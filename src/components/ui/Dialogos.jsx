"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Hoja } from "./Hoja";
import { Boton } from "./Boton";
import { Campo } from "./Campo";

// Modales propios en lugar de window.confirm / window.prompt.
// Uso:  if (await confirmar({ titulo, mensaje, peligro: true })) { ... }
//       const nombre = await pedirTexto({ titulo, etiqueta });   // null si cancela

let mostrar = null;

/** @returns {Promise<boolean>} */
export function confirmar({ titulo, mensaje, textoConfirmar = "Confirmar", textoCancelar = "Cancelar", peligro = false }) {
  return new Promise((resolver) => {
    if (!mostrar) return resolver(false);
    mostrar({ tipo: "confirmar", titulo, mensaje, textoConfirmar, textoCancelar, peligro, resolver });
  });
}

/** @returns {Promise<string|null>} */
export function pedirTexto({ titulo, mensaje, etiqueta, placeholder, textoConfirmar = "Guardar", minimo = 1, maximo = 100 }) {
  return new Promise((resolver) => {
    if (!mostrar) return resolver(null);
    mostrar({ tipo: "texto", titulo, mensaje, etiqueta, placeholder, textoConfirmar, minimo, maximo, resolver });
  });
}

/** Va una sola vez en el layout raíz. */
export function Dialogos() {
  const [d, setD] = useState(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    mostrar = (nuevo) => {
      setTexto("");
      setD(nuevo);
    };
    return () => {
      mostrar = null;
    };
  }, []);

  function cerrar(valor) {
    d?.resolver(valor);
    setD(null);
  }

  const esTexto = d?.tipo === "texto";
  const valido = !esTexto || texto.trim().length >= d.minimo;

  return (
    <Hoja
      abierta={!!d}
      onCerrar={() => cerrar(esTexto ? null : false)}
      titulo={d?.titulo}
      centrado
      rol={esTexto ? "dialog" : "alertdialog"}
    >
      {d && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valido) cerrar(esTexto ? texto.trim() : true);
          }}
          className="flex flex-col gap-4"
        >
          {d.mensaje && (
            <div className="flex gap-3 text-sm text-suave">
              {d.peligro && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-peligro" />}
              <p>{d.mensaje}</p>
            </div>
          )}
          {esTexto && (
            <Campo
              etiqueta={d.etiqueta}
              placeholder={d.placeholder}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={d.maximo}
              autoFocus
              autoComplete="off"
            />
          )}
          <div className="flex justify-end gap-2">
            <Boton type="button" variante="fantasma" onClick={() => cerrar(esTexto ? null : false)}>
              {d.textoCancelar ?? "Cancelar"}
            </Boton>
            <Boton type="submit" variante={d.peligro ? "peligro" : "primario"} disabled={!valido} data-autofocus={!esTexto || undefined}>
              {d.textoConfirmar}
            </Boton>
          </div>
        </form>
      )}
    </Hoja>
  );
}
