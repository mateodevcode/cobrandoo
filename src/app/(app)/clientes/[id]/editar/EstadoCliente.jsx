"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { api } from "@/lib/api";

export function EstadoCliente({ id, estado }) {
  const router = useRouter();
  const [cargando, setCargando] = useState(false);
  const activo = estado === "activo";

  async function alternar() {
    if (activo && !window.confirm("El cliente dejará de aparecer en la ruta y no podrá recibir préstamos nuevos. ¿Continuar?")) return;
    setCargando(true);
    try {
      await api(`/api/clientes/${id}`, { method: "PATCH", body: { estado: activo ? "inactivo" : "activo" } });
      toast.success(activo ? "Cliente desactivado" : "Cliente activado");
      router.refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <Boton variante="secundario" tamano="sm" cargando={cargando} onClick={alternar}>
      {activo ? "Desactivar" : "Activar"}
    </Boton>
  );
}
