import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { tablero } from "@/server/services/asignacion.service";
import { TableroAsignacion } from "./TableroAsignacion";

export const metadata = { title: "Asignar clientes" };

export default async function PaginaAsignar() {
  const yo = await exigirUsuarioPagina(["dueno", "supervisor"]);
  const datos = await tablero(yo);
  return (
    <div className="mx-auto flex max-w-[100rem] flex-col gap-4">
      <Link href="/equipo" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Equipo
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Asignar clientes</h1>
        <p className="text-sm text-suave">
          Arrastra un cliente o una ruta completa (desde <span className="font-semibold">⋮⋮</span>) hasta otro cobrador. En el celular, mantén presionado y arrastra. Marca varios para moverlos juntos.
        </p>
      </header>
      {datos.cobradores.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">No tienes cobradores a cargo.</div>
      ) : (
        <TableroAsignacion datos={datos} />
      )}
    </div>
  );
}
