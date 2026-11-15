import { Suspense } from "react";
import { FormularioLogin } from "./FormularioLogin";

export const metadata = { title: "Ingresar" };

export default function PaginaLogin() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-2">
      {/* Panel de marca (solo escritorio) */}
      <section className="relative hidden overflow-hidden bg-marino-900 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Marca />
        <div className="max-w-md">
          <h1 className="text-4xl font-bold leading-tight">Cada peso cobrado, en su lugar.</h1>
          <p className="mt-4 text-white/70">
            Préstamos, cobros diarios y cierre de caja en una sola app. Funciona aunque te quedes sin señal.
          </p>
        </div>
        <p className="text-xs text-white/40">© Cobrandoo</p>
        <div className="pointer-events-none absolute -right-32 -bottom-32 size-[28rem] rounded-full bg-primario/30 blur-3xl" />
        <div className="pointer-events-none absolute top-1/3 -right-10 size-64 rounded-full bg-acento/20 blur-3xl" />
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Marca oscuro />
          </div>
          <h2 className="text-2xl font-bold">Ingresar</h2>
          <p className="mt-1 text-sm text-suave">Usa el correo y la contraseña que te entregó tu administrador.</p>
          <Suspense>
            <FormularioLogin />
          </Suspense>
        </div>
      </section>
    </main>
  );
}

function Marca({ oscuro }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="size-8 rounded-lg bg-acento" />
      <span className={`text-lg font-bold ${oscuro ? "text-texto" : "text-white"}`}>Cobrandoo</span>
    </div>
  );
}
