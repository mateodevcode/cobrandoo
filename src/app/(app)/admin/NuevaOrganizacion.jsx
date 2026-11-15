"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { api } from "@/lib/api";

export function NuevaOrganizacion() {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      const { organizacion } = await api("/api/admin/organizaciones", {
        method: "POST",
        body: { nombre: new FormData(e.currentTarget).get("nombre") },
      });
      toast.success("Organización creada");
      router.push(`/admin/organizaciones/${organizacion.id}`);
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
      setEnviando(false);
    }
  }

  if (!abierto) {
    return (
      <Boton onClick={() => setAbierto(true)}>
        <Plus className="size-4" /> Nueva organización
      </Boton>
    );
  }

  return (
    <form onSubmit={enviar} className="flex w-full flex-wrap items-start gap-2 sm:w-auto">
      <Campo name="nombre" placeholder="Nombre del negocio" autoFocus required error={error} className="min-w-60 flex-1" />
      <Boton type="submit" cargando={enviando}>Crear</Boton>
      <Boton type="button" variante="fantasma" onClick={() => setAbierto(false)}>
        Cancelar
      </Boton>
    </form>
  );
}
