"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";

/** Borra la organización con todo lo que tiene. Pide escribir el nombre exacto. */
export function EliminarOrganizacion({ org, resumen }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const coincide = texto.trim().toLowerCase() === org.nombre.trim().toLowerCase();

  async function eliminar(e) {
    e.preventDefault();
    if (!coincide) return;
    setEnviando(true);
    setError("");
    try {
      await api(`/api/admin/organizaciones/${org.id}`, { method: "DELETE", body: { confirmacion: texto } });
      toast.success(`Se eliminó "${org.nombre}" con todos sus datos`);
      router.replace("/admin");
      router.refresh();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <section className="rounded-tarjeta border border-peligro/30 bg-peligro-suave/40 p-5">
      <h2 className="font-semibold text-peligro">Zona de peligro</h2>
      <p className="mt-1 text-sm text-suave">
        Eliminar la organización borra para siempre a todas sus personas, clientes, préstamos, pagos, cajas y cierres. Si solo quieres que nadie entre, usa
        “Desactivar”.
      </p>
      <Boton variante="peligro" tamano="sm" className="mt-3" onClick={() => setAbierta(true)}>
        <Trash2 className="size-4" /> Eliminar organización
      </Boton>

      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={`Eliminar "${org.nombre}"`} descripcion="Esta acción no se puede deshacer.">
        <form onSubmit={eliminar} className="flex flex-col gap-4">
          <ul className="rounded-xl bg-peligro-suave p-3 text-sm text-peligro">
            <li>• {resumen.usuarios} persona(s)</li>
            <li>• {resumen.clientes} cliente(s)</li>
            <li>• {resumen.prestamos} préstamo(s) y todos sus pagos</li>
            <li>• Cajas, cierres, avisos y registros de actividad</li>
          </ul>
          <Campo
            etiqueta={`Para confirmar, escribe: ${org.nombre}`}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
            autoFocus
            error={error}
          />
          <Boton type="submit" variante="peligro" cargando={enviando} disabled={!coincide}>
            Eliminar todo para siempre
          </Boton>
        </form>
      </Hoja>
    </section>
  );
}
