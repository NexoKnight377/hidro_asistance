import type { Metadata } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, IBM_Plex_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "700"],
  variable: "--font-display",
});

const body = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});

const data = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-data",
});

export const metadata: Metadata = {
  title: "ASISTE·OPS — Control de asistencias Hikvision ISAPI",
  description:
    "Dashboard de asistencias con conexión a controles de acceso Hikvision vía ISAPI (HTTP Digest): marcaciones crudas en PostgreSQL, estados calculados al vuelo, cron de sincronización y gestión de personal y terminales.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${display.variable} ${body.variable} ${data.variable}`}>
      <body className="bg-ink-950 font-sans text-mist-100 antialiased">
        {children}
      </body>
    </html>
  );
}
