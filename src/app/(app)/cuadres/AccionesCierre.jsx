"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";

/** Aprobar, marcar con fallo o resolver un cierre. */
export function AccionesCierre({ id, estado, nombre }) {
  const router = useRouter();
  const [modo, setModo] = useState(null); // "rechazar" | "resolver"
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(url, body, mensaje) {
    setEnviando(true);
    setError("");
    try {
      await api(url, { method: "POST", body });
      toast.success(mensaje);
      setModo(null);
      setComentario("");
      router.refresh();
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
      if (!modo) toast.error(err.message);
    } finally {
      setEnviando(false);
    }
  }

  if (estado === "aprobado" || estado === "resuelto") return null;

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {estado === "pendiente" && (
          <>
            <Boton tamano="sm" variante="acento" cargando={enviando && !modo} onClick={() => enviar(`/api/cierres/${id}/revisar`, { decision: "aprobar" }, `Cierre de ${nombre} aprobado`)}>
              Aprobar
            </Boton>
            <Boton tamano="sm" variante="secundario" onClick={() => setModo("rechazar")}>
              Marcar con fallo
            </Boton>
          </>
        )}
        {estado === "con_fallo" && (
          <Boton tamano="sm" onClick={() => setModo("resolver")}>
            Marcar como resuelto
          </Boton>
        )}
      </div>

      <Hoja
        abierta={!!modo}
        onCerrar={() => setModo(null)}
        titulo={modo === "rechazar" ? `Fallo en el cierre de ${nombre}` : "Resolver el fallo"}
        descripcion={modo === "rechazar" ? "Queda registrado y el cobrador recibe el aviso. No lo bloquea: lo resuelven entre los dos." : "Explica cómo se arregló (repuso el dinero, era un error de registro, etc.)."}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (modo === "rechazar") enviar(`/api/cierres/${id}/revisar`, { decision: "rechazar", comentario }, "Cierre marcado con fallo");
            else enviar(`/api/cierres/${id}/resolver`, { comentario }, "Fallo resuelto");
          }}
          className="flex flex-col gap-4"
        >
          <Campo
            as="textarea"
            etiqueta={modo === "rechazar" ? "¿Qué falló?" : "¿Cómo se resolvió?"}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            required
            minLength={3}
            maxLength={500}
            autoFocus
            error={error}
            className="[&_textarea]:h-auto [&_textarea]:py-2.5"
          />
          <Boton type="submit" variante={modo === "rechazar" ? "peligro" : "primario"} cargando={enviando}>
            {modo === "rechazar" ? "Marcar con fallo" : "Marcar como resuelto"}
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
