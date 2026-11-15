import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as clientes from "@/server/services/clientes.service";
import { hoyBogota } from "@/lib/fechas";
import { FormPrestamo } from "./FormPrestamo";

export const metadata = { title: "Nuevo préstamo" };

export default async function NuevoPrestamo({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { cliente: clienteId } = await searchParams;
  const valido = z.uuid().safeParse(clienteId).success;
  const cliente = valido ? await clientes.obtener(yo, clienteId).catch(() => null) : null;
  const lista = cliente ? [] : (await clientes.listar(yo, { estado: "activo" })).map((c) => ({ id: c.id, nombre: c.nombre, barrio: c.barrio, saldo: c.saldo }));

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href={cliente ? `/clientes/${cliente.id}` : "/clientes"} className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> {cliente ? cliente.nombre : "Clientes"}
      </Link>
      <h1 className="text-2xl font-bold">Nuevo préstamo</h1>
      <FormPrestamo cliente={cliente ? { id: cliente.id, nombre: cliente.nombre } : null} clientes={lista} hoy={hoyBogota()} />
    </div>
  );
}
