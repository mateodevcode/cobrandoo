import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil, Phone, MessageCircle, MapPin, Plus, ChevronRight } from "lucide-react";
import { z } from "zod";
import { exigirUsuarioPagina } from "@/server/auth/session";
import { ROLES_NEGOCIO } from "@/server/permisos";
import * as clientes from "@/server/services/clientes.service";
import * as prestamos from "@/server/services/prestamos.service";
import { Avatar, Insignia } from "@/components/ui/Insignia";
import { BotonCobrar } from "@/components/negocio/BotonCobrar";
import { CompartirHistorial } from "@/components/negocio/CompartirHistorial";
import { METODOS } from "@/lib/prestamos/metodos";
import { FotosCliente } from "@/components/negocio/FotosCliente";
import { fotosDe } from "@/server/services/fotos.service";
import { s3Configurado } from "@/server/s3";
import { Map as IconoMapa } from "lucide-react";
import { dinero, fecha } from "@/lib/formato";

export const metadata = { title: "Cliente" };

const TONO = { activo: "info", pagado: "exito", anulado: "neutro" };

export default async function PaginaCliente({ params }) {
  const yo = await exigirUsuarioPagina(ROLES_NEGOCIO);
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const cliente = await clientes.obtener(yo, id).catch(() => null);
  if (!cliente) notFound();
  const [lista, fotos] = await Promise.all([prestamos.listar(yo, { clienteId: id, estado: "todos" }), fotosDe(yo, id).catch(() => [])]);
  const activos = lista.filter((p) => p.estado === "activo");
  const deuda = activos.reduce((s, p) => s + p.saldo, 0);
  const tel = cliente.telefono?.replace(/\D/g, "");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <Link href="/clientes" className="flex w-fit items-center gap-1 text-sm text-suave hover:text-texto">
        <ArrowLeft className="size-4" /> Clientes
      </Link>

      <section className="tarjeta p-5">
        <div className="flex items-start gap-4">
          <Avatar nombre={cliente.nombre} className="size-14 text-base" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">{cliente.nombre}</h1>
              {cliente.estado !== "activo" && <Insignia>Inactivo</Insignia>}
            </div>
            <p className="text-sm text-suave">
              {[cliente.cedula && `C.C. ${cliente.cedula}`, cliente.ruta_nombre ? `Ruta ${cliente.ruta_nombre}` : "Sin ruta", yo.rol !== "cobrador" && cliente.cobrador_nombre].filter(Boolean).join(" · ")}
            </p>
            {(cliente.direccion || cliente.barrio) && (
              <p className="mt-1 flex items-center gap-1 text-sm text-suave">
                <MapPin className="size-3.5" /> {[cliente.direccion, cliente.barrio, cliente.ciudad].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <Link href={`/clientes/${id}/editar`} className="rounded-lg p-2 text-suave hover:bg-fondo hover:text-texto" aria-label="Editar">
            <Pencil className="size-4" />
          </Link>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {tel && (
            <>
              <a href={`tel:${tel}`} className="inline-flex h-9 items-center gap-2 rounded-xl border border-borde px-3 text-sm font-medium hover:bg-fondo">
                <Phone className="size-4" /> Llamar
              </a>
              <a href={`https://wa.me/57${tel.slice(-10)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-xl border border-borde px-3 text-sm font-medium hover:bg-fondo">
                <MessageCircle className="size-4" /> WhatsApp
              </a>
            </>
          )}
          {cliente.latitud != null && (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${cliente.latitud},${cliente.longitud}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-borde px-3 text-sm font-medium hover:bg-fondo"
            >
              <IconoMapa className="size-4" /> Cómo llegar
            </a>
          )}
          <CompartirHistorial clienteId={cliente.id} nombre={cliente.nombre} telefono={cliente.telefono} token={cliente.token_publico} />
          {activos.length > 0 && <BotonCobrar clienteId={cliente.id} cliente={cliente.nombre} prestamos={activos} tamano="sm" />}
        </div>

        {cliente.notas && <p className="mt-4 rounded-xl bg-fondo p-3 text-sm text-suave">{cliente.notas}</p>}
      </section>

      {s3Configurado() && <FotosCliente clienteId={cliente.id} nombre={cliente.nombre} fotos={fotos} puedeQuitar={yo.rol !== "cobrador"} />}

      <div className="grid grid-cols-2 gap-3">
        <div className="tarjeta p-4">
          <p className="text-xs text-suave">Debe en total</p>
          <p className="tabular text-xl font-bold">{dinero(deuda)}</p>
        </div>
        <div className="tarjeta p-4">
          <p className="text-xs text-suave">Préstamos</p>
          <p className="text-xl font-bold">
            {activos.length} <span className="text-sm font-normal text-suave">activo(s) de {lista.length}</span>
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Préstamos</h2>
          {cliente.estado === "activo" && (
            <Link href={`/prestamos/nuevo?cliente=${id}`} className="inline-flex h-9 items-center gap-2 rounded-xl bg-primario px-3 text-sm font-semibold text-white hover:bg-primario-oscuro">
              <Plus className="size-4" /> Nuevo préstamo
            </Link>
          )}
        </div>
        {lista.length === 0 ? (
          <div className="tarjeta p-8 text-center text-sm text-suave">Este cliente no tiene préstamos.</div>
        ) : (
          <ul className="tarjeta divide-y divide-borde overflow-hidden">
            {lista.map((p) => {
              const avance = p.total_cargado ? Math.min(100, Math.round((p.total_pagado / p.total_cargado) * 100)) : 0;
              return (
                <li key={p.id}>
                  <Link href={`/prestamos/${p.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-fondo">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{dinero(p.capital)}</p>
                        <Insignia tono={TONO[p.estado]}>{p.estado}</Insignia>
                        {p.dias_atraso > 0 && p.estado === "activo" && <Insignia tono="peligro">{p.dias_atraso} d atraso</Insignia>}
                      </div>
                      <p className="text-xs text-suave">
                        {METODOS[p.metodo]?.nombre} · {Number(p.tasa)} % · desde {fecha(p.fecha_inicio)}
                      </p>
                      <div className="mt-2 h-1.5 rounded-full bg-fondo">
                        <div className="h-full rounded-full bg-acento" style={{ width: `${avance}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="tabular text-sm font-bold">{dinero(p.saldo)}</p>
                      <p className="text-[11px] text-suave">pendiente</p>
                    </div>
                    <ChevronRight className="size-4 text-suave" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
