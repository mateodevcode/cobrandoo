"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useVista } from "@/lib/offline/hooks";
import { hoyBogota } from "@/lib/fechas";
import { CargandoDatos } from "@/components/offline/CargandoDatos";
import { FormPrestamo } from "./FormPrestamo";

export function NuevoPrestamoLocal() {
  const params = useSearchParams();
  const vista = useVista();

  const clientes = useMemo(() => {
    if (!vista) return [];
    const deuda = new Map();
    for (const p of vista.activos) deuda.set(p.cliente_id, (deuda.get(p.cliente_id) ?? 0) + p.saldo);
    return [...vista.clientes.values()]
      .filter((c) => c.estado === "activo")
      .map((c) => ({ id: c.id, nombre: c.nombre, barrio: c.barrio, cobrador_id: c.cobrador_id, saldo: deuda.get(c.id) ?? 0 }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [vista]);

  const cliente = clientes.find((c) => c.id === params.get("cliente")) ?? null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <Link href={cliente ? `/clientes/${cliente.id}` : "/clientes"} className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> {cliente ? cliente.nombre : "Clientes"}
      </Link>
      <h1 className="text-2xl font-bold">Nuevo préstamo</h1>
      {!vista ? <CargandoDatos /> : <FormPrestamo key={cliente?.id ?? "sin"} cliente={cliente} clientes={clientes} hoy={hoyBogota()} />}
    </div>
  );
}
