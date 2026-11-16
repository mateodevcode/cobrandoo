import { Suspense } from "react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import * as cierres from "@/server/services/cierres.service";
import { Filtros } from "@/components/negocio/Filtros";
import { TarjetaCierre } from "@/components/negocio/TarjetaCierre";
import { AccionesCierre } from "./AccionesCierre";

export const metadata = { title: "Cuadres" };

export default async function PaginaCuadres({ searchParams }) {
  const yo = await exigirUsuarioPagina(["dueno", "supervisor"]);
  const { vista = "abiertos" } = await searchParams;
  const estado = { abiertos: "abiertos", pendientes: "pendiente", fallos: "con_fallo", todos: undefined }[vista] ?? "abiertos";
  const lista = await cierres.listar(yo, { estado });
  const pendientes = lista.filter((c) => c.estado === "pendiente").length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Cuadres</h1>
        <p className="text-sm text-suave">
          Revisa el cierre del día de cada cobrador. {vista === "abiertos" && pendientes > 0 && `${pendientes} por revisar.`}
        </p>
      </header>

      <Suspense>
        <Filtros
          parametro="vista"
          opciones={[
            { id: "abiertos", nombre: "Por atender" },
            { id: "pendientes", nombre: "Pendientes" },
            { id: "fallos", nombre: "Con fallo" },
            { id: "todos", nombre: "Historial" },
          ]}
        />
      </Suspense>

      {lista.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">{vista === "abiertos" ? "Nada por revisar. 👌" : "No hay cierres en esta lista."}</div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {lista.map((c) => (
            <TarjetaCierre
              key={c.id}
              c={c}
              mostrarCobrador
              acciones={c.usuario_id !== yo.id && <AccionesCierre id={c.id} estado={c.estado} nombre={c.usuario_nombre} />}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
