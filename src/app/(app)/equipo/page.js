import Link from "next/link";
import { ArrowRightLeft } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { equipoHoy } from "@/server/services/caja.service";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { NOMBRE_ROL } from "@/lib/roles";
import { dinero } from "@/lib/formato";
import { BotonBase } from "./BotonBase";
import { CambiarClaves } from "./CambiarClaves";
import { personasConAcceso } from "@/server/services/admin.service";

export const metadata = { title: "Equipo" };

export default async function PaginaEquipo() {
  const yo = await exigirUsuarioPagina(["dueno", "supervisor"]);
  const equipo = await equipoHoy(yo);
  const personas = yo.rol === "dueno" ? await personasConAcceso(yo) : null;
  const totales = equipo.reduce(
    (t, u) => ({ cobrado: t.cobrado + u.cobrado, prestado: t.prestado + u.prestado, efectivo: t.efectivo + u.efectivo, pendiente: t.pendiente + u.pendiente }),
    { cobrado: 0, prestado: 0, efectivo: 0, pendiente: 0 }
  );

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Equipo</h1>
          <p className="text-sm text-suave">Cómo va cada persona a cargo hoy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/equipo/asignar" className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-primario px-3 text-sm font-semibold text-white hover:opacity-90">
            <ArrowRightLeft className="size-4" /> Asignar clientes
          </Link>
          {personas && <CambiarClaves personas={personas} yoId={yo.id} />}
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Cifra titulo="Cobrado hoy" valor={totales.cobrado} tono="text-exito" />
        <Cifra titulo="Falta por cobrar" valor={totales.pendiente} />
        <Cifra titulo="Prestado hoy" valor={totales.prestado} />
        <Cifra titulo="Efectivo en la calle" valor={totales.efectivo} />
      </div>

      {equipo.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">No tienes personas a cargo todavía.</div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {equipo.map((u) => (
            <li key={u.id} className="tarjeta flex flex-col gap-3 p-4">
              <div className="flex items-center gap-3">
                <Avatar nombre={u.nombre} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{u.nombre}</p>
                  <p className="text-xs text-suave">
                    {NOMBRE_ROL[u.rol]}
                    {yo.rol === "dueno" && u.jefe_nombre && ` · reporta a ${u.jefe_nombre}`}
                  </p>
                </div>
                {u.cierre_estado ? (
                  <Link href="/cuadres">
                    <Insignia tono={u.cierre_estado === "pendiente" ? "alerta" : u.cierre_estado === "con_fallo" ? "peligro" : "exito"}>
                      {u.cierre_estado === "pendiente" ? "Cerró · revisar" : u.cierre_estado === "con_fallo" ? "Cierre con fallo" : "Día cerrado"}
                    </Insignia>
                  </Link>
                ) : u.pendiente > 0 ? (
                  <Insignia tono="alerta">Falta {dinero(u.pendiente)}</Insignia>
                ) : (
                  <Insignia tono="exito">Al día</Insignia>
                )}
              </div>
              <dl className="grid grid-cols-4 gap-2 text-center">
                <Mini titulo="Base" valor={u.base} />
                <Mini titulo="Cobrado" valor={u.cobrado} />
                <Mini titulo="Prestado" valor={u.prestado} />
                <Mini titulo="Efectivo" valor={u.efectivo} fuerte />
              </dl>
              <div className="flex flex-wrap gap-2">
                <BotonBase cobrador={{ id: u.id, nombre: u.nombre, rol: u.rol }} />
                <Link href={`/caja?usuario=${u.id}`} className="inline-flex h-8 items-center rounded-xl border border-borde px-3 text-xs font-semibold hover:bg-fondo">
                  Ver caja
                </Link>
                {u.rol === "cobrador" && (
                  <Link href={`/ruta?cobrador=${u.id}`} className="inline-flex h-8 items-center rounded-xl border border-borde px-3 text-xs font-semibold hover:bg-fondo">
                    Ver ruta
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, tono }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-[11px] text-suave">{titulo}</p>
      <p className={`tabular font-bold ${tono ?? ""}`}>{dinero(valor)}</p>
    </div>
  );
}

function Mini({ titulo, valor, fuerte }) {
  return (
    <div className="rounded-xl bg-fondo px-1 py-2">
      <dt className="text-[10px] text-suave">{titulo}</dt>
      <dd className={`tabular text-xs ${fuerte ? "font-bold" : "font-semibold"}`}>{dinero(valor)}</dd>
    </div>
  );
}
