"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";

export function EstadoOrganizacion({ org }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    const mensaje = org.activa
      ? "Al desactivarla, nadie de esta organización podrá ingresar. ¿Continuar?"
      : "¿Reactivar la organización?";
    if (!window.confirm(mensaje)) return;
    setCargando(true);
    try {
      await api(`/api/admin/organizaciones/${org.id}`, { method: "PATCH", body: { activa: !org.activa } });
      toast.success(org.activa ? "Organización desactivada" : "Organización activada");
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Boton variante={org.activa ? "secundario" : "primario"} tamano="sm" cargando={cargando} onClick={alternar}>
      {org.activa ? "Desactivar" : "Activar"}
    </Boton>
  );
}
