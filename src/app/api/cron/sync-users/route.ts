import { NextResponse } from "next/server";
import { fetchUsers, fetchAcsEvents, syncDeviceTime, DeviceConfig } from "@/lib/isapi";
import { db } from "@/db";
import { employees, accessDevices, attendanceLogs } from "@/db/schema";
import { eq } from "drizzle-orm";

export const maxDuration = 60;

export async function GET() {
  try {
    const devices = await db.select().from(accessDevices);

    const targetDevices: DeviceConfig[] = devices.length > 0 
      ? devices.map(d => ({
          id: d.id,
          name: d.name,
          ipAddress: d.ipAddress,
          port: d.port,
          username: d.username,
          password: d.password,
          deviceType: d.deviceType,
        }))
      : [{
          name: "Control de Acceso Principal",
          ipAddress: process.env.HIKVISION_IP || "192.168.0.136",
          port: Number(process.env.HIKVISION_PORT ?? 80),
          username: process.env.HIKVISION_USER || "admin",
          password: process.env.HIKVISION_PASS || "Hidro171273",
          deviceType: "entrada",
        }];

    let totalUsers = 0;
    let totalLogs = 0;

    for (const device of targetDevices) {
      // 0. Sincronizar Hora del Biométrico
      try {
        await syncDeviceTime(device);
      } catch (err) {
        console.error(`Error al sincronizar hora del dispositivo ${device.ipAddress}:`, err);
      }

      // 1. Sincronizar Empleados
      const rawUsers = await fetchUsers(device);
      if (rawUsers.length > 0) {
        const recordsToUpsert = rawUsers.map((user) => {
          const rawName = user.name.trim();
          const spaceIndex = rawName.indexOf(" ");
          return {
            legajo: user.employeeNo,
            firstName: spaceIndex !== -1 ? rawName.substring(0, spaceIndex) : rawName,
            lastName: spaceIndex !== -1 ? rawName.substring(spaceIndex + 1).trim() : "",
            department: user.department ?? "General",
            active: true,
          };
        });

        await db
          .insert(employees)
          .values(recordsToUpsert)
          .onConflictDoUpdate({
            target: employees.legajo,
            set: {
              firstName: employees.firstName,
              lastName: employees.lastName,
              department: employees.department,
            },
          });
        totalUsers += rawUsers.length;
      }

      // 2. Sincronizar Fichajes / Marcaciones (attendance_logs)
      // Se busca desde el inicio del día o 24 horas atrás
      const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const rawEvents = await fetchAcsEvents(device, sinceDate);

      if (rawEvents.length > 0) {
        const dbEmployees = await db.select().from(employees);
        const employeeMap = new Map(dbEmployees.map((e) => [e.legajo, e.id]));

        const logsToInsert = [];
        for (const ev of rawEvents) {
          const empId = employeeMap.get(ev.employeeNo);
          if (empId) {
            logsToInsert.push({
              employeeId: empId,
              employeeNo: ev.employeeNo,
              eventTime: ev.time,
              eventType: "check_in",
              deviceId: device.id ?? null,
              rawEventId: ev.eventId,
            });
          }
        }

        if (logsToInsert.length > 0) {
          await db
            .insert(attendanceLogs)
            .values(logsToInsert)
            .onConflictDoNothing(); // Evita duplicar marcaciones existentes
          totalLogs += logsToInsert.length;
        }
      }

      if (device.id) {
        await db
          .update(accessDevices)
          .set({ lastSyncAt: new Date() })
          .where(eq(accessDevices.id, device.id));
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronización exitosa. Empleados: ${totalUsers}, Registros de asistencia: ${totalLogs}`,
    });
  } catch (error) {
    console.error("Error en sincronización global:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}