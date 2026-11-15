import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { cobradoresDisponibles } from "@/server/services/clientes.service";
import { FormCliente } from "@/components/negocio/FormCliente";

export const metadata = { title: "Nuevo cliente" };

export default async function NuevoCliente() {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const cobradores = await cobradoresDisponibles(yo);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/clientes" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      <FormCliente cobradores={cobradores} esJefe={yo.rol !== "cobrador"} />
    </div>
  );
}
