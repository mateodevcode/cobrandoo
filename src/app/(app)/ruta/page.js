import Link from "next/link";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { rutaDelDia } from "@/server/services/tablero.service";
import { cobradoresDisponibles } from "@/server/services/clientes.service";
import { fechaHoy } from "@/lib/formato";
import { ListaRuta } from "./ListaRuta";

export const metadata = { title: "Ruta de hoy" };

export default async function PaginaRuta({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const sp = await searchParams;
  const cobradores = yo.rol === "cobrador" ? [] : await cobradoresDisponibles(yo);
  const cobradorId = yo.rol === "cobrador" ? yo.id : cobradores.find((c) => c.id === sp.cobrador)?.id;
  const clientes = cobradorId ? await rutaDelDia(yo, cobradorId) : [];
  const nombreCobrador = cobradores.find((c) => c.id === cobradorId)?.nombre;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <header>
        <p className="text-sm text-suave first-letter:uppercase">{fechaHoy()}</p>
        <h1 className="text-2xl font-bold">Ruta de hoy{nombreCobrador && ` · ${nombreCobrador}`}</h1>
      </header>

      {yo.rol !== "cobrador" && (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {cobradores.length === 0 && <p className="text-sm text-suave">No tienes cobradores a cargo.</p>}
          {cobradores.map((c) => (
            <Link
              key={c.id}
              href={`/ruta?cobrador=${c.id}`}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium ${c.id === cobradorId ? "border-primario bg-primario text-white" : "border-borde bg-superficie"}`}
            >
              {c.nombre}
            </Link>
          ))}
        </div>
      )}

      {cobradorId ? (
        <ListaRuta clientes={JSON.parse(JSON.stringify(clientes))} puedeOrdenar />
      ) : (
        <div className="tarjeta p-10 text-center text-sm text-suave">Elige un cobrador para ver su ruta.</div>
      )}
    </div>
  );
}
