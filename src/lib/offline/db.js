// IndexedDB del teléfono: los datos para trabajar sin internet y la cola de operaciones pendientes.
import { openDB } from "idb";

let conexion;
function abrir() {
  conexion ??= openDB("cobrandoo", 1, {
    upgrade(db) {
      db.createObjectStore("datos"); // clave = id del usuario
      const p = db.createObjectStore("pendientes", { keyPath: "id" });
      p.createIndex("usuario", "usuario_id");
    },
  });
  return conexion;
}

export async function leerDatos(usuarioId) {
  return (await abrir()).get("datos", usuarioId);
}

export async function guardarDatos(datos) {
  return (await abrir()).put("datos", datos, datos.usuario.id);
}

export async function borrarDatos(usuarioId) {
  return (await abrir()).delete("datos", usuarioId);
}

/** Pendientes del usuario en el orden en que se hicieron. */
export async function listarPendientes(usuarioId) {
  const todos = await (await abrir()).getAllFromIndex("pendientes", "usuario", usuarioId);
  return todos.sort((a, b) => (a.creado_en < b.creado_en ? -1 : 1));
}

export async function guardarPendiente(op) {
  return (await abrir()).put("pendientes", op);
}

export async function borrarPendiente(id) {
  return (await abrir()).delete("pendientes", id);
}
