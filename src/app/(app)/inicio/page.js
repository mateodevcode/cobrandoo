import Link from "next/link";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { resumen } from "@/server/services/tablero.service";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { dinero, fechaHoy, saludo } from "@/lib/formato";
import { NOMBRE_ROL } from "@/lib/roles";
import { NOMBRE_METODO_PAGO } from "@/lib/prestamos/constantes";

export const metadata = { title: "Inicio" };

const DIAS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

export default async function Inicio() {
  const u = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const r = await resumen(u);
  const nombre = u.nombre.split(" ")[0];
  const avance = r.metaHoy > 0 ? Math.min(100, Math.round((r.cobradoHoy / r.metaHoy) * 100)) : 0;
  const maxSerie = Math.max(1, ...r.serie.map((d) => d.total));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-suave first-letter:uppercase">{fechaHoy()}</p>
          <h1 className="text-2xl font-bold">
            {saludo()}, {nombre}
          </h1>
          <p className="text-sm text-suave">{NOMBRE_ROL[u.rol]}</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Link href="/prestamos/nuevo" className="inline-flex h-10 items-center rounded-xl border border-borde bg-superficie px-4 text-sm font-semibold hover:bg-fondo">
            Nuevo préstamo
          </Link>
          <Link href="/ruta" className="inline-flex h-10 items-center rounded-xl bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-oscuro">
            {u.rol === "cobrador" ? "Ir a cobrar" : "Ver rutas"}
          </Link>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative overflow-hidden rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-6 text-white shadow-tarjeta">
          <p className="text-sm text-white/75">Cobrado hoy</p>
          <p className="tabular mt-1 text-4xl font-bold">{dinero(r.cobradoHoy)}</p>
          <div className="mt-6 h-2 rounded-full bg-white/20">
            <div className="h-full rounded-full bg-acento transition-all" style={{ width: `${avance}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/75">
            <span>
              {avance} % de la meta del día ({dinero(r.metaHoy)})
            </span>
            <span>Pendiente: {dinero(r.pendienteHoy)}</span>
          </div>
        </section>

        <section className="tarjeta flex flex-col p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Cobros · últimos 7 días</h2>
            <span className="tabular text-xs text-suave">{dinero(r.serie.reduce((s, d) => s + d.total, 0))}</span>
          </div>
          <div className="mt-4 flex h-32 flex-1 items-end gap-2" role="img" aria-label="Cobros por día de los últimos 7 días">
            {r.serie.map((d) => {
              const dia = DIAS[new Date(`${d.fecha}T12:00:00Z`).getUTCDay()];
              const esHoy = d.fecha === r.hoy;
              return (
                <div key={d.fecha} className="flex flex-1 flex-col items-center gap-1.5" title={`${dia}: ${dinero(d.total)}`}>
                  <div className="flex w-full flex-1 items-end">
                    <div className={`w-full rounded-t-md ${esHoy ? "bg-primario" : "bg-acento/70"}`} style={{ height: `${Math.max(3, (d.total / maxSerie) * 100)}%` }} />
                  </div>
                  <span className={`text-[11px] ${esHoy ? "font-bold text-texto" : "text-suave"}`}>{dia}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Cobrado esta semana" valor={dinero(r.cobradoSemana)} />
        <Indicador titulo="Prestado esta semana" valor={dinero(r.prestadoSemana)} />
        <Indicador titulo="Cartera por cobrar" valor={dinero(r.cartera)} sub={`${r.prestamosActivos} préstamo(s) activo(s)`} />
        <Indicador titulo="Clientes en mora" valor={String(r.clientesMora)} tono={r.clientesMora > 0 ? "peligro" : undefined} href="/clientes?vista=mora" />
      </div>

      <section className="tarjeta p-5">
        <h2 className="text-sm font-semibold">Movimientos recientes</h2>
        {r.recientes.length === 0 ? (
          <p className="mt-6 mb-4 text-center text-sm text-suave">
            Aún no hay movimientos. <Link href="/clientes/nuevo" className="font-semibold text-primario">Crea tu primer cliente</Link>.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-borde">
            {r.recientes.map((m) => (
              <li key={`${m.tipo}-${m.id}`}>
                <Link href={`/prestamos/${m.prestamo_id}`} className="flex items-center gap-3 py-3 hover:opacity-80">
                  <Avatar nombre={m.cliente_nombre} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{m.cliente_nombre}</p>
                    <p className="text-xs text-suave">
                      {m.tipo === "pago" ? "Abono" : "Préstamo"} · {NOMBRE_METODO_PAGO[m.metodo]}
                    </p>
                  </div>
                  {m.anulado ? (
                    <Insignia>Anulado</Insignia>
                  ) : (
                    <Insignia tono={m.tipo === "pago" ? "exito" : "info"}>{m.tipo === "pago" ? "Cobrado" : "Prestado"}</Insignia>
                  )}
                  <span className={`tabular w-28 text-right text-sm font-bold ${m.tipo === "pago" && !m.anulado ? "text-exito" : ""}`}>
                    {m.tipo === "pago" ? "+" : "−"} {dinero(m.monto)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Indicador({ titulo, valor, sub, tono, href }) {
  const contenido = (
    <>
      <p className="text-xs text-suave">{titulo}</p>
      <p className={`tabular mt-1 text-xl font-bold ${tono === "peligro" ? "text-peligro" : ""}`}>{valor}</p>
      {sub && <p className="text-[11px] text-suave">{sub}</p>}
    </>
  );
  return href ? (
    <Link href={href} className="tarjeta p-4 hover:bg-fondo">
      {contenido}
    </Link>
  ) : (
    <div className="tarjeta p-4">{contenido}</div>
  );
}
