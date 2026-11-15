import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as clientes from "@/server/services/clientes.service";
import { FormCliente } from "@/components/negocio/FormCliente";
import { EstadoCliente } from "./EstadoCliente";

export const metadata = { title: "Editar cliente" };

export default async function EditarCliente({ params }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [cliente, cobradores] = await Promise.all([clientes.obtener(yo, id).catch(() => null), clientes.cobradoresDisponibles(yo)]);
  if (!cliente) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href={`/clientes/${id}`} className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> {cliente.nombre}
      </Link>
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Editar cliente</h1>
        <EstadoCliente id={id} estado={cliente.estado} />
      </div>
      <FormCliente cliente={cliente} cobradores={cobradores} esJefe={yo.rol !== "cobrador"} />
    </div>
  );
}
