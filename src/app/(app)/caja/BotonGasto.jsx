"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Receipt } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Chips } from "@/components/ui/Chips";
import { Hoja } from "@/components/ui/Hoja";
import { CATEGORIAS_GASTO, METODOS_PAGO } from "@/lib/prestamos/constantes";
import { dinero } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";

export function BotonGasto() {
  const router = useRouter();
  const params = useSearchParams();
  const [abiertaLocal, setAbiertaLocal] = useState(false);
  // /caja?gasto=1 abre el formulario directamente (desde el botón +)
  const desdeUrl = params.get("gasto") === "1";
  const abierta = abiertaLocal || desdeUrl;
  const setAbierta = (v) => {
    setAbiertaLocal(v);
    if (!v && desdeUrl) router.replace("/caja", { scroll: false });
  };
  const [monto, setMonto] = useState(0);
  const [categoria, setCategoria] = useState("transporte");
  const [metodo, setMetodo] = useState("efectivo");
  const [descripcion, setDescripcion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    if (!monto) return setError("Escribe el valor");
    setEnviando(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      await sincronizador.encolar({
        id,
        tipo: "gasto",
        url: "/api/caja/gastos",
        body: { id, monto, categoria, metodo, descripcion, creado_en_dispositivo: new Date().toISOString() },
        local: {},
        descripcion: `Gasto de ${dinero(monto)}`,
      });
      toast.success(`Gasto de ${dinero(monto)} guardado`, { description: navigator.onLine ? undefined : "Sin señal: se enviará solo cuando vuelva." });
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
      <Boton variante="secundario" onClick={() => setAbierta(true)}>
        <Receipt className="size-4" /> Registrar gasto
      </Boton>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Registrar gasto">
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <CampoDinero etiqueta="Valor" valor={monto} onCambio={setMonto} grande autoFocus error={error} />
          <Chips etiqueta="Tipo de gasto" opciones={CATEGORIAS_GASTO} valor={categoria} onCambio={setCategoria} />
          <Chips etiqueta="Pagado con" opciones={METODOS_PAGO} valor={metodo} onCambio={setMetodo} />
          <Campo etiqueta="Descripción (opcional)" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} />
          <Boton type="submit" tamano="lg" cargando={enviando}>
            Guardar gasto
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
