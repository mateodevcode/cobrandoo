"use client";

import { useState } from "react";
import { Copy, Link2, MessageCircle, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";
import { confirmar } from "@/components/ui/Dialogos";

/** Link secreto para que el cliente vea su historial sin cuenta. */
export function CompartirHistorial({ clienteId, nombre, telefono, token: tokenInicial }) {
  const [abierta, setAbierta] = useState(false);
  const [token, setToken] = useState(tokenInicial);
  const [regenerando, setRegenerando] = useState(false);
  const url = typeof window === "undefined" ? "" : `${window.location.origin}/c/${token}`;
  const tel = telefono?.replace(/\D/g, "").slice(-10);
  const mensaje = `Hola ${nombre.split(" ")[0]}, aquí puedes ver tus préstamos y abonos cuando quieras: ${url}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar; mantén presionado el link para copiarlo.");
    }
  }

  async function regenerar() {
    const ok = await confirmar({
      titulo: "¿Generar un link nuevo?",
      mensaje: "El link anterior dejará de funcionar de inmediato. Tendrás que enviarle el nuevo al cliente.",
      textoConfirmar: "Generar link nuevo",
      peligro: true,
    });
    if (!ok) return;
    setRegenerando(true);
    try {
      const r = await api(`/api/clientes/${clienteId}/link`, { method: "POST" });
      setToken(r.token);
      toast.success("Link nuevo generado");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRegenerando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="inline-flex h-9 items-center gap-2 rounded-xl border border-borde px-3 text-sm font-medium hover:bg-fondo">
        <Link2 className="size-4" /> Su historial
      </button>
      <Hoja
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Historial del cliente"
        descripcion="Un link personal y secreto: el cliente ve sus préstamos, cuotas y abonos sin necesidad de cuenta."
      >
        <div className="flex flex-col gap-3">
          <p className="rounded-xl bg-fondo p-3 font-mono text-xs break-all">{url}</p>
          <div className="grid grid-cols-2 gap-2">
            <Boton variante="secundario" onClick={copiar}>
              <Copy className="size-4" /> Copiar
            </Boton>
            <a
              href={`https://wa.me/${tel ? `57${tel}` : ""}?text=${encodeURIComponent(mensaje)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-acento-oscuro px-4 text-sm font-semibold text-white"
            >
              <MessageCircle className="size-4" /> WhatsApp
            </a>
          </div>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-center text-sm font-semibold text-primario">
            Ver como lo ve el cliente
          </a>
          <button onClick={regenerar} disabled={regenerando} className="mt-2 inline-flex items-center justify-center gap-1.5 text-xs text-suave hover:text-peligro">
            <RefreshCw className="size-3.5" /> Generar un link nuevo (si se filtró)
          </button>
        </div>
      </Hoja>
    </>
  );
}
