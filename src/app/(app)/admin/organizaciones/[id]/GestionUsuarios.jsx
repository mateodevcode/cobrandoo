"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { JEFES_PERMITIDOS, NOMBRE_ROL, ESTADOS_USUARIO } from "@/lib/roles";
import { api } from "@/lib/api";

const GRUPOS = [
  { rol: "dueno", titulo: "Dueños", ayuda: "Ven todo el negocio. Puede haber varios (familiares o socios)." },
  { rol: "supervisor", titulo: "Supervisores", ayuda: "Ven y aprueban el trabajo de los cobradores a su cargo." },
  { rol: "cobrador", titulo: "Cobradores", ayuda: "Prestan, cobran y cierran su día." },
];

const TONO_ESTADO = { activo: "exito", inactivo: "neutro", suspendido: "peligro" };

function generarClave() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
}

/** Posibles jefes para un rol, entre los usuarios activos (excluye al propio usuario). */
function jefesPara(rol, usuarios, excluirId) {
  const roles = JEFES_PERMITIDOS[rol] ?? [];
  return usuarios.filter((u) => roles.includes(u.rol) && u.estado === "activo" && u.id !== excluirId);
}

export function GestionUsuarios({ organizacionId, usuarios }) {
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usuarios</h2>
        {!creando && (
          <Boton onClick={() => setCreando(true)}>
            <Plus className="size-4" /> Nuevo usuario
          </Boton>
        )}
      </div>

      {creando && <FormNuevo organizacionId={organizacionId} usuarios={usuarios} onCerrar={() => setCreando(false)} />}

      {GRUPOS.map((g) => {
        const lista = usuarios.filter((u) => u.rol === g.rol);
        return (
          <section key={g.rol} className="tarjeta overflow-hidden">
            <div className="border-b border-borde px-5 py-3">
              <h3 className="text-sm font-semibold">
                {g.titulo} <span className="font-normal text-suave">({lista.length})</span>
              </h3>
              <p className="text-xs text-suave">{g.ayuda}</p>
            </div>
            {lista.length === 0 ? (
              <p className="px-5 py-6 text-sm text-suave">Ninguno todavía.</p>
            ) : (
              <ul className="divide-y divide-borde">
                {lista.map((u) => (
                  <li key={u.id} className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar nombre={u.nombre} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{u.nombre}</p>
                        <p className="truncate text-xs text-suave">
                          {u.email}
                          {u.jefe_nombre && ` · reporta a ${u.jefe_nombre}`}
                          {u.telefono && ` · ${u.telefono}`}
                        </p>
                      </div>
                      <Insignia tono={TONO_ESTADO[u.estado]}>{u.estado}</Insignia>
                      <button
                        onClick={() => setEditando(editando === u.id ? null : u.id)}
                        className="rounded-lg p-2 text-suave hover:bg-fondo hover:text-texto"
                        aria-label={`Editar a ${u.nombre}`}
                      >
                        {editando === u.id ? <X className="size-4" /> : <Pencil className="size-4" />}
                      </button>
                    </div>
                    {editando === u.id && <FormEditar usuario={u} usuarios={usuarios} onCerrar={() => setEditando(null)} />}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function FormNuevo({ organizacionId, usuarios, onCerrar }) {
  const router = useRouter();
  const [rol, setRol] = useState("cobrador");
  const [clave, setClave] = useState("");
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const jefes = useMemo(() => jefesPara(rol, usuarios), [rol, usuarios]);
  const necesitaJefe = (JEFES_PERMITIDOS[rol] ?? []).length > 0;

  async function enviar(e) {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api("/api/admin/usuarios", {
        method: "POST",
        body: { ...f, organizacion_id: organizacionId, rol, jefe_id: necesitaJefe ? f.jefe_id || null : null },
      });
      toast.success("Usuario creado. Entrégale su usuario y contraseña.");
      onCerrar();
      router.refresh();
    } catch (err) {
      const porCampo = Object.fromEntries((err.campos ?? []).map((c) => [c.campo, c.mensaje]));
      setErrores({ ...porCampo, general: err.campos ? "" : err.message });
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="tarjeta grid gap-4 p-5 sm:grid-cols-2">
      <div className="flex items-center justify-between sm:col-span-2">
        <h3 className="font-semibold">Nuevo usuario</h3>
        <button type="button" onClick={onCerrar} className="rounded-lg p-1 text-suave hover:bg-fondo" aria-label="Cerrar">
          <X className="size-5" />
        </button>
      </div>

      <Campo as="select" etiqueta="Rol" value={rol} onChange={(e) => setRol(e.target.value)}>
        <option value="dueno">Dueño</option>
        <option value="supervisor">Supervisor</option>
        <option value="cobrador">Cobrador</option>
      </Campo>

      {necesitaJefe ? (
        <Campo
          as="select"
          etiqueta="Reporta a"
          name="jefe_id"
          required
          defaultValue=""
          error={errores.jefe_id}
          ayuda={jefes.length === 0 ? `Primero crea un ${rol === "supervisor" ? "dueño" : "supervisor o dueño"}.` : undefined}
        >
          <option value="" disabled>
            Elegir…
          </option>
          {jefes.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nombre} ({NOMBRE_ROL[j.rol]})
            </option>
          ))}
        </Campo>
      ) : (
        <div className="hidden sm:block" />
      )}

      <Campo etiqueta="Nombre completo" name="nombre" required error={errores.nombre} />
      <Campo
        etiqueta="Correo (con este ingresa)"
        name="email"
        type="email"
        inputMode="email"
        autoCapitalize="none"
        required
        error={errores.email}
      />
      <Campo etiqueta="Cédula" name="cedula" inputMode="numeric" error={errores.cedula} />
      <Campo etiqueta="Celular" name="telefono" inputMode="tel" error={errores.telefono} />

      <div className="flex items-end gap-2">
        <Campo
          etiqueta="Contraseña inicial"
          name="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          required
          error={errores.password}
          className="flex-1"
        />
        <Boton type="button" variante="secundario" onClick={() => setClave(generarClave())} aria-label="Generar contraseña">
          <Wand2 className="size-4" />
        </Boton>
      </div>

      {errores.general && <p className="rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro sm:col-span-2">{errores.general}</p>}

      <div className="flex justify-end gap-2 sm:col-span-2">
        <Boton type="button" variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={enviando}>
          Crear usuario
        </Boton>
      </div>
    </form>
  );
}

function FormEditar({ usuario, usuarios, onCerrar }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [clave, setClave] = useState("");
  const jefes = jefesPara(usuario.rol, usuarios, usuario.id);
  const necesitaJefe = (JEFES_PERMITIDOS[usuario.rol] ?? []).length > 0;

  async function enviar(e) {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget));
    const cambios = { nombre: f.nombre, telefono: f.telefono, estado: f.estado };
    if (f.email && f.email.toLowerCase() !== usuario.email) cambios.email = f.email;
    if (necesitaJefe && f.jefe_id && f.jefe_id !== usuario.jefe_id) cambios.jefe_id = f.jefe_id;
    if (clave) cambios.password = clave;

    setEnviando(true);
    try {
      await api(`/api/admin/usuarios/${usuario.id}`, { method: "PATCH", body: cambios });
      toast.success(clave ? "Guardado. Se cerraron sus sesiones abiertas." : "Cambios guardados");
      onCerrar();
      router.refresh();
    } catch (err) {
      toast.error(err.campos?.[0]?.mensaje || err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-4 grid gap-3 rounded-xl bg-fondo p-4 sm:grid-cols-2">
      <Campo etiqueta="Nombre" name="nombre" defaultValue={usuario.nombre} required />
      <Campo etiqueta="Correo" name="email" type="email" defaultValue={usuario.email} required autoCapitalize="none" />
      <Campo etiqueta="Celular" name="telefono" defaultValue={usuario.telefono ?? ""} />
      {necesitaJefe && (
        <Campo as="select" etiqueta="Reporta a" name="jefe_id" defaultValue={usuario.jefe_id ?? ""}>
          {jefes.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nombre} ({NOMBRE_ROL[j.rol]})
            </option>
          ))}
        </Campo>
      )}
      <Campo as="select" etiqueta="Estado" name="estado" defaultValue={usuario.estado}>
        {ESTADOS_USUARIO.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </Campo>
      <div className="flex items-end gap-2">
        <Campo
          etiqueta="Nueva contraseña (opcional)"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Dejar vacío para no cambiar"
          className="flex-1"
        />
        <Boton type="button" variante="secundario" onClick={() => setClave(generarClave())} aria-label="Generar contraseña">
          <Wand2 className="size-4" />
        </Boton>
      </div>
      <div className="flex items-end justify-end gap-2 sm:col-span-2">
        <Boton type="button" variante="fantasma" onClick={onCerrar}>
          Cancelar
        </Boton>
        <Boton type="submit" cargando={enviando}>
          Guardar
        </Boton>
      </div>
    </form>
  );
}
