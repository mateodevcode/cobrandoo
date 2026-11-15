import { WifiOff } from "lucide-react";

export const metadata = { title: "Sin conexión" };

// Página que muestra el service worker cuando no hay internet y la pantalla pedida no está guardada.
export default function SinConexion() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="tarjeta max-w-sm p-8 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-alerta-suave text-alerta">
          <WifiOff className="size-7" />
        </span>
        <h1 className="mt-4 text-xl font-bold">Sin conexión</h1>
        <p className="mt-2 text-sm text-suave">
          Esta pantalla necesita internet. Puedes seguir cobrando desde tu ruta: todo se guarda en el teléfono y se envía solo cuando vuelva la señal.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          {/* Enlaces <a> normales: fuerzan una carga completa que atiende el service worker */}
          <a href="/ruta" className="inline-flex h-11 items-center justify-center rounded-xl bg-primario text-sm font-semibold text-white">
            Ir a mi ruta
          </a>
          <a href="/caja" className="inline-flex h-11 items-center justify-center rounded-xl border border-borde text-sm font-semibold">
            Ver mi caja
          </a>
        </div>
      </div>
    </main>
  );
}
