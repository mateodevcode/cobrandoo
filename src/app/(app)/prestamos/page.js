import Link from "next/link";
import { Suspense } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as prestamos from "@/server/services/prestamos.service";
import { Insignia } from "@/components/ui/Insignia";
import { Filtros } from "@/components/negocio/Filtros";
import { METODOS } from "@/lib/prestamos/metodos";
import { dinero, fecha } from "@/lib/formato";

export const metadata = { title: "Préstamos" };

export default async function PaginaPrestamos({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { vista = "activos" } = await searchParams;
  const lista = await prestamos.listar(yo, {
    estado: vista === "pagados" ? "pagado" : vista === "anulados" ? "anulado" : "activo",
    enMora: vista === "mora",
  });
  const total = lista.reduce((s, p) => s + p.saldo, 0);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Préstamos</h1>
          <p className="text-sm text-suave">
            {lista.length} préstamo(s){vista !== "pagados" && vista !== "anulados" && ` · por cobrar ${dinero(total)}`}
          </p>
        </div>
        <Link href="/prestamos/nuevo" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-oscuro">
          <Plus className="size-4" /> Nuevo
        </Link>
      </header>

      <Suspense>
        <Filtros
          parametro="vista"
          opciones={[
            { id: "activos", nombre: "Activos" },
            { id: "mora", nombre: "En mora" },
            { id: "pagados", nombre: "Pagados" },
            { id: "anulados", nombre: "Anulados" },
          ]}
        />
      </Suspense>

      {lista.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">No hay préstamos en esta lista.</div>
      ) : (
        <ul className="tarjeta divide-y divide-borde overflow-hidden">
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={`/prestamos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fondo">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold">{p.cliente_nombre}</p>
                    {p.estado === "activo" && p.dias_atraso > 0 && <Insignia tono="peligro">{p.dias_atraso} d atraso</Insignia>}
                  </div>
                  <p className="truncate text-xs text-suave">
                    {dinero(p.capital)} · {METODOS[p.metodo]?.nombre} · {fecha(p.fecha_inicio)}
                    {yo.rol !== "cobrador" && ` · ${p.cobrador_nombre}`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm font-bold">{dinero(p.saldo)}</p>
                  {p.sugerido_hoy > 0 && <p className="tabular text-[11px] text-primario">hoy {dinero(p.sugerido_hoy)}</p>}
                </div>
                <ChevronRight className="size-4 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
