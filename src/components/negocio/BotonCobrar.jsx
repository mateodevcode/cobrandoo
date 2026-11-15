"use client";

import { useState } from "react";
import { HandCoins } from "lucide-react";
import { Boton } from "@/components/ui/Boton";
import { Hoja } from "@/components/ui/Hoja";
import { FormPago } from "./FormPago";

export function BotonCobrar({ cliente, prestamos, tamano = "md", className, children }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <Boton variante="acento" tamano={tamano} className={className} onClick={() => setAbierta(true)}>
        {children ?? (
          <>
            <HandCoins className="size-4" /> Cobrar
          </>
        )}
      </Boton>
      <Hoja abierta={abierta} onCerrar={() => setAbierta(false)} titulo={`Cobrar a ${cliente}`}>
        <FormPago prestamos={prestamos} onListo={() => setAbierta(false)} />
      </Hoja>
    </>
  );
}
