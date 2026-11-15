"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { Hoja } from "@/components/ui/Hoja";
import { METODOS_PAGO } from "@/lib/prestamos/constantes";
import { dinero } from "@/lib/formato";
import { api } from "@/lib/api";

export function BotonBase({ cobrador }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [monto, setMonto] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [id, setId] = useState(() => crypto.randomUUID());

  async function enviar(e) {
    e.preventDefault();
    if (!monto) return setError("Escribe el valor");
    setEnviando(true);
    setError("");
    try {
      await api("/api/caja/base", { method: "POST", body: { id, cobrador_id: cobrador.id, monto, metodo } });
      toast.success(`Base de ${dinero(monto)} entregada a ${cobrador.nombre}`);
      setAbierta(false);
      setMonto(0);
      setId(crypto.randomUUID());
      router.refresh();
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Boton tamano="sm" className="h-8 text-xs" onClick={() => setAbierta(true)}>
        Entregar base
      </Boton>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={`Entregar base a ${cobrador.nombre}`} descripcion="Queda en su caja de hoy y la debe cuadrar al cerrar el día.">
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
