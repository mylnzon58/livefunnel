import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LiveFunnel · Analítica Forense y Embudo en Tiempo Real",
  description: "Panel de analítica forense en tiempo real para Next.js y Supabase.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
