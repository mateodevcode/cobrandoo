import Link from "next/link";
import { Suspense } from "react";
import { Plus, ChevronRight } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as clientes from "@/server/services/clientes.service";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { Buscador } from "@/components/negocio/Buscador";
import { Filtros } from "@/components/negocio/Filtros";
import { dinero } from "@/lib/formato";

export const metadata = { title: "Clientes" };

export default async function PaginaClientes({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const sp = await searchParams;
  const vista = sp.vista ?? "activos";
  const lista = await clientes.listar(yo, {
    q: typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined,
    estado: vista === "inactivos" ? "inactivo" : "activo",
    conDeuda: vista === "deuda",
  });
  const enMora = vista === "mora" ? lista.filter((c) => c.dias_atraso > 0) : lista;
  const esJefe = yo.rol !== "cobrador";

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-suave">{enMora.length} cliente(s)</p>
        </div>
        <Link href="/clientes/nuevo" className="inline-flex h-10 items-center gap-2 rounded-xl bg-primario px-4 text-sm font-semibold text-white hover:bg-primario-oscuro">
          <Plus className="size-4" /> Nuevo
        </Link>
      </header>

      <Suspense>
        <Buscador placeholder="Buscar por nombre, cédula, celular o barrio" />
        <Filtros
          parametro="vista"
          opciones={[
            { id: "activos", nombre: "Activos" },
            { id: "deuda", nombre: "Con deuda" },
            { id: "mora", nombre: "En mora" },
            { id: "inactivos", nombre: "Inactivos" },
          ]}
        />
      </Suspense>

      {enMora.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">
          {sp.q ? "Ningún cliente coincide con la búsqueda." : "Aún no hay clientes aquí."}
        </div>
      ) : (
        <ul className="tarjeta divide-y divide-borde overflow-hidden">
          {enMora.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/${c.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fondo">
                <Avatar nombre={c.nombre} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{c.nombre}</p>
                    {c.dias_atraso > 0 && <Insignia tono="peligro">{c.dias_atraso} d atraso</Insignia>}
                  </div>
                  <p className="truncate text-xs text-suave">
                    {[c.barrio, c.ruta_nombre && `Ruta ${c.ruta_nombre}`, esJefe && c.cobrador_nombre].filter(Boolean).join(" · ") || "Sin ruta"}
                  </p>
                </div>
                <div className="text-right">
                  {c.saldo > 0 ? (
                    <>
                      <p className="tabular text-sm font-bold">{dinero(c.saldo)}</p>
                      <p className="text-[11px] text-suave">{c.prestamos_activos} préstamo(s)</p>
                    </>
                  ) : (
                    <p className="text-xs text-suave">Sin deuda</p>
                  )}
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
