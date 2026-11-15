import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import { LISTA_METODOS } from "@/lib/prestamos/metodos";
import { BASES_INTERES, RECARGOS, DIAS_PERIODO } from "@/lib/prestamos/constantes";

export const metadata = { title: "Métodos de préstamo" };

export default async function PaginaMetodos() {
  await exigirUsuarioPagina(ROLES_NEGOCIO);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-bold">¿Cómo funciona cada método?</h1>
        <p className="text-sm text-suave">Al crear un préstamo eliges el método que mejor le sirve a ese cliente. Las condiciones quedan guardadas y no cambian después.</p>
      </header>

      {LISTA_METODOS.map((m, i) => (
        <section key={m.id} className="tarjeta p-5 sm:p-6">
          <p className="text-xs font-semibold text-primario">Método {i + 1}</p>
          <h2 className="text-lg font-bold">{m.nombre}</h2>
          <p className="mt-1 text-sm text-suave">{m.resumen}</p>
          <ul className="mt-4 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {m.explicacion.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="mt-4 rounded-xl bg-acento-suave p-3 text-sm text-acento-oscuro">
            <span className="font-semibold">Ejemplo: </span>
            {m.ejemplo}
          </p>
        </section>
      ))}

      <section className="tarjeta p-5 sm:p-6">
        <h2 className="text-lg font-bold">¿Sobre qué se calcula el interés que se acumula?</h2>
        <p className="mt-1 text-sm text-suave">
          Cada {DIAS_PERIODO} días que el cliente siga debiendo (o cuando se vence el plazo en cuotas fijas) se suma el %. Tú eliges la base al crear el préstamo:
        </p>
        <p className="mt-3 text-xs text-suave">Ejemplo: presta $1.000.000 al 10 % → debe $1.100.000. Abona $300.000 → ahora debe $800.000, todo capital (el abono pagó primero los $100.000 de interés).</p>
        <dl className="mt-3 flex flex-col gap-3">
          {BASES_INTERES.map((b, i) => (
            <div key={b.id} className="rounded-xl border border-borde p-3">
              <dt className="text-sm font-semibold">{b.nombre}</dt>
              <dd className="text-sm text-suave">{b.explicacion}</dd>
              <dd className="mt-1 text-xs font-semibold text-primario">En el ejemplo, el mes siguiente se suman {["$80.000 (10 % de $800.000)", "$80.000 (10 % de $800.000 de capital)", "$100.000 (10 % de $1.000.000)"][i]}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="tarjeta p-5 sm:p-6">
        <h2 className="text-lg font-bold">Recargos por atraso</h2>
        <p className="mt-1 text-sm text-suave">Opcionales, solo en cuotas fijas y durante el plazo. Un día cuenta como atrasado cuando termina sin que el cliente esté al día.</p>
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {RECARGOS.filter((r) => r.explicacion).map((r) => (
            <li key={r.id}>
              <span className="font-semibold">{r.nombre}:</span> {r.explicacion}
            </li>
          ))}
        </ul>
      </section>

      <section className="tarjeta p-5 sm:p-6">
        <h2 className="text-lg font-bold">¿En qué orden se aplica cada abono?</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-sm">
          <li>Primero a los recargos por atraso.</li>
          <li>Luego a los intereses.</li>
          <li>Y lo que quede, al capital.</li>
        </ol>
        <p className="mt-3 text-sm text-suave">Si un abono se anula, el sistema recalcula todo como si nunca hubiera existido (intereses, recargos y saldos).</p>
      </section>
    </div>
  );
}
