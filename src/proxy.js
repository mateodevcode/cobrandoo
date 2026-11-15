// Next 16: "proxy" reemplaza a "middleware". Corre antes de cada página.
// Solo verifica la firma del JWT (sin base de datos) y redirige.
import { NextResponse } from "next/server";
import { verificarAcceso, COOKIE_ACCESS } from "@/server/auth/tokens";

const PUBLICAS = ["/login", "/c/"]; // /c/{token} = historial público del cliente (fase 5)

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  const esPublica = PUBLICAS.some((p) => pathname === p || pathname.startsWith(p));
  const usuario = await verificarAcceso(req.cookies.get(COOKIE_ACCESS)?.value);

  if (esPublica) {
    // Ya logueado y entra al login → a su inicio
    if (usuario && pathname === "/login") return NextResponse.redirect(new URL(destinoPorRol(usuario.rol), req.url));
    return NextResponse.next();
  }

  if (!usuario) {
    // Puede que solo haya expirado el access token: el login intenta un refresh silencioso primero.
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname === "/") return NextResponse.redirect(new URL(destinoPorRol(usuario.rol), req.url));
  if (pathname.startsWith("/admin") && usuario.rol !== "super_admin") {
    return NextResponse.redirect(new URL("/inicio", req.url));
  }
  return NextResponse.next();
}

function destinoPorRol(rol) {
  return rol === "super_admin" ? "/admin" : "/inicio";
}

export const config = {
  // Excluye API, estáticos e íconos/manifest de la PWA
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico)$).*)"],
};
