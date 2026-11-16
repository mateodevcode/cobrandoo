"use client";

import { useState } from "react";
import { PiggyBank } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { Hoja } from "@/components/ui/Hoja";
import { METODOS_PAGO } from "@/lib/prestamos/constantes";
import { dinero } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";

/** El dueño anota el dinero que mete al negocio (entra a su caja para repartir). */
export function BotonCapital() {
  const [abierta, setAbierta] = useState(false);
  const [monto, setMonto] = useState(0);
  const [metodo, setMetodo] = useState("efectivo");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    if (monto < 1000) return setError("Escribe el valor");
    setEnviando(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      await sincronizador.encolar({
        id,
        tipo: "capital",
        url: "/api/caja/capital",
        body: { id, monto, metodo, descripcion, creado_en_dispositivo: new Date().toISOString() },
        local: {},
        descripcion: `Capital de ${dinero(monto)}`,
      });
      toast.success(`Capital de ${dinero(monto)} registrado`);
      setAbierta(false);
      setMonto(0);
      setDescripcion("");
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <Boton onClick={() => setAbierta(true)}>
        <PiggyBank className="size-4" /> Registrar capital
      </Boton>
      <Hoja
        abierta={abierta}
        onCerrar={() => setAbierta(false)}
        titulo="Registrar capital"
        descripcion="El dinero que pones en el negocio. Entra a tu caja y desde ahí lo entregas a supervisores y cobradores."
      >
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <CampoDinero etiqueta="Valor" valor={monto} onCambio={setMonto} grande autoFocus error={error} />
          <Chips etiqueta="Está en" opciones={METODOS_PAGO} valor={metodo} onCambio={setMetodo} />
          <Campo etiqueta="Nota (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} placeholder="Ej: capital inicial, ahorro, préstamo bancario" />
          <Boton type="submit" tamano="lg" cargando={enviando}>
            Registrar {monto > 0 && dinero(monto)}
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
