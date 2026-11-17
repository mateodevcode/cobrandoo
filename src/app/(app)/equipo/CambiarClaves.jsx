"use client";

import { useState } from "react";
import { KeyRound, Wand2, Copy } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { NOMBRE_ROL } from "@/lib/roles";
import { api } from "@/lib/api";

function generarClave() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/**
 * Solo el dueño (y el super admin desde Organizaciones) cambia contraseñas.
 * Nadie recupera la suya por su cuenta: si un cobrador la olvida, se la cambia el dueño.
 */
export function CambiarClaves({ personas, yoId }) {
  const [abierta, setAbierta] = useState(false);
  const [editando, setEditando] = useState(null);

  return (
    <>
      <Boton variante="secundario" tamano="sm" onClick={() => setAbierta(true)}>
        <KeyRound className="size-4" /> Contraseñas
      </Boton>
      <Hoja
        abierta={abierta}
        onCerrar={() => {
          setAbierta(false);
          setEditando(null);
        }}
        titulo="Contraseñas del equipo"
        descripcion="Por seguridad, nadie cambia su propia contraseña: lo haces tú. Al cambiarla se cierran sus sesiones abiertas."
      >
        <ul className="flex flex-col divide-y divide-borde">
          {personas.map((p) => (
            <li key={p.id} className="py-3">
              <div className="flex items-center gap-3">
                <Avatar nombre={p.nombre} className="size-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.nombre} {p.id === yoId && <span className="font-normal text-suave">(tú)</span>}
                  </p>
                  <p className="truncate text-xs text-suave">
                    {NOMBRE_ROL[p.rol]} · {p.email}
                  </p>
                </div>
                {p.estado !== "activo" && <Insignia tono="neutro">{p.estado}</Insignia>}
                {editando !== p.id && (
                  <Boton tamano="sm" variante="fantasma" onClick={() => setEditando(p.id)}>
                    Cambiar
                  </Boton>
                )}
              </div>
              {editando === p.id && <FormClave persona={p} esYo={p.id === yoId} onListo={() => setEditando(null)} />}
            </li>
          ))}
        </ul>
      </Hoja>
    </>
  );
}

function FormClave({ persona, esYo, onListo }) {
  const [clave, setClave] = useState(() => generarClave());
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setError("");
    try {
      await api(`/api/equipo/${persona.id}/clave`, { method: "POST", body: { password: clave } });
      if (esYo) {
        toast.success("Contraseña cambiada. Vuelve a ingresar con la nueva.");
        // Recarga completa a propósito: la sesión ya no es válida
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/login";
        return;
      }
      await navigator.clipboard?.writeText(clave).catch(() => {});
      toast.success(`Contraseña de ${persona.nombre} cambiada`, { description: "La copié: entrégasela en persona o por un medio seguro." });
      onListo();
    } catch (err) {
      setError(err.campos?.[0]?.mensaje || err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-3 flex flex-col gap-2 rounded-xl bg-fondo p-3">
      <div className="flex items-end gap-2">
        <Campo etiqueta="Nueva contraseña" value={clave} onChange={(e) => setClave(e.target.value)} className="flex-1" autoCapitalize="none" autoComplete="off" />
        <Boton type="button" variante="secundario" onClick={() => setClave(generarClave())} aria-label="Generar otra">
          <Wand2 className="size-4" />
        </Boton>
        <Boton type="button" variante="secundario" onClick={() => navigator.clipboard?.writeText(clave).then(() => toast.success("Copiada"))} aria-label="Copiar">
          <Copy className="size-4" />
        </Boton>
      </div>
      {error && <p className="text-sm text-peligro">{error}</p>}
      {esYo && <p className="text-xs text-alerta">Es tu propia contraseña: se cerrará tu sesión en todos tus equipos.</p>}
      <div className="flex justify-end gap-2">
        <Boton type="button" variante="fantasma" tamano="sm" onClick={onListo}>
          Cancelar
        </Boton>
        <Boton type="submit" tamano="sm" cargando={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}
