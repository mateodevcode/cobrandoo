import { exigirUsuarioPagina } from "@/server/auth/session";
import { dinero, fechaHoy, saludo } from "@/lib/formato";
import { NOMBRE_ROL } from "@/lib/roles";

export const metadata = { title: "Inicio" };

// Fase 1: estructura del tablero con datos en cero. Los números reales llegan en la fase 2.
export default async function Inicio() {
  const u = await exigirUsuarioPagina(["dueno", "supervisor", "cobrador"]);
  const nombre = u.nombre.split(" ")[0];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header>
        <p className="text-sm text-suave first-letter:uppercase">{fechaHoy()}</p>
        <h1 className="text-2xl font-bold">
          {saludo()}, {nombre}
        </h1>
        <p className="text-sm text-suave">{NOMBRE_ROL[u.rol]}</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <section className="relative overflow-hidden rounded-tarjeta bg-gradient-to-br from-marino-800 to-primario p-6 text-white shadow-tarjeta">
          <p className="text-sm text-white/75">Cobrado hoy</p>
          <p className="tabular mt-1 text-4xl font-bold">{dinero(0)}</p>
          <div className="mt-6 h-2 rounded-full bg-white/20">
            <div className="h-full w-0 rounded-full bg-acento" />
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/75">
            <span>0 % de la meta del día</span>
            <span>Pendiente: {dinero(0)}</span>
          </div>
        </section>

        <section className="tarjeta flex flex-col justify-center p-6">
          <h2 className="text-sm font-semibold">Cobros · últimos 7 días</h2>
          <p className="mt-3 text-sm text-suave">La gráfica aparecerá cuando registres los primeros cobros.</p>
        </section>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Cobrado esta semana" valor={dinero(0)} />
        <Indicador titulo="Prestado esta semana" valor={dinero(0)} />
        <Indicador titulo="Cartera activa" valor={dinero(0)} />
        <Indicador titulo="Clientes en mora" valor="0" tono="peligro" />
      </div>

      <section className="tarjeta p-5">
        <h2 className="text-sm font-semibold">Movimientos recientes</h2>
        <p className="mt-6 mb-4 text-center text-sm text-suave">Aún no hay movimientos.</p>
      </section>
    </div>
  );
}

function Indicador({ titulo, valor, tono }) {
  return (
    <div className="tarjeta p-4">
      <p className="text-xs text-suave">{titulo}</p>
      <p className={`tabular mt-1 text-xl font-bold ${tono === "peligro" ? "text-peligro" : ""}`}>{valor}</p>
    </div>
  );
}
