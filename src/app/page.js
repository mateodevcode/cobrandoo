import { redirect } from "next/navigation";
import { usuarioActual } from "@/server/auth/session";

export default async function Raiz() {
  const u = await usuarioActual();
  redirect(!u ? "/login" : u.rol === "super_admin" ? "/admin" : "/inicio");
}
