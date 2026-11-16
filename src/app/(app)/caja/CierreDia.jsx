"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Lock, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { CampoDinero } from "@/components/ui/CampoDinero";
import { Hoja } from "@/components/ui/Hoja";
import { Insignia } from "@/components/ui/Insignia";
import { api } from "@/lib/api";
import { dinero, fecha as fmtFecha } from "@/lib/formato";
import { sincronizador } from "@/lib/offline/sync";
import { useSync } from "@/lib/offline/hooks";
import { cn } from "@/lib/cn";

export const ESTADO_CIERRE = {
  pendiente: { texto: "Pendiente de revisión", tono: "alerta" },
  aprobado: { texto: "Aprobado", tono: "exito" },
  con_fallo: { texto: "Con fallo", tono: "peligro" },
  resuelto: { texto: "Resuelto", tono: "info" },
};

/**
 * Cierre del día del cobrador: cuenta el efectivo y se lo entrega todo al jefe.
 * Muestra también días anteriores que quedaron sin cerrar.
 */
export function CierreDia() {
  const router = useRouter();
  const { pendientes, enLinea } = useSync();
  const [estado, setEstado] = useState(null);
  const [cerrando, setCerrando] = useState(null); // fecha que se está cerrando

  const cargar = useCallback(() => {
    if (!navigator.onLine) return;
    api("/api/cierres/estado", { redirigir: false }).then(setEstado).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(cargar, 0);
    return () => clearTimeout(t);
  }, [cargar]);

  function abrir(fecha) {
    if (!enLinea || !navigator.onLine) return toast.error("Necesitas internet para cerrar el día.");
    if (pendientes.length > 0) {
      sincronizador.sincronizar();
      return toast.error("Primero deben enviarse tus operaciones pendientes.", { description: "Espera a que el indicador diga “Al día” y vuelve a intentar." });
    }
    setCerrando(fecha);
  }

  if (!estado) return null;

  return (
    <>
      {estado.diasSinCerrar.map((f) => (
        <div key={f} className="flex items-center gap-3 rounded-2xl border border-alerta/30 bg-alerta-suave p-4 text-sm text-alerta">
          <AlertTriangle className="size-5 shrink-0" />
          <p className="flex-1">Dejaste sin cerrar el {fmtFecha(f)}.</p>
          <Boton tamano="sm" variante="secundario" onClick={() => abrir(f)}>
            Cerrar ese día
          </Boton>
        </div>
      ))}

      {estado.cerrada && estado.cierre ? (
        <section className="tarjeta flex flex-col gap-2 p-4">
          <div className="flex items-center gap-2">
            <Lock className="size-4 text-suave" />
            <h2 className="flex-1 font-semibold">Día cerrado</h2>
            <Insignia tono={ESTADO_CIERRE[estado.cierre.estado].tono}>{ESTADO_CIERRE[estado.cierre.estado].texto}</Insignia>
          </div>
          <p className="text-sm text-suave">
            Entregaste <span className="tabular font-semibold text-texto">{dinero(estado.cierre.efectivo_contado)}</span> de{" "}
            <span className="tabular">{dinero(estado.cierre.efectivo_esperado)}</span> esperados
            {estado.cierre.diferencia !== 0 && (
              <span className={cn("font-semibold", estado.cierre.diferencia < 0 ? "text-peligro" : "text-exito")}>
                {" "}({estado.cierre.diferencia < 0 ? "faltan" : "sobran"} {dinero(Math.abs(estado.cierre.diferencia))})
              </span>
            )}
            {estado.cierre.jefe_nombre && ` a ${estado.cierre.jefe_nombre}`}.
          </p>
          {estado.cierre.comentario_revision && <p className="rounded-xl bg-fondo p-2.5 text-sm">“{estado.cierre.comentario_revision}” — {estado.cierre.revisado_por_nombre}</p>}
          <Link href="/caja/cierres" className="text-sm font-semibold text-primario">
            Ver mis cierres
          </Link>
        </section>
      ) : (
        <Boton tamano="lg" variante="primario" onClick={() => abrir(estado.fecha)} disabled={estado.movimientos === 0}>
          <CheckCircle2 className="size-5" /> Cerrar el día y entregar
        </Boton>
      )}

      {cerrando && (
        <FormCierre
          fecha={cerrando}
          esHoy={cerrando === estado.fecha}
          onCerrar={() => setCerrando(null)}
          onListo={() => {
            setCerrando(null);
            cargar();
            sincronizador.sincronizar();
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function FormCierre({ fecha, esHoy, onCerrar, onListo }) {
  const [datos, setDatos] = useState(null);
  const [contado, setContado] = useState(0);
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api(`/api/cierres/estado?fecha=${fecha}`, { redirigir: false })
      .then((d) => {
        setDatos(d);
        setContado(Math.max(0, d.efectivoEsperado));
      })
      .catch((e) => setError(e.message));
  }, [fecha]);

  const diferencia = datos ? contado - datos.efectivoEsperado : 0;

  async function enviar(e) {
    e.preventDefault();
    if (diferencia !== 0 && observacion.trim().length < 3) return setError("Explica por qué no cuadra");
    setEnviando(true);
    setError("");
    try {
      await api("/api/cierres", { method: "POST", body: { efectivo_contado: contado, observacion, fecha } });
      toast.success("Día cerrado", { description: "Tu jefe recibió el aviso para revisarlo." });
      onListo();
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
      setEnviando(false);
    }
  }

  return (
    <Hoja abierta onCerrar={onCerrar} titulo={esHoy ? "Cerrar el día" : `Cerrar el ${fmtFecha(fecha)}`} descripcion="Cuenta el efectivo que tienes y entrégaselo todo a tu jefe.">
      {!datos ? (
        <p className="py-6 text-center text-sm text-suave">{error || "Calculando…"}</p>
      ) : (
        <form onSubmit={enviar} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-xl bg-fondo p-3">
              <p className="text-xs text-suave">Efectivo esperado</p>
              <p className="tabular text-lg font-bold">{dinero(datos.efectivoEsperado)}</p>
            </div>
            <div className="rounded-xl bg-fondo p-3">
              <p className="text-xs text-suave">Digital (se revisa aparte)</p>
              <p className="tabular text-lg font-bold">{dinero(datos.digital)}</p>
            </div>
          </div>

          <CampoDinero etiqueta="Efectivo que tienes en la mano" valor={contado} onCambio={setContado} grande autoFocus />

          <div
            className={cn(
              "rounded-xl p-3 text-sm font-semibold",
              diferencia === 0 ? "bg-exito-suave text-exito" : diferencia < 0 ? "bg-peligro-suave text-peligro" : "bg-alerta-suave text-alerta"
            )}
          >
            {diferencia === 0 ? "✓ Cuadra exacto" : diferencia < 0 ? `Faltan ${dinero(-diferencia)}` : `Sobran ${dinero(diferencia)}`}
          </div>

          <Campo
            as="textarea"
            etiqueta={diferencia === 0 ? "Observación (opcional)" : "¿Por qué no cuadra?"}
            value={observacion}
            onChange={(e) => setObservacion(e.target.value)}
            rows={2}
            maxLength={500}
            className="[&_textarea]:h-auto [&_textarea]:py-2.5"
          />

          {error && <p className="rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro">{error}</p>}
          <p className="text-xs text-suave">Al cerrar, la caja de ese día ya no acepta cobros ni gastos. Tu jefe revisará el cuadre.</p>
          <Boton type="submit" tamano="lg" cargando={enviando}>
            Cerrar y entregar {dinero(contado)}
          </Boton>
        </form>
      )}
    </Hoja>
  );
}
