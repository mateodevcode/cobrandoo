"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";

/** Pide un motivo y anula (pago o préstamo). `url` = endpoint de anulación. */
export function BotonAnular({ url, titulo, descripcion, etiqueta = "Anular", className, onListo }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await api(url, { method: "POST", body: { motivo } });
      toast.success("Anulado");
      setAbierta(false);
      router.refresh();
      onListo?.();
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className={className ?? "text-xs font-semibold text-peligro hover:underline"}>
        {etiqueta}
      </button>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={titulo} descripcion={descripcion}>
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <Campo etiqueta="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} maxLength={300} autoFocus error={error} placeholder="Ej: se registró dos veces" />
          <p className="text-xs text-suave">Queda registrado quién lo anuló y por qué. El dinero se devuelve en la caja con un movimiento de anulación.</p>
          <Boton type="submit" variante="peligro" cargando={enviando}>
            Confirmar anulación
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
