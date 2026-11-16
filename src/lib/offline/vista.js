// Combina los datos descargados con las operaciones pendientes y recalcula todo con el mismo
// motor del servidor. Así la app muestra al instante lo que el cobrador acaba de hacer,
// tenga o no señal. Funciones puras (se prueban en tests/vista.test.mjs).
import { simular } from "../prestamos/motor.js";
import { hoyBogota } from "../fechas.js";

/** Fecha de negocio de una operación pendiente (día en que se hizo en el teléfono). */
export const fechaPendiente = (op) => hoyBogota(new Date(op.body?.creado_en_dispositivo ?? op.creado_en));

const condiciones = (p) => ({
  metodo: p.metodo,
  capital: Number(p.capital),
  tasa: Number(p.tasa),
  base_interes: p.base_interes,
  fecha_inicio: p.fecha_inicio,
  n_cuotas: p.n_cuotas,
  frecuencia: p.frecuencia,
  recargo_tipo: p.recargo_tipo ?? "ninguno",
  recargo_valor: Number(p.recargo_valor ?? 0),
});

/**
 * @param {object} datos       respuesta de /api/sync/datos (o null)
 * @param {Array}  pendientes  operaciones en cola
 * @param {string} hoy         "YYYY-MM-DD"
 */
export function construirVista(datos, pendientes = [], hoy = hoyBogota()) {
  if (!datos) return null;
  const idsServidor = new Set([...datos.clientes.map((c) => c.id), ...datos.prestamos.map((p) => p.id), ...datos.pagos.map((p) => p.id)]);
  // Lo que ya llegó al servidor no se vuelve a sumar
  const enCola = pendientes.filter((op) => !idsServidor.has(op.id));

  // ===== Clientes =====
  const clientes = new Map(datos.clientes.map((c) => [c.id, { ...c, pendiente: false }]));
  for (const op of enCola.filter((o) => o.tipo === "cliente")) {
    clientes.set(op.id, {
      id: op.id, cobrador_id: op.local.cobrador_id, ruta_id: op.body.ruta_id ?? null, orden_ruta: 9999,
      nombre: op.body.nombre, cedula: op.body.cedula ?? null, telefono: op.body.telefono ?? null,
      direccion: op.body.direccion ?? null, barrio: op.body.barrio ?? null, ciudad: op.body.ciudad ?? null,
      estado: "activo", pendiente: true,
    });
  }

  // ===== Pagos =====
  const pagos = [
    ...datos.pagos.map((p) => ({ ...p, pendiente: false })),
    ...enCola
      .filter((o) => o.tipo === "pago")
      .map((o) => ({
        id: o.id, prestamo_id: o.body.prestamo_id, cliente_id: o.local.cliente_id, cobrador_id: o.usuario_id,
        monto: o.body.monto, metodo: o.body.metodo, fecha: fechaPendiente(o), creado_en: o.creado_en, pendiente: true,
      })),
  ];
  const pagosPorPrestamo = new Map();
  for (const p of pagos) {
    if (!pagosPorPrestamo.has(p.prestamo_id)) pagosPorPrestamo.set(p.prestamo_id, []);
    pagosPorPrestamo.get(p.prestamo_id).push(p);
  }

  // ===== Préstamos (recalculados con el motor) =====
  const base = [
    ...datos.prestamos.map((p) => ({ ...p, pendiente: false })),
    ...enCola
      .filter((o) => o.tipo === "prestamo")
      .map((o) => ({
        ...o.body, id: o.id, cobrador_id: o.local.cobrador_id, fecha_inicio: o.body.fecha_inicio ?? fechaPendiente(o),
        estado: "activo", creado_en: o.creado_en, pendiente: true,
      })),
  ];
  const prestamos = [];
  for (const p of base) {
    const ps = pagosPorPrestamo.get(p.id) ?? [];
    let r;
    try {
      r = simular({
        prestamo: condiciones(p),
        pagos: ps.map((x) => ({ id: x.id, monto: Number(x.monto), fecha: x.fecha, orden: String(x.creado_en) })),
        hasta: hoy,
      });
    } catch {
      continue;
    }
    prestamos.push({
      ...p,
      estado: r.estado,
      saldo: r.saldo,
      saldo_capital: r.saldos.capital,
      saldo_interes: r.saldos.interes,
      saldo_recargo: r.saldos.recargo,
      sugerido_hoy: r.sugeridoHoy,
      dias_atraso: r.diasAtraso,
      valor_cuota: r.plan.valor_cuota,
      total_pagado: r.totalPagado,
      tiene_pendientes: p.pendiente || ps.some((x) => x.pendiente),
    });
  }
  const activos = prestamos.filter((p) => p.estado === "activo");

  return { hoy, datos, clientes, pagos, prestamos, activos, enCola };
}

/** Ruta del día de un cobrador (misma forma que la del servidor). */
export function rutaDe(vista, cobradorId) {
  if (!vista) return [];
  const rutas = new Map(vista.datos.rutas.map((r) => [r.id, r]));
  const porCliente = new Map();
  for (const p of vista.activos) {
    if (p.cobrador_id !== cobradorId) continue;
    if (!porCliente.has(p.cliente_id)) porCliente.set(p.cliente_id, []);
    porCliente.get(p.cliente_id).push(p);
  }
  const pagadoHoy = new Map();
  for (const p of vista.pagos) {
    if (p.fecha === vista.hoy) pagadoHoy.set(p.cliente_id, (pagadoHoy.get(p.cliente_id) ?? 0) + Number(p.monto));
  }
  const filas = [];
  for (const [clienteId, ps] of porCliente) {
    const c = vista.clientes.get(clienteId);
    if (!c || c.estado !== "activo") continue;
    const r = c.ruta_id ? rutas.get(c.ruta_id) : null;
    filas.push({
      cliente_id: c.id, nombre: c.nombre, telefono: c.telefono, direccion: c.direccion, barrio: c.barrio,
      ruta_id: r ? c.ruta_id : null, ruta_nombre: r?.nombre ?? null, ruta_orden: r?.orden ?? null, orden_ruta: c.orden_ruta,
      prestamos: ps.map((p) => ({ id: p.id, metodo: p.metodo, saldo: p.saldo, sugerido_hoy: p.sugerido_hoy, dias_atraso: p.dias_atraso, valor_cuota: p.valor_cuota, saldo_interes: p.saldo_interes })),
      saldo: ps.reduce((s, p) => s + p.saldo, 0),
      sugerido_hoy: ps.reduce((s, p) => s + p.sugerido_hoy, 0),
      dias_atraso: Math.max(...ps.map((p) => p.dias_atraso)),
      pagado_hoy: pagadoHoy.get(c.id) ?? 0,
      pendiente: c.pendiente || ps.some((p) => p.tiene_pendientes),
    });
  }
  const ordenRuta = (x) => (x.ruta_orden ?? Number.MAX_SAFE_INTEGER);
  return filas.sort(
    (a, b) =>
      ordenRuta(a) - ordenRuta(b) ||
      (a.ruta_nombre ?? "").localeCompare(b.ruta_nombre ?? "") ||
      a.orden_ruta - b.orden_ruta ||
      a.nombre.localeCompare(b.nombre)
  );
}

/** Caja de hoy del propio usuario: lo descargado + lo que hizo sin enviar. */
export function cajaDe(vista, usuarioId) {
  if (!vista) return null;
  const base = vista.datos.caja?.fecha === vista.hoy ? vista.datos.caja.movimientos : [];
  const yaEnServidor = new Set(base.map((m) => m.ref_id ?? m.id));
  const extra = [];
  for (const op of vista.enCola) {
    if (op.usuario_id !== usuarioId || fechaPendiente(op) !== vista.hoy || yaEnServidor.has(op.id)) continue;
    const comun = { id: `local-${op.id}`, creado_en: op.creado_en, pendiente: true };
    if (op.tipo === "pago") {
      extra.push({ ...comun, tipo: "cobro", metodo: op.body.metodo, monto: op.body.monto, cliente_nombre: vista.clientes.get(op.local.cliente_id)?.nombre });
    } else if (op.tipo === "gasto") {
      extra.push({ ...comun, tipo: "gasto", metodo: op.body.metodo, monto: -op.body.monto, categoria: op.body.categoria, descripcion: op.body.descripcion });
    } else if (op.tipo === "prestamo" && op.body.registrar_desembolso !== false) {
      extra.push({ ...comun, tipo: "desembolso", metodo: op.body.metodo_desembolso, monto: -op.body.capital, cliente_nombre: vista.clientes.get(op.body.cliente_id)?.nombre });
    }
  }
  const movimientos = [...extra.reverse(), ...base];
  const totales = { base: 0, cobro: 0, desembolso: 0, gasto: 0, entrega: 0, ajuste: 0, anulacion: 0, base_entregada: 0, recibido: 0 };
  const porMetodo = { efectivo: 0, nequi: 0, daviplata: 0, transferencia: 0 };
  for (const m of movimientos) {
    totales[m.tipo] += Number(m.monto);
    porMetodo[m.metodo] += Number(m.monto);
  }
  const cajaHoy = vista.datos.caja?.fecha === vista.hoy ? vista.datos.caja : null;
  return {
    fecha: vista.hoy,
    cerrada: !!cajaHoy?.cerrada,
    cierre: cajaHoy?.cierre ?? null,
    movimientos,
    totales,
    porMetodo,
    efectivoEsperado: porMetodo.efectivo,
    digital: porMetodo.nequi + porMetodo.daviplata + porMetodo.transferencia,
  };
}
