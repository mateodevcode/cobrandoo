import { AppShell } from "@/components/shell/AppShell";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { configPublica } from "@/server/socket";

export default async function LayoutApp({ children }) {
  const usuario = await exigirUsuarioPagina();
  // URL del hub y canal de la organización (sin secretos); el token se pide aparte
  const tiempoReal = usuario.rol === "super_admin" ? null : configPublica(usuario.org);
  return (
    <AppShell usuario={usuario} tiempoReal={tiempoReal}>
      {children}
    </AppShell>
  );
}
