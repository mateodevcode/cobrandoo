import Link from "next/link";
import { Suspense } from "react";
import { MessageCircle, Phone, Map as IconoMapa, ChevronRight } from "lucide-react";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { listar } from "@/server/services/morosos.service";
import { Filtros } from "@/components/negocio/Filtros";
import { Insignia } from "@/components/ui/Insignia";
import { dinero, fecha } from "@/lib/formato";
import { cn } from "@/lib/cn";

export const metadata = { title: "Morosos" };

const NIVEL = {
  grave: { texto: "Grave", tono: "peligro", borde: "border-l-peligro" },
  medio: { texto: "Medio", tono: "alerta", borde: "border-l-alerta" },
  leve: { texto: "Leve", tono: "info", borde: "border-l-primario" },
};

export default async function PaginaMorosos({ searchParams }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { nivel = "todos", cobrador } = await searchParams;
  const todos = await listar(yo);
  const esJefe = yo.rol !== "cobrador";
  const cobradores = esJefe ? [...new Map(todos.map((m) => [m.cobrador_id, m.cobrador_nombre])).entries()] : [];
  const lista = todos.filter((m) => (nivel === "todos" || m.nivel === nivel) && (!cobrador || m.cobrador_id === cobrador));
  const atraso = lista.reduce((s, m) => s + Number(m.atraso), 0);
  const saldo = lista.reduce((s, m) => s + Number(m.saldo), 0);
  const cuenta = (n) => todos.filter((m) => m.nivel === n).length;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <header>
        <h1 className="text-2xl font-bold">Morosos</h1>
        <p className="text-sm text-suave">Préstamos diarios con 3 o más días de atraso, y semanales o mensuales con una cuota vencida. Del más grave al más leve.</p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Cifra titulo="Clientes" valor={lista.length} />
        <Cifra titulo="Atrasado" valor={dinero(atraso)} tono="text-peligro" />
        <Cifra titulo="Saldo en riesgo" valor={dinero(saldo)} />
      </div>

      <Suspense>
        <Filtros
          parametro="nivel"
          opciones={[
            { id: "todos", nombre: `Todos (${todos.length})` },
            { id: "grave", nombre: `Grave · 30+ días (${cuenta("grave")})` },
            { id: "medio", nombre: `Medio · 8-29 (${cuenta("medio")})` },
            { id: "leve", nombre: `Leve (${cuenta("leve")})` },
          ]}
        />
      </Suspense>
      {cobradores.length > 1 && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Link href={`/morosos?nivel=${nivel}`} className={cn("rounded-full border px-3 py-1", !cobrador ? "border-primario bg-primario-suave text-primario" : "border-borde")}>
            Todos los cobradores
          </Link>
          {cobradores.map(([id, nombre]) => (
            <Link key={id} href={`/morosos?nivel=${nivel}&cobrador=${id}`} className={cn("rounded-full border px-3 py-1", cobrador === id ? "border-primario bg-primario-suave text-primario" : "border-borde")}>
              {nombre}
            </Link>
          ))}
        </div>
      )}

      {lista.length === 0 ? (
        <div className="tarjeta p-10 text-center text-sm text-suave">{todos.length === 0 ? "Nadie en mora. 🎉" : "Nadie en mora con este filtro."}</div>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((m) => {
            const n = NIVEL[m.nivel];
            const tel = m.telefono?.replace(/\D/g, "");
            return (
              <li key={m.id} className={cn("tarjeta border-l-4 p-4", n.borde)}>
                <div className="flex items-start gap-3">
                  <Link href={`/clientes/${m.id}`} className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{m.nombre}</p>
                      <Insignia tono={n.tono}>
                        {n.texto} · {m.dias_atraso} día{m.dias_atraso === 1 ? "" : "s"}
                      </Insignia>
                    </div>
                    <p className="text-xs text-suave">
                      {[m.barrio, m.ruta_nombre && `Ruta ${m.ruta_nombre}`, esJefe && m.cobrador_nombre].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-1 text-sm">
                      Atrasado <span className="tabular font-bold text-peligro">{dinero(m.atraso)}</span>
                      <span className="text-suave"> · debe {dinero(m.saldo)}</span>
                    </p>
                    <p className="text-xs text-suave">{m.ultimo_pago ? `Último abono: ${fecha(m.ultimo_pago)}` : "Nunca ha abonado"}</p>
                  </Link>
                  <ChevronRight className="mt-1 size-4 shrink-0 text-suave" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tel && (
                    <>
                      <a href={`tel:${tel}`} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-borde px-3 text-xs font-semibold hover:bg-fondo">
                        <Phone className="size-3.5" /> Llamar
                      </a>
                      <a
                        href={`https://wa.me/57${tel.slice(-10)}?text=${encodeURIComponent(`Hola ${m.nombre.split(" ")[0]}, te recordamos que tienes ${dinero(m.atraso)} pendientes de tu préstamo.`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-borde px-3 text-xs font-semibold hover:bg-fondo"
                      >
                        <MessageCircle className="size-3.5" /> Recordar
                      </a>
                    </>
                  )}
                  {m.latitud != null && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${m.latitud},${m.longitud}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-borde px-3 text-xs font-semibold hover:bg-fondo"
                    >
                      <IconoMapa className="size-3.5" /> Cómo llegar
                    </a>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Cifra({ titulo, valor, tono }) {
  return (
    <div className="tarjeta p-3">
      <p className="text-xs text-suave">{titulo}</p>
      <p className={cn("tabular text-lg font-bold", tono)}>{valor}</p>
    </div>
  );
}
