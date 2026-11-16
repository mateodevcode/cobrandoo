import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import * as orgRepo from "@/server/repos/organizaciones.repo";
import * as usuariosRepo from "@/server/repos/usuarios.repo";
import { Insignia } from "@/components/ui/Insignia";
import { GestionUsuarios } from "./GestionUsuarios";
import { EstadoOrganizacion } from "./EstadoOrganizacion";
import { EliminarOrganizacion } from "./EliminarOrganizacion";
import { query } from "@/server/db";

export const metadata = { title: "Organización" };

export default async function PaginaOrganizacion({ params }) {
  await exigirUsuarioPagina(["super_admin"]);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const [org, usuarios, { rows: conteo }] = await Promise.all([
    orgRepo.buscarPorId(id),
    usuariosRepo.listar({ organizacionId: id }),
    query(
      `SELECT (SELECT count(*) FROM usuarios WHERE organizacion_id = $1)::int AS usuarios,
              (SELECT count(*) FROM clientes WHERE organizacion_id = $1)::int AS clientes,
              (SELECT count(*) FROM prestamos WHERE organizacion_id = $1)::int AS prestamos`,
      [id]
    ),
  ]);
  if (!org) notFound();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <Link href="/admin" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Organizaciones
      </Link>

      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{org.nombre}</h1>
          {org.activa ? <Insignia tono="exito">Activa</Insignia> : <Insignia tono="peligro">Inactiva</Insignia>}
        </div>
        <EstadoOrganizacion org={org} />
      </header>

      <GestionUsuarios organizacionId={org.id} usuarios={JSON.parse(JSON.stringify(usuarios))} />
      <EliminarOrganizacion org={{ id: org.id, nombre: org.nombre }} resumen={conteo[0]} />
    </div>
  );
}
