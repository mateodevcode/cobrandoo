"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Hoja } from "@/components/ui/Hoja";
import { api } from "@/lib/api";

/**
 * Elimina a una persona conservando su historial. Si tiene clientes, hay que elegir
 * a qué cobrador pasan; si tiene gente a cargo, primero hay que reasignarla.
 */
export function EliminarUsuario({ usuario, usuarios }) {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [destino, setDestino] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const cobradores = usuarios.filter((u) => u.rol === "cobrador" && u.estado === "activo" && u.id !== usuario.id);
  const tieneClientes = usuario.clientes_total > 0;
  const bloqueado = usuario.a_cargo > 0 || (tieneClientes && cobradores.length === 0);

  async function eliminar(e) {
    e.preventDefault();
    if (tieneClientes && !destino) return setError("Elige a qué cobrador pasan sus clientes");
    setEnviando(true);
    setError("");
    try {
      const r = await api(`/api/admin/usuarios/${usuario.id}`, { method: "DELETE", body: { reasignar_a: destino || null } });
      toast.success(`${usuario.nombre} fue eliminado`, {
        description: r.reasignadoA ? `${r.clientesReasignados} cliente(s) pasaron a ${r.reasignadoA}.` : "Su historial se conserva.",
      });
      setAbierta(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setAbierta(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-peligro hover:underline">
        <Trash2 className="size-3.5" /> Eliminar persona
      </button>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={`Eliminar a ${usuario.nombre}`}>
        <form onSubmit={eliminar} className="flex flex-col gap-4">
          <div className="rounded-xl bg-fondo p-3 text-sm">
            <p className="font-semibold">Qué pasa al eliminarlo:</p>
            <ul className="mt-1 list-disc pl-5 text-suave">
              <li>Ya no podrá ingresar y su correo queda libre para otra cuenta.</li>
              <li>Todo lo que hizo (préstamos, cobros, caja, cierres) se conserva con su nombre.</li>
              <li>Deja de aparecer en las listas de personas.</li>
            </ul>
          </div>

          {usuario.a_cargo > 0 && (
            <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
              Tiene {usuario.a_cargo} persona(s) a cargo. Primero cámbiales el jefe (en “Reporta a”) y luego vuelve aquí.
            </p>
          )}

          {usuario.a_cargo === 0 && tieneClientes && (
            cobradores.length === 0 ? (
              <p className="rounded-xl bg-alerta-suave p-3 text-sm text-alerta">
                Tiene {usuario.clientes_total} cliente(s) y no hay otro cobrador activo que los reciba. Crea uno primero.
              </p>
            ) : (
              <Campo
                as="select"
                etiqueta={`Sus ${usuario.clientes_total} cliente(s) y ${usuario.prestamos_activos} préstamo(s) activo(s) pasan a:`}
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                required
              >
                <option value="" disabled>
                  Elegir cobrador…
                </option>
                {cobradores.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Campo>
            )
          )}

          {error && <p className="rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro">{error}</p>}
          <Boton type="submit" variante="peligro" cargando={enviando} disabled={bloqueado}>
            Eliminar a {usuario.nombre.split(" ")[0]}
          </Boton>
        </form>
      </Hoja>
    </>
  );
}
