// Pruebas de la vista offline: datos descargados + operaciones pendientes → lo que ve el cobrador.
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirVista, rutaDe, cajaDe } from "../src/lib/offline/vista.js";

const HOY = "2026-01-05";
const AHORA = "2026-01-05T15:00:00.000Z"; // 10 a. m. en Colombia
const COB = "cob-1";

const datos = () => ({
  usuario: { id: COB },
  cobradores: [],
  rutas: [{ id: "r1", nombre: "Centro", orden: 0, cobrador_id: COB }],
  clientes: [{ id: "c1", cobrador_id: COB, ruta_id: "r1", orden_ruta: 0, nombre: "María", estado: "activo" }],
  prestamos: [
    { id: "p1", cliente_id: "c1", cobrador_id: COB, metodo: "cuotas_fijas", capital: 1_000_000, tasa: 10, base_interes: "saldo_total", frecuencia: "diaria", n_cuotas: 30, recargo_tipo: "ninguno", recargo_valor: 0, fecha_inicio: "2026-01-01", estado: "activo", metodo_desembolso: "efectivo" },
  ],
  pagos: [{ id: "g1", prestamo_id: "p1", cliente_id: "c1", cobrador_id: COB, monto: 37_000, metodo: "efectivo", fecha: "2026-01-02", creado_en: "2026-01-02T15:00:00Z" }],
  caja: { fecha: HOY, movimientos: [{ id: "m1", tipo: "base", metodo: "efectivo", monto: 500_000, creado_en: "2026-01-05T13:00:00Z" }] },
});

const op = (tipo, id, body, local = {}) => ({ id, tipo, usuario_id: COB, body: { ...body, creado_en_dispositivo: AHORA }, local, creado_en: AHORA, estado: "pendiente" });

test("sin pendientes: recalcula saldos con el motor", () => {
  const v = construirVista(datos(), [], HOY);
  const p = v.activos[0];
  assert.equal(p.saldo, 1_100_000 - 37_000);
  // Cuotas del 2 al 4 vencidas (1 pagada) + hoy → para quedar al día: 4 cuotas − 1 pagada
  assert.equal(p.sugerido_hoy, 4 * 37_000 - 37_000);
});

test("un pago pendiente baja el saldo y aparece en la ruta y en la caja", () => {
  const pend = [op("pago", "g2", { prestamo_id: "p1", monto: 50_000, metodo: "efectivo" }, { cliente_id: "c1" })];
  const v = construirVista(datos(), pend, HOY);
  assert.equal(v.activos[0].saldo, 1_100_000 - 37_000 - 50_000);
  const ruta = rutaDe(v, COB);
  assert.equal(ruta.length, 1);
  assert.equal(ruta[0].pagado_hoy, 50_000);
  assert.equal(ruta[0].pendiente, true);
  const caja = cajaDe(v, COB);
  assert.equal(caja.efectivoEsperado, 500_000 + 50_000);
  assert.equal(caja.movimientos[0].pendiente, true);
});

test("cliente y préstamo nuevos sin señal aparecen en la ruta y descuentan caja", () => {
  const pend = [
    op("cliente", "c2", { nombre: "Juan", ruta_id: "r1" }, { cobrador_id: COB }),
    op("prestamo", "p2", { cliente_id: "c2", metodo: "interes_mensual", capital: 200_000, tasa: 10, base_interes: "saldo_total", metodo_desembolso: "efectivo", fecha_inicio: HOY }, { cobrador_id: COB }),
  ];
  const v = construirVista(datos(), pend, HOY);
  const ruta = rutaDe(v, COB);
  const juan = ruta.find((r) => r.cliente_id === "c2");
  assert.ok(juan);
  assert.equal(juan.saldo, 220_000);
  assert.equal(cajaDe(v, COB).efectivoEsperado, 500_000 - 200_000);
});

test("lo que ya llegó al servidor no se cuenta dos veces", () => {
  const d = datos();
  d.pagos.push({ id: "g2", prestamo_id: "p1", cliente_id: "c1", cobrador_id: COB, monto: 50_000, metodo: "efectivo", fecha: HOY, creado_en: AHORA });
  d.caja.movimientos.unshift({ id: "m2", tipo: "cobro", metodo: "efectivo", monto: 50_000, ref_tipo: "pago", ref_id: "g2", creado_en: AHORA });
  const pend = [op("pago", "g2", { prestamo_id: "p1", monto: 50_000, metodo: "efectivo" }, { cliente_id: "c1" })];
  const v = construirVista(d, pend, HOY);
  assert.equal(v.activos[0].saldo, 1_100_000 - 37_000 - 50_000);
  assert.equal(cajaDe(v, COB).efectivoEsperado, 550_000);
});

test("un gasto pendiente resta efectivo", () => {
  const v = construirVista(datos(), [op("gasto", "x1", { monto: 20_000, categoria: "transporte", metodo: "efectivo" })], HOY);
  assert.equal(cajaDe(v, COB).efectivoEsperado, 480_000);
});

test("un préstamo que se termina de pagar sale de la ruta", () => {
  const pend = [op("pago", "g9", { prestamo_id: "p1", monto: 1_063_000, metodo: "nequi" }, { cliente_id: "c1" })];
  const v = construirVista(datos(), pend, HOY);
  assert.equal(v.activos.length, 0);
  assert.equal(rutaDe(v, COB).length, 0);
  assert.equal(cajaDe(v, COB).digital, 1_063_000);
});
