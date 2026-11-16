"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, UploadCloud } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { Hoja } from "@/components/ui/Hoja";
import { useSync } from "@/lib/offline/hooks";
import { sincronizador } from "@/lib/offline/sync";
import { confirmar } from "@/components/ui/Dialogos";
import { cn } from "@/lib/cn";

/** Indicador de conexión y cola de envíos. Al tocarlo muestra el detalle. */
export function EstadoConexion({ oscuro, className }) {
  const s = useSync();
  const [abierta, setAbierta] = useState(false);
  if (!s.listo) return null;

  const errores = s.pendientes.filter((p) => p.estado === "error");
  const porEnviar = s.pendientes.length - errores.length;

  let icono = CheckCircle2;
  let texto = "Al día";
  let tono = oscuro ? "text-white/60" : "text-suave";
  if (errores.length) {
    icono = AlertTriangle;
    texto = `${errores.length} con error`;
    tono = "bg-peligro-suave text-peligro";
  } else if (!s.enLinea) {
    icono = CloudOff;
    texto = porEnviar ? `Sin señal · ${porEnviar} por enviar` : "Sin señal";
    tono = "bg-alerta-suave text-alerta";
  } else if (s.sincronizando) {
    icono = Loader2;
    texto = porEnviar ? `Enviando ${porEnviar}…` : "Sincronizando…";
    tono = oscuro ? "text-white/80" : "text-primario";
  } else if (porEnviar) {
    icono = UploadCloud;
    texto = `${porEnviar} por enviar`;
    tono = "bg-primario-suave text-primario";
  } else if (s.sesionVencida) {
    icono = AlertTriangle;
    texto = "Inicia sesión para enviar";
    tono = "bg-alerta-suave text-alerta";
  }
  const Icono = icono;

  return (
    <>
      <button
        onClick={() => setAbierta(true)}
        className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", tono, className)}
        aria-label={`Estado de sincronización: ${texto}`}
      >
        <Icono className={cn("size-3.5", s.sincronizando && Icono === Loader2 && "animate-spin")} />
        {texto}
      </button>

      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo="Sincronización" descripcion={descripcion(s)}>
        <div className="flex flex-col gap-4">
          {s.pendientes.length === 0 ? (
            <p className="rounded-xl bg-exito-suave p-3 text-sm text-exito">Todo lo que registraste ya está en el servidor.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {s.pendientes.map((op) => (
                <li key={op.id} className={cn("rounded-xl border p-3 text-sm", op.estado === "error" ? "border-peligro/40 bg-peligro-suave/40" : "border-borde")}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{op.descripcion}</p>
                      <p className="text-xs text-suave">
                        {new Date(op.creado_en).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" })}
                        {op.estado !== "error" && op.intentos > 0 && ` · ${op.intentos} intento(s)`}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", op.estado === "error" ? "bg-peligro text-white" : "bg-fondo text-suave")}>
                      {op.estado === "error" ? "Rechazado" : "Por enviar"}
                    </span>
                  </div>
                  {op.error && <p className="mt-2 text-xs text-peligro">{op.error}</p>}
                  {op.estado === "error" && (
                    <div className="mt-2 flex gap-3">
                      <button onClick={() => sincronizador.reintentar(op.id)} className="text-xs font-semibold text-primario">
                        Reintentar
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await confirmar({
                            titulo: "¿Descartar esta operación?",
                            mensaje: `“${op.descripcion}” se borrará del teléfono y no se enviará al servidor.`,
                            textoConfirmar: "Descartar",
                            peligro: true,
                          });
                          if (ok) sincronizador.descartar(op.id);
                        }}
                        className="text-xs font-semibold text-peligro"
                      >
                        Descartar
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
          {s.sesionVencida && (
            <a href="/login?next=/ruta" className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
              Tu sesión venció. Toca aquí para ingresar de nuevo; lo pendiente se enviará después.
            </a>
          )}
          <Boton variante="secundario" cargando={s.sincronizando} onClick={() => sincronizador.sincronizar()}>
            <RefreshCw className="size-4" /> Sincronizar ahora
          </Boton>
        </div>
      </Hoja>
    </>
  );
}

function descripcion(s) {
  const cuando = s.ultimaSync
    ? `Datos actualizados: ${new Date(s.ultimaSync).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short", timeZone: "America/Bogota" })}`
    : "Aún no hay datos descargados en este teléfono.";
  return `${s.enLinea ? "Con conexión" : "Sin conexión"} · ${cuando}`;
}
