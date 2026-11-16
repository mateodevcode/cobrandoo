"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";
import { confirmar } from "@/components/ui/Dialogos";

export function EstadoOrganizacion({ org }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);

  async function alternar() {
    const ok = await confirmar(
      org.activa
        ? {
            titulo: `¿Desactivar "${org.nombre}"?`,
            mensaje: "Nadie de esta organización podrá ingresar hasta que la vuelvas a activar. No se borra ningún dato.",
            textoConfirmar: "Desactivar",
            peligro: true,
          }
        : { titulo: `¿Activar "${org.nombre}"?`, mensaje: "Sus personas podrán volver a ingresar.", textoConfirmar: "Activar" }
    );
    if (!ok) return;
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
