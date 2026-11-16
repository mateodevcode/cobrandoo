"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { Hoja } from "@/components/ui/Hoja";
import { METODOS_PAGO } from "@/lib/prestamos/constantes";
import { dinero } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";

export function BotonBase({ cobrador }) {
  const [abierta, setAbierta] = useState(false);
  const [monto, setMonto] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    if (!monto) return setError("Escribe el valor");
    setEnviando(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      const r = await sincronizador.encolarYEsperar({
        id,
        tipo: "base",
        url: "/api/caja/base",
        body: { id, cobrador_id: cobrador.id, monto, metodo, creado_en_dispositivo: new Date().toISOString() },
        local: {},
        descripcion: `Base de ${dinero(monto)} para ${cobrador.nombre}`,
      }, 6000);
      if (r.error) {
        await sincronizador.descartar(id);
        return setError(r.error);
      }
      toast.success(`Base de ${dinero(monto)} entregada a ${cobrador.nombre}`, { description: r.enviado ? undefined : "Sin señal: se enviará sola cuando vuelva." });
      setAbierta(false);
      setMonto(0);
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Boton tamano="sm" className="h-8 text-xs" onClick={() => setAbierta(true)}>
        {cobrador.rol === "supervisor" ? "Entregar dinero" : "Entregar base"}
      </Boton>
      <Hoja
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo={`Entregar ${cobrador.rol === "supervisor" ? "dinero" : "base"} a ${cobrador.nombre}`}
        descripcion={
          cobrador.rol === "supervisor"
            ? "Sale de tu caja y entra a la suya, para que reparta la base a sus cobradores o preste."
            : "Sale de tu caja y queda en la suya de hoy; la debe cuadrar al cerrar el día."
        }
      >
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <CampoDinero etiqueta="Valor" valor={monto} onCambio={setMonto} grande autoFocus error={error} />
          <Chips etiqueta="Entregado en" opciones={METODOS_PAGO} valor={metodo} onCambio={setMetodo} />
          <Boton type="submit" tamano="lg" cargando={enviando}>
            Entregar {monto > 0 && dinero(monto)}
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
