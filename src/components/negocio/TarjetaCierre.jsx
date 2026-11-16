import { Avatar, Insignia } from "@/components/ui/Insignia";
import { dinero, fecha } from "@/lib/formato";
import { cn } from "@/lib/cn";

const ESTADO = {
  pendiente: { texto: "Pendiente", tono: "alerta" },
  aprobado: { texto: "Aprobado", tono: "exito" },
  con_fallo: { texto: "Con fallo", tono: "peligro" },
  resuelto: { texto: "Resuelto", tono: "info" },
};
const hora = (d) => new Date(d).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" });

/** Tarjeta de un cierre del día (para el jefe y para el cobrador). */
export function TarjetaCierre({ c, mostrarCobrador, acciones }) {
  const r = c.resumen?.porTipo ?? {};
  const d = Number(c.diferencia);
  return (
    <li className="tarjeta flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        {mostrarCobrador && <Avatar nombre={c.usuario_nombre} />}
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{mostrarCobrador ? c.usuario_nombre : `Cierre del ${fecha(c.fecha)}`}</p>
          <p className="text-xs text-suave">
            {mostrarCobrador && `${fecha(c.fecha)} · `}cerrado {hora(c.creado_en)}
            {c.jefe_nombre && ` · entregó a ${c.jefe_nombre}`}
          </p>
        </div>
        <Insignia tono={ESTADO[c.estado].tono}>{ESTADO[c.estado].texto}</Insignia>
      </div>

      <dl className="grid grid-cols-3 gap-2 text-center">
        <Dato titulo="Esperado" valor={dinero(c.efectivo_esperado)} />
        <Dato titulo="Entregó" valor={dinero(c.efectivo_contado)} />
        <Dato
          titulo="Diferencia"
          valor={d === 0 ? "Cuadra" : `${d > 0 ? "+" : "−"}${dinero(Math.abs(d))}`}
          tono={d === 0 ? "text-exito" : d < 0 ? "text-peligro" : "text-alerta"}
        />
      </dl>

      <p className="text-xs text-suave">
        {[
          r.base && `Base ${dinero(r.base)}`,
          r.cobro && `Cobros ${dinero(r.cobro)}`,
          r.desembolso && `Prestado ${dinero(-r.desembolso)}`,
          r.gasto && `Gastos ${dinero(-r.gasto)}`,
          Number(c.digital) && `Digital ${dinero(c.digital)}`,
        ]
          .filter(Boolean)
          .join(" · ") || "Sin movimientos"}
      </p>

      {c.observacion && <Nota quien={mostrarCobrador ? c.usuario_nombre : "Tú"} texto={c.observacion} />}
      {c.comentario_revision && <Nota quien={c.revisado_por_nombre} texto={c.comentario_revision} tono={c.estado === "con_fallo" ? "peligro" : undefined} />}
      {c.comentario_resolucion && <Nota quien={`${c.resuelto_por_nombre} (resolución)`} texto={c.comentario_resolucion} tono="info" />}
      {acciones}
    </li>
  );
}

function Dato({ titulo, valor, tono }) {
  return (
    <div className="rounded-xl bg-fondo px-1 py-2">
      <dt className="text-[10px] text-suave">{titulo}</dt>
      <dd className={cn("tabular text-sm font-bold", tono)}>{valor}</dd>
    </div>
  );
}

function Nota({ quien, texto, tono }) {
  return (
    <p className={cn("rounded-xl px-3 py-2 text-sm", tono === "peligro" ? "bg-peligro-suave" : tono === "info" ? "bg-primario-suave" : "bg-fondo")}>
      <span className="font-semibold">{quien}:</span> {texto}
    </p>
  );
}
