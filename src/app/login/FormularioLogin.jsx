"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { Campo } from "@/components/ui/Campo";
import { api, refrescarSesion } from "@/lib/api";

/** Solo rutas internas (evita redirecciones abiertas a otros sitios). */
function destinoSeguro(next) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const destino = destinoSeguro(params.get("next"));

  const [verificando, setVerificando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [verClave, setVerClave] = useState(false);

  // Si solo expiró el token corto, renueva en silencio y vuelve a donde iba.
  useEffect(() => {
    let vivo = true;
    refrescarSesion().then((ok) => {
      if (!vivo) return;
      if (ok) router.replace(destino);
      else setVerificando(false);
    });
    return () => {
      vivo = false;
    };
  }, [destino, router]);

  async function enviar(e) {
    e.preventDefault();
    setError("");
    setEnviando(true);
    const form = new FormData(e.currentTarget);
    try {
      await api("/api/auth/login", {
        method: "POST",
        body: { email: form.get("email"), password: form.get("password") },
      });
      router.replace(destino);
      router.refresh();
    } catch (err) {
      setError(err.message);
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="mt-8 flex flex-col gap-4" noValidate>
      <Campo
        etiqueta="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="username"
        autoCapitalize="none"
        placeholder="tucorreo@ejemplo.com"
        required
        disabled={verificando}
      />
      <div className="relative">
        <Campo
          etiqueta="Contraseña"
          name="password"
          type={verClave ? "text" : "password"}
          autoComplete="current-password"
          required
          disabled={verificando}
        />
        <button
          type="button"
          onClick={() => setVerClave((v) => !v)}
          className="absolute right-3 bottom-3 text-suave hover:text-texto"
          aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {verClave ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-peligro-suave px-3 py-2 text-sm text-peligro">
          {error}
        </p>
      )}

      <Boton type="submit" tamano="lg" cargando={enviando || verificando} className="mt-2">
        {verificando ? "Verificando sesión…" : "Ingresar"}
      </Boton>
    </form>
  );
}
