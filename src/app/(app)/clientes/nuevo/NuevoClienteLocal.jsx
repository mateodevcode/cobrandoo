"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useSync } from "@/lib/offline/hooks";
import { FormCliente } from "@/components/negocio/FormCliente";
import { CargandoDatos } from "@/components/offline/CargandoDatos";

export function NuevoClienteLocal({ usuarioId, esJefe }) {
  const { datos } = useSync();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/clientes" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Clientes
      </Link>
      <h1 className="text-2xl font-bold">Nuevo cliente</h1>
      {esJefe && !datos ? <CargandoDatos /> : <FormCliente usuarioId={usuarioId} cobradores={datos?.cobradores ?? []} esJefe={esJefe} />}
    </div>
  );
}
