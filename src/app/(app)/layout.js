import { AppShell } from "@/components/shell/AppShell";
import { exigirUsuarioPagina } from "@/server/auth/session";

export default async function LayoutApp({ children }) {
  const usuario = await exigirUsuarioPagina();
  return <AppShell usuario={usuario}>{children}</AppShell>;
}
