import "dotenv/config";
import { fetchUsers, DeviceConfig } from "@/lib/isapi";
import { db } from "@/db";
import { employees } from "@/db/schema";

const device: DeviceConfig = {
  name: "Control de Acceso Principal",
  ipAddress: process.env.HIKVISION_IP || "192.168.0.136",
  port: Number(process.env.HIKVISION_PORT ?? 80),
  username: process.env.HIKVISION_USER || "admin",
  password: process.env.HIKVISION_PASS || "Hidro171273",
  deviceType: "entrada",
};

async function syncUsersFromDevice() {
  console.log(`Consultando usuarios desde el biométrico (${device.ipAddress})...`);
  
  const rawUsers = await fetchUsers(device);
  console.log(`Se obtuvieron ${rawUsers.length} usuarios desde el terminal.`);

  for (const user of rawUsers) {
    const rawName = user.name.trim();
    const spaceIndex = rawName.indexOf(" ");
    
    let firstName = rawName;
    let lastName = "";

    if (spaceIndex !== -1) {
      firstName = rawName.substring(0, spaceIndex);
      lastName = rawName.substring(spaceIndex + 1).trim();
    }

    await db
      .insert(employees)
      .values({
        legajo: user.employeeNo,
        firstName: firstName || "Sin Nombre",
        lastName: lastName || "Sin Apellido",
        department: user.department ?? "General",
        active: true,
      })
      .onConflictDoUpdate({
        target: employees.legajo,
        set: {
          firstName: firstName || "Sin Nombre",
          lastName: lastName || "Sin Apellido",
          department: user.department ?? "General",
        },
      });
  }

  console.log("¡Importación exitosa a la tabla 'employees'!");
  process.exit(0);
}

syncUsersFromDevice().catch((err) => {
  console.error("Error durante la importación:", err);
  process.exit(1);
});