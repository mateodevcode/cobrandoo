import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import * as cierres from "@/server/services/cierres.service";
import { TarjetaCierre } from "@/components/negocio/TarjetaCierre";

export const metadata = { title: "Mis cierres" };

export default async function MisCierres() {
  const yo = await exigirUsuarioPagina(["cobrador", "supervisor"]);
  const lista = (await cierres.listar(yo)).filter((c) => c.usuario_id === yo.id);
  const fallos = lista.filter((c) => c.estado === "con_fallo").length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href="/caja" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Mi caja
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Mis cierres</h1>
        {fallos > 0 && <p className="text-sm text-peligro">Tienes {fallos} cierre(s) con fallo. Habla con {yo.rol === "supervisor" ? "el dueño" : "tu jefe"} para resolverlo.</p>}
      </header>
      {lista.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">Aún no has cerrado ningún día.</div>
      ) : (
        <ul className="flex flex-col gap-3">
          {lista.map((c) => (
            <TarjetaCierre key={c.id} c={c} />
          ))}
        </ul>
      )}
    </div>
  );
}
