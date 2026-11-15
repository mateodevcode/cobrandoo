import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import * as orgRepo from "@/server/repos/organizaciones.repo";
import { Insignia } from "@/components/ui/Insignia";
import { fecha } from "@/lib/formato";
import { NuevaOrganizacion } from "./NuevaOrganizacion";

export const metadata = { title: "Organizaciones" };

export default async function Admin() {
  await exigirUsuarioPagina(["super_admin"]);
  const organizaciones = await orgRepo.listar();

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Organizaciones</h1>
          <p className="text-sm text-suave">Cada organización es un negocio con sus dueños, supervisores y cobradores.</p>
        </div>
        <NuevaOrganizacion />
      </header>

      {organizaciones.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">Aún no hay organizaciones. Crea la primera.</div>
      ) : (
        <ul className="tarjeta divide-y divide-borde overflow-hidden">
          {organizaciones.map((o) => (
            <li key={o.id}>
              <Link href={`/admin/organizaciones/${o.id}`} className="flex items-center gap-4 p-4 hover:bg-fondo">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold">{o.nombre}</p>
                    {!o.activa && <Insignia tono="peligro">Inactiva</Insignia>}
                  </div>
                  <p className="text-xs text-suave">
                    {o.duenos} dueño(s) · {o.supervisores} supervisor(es) · {o.cobradores} cobrador(es) · desde {fecha(o.creado_en)}
                  </p>
                </div>
                <ChevronRight className="size-5 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
