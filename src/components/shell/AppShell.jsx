"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Banknote, HandCoins, LogOut, Plus, Receipt, UserPlus } from "lucide-react";
import { Hoja } from "@/components/ui/Hoja";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { NOMBRE_ROL } from "@/lib/roles";
import { api } from "@/lib/api";
import { Avatar } from "@/components/ui/Insignia";
import { menuPara } from "./navegacion";
import { ProveedorSync, limpiarOffline } from "@/components/offline/ProveedorSync";
import { EstadoConexion } from "@/components/offline/EstadoConexion";
import { sincronizador } from "@/lib/offline/sync";

export function AppShell({ usuario, children }) {
  const pathname = usePathname();
  const router = useRouter();
  const menu = menuPara(usuario.rol);
  const conBotonAccion = usuario.rol !== "super_admin";
  const [acciones, setAcciones] = useState(false);

  async function salir() {
    const pendientes = sincronizador?.obtener().pendientes.length ?? 0;
    const aviso = pendientes
      ? `Tienes ${pendientes} operación(es) sin enviar. Se enviarán cuando vuelvas a ingresar en este teléfono. ¿Cerrar sesión?`
      : "¿Cerrar sesión?";
    if (!window.confirm(aviso)) return;
    await api("/api/auth/logout", { method: "POST" }).catch(() => {});
    await limpiarOffline().catch(() => {});
    // Recarga completa a propósito: no debe quedar nada de la sesión en memoria
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  const activo = (href) => pathname === href || pathname.startsWith(href + "/");
  const pronto = () => toast.info("Este módulo llega en la siguiente fase.");

  return (
    <div className="min-h-dvh lg:flex">
      <ProveedorSync usuario={usuario} />
      {/* ===== Barra lateral (escritorio) ===== */}
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col bg-marino-900 p-4 text-white lg:flex">
        <div className="flex items-center gap-2.5 px-2 py-3">
          <span className="size-8 rounded-lg bg-acento" />
          <span className="text-lg font-bold">Cobrandoo</span>
        </div>
        {conBotonAccion && <EstadoConexion oscuro className="mx-2 w-fit" />}

        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Principal">
          {menu.map((item) =>
            item.pronto ? (
              <button
                key={item.href}
                onClick={pronto}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-white/45 hover:bg-white/5"
              >
                <item.icono className="size-[18px]" />
                {item.etiqueta}
                <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 text-[10px]">Pronto</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                  activo(item.href) ? "bg-primario text-white shadow-lg shadow-primario/30" : "text-white/75 hover:bg-white/10"
                )}
              >
                <item.icono className="size-[18px]" />
                {item.etiqueta}
              </Link>
            )
          )}
        </nav>

        <div className="rounded-2xl bg-marino-800 p-3">
          <div className="flex items-center gap-3">
            <Avatar nombre={usuario.nombre} className="size-9 bg-white/10 text-white" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{usuario.nombre}</p>
              <p className="text-xs text-white/60">{NOMBRE_ROL[usuario.rol]}</p>
            </div>
            <button onClick={salir} className="ml-auto rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Cerrar sesión">
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ===== Contenido ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Encabezado móvil */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-borde bg-superficie/90 px-4 py-3 backdrop-blur lg:hidden">
          <span className="size-7 rounded-lg bg-acento" />
          <span className="font-bold">Cobrandoo</span>
          {conBotonAccion && <EstadoConexion className="ml-auto" />}
          <button
            onClick={salir}
            className={cn("flex items-center gap-2 rounded-full", !conBotonAccion && "ml-auto")}
            aria-label="Cerrar sesión"
          >
            <Avatar nombre={usuario.nombre} className="size-8" />
          </button>
        </header>

        <main className="flex-1 px-4 pt-5 pb-28 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>

      {/* ===== Navegación inferior (móvil) ===== */}
      {menu.length > 1 && (
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-30 border-t border-borde bg-superficie pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          <ul className="relative grid h-16 grid-cols-5 items-center">
            {menuMovil(menu.filter((m) => m.movil !== false), conBotonAccion).map((item, i) =>
              item === "accion" ? (
                <li key="accion" className="flex justify-center">
                  <button
                    onClick={() => setAcciones(true)}
                    className="-mt-8 flex size-14 items-center justify-center rounded-full bg-acento-oscuro text-white shadow-lg shadow-acento-oscuro/40"
                    aria-label="Nuevo cobro o préstamo"
                  >
                    <Plus className="size-6" />
                  </button>
                </li>
              ) : item ? (
                <li key={item.href}>
                  {item.pronto ? (
                    <button onClick={pronto} className="flex w-full flex-col items-center gap-1 text-[11px] text-suave/60">
                      <item.icono className="size-5" />
                      {item.etiqueta}
                    </button>
                  ) : (
                    <Link
                      href={item.href}
                      className={cn("flex flex-col items-center gap-1 text-[11px] font-medium", activo(item.href) ? "text-primario" : "text-suave")}
                    >
                      <item.icono className="size-5" />
                      {item.etiqueta}
                    </Link>
                  )}
                </li>
              ) : (
                <li key={`vacio-${i}`} />
              )
            )}
          </ul>
        </nav>
      )}

      <Hoja abierta={acciones} onCerrar={() => setAcciones(false)} titulo="¿Qué quieres hacer?">
        <div className="grid grid-cols-2 gap-3">
          {ACCIONES.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              onClick={() => setAcciones(false)}
              className="flex flex-col items-start gap-3 rounded-2xl border border-borde p-4 hover:bg-fondo"
            >
              <span className={cn("flex size-10 items-center justify-center rounded-xl", a.tono)}>
                <a.icono className="size-5" />
              </span>
              <span className="text-sm font-semibold">{a.etiqueta}</span>
            </Link>
          ))}
        </div>
      </Hoja>
    </div>
  );
}

const ACCIONES = [
  { href: "/ruta", etiqueta: "Cobrar", icono: HandCoins, tono: "bg-acento-suave text-acento-oscuro" },
  { href: "/prestamos/nuevo", etiqueta: "Nuevo préstamo", icono: Banknote, tono: "bg-primario-suave text-primario" },
  { href: "/clientes/nuevo", etiqueta: "Nuevo cliente", icono: UserPlus, tono: "bg-primario-suave text-primario" },
  { href: "/caja?gasto=1", etiqueta: "Registrar gasto", icono: Receipt, tono: "bg-alerta-suave text-alerta" },
];

/** 4 accesos + botón central de acción en el medio. */
function menuMovil(menu, conAccion) {
  const items = menu.slice(0, 4);
  while (items.length < 4) items.push(null);
  return conAccion ? [items[0], items[1], "accion", items[2], items[3]] : [items[0], items[1], items[2], items[3], null];
}
