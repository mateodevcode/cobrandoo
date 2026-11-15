"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { Campo } from "@/components/ui/Campo";
import { METODOS_PAGO } from "@/lib/prestamos/constantes";
import { METODOS } from "@/lib/prestamos/metodos";
import { dinero } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";
import { cn } from "@/lib/cn";

/**
 * Registrar un abono. Se guarda primero en el teléfono (funciona sin señal) y se envía solo.
 * `prestamos`: [{ id, metodo, saldo, sugerido_hoy, valor_cuota }]
 */
export function FormPago({ clienteId, clienteNombre, prestamos, onListo }) {
  const [prestamoId, setPrestamoId] = useState(prestamos[0]?.id);
  const p = prestamos.find((x) => x.id === prestamoId) ?? prestamos[0];
  const [monto, setMonto] = useState(sugerencia(prestamos[0]));
  const [metodo, setMetodo] = useState("efectivo");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const atajos = [
    p.sugerido_hoy > 0 && { etiqueta: "Al día", valor: p.sugerido_hoy },
    p.valor_cuota && { etiqueta: "1 cuota", valor: Math.min(p.valor_cuota, p.saldo) },
    { etiqueta: "Todo", valor: p.saldo },
  ].filter(Boolean);

  async function enviar(e) {
    e.preventDefault();
    if (!monto) return setError("Escribe el valor");
    if (monto > p.saldo) return setError(`Máximo ${dinero(p.saldo)}`);
    setError("");
    setEnviando(true);
    try {
      // El id se crea aquí: si se reintenta el envío, el servidor no lo duplica
      const id = crypto.randomUUID();
      await sincronizador.encolar({
        id,
        tipo: "pago",
        url: "/api/pagos",
        body: { id, prestamo_id: p.id, monto, metodo, nota, creado_en_dispositivo: new Date().toISOString() },
        local: { cliente_id: clienteId },
        descripcion: `Cobro de ${dinero(monto)} a ${clienteNombre}`,
      });
      const resta = p.saldo - monto;
      toast.success(`Cobro de ${dinero(monto)} guardado`, {
        description: [
          resta <= 0 ? "¡Préstamo pagado por completo!" : `Queda debiendo ${dinero(resta)}`,
          !navigator.onLine && "Sin señal: se enviará solo cuando vuelva.",
        ].filter(Boolean).join(" "),
      });
      onListo?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      {prestamos.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold text-suave">Préstamo</span>
          {prestamos.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                setPrestamoId(x.id);
                setMonto(sugerencia(x));
              }}
              className={cn(
                "flex items-center justify-between rounded-xl border px-3 py-2.5 text-left text-sm",
                x.id === p.id ? "border-primario bg-primario-suave" : "border-borde"
              )}
            >
              <span>{METODOS[x.metodo]?.nombre}</span>
              <span className="tabular font-semibold">Debe {dinero(x.saldo)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="rounded-2xl bg-fondo p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-suave">Debe en total</span>
          <span className="tabular font-semibold">{dinero(p.saldo)}</span>
        </div>
        {p.sugerido_hoy > 0 && (
          <div className="mt-1 flex justify-between">
            <span className="text-suave">Para quedar al día</span>
            <span className="tabular font-semibold text-primario">{dinero(p.sugerido_hoy)}</span>
          </div>
        )}
      </div>

      <CampoDinero etiqueta="Valor recibido" valor={monto} onCambio={setMonto} grande autoFocus error={error} />
      <div className="-mt-2 flex flex-wrap gap-2">
        {atajos.map((a) => (
          <button key={a.etiqueta} type="button" onClick={() => setMonto(a.valor)} className="rounded-lg bg-fondo px-3 py-1.5 text-xs font-semibold text-suave hover:text-texto">
            {a.etiqueta} · {dinero(a.valor)}
          </button>
        ))}
      </div>

      <Chips etiqueta="Forma de pago" opciones={METODOS_PAGO} valor={metodo} onCambio={setMetodo} />
      <Campo etiqueta="Nota (opcional)" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={300} />

      <Boton type="submit" tamano="lg" variante="acento" cargando={enviando}>
        Registrar cobro {monto > 0 && `de ${dinero(monto)}`}
      </Boton>
    </form>
  );
}

function sugerencia(p) {
  if (!p) return 0;
  return p.sugerido_hoy > 0 ? p.sugerido_hoy : p.valor_cuota ? Math.min(p.valor_cuota, p.saldo) : 0;
}
