// Pruebas del motor de préstamos: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { simular } from "../src/lib/prestamos/motor.js";
import { planCuotas } from "../src/lib/prestamos/metodos.js";
import { sumarDias, diasEntre, inicioSemana } from "../src/lib/fechas.js";

const base = { capital: 1_000_000, tasa: 10, fecha_inicio: "2026-01-01" };
const pago = (id, monto, fecha) => ({ id, monto, fecha, orden: id });

test("fechas", () => {
  assert.equal(sumarDias("2026-01-31", 1), "2026-02-01");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(diasEntre("2026-01-01", "2026-01-31"), 30);
  assert.equal(inicioSemana("2026-11-15"), "2026-11-09"); // domingo → lunes anterior
});

test("plan de cuotas redondeado a miles y cuadra exacto", () => {
  const { valorCuota, montos } = planCuotas(1_100_000, 30);
  assert.equal(valorCuota, 37_000);
  assert.equal(montos.at(-1), 27_000);
  assert.equal(montos.reduce((a, b) => a + b), 1_100_000);
  // Caso donde redondear hacia arriba dejaría la última en negativo
  const p = planCuotas(10_500, 10);
  assert.equal(p.montos.reduce((a, b) => a + b), 10_500);
  assert.ok(p.montos.every((m) => m > 0));
});

test("interés mensual: debe capital + 10 % desde el día 1", () => {
  const r = simular({ prestamo: { ...base, metodo: "interes_mensual", base_interes: "saldo_total" }, hasta: "2026-01-15" });
  assert.equal(r.saldo, 1_100_000);
  assert.equal(r.saldos.interes, 100_000);
  assert.equal(r.proximoCorte, "2026-01-31");
});

test("interés mensual: las 3 bases del segundo mes (abonó 300.000)", () => {
  const pagos = [pago("p1", 300_000, "2026-01-10")];
  const caso = (b) => simular({ prestamo: { ...base, metodo: "interes_mensual", base_interes: b }, pagos, hasta: "2026-01-31" });
  // Debe 800.000 (de los cuales 0 interés y 800.000 capital, porque el abono pagó primero los 100.000 de interés)
  assert.equal(caso("saldo_total").saldo, 800_000 + 80_000);
  assert.equal(caso("capital_pendiente").saldo, 800_000 + 80_000);
  assert.equal(caso("capital_original").saldo, 800_000 + 100_000);
});

test("interés mensual: base capital pendiente difiere cuando aún debe interés", () => {
  // Abona solo 50.000 (queda debiendo 50.000 de interés + 1.000.000 capital)
  const pagos = [pago("p1", 50_000, "2026-01-10")];
  const total = simular({ prestamo: { ...base, metodo: "interes_mensual", base_interes: "saldo_total" }, pagos, hasta: "2026-01-31" });
  const cap = simular({ prestamo: { ...base, metodo: "interes_mensual", base_interes: "capital_pendiente" }, pagos, hasta: "2026-01-31" });
  assert.equal(total.saldo, 1_050_000 + 105_000);
  assert.equal(cap.saldo, 1_050_000 + 100_000);
  assert.ok(total.diasAtraso >= 0);
});

test("interés mensual: se acumula cada 30 días y se detiene al pagar", () => {
  const p = { ...base, metodo: "interes_mensual", base_interes: "capital_original" };
  const r = simular({ prestamo: p, hasta: "2026-04-01" }); // cortes: 31-ene, 2-mar, 1-abr
  assert.equal(r.saldo, 1_000_000 + 100_000 * 4);
  const pagado = simular({ prestamo: p, pagos: [pago("p1", 1_100_000, "2026-01-20")], hasta: "2026-04-01" });
  assert.equal(pagado.estado, "pagado");
  assert.equal(pagado.saldo, 0);
  assert.equal(pagado.proximoCorte, null);
});

test("cuotas fijas: 30 diarias, al día, sin recargo", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "saldo_total", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "ninguno" };
  const pagos = Array.from({ length: 5 }, (_, i) => pago(`p${i}`, 37_000, sumarDias("2026-01-01", i + 1)));
  const r = simular({ prestamo: p, pagos, hasta: "2026-01-06" });
  assert.equal(r.plan.fecha_vencimiento, "2026-01-31");
  assert.equal(r.saldo, 1_100_000 - 5 * 37_000);
  assert.equal(r.atraso, 0);
  assert.equal(r.diasAtraso, 0);
  assert.equal(r.cuotasCubiertas, 5);
  assert.equal(r.cuotaHoy, 37_000); // la cuota 5 vence el 6 de enero…
  assert.equal(r.sugeridoHoy, 0); // …pero ya la pagó
});

test("cuotas fijas: atraso y recargo fijo diario", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "saldo_total", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "fijo_diario", recargo_valor: 2_000 };
  // No paga nada los primeros 3 días (cuotas del 2, 3 y 4 de enero)
  const r = simular({ prestamo: p, hasta: "2026-01-05" });
  // Recargos el 2, 3 y 4 (días ya cerrados con atraso); el 5 es "hoy" y aún no cuenta → 6.000
  assert.equal(r.saldos.recargo, 6_000);
  assert.equal(r.diasAtraso, 3);
  assert.equal(r.atraso, 3 * 37_000 + 6_000);
  assert.equal(r.sugeridoHoy, 3 * 37_000 + 6_000 + 37_000);
});

test("cuotas fijas: recargo % por cuota atrasada (una sola vez por cuota)", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "saldo_total", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "porcentaje_cuota", recargo_valor: 10 };
  const r = simular({ prestamo: p, pagos: [pago("p1", 37_000, "2026-01-02")], hasta: "2026-01-05" });
  // Cuota 1 pagada a tiempo; cuotas 2 y 3 (3 y 4 de enero) atrasadas → 3.700 c/u
  assert.equal(r.saldos.recargo, 7_400);
});

test("cuotas fijas: vencido el plazo suma interés al día siguiente y cada 30 días", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "capital_original", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "ninguno" };
  const r = simular({ prestamo: p, hasta: "2026-03-05" }); // vence 31-ene; cortes 1-feb y 3-mar
  assert.equal(r.saldo, 1_100_000 + 2 * 100_000);
  assert.equal(r.atraso, r.saldo);
});

test("pago se aplica recargo → interés → capital", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "saldo_total", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "fijo_diario", recargo_valor: 2_000 };
  const r = simular({ prestamo: p, pagos: [pago("p1", 150_000, "2026-01-04")], hasta: "2026-01-04" });
  // Al 4 de enero había 2 recargos (2 y 3) = 4.000
  assert.deepEqual(r.aplicaciones.p1, { recargo: 4_000, interes: 100_000, capital: 46_000, sobrante: 0 });
});

test("anular un pago (quitarlo) recalcula todo", () => {
  const p = { ...base, metodo: "cuotas_fijas", base_interes: "saldo_total", n_cuotas: 30, frecuencia: "diaria", recargo_tipo: "fijo_diario", recargo_valor: 1_000 };
  const con = simular({ prestamo: p, pagos: [pago("p1", 37_000, "2026-01-02")], hasta: "2026-01-03" });
  const sin = simular({ prestamo: p, pagos: [], hasta: "2026-01-03" });
  assert.equal(con.saldos.recargo, 0);
  assert.equal(sin.saldos.recargo, 1_000); // día 2 cerrado sin pagar; el 3 es "hoy"
  // Un día después, sin el pago ya son 2 recargos
  assert.equal(simular({ prestamo: p, pagos: [], hasta: "2026-01-04" }).saldos.recargo, 2_000);
});

test("solo interés: paga el interés cada mes y el capital al final", () => {
  const p = { ...base, metodo: "solo_interes", base_interes: "capital_pendiente", n_cuotas: 3, frecuencia: "mensual", recargo_tipo: "ninguno" };
  const r = simular({ prestamo: p, hasta: "2026-01-02" });
  assert.deepEqual(r.plan.cuotas.map((c) => c.monto), [100_000, 100_000, 1_100_000]);
  assert.equal(r.saldo, 1_300_000);
  assert.equal(r.plan.fecha_vencimiento, "2026-04-01");
  // Pagó los 2 primeros intereses a tiempo: queda debiendo capital + último interés
  const pagos = [pago("a", 100_000, "2026-01-31"), pago("b", 100_000, "2026-03-02")];
  const r2 = simular({ prestamo: p, pagos, hasta: "2026-03-05" });
  assert.equal(r2.saldo, 1_100_000);
  assert.equal(r2.diasAtraso, 0);
});

test("descuento anticipado: se entrega menos y se devuelve el monto completo", () => {
  const p = { ...base, metodo: "descuento_anticipado", base_interes: "saldo_total", n_cuotas: 20, frecuencia: "diaria", recargo_tipo: "ninguno" };
  const r = simular({ prestamo: p, hasta: "2026-01-01" });
  assert.equal(r.plan.entregado, 900_000);
  assert.equal(r.plan.descuento, 100_000);
  assert.equal(r.saldo, 1_000_000);
  assert.equal(r.saldos.interes, 0);
  assert.equal(r.plan.valor_cuota, 50_000);
  // Un abono va directo a capital
  const r2 = simular({ prestamo: p, pagos: [pago("a", 50_000, "2026-01-02")], hasta: "2026-01-02" });
  assert.deepEqual(r2.aplicaciones.a, { recargo: 0, interes: 0, capital: 50_000, sobrante: 0 });
});

test("sobrante cuando paga de más", () => {
  const r = simular({ prestamo: { ...base, metodo: "interes_mensual", base_interes: "saldo_total" }, pagos: [pago("p1", 1_200_000, "2026-01-05")], hasta: "2026-01-05" });
  assert.equal(r.estado, "pagado");
  assert.equal(r.sobrante, 100_000);
});
