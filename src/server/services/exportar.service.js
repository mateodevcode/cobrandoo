import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { query } from "../db";
import { filtroVisible } from "../permisos";
import { reporte } from "./reportes.service";
import { listar as listarMorosos } from "./morosos.service";
import { NOMBRE_ROL } from "@/lib/roles";
import { METODOS } from "@/lib/prestamos/metodos";
import { NOMBRE_METODO_PAGO } from "@/lib/prestamos/constantes";
import { dinero, fecha } from "@/lib/formato";

/** Todo lo que va en la exportación: el reporte + detalle de préstamos, abonos y morosos. */
async function datos(yo, dias) {
  const r = await reporte(yo, dias);
  const pP = [];
  const fP = await filtroVisible(yo, "p.cobrador_id", "p.organizacion_id", pP);
  const pG = [];
  const fG = await filtroVisible(yo, "pg.cobrador_id", "pg.organizacion_id", pG);
  const [{ rows: prestamos }, { rows: abonos }, morosos] = await Promise.all([
    query(
      `SELECT c.nombre AS cliente, c.cedula, u.nombre AS cobrador, p.metodo, p.frecuencia, p.fecha_inicio::text, p.capital,
              p.tasa::float8 AS tasa, p.total_cargado, p.total_pagado, p.saldo, p.atraso, p.dias_atraso
         FROM prestamos p JOIN clientes c ON c.id = p.cliente_id JOIN usuarios u ON u.id = p.cobrador_id
        WHERE ${fP} AND p.estado = 'activo'
        ORDER BY u.nombre, c.nombre`,
      pP
    ),
    query(
      `SELECT pg.fecha::text, c.nombre AS cliente, u.nombre AS cobrador, pg.monto, pg.metodo,
              pg.aplicado_capital, pg.aplicado_interes, pg.aplicado_recargo
         FROM pagos pg JOIN clientes c ON c.id = pg.cliente_id JOIN usuarios u ON u.id = pg.cobrador_id
        WHERE ${fG} AND pg.anulado_en IS NULL AND pg.fecha BETWEEN $${pG.length + 1} AND $${pG.length + 2}
        ORDER BY pg.fecha DESC, pg.creado_en DESC
        LIMIT 20000`,
      [...pG, r.desde, r.hoy]
    ),
    listarMorosos(yo),
  ]);
  return { r, prestamos, abonos, morosos };
}

const nombreArchivo = (r, ext) => `cobrandoo-reporte-${r.desde}-a-${r.hoy}.${ext}`;
const FMT_PESOS = '"$"#,##0';

// ===================== Excel =====================

export async function excel(yo, dias) {
  const { r, prestamos, abonos, morosos } = await datos(yo, dias);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Cobrandoo";
  wb.created = new Date();

  const hoja = (nombre, columnas, filas) => {
    const ws = wb.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columnas.map((c) => ({ header: c.titulo, key: c.clave, width: c.ancho ?? 16, style: c.pesos ? { numFmt: FMT_PESOS } : {} }));
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A8A" } };
    filas.forEach((f) => ws.addRow(f));
    if (filas.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnas.length } };
    return ws;
  };

  hoja(
    "Resumen",
    [{ titulo: "Concepto", clave: "c", ancho: 42 }, { titulo: "Valor", clave: "v", ancho: 20, pesos: true }],
    [
      { c: `Período: ${fecha(r.desde)} a ${fecha(r.hoy)}`, v: null },
      { c: "Cobrado", v: r.periodo.cobrado },
      { c: "Prestado (salió de caja)", v: r.periodo.prestado },
      { c: "Ganancia cobrada (intereses y recargos)", v: r.periodo.ganancia },
      { c: "Gastos", v: r.periodo.gastos },
      { c: "Neto (ganancia − gastos)", v: r.periodo.ganancia - r.periodo.gastos },
      { c: "", v: null },
      { c: "Dinero del negocio hoy", v: r.dinero.total },
      { c: "Capital prestado por cobrar", v: r.dinero.capitalPrestado },
      { c: "Efectivo en manos del equipo", v: r.dinero.efectivo },
      { c: "Nequi / Daviplata / transferencias", v: r.dinero.digital },
      { c: "", v: null },
      { c: "Cartera total (saldo por cobrar)", v: r.cartera.saldo },
      { c: "Cartera en mora", v: r.cartera.en_mora },
      { c: `Porcentaje en mora: ${r.cartera.porcentajeMora} %`, v: null },
    ]
  ).getColumn(1).font = { bold: false };

  hoja("Por día", [
    { titulo: "Fecha", clave: "fecha", ancho: 14 },
    { titulo: "Cobrado", clave: "cobrado", pesos: true },
    { titulo: "Prestado", clave: "prestado", pesos: true },
  ], r.serie);

  hoja("Equipo", [
    { titulo: "Persona", clave: "nombre", ancho: 26 },
    { titulo: "Rol", clave: "rol", ancho: 14 },
    { titulo: "Cobrado", clave: "cobrado", pesos: true },
    { titulo: "Prestado", clave: "prestado", pesos: true },
    { titulo: "Cartera", clave: "cartera", pesos: true },
    { titulo: "En mora", clave: "en_mora", pesos: true },
    { titulo: "Efectivo", clave: "efectivo", pesos: true },
    { titulo: "Digital", clave: "digital", pesos: true },
    { titulo: "Cierres con fallo", clave: "fallos", ancho: 16 },
  ], r.personas.map((u) => ({ ...u, rol: NOMBRE_ROL[u.rol] })));

  hoja("Préstamos activos", [
    { titulo: "Cliente", clave: "cliente", ancho: 26 },
    { titulo: "Cédula", clave: "cedula", ancho: 14 },
    { titulo: "Cobrador", clave: "cobrador", ancho: 20 },
    { titulo: "Método", clave: "metodo", ancho: 20 },
    { titulo: "Frecuencia", clave: "frecuencia", ancho: 12 },
    { titulo: "Inicio", clave: "fecha_inicio", ancho: 12 },
    { titulo: "Capital", clave: "capital", pesos: true },
    { titulo: "Tasa %", clave: "tasa", ancho: 8 },
    { titulo: "Total a pagar", clave: "total_cargado", pesos: true },
    { titulo: "Pagado", clave: "total_pagado", pesos: true },
    { titulo: "Saldo", clave: "saldo", pesos: true },
    { titulo: "Atrasado", clave: "atraso", pesos: true },
    { titulo: "Días de atraso", clave: "dias_atraso", ancho: 14 },
  ], prestamos.map((p) => ({ ...p, metodo: METODOS[p.metodo]?.nombre ?? p.metodo })));

  hoja("Abonos", [
    { titulo: "Fecha", clave: "fecha", ancho: 12 },
    { titulo: "Cliente", clave: "cliente", ancho: 26 },
    { titulo: "Cobrador", clave: "cobrador", ancho: 20 },
    { titulo: "Monto", clave: "monto", pesos: true },
    { titulo: "Medio", clave: "metodo", ancho: 14 },
    { titulo: "A capital", clave: "aplicado_capital", pesos: true },
    { titulo: "A interés", clave: "aplicado_interes", pesos: true },
    { titulo: "A recargo", clave: "aplicado_recargo", pesos: true },
  ], abonos.map((a) => ({ ...a, metodo: NOMBRE_METODO_PAGO[a.metodo] ?? a.metodo })));

  hoja("Morosos", [
    { titulo: "Cliente", clave: "nombre", ancho: 26 },
    { titulo: "Teléfono", clave: "telefono", ancho: 14 },
    { titulo: "Barrio", clave: "barrio", ancho: 16 },
    { titulo: "Cobrador", clave: "cobrador_nombre", ancho: 20 },
    { titulo: "Días de atraso", clave: "dias_atraso", ancho: 14 },
    { titulo: "Riesgo", clave: "nivel", ancho: 10 },
    { titulo: "Atrasado", clave: "atraso", pesos: true },
    { titulo: "Debe", clave: "saldo", pesos: true },
    { titulo: "Último abono", clave: "ultimo_pago", ancho: 14 },
  ], morosos);

  return { buffer: Buffer.from(await wb.xlsx.writeBuffer()), nombre: nombreArchivo(r, "xlsx") };
}

// ===================== PDF =====================

const AZUL = "#1E3A8A";
const GRIS = "#64748B";

export async function pdf(yo, dias, organizacion) {
  const { r, morosos } = await datos(yo, dias);
  const doc = new PDFDocument({ size: "LETTER", margin: 40, info: { Title: "Reporte Cobrandoo", Author: "Cobrandoo" } });
  const partes = [];
  doc.on("data", (b) => partes.push(b));
  const fin = new Promise((ok) => doc.on("end", ok));
  const ancho = doc.page.width - 80;

  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(20).text("Reporte de cobros");
  doc.fillColor(GRIS).font("Helvetica").fontSize(10).text(`${organizacion ?? ""}${organizacion ? " · " : ""}Del ${fecha(r.desde)} al ${fecha(r.hoy)} · generado el ${fecha(r.hoy)}`);
  doc.moveDown();

  const tarjetas = (items) => {
    const w = (ancho - (items.length - 1) * 8) / items.length;
    const y = doc.y;
    items.forEach(([t, v], i) => {
      const x = 40 + i * (w + 8);
      doc.roundedRect(x, y, w, 46, 6).fillAndStroke("#F1F5F9", "#E2E8F0");
      doc.fillColor(GRIS).font("Helvetica").fontSize(8).text(t, x + 8, y + 8, { width: w - 16 });
      doc.fillColor("#0F172A").font("Helvetica-Bold").fontSize(12).text(v, x + 8, y + 22, { width: w - 16 });
    });
    doc.x = 40;
    doc.y = y + 56;
  };
  const titulo = (t) => {
    doc.moveDown(0.5).fillColor(AZUL).font("Helvetica-Bold").fontSize(13).text(t, 40);
    doc.moveDown(0.3);
  };

  titulo("Período");
  tarjetas([["Cobrado", dinero(r.periodo.cobrado)], ["Prestado", dinero(r.periodo.prestado)], ["Ganancia", dinero(r.periodo.ganancia)], ["Gastos", dinero(r.periodo.gastos)]]);
  titulo("Dinero del negocio hoy");
  tarjetas([["Total", dinero(r.dinero.total)], ["Capital en la calle", dinero(r.dinero.capitalPrestado)], ["Efectivo", dinero(r.dinero.efectivo)], ["Digital", dinero(r.dinero.digital)]]);
  tarjetas([["Cartera por cobrar", dinero(r.cartera.saldo)], ["En mora", dinero(r.cartera.en_mora)], ["% en mora", `${r.cartera.porcentajeMora} %`], ["Préstamos activos", String(r.cartera.prestamos)]]);

  const tabla = (columnas, filas) => {
    const total = columnas.reduce((s, c) => s + c.w, 0);
    const ws = columnas.map((c) => (c.w / total) * ancho);
    const fila = (valores, negrita, fondo) => {
      if (doc.y > doc.page.height - 60) doc.addPage();
      const y = doc.y;
      if (fondo) doc.rect(40, y - 2, ancho, 16).fill(fondo);
      let x = 40;
      valores.forEach((v, i) => {
        doc.fillColor(negrita ? "#FFFFFF" : "#0F172A").font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(8.5)
          .text(String(v ?? ""), x + 3, y + 2, { width: ws[i] - 6, align: columnas[i].der ? "right" : "left", lineBreak: false, ellipsis: true });
        x += ws[i];
      });
      doc.x = 40;
      doc.y = y + 16;
    };
    fila(columnas.map((c) => c.t), true, AZUL);
    filas.forEach((f, i) => fila(f, false, i % 2 ? "#F8FAFC" : null));
  };

  titulo("Equipo");
  tabla(
    [{ t: "Persona", w: 26 }, { t: "Rol", w: 12 }, { t: "Cobrado", w: 15, der: true }, { t: "Prestado", w: 15, der: true }, { t: "Cartera", w: 15, der: true }, { t: "En mora", w: 15, der: true }],
    r.personas.map((u) => [u.nombre, NOMBRE_ROL[u.rol], dinero(u.cobrado), dinero(u.prestado), dinero(u.cartera), dinero(u.en_mora)])
  );

  titulo(`Morosos (${morosos.length})`);
  if (!morosos.length) doc.fillColor(GRIS).font("Helvetica").fontSize(10).text("Nadie en mora.");
  else
    tabla(
      [{ t: "Cliente", w: 26 }, { t: "Cobrador", w: 18 }, { t: "Días", w: 7, der: true }, { t: "Atrasado", w: 15, der: true }, { t: "Debe", w: 15, der: true }, { t: "Último abono", w: 14 }],
      morosos.slice(0, 200).map((m) => [m.nombre, m.cobrador_nombre, m.dias_atraso, dinero(m.atraso), dinero(m.saldo), m.ultimo_pago ? fecha(m.ultimo_pago) : "Nunca"])
    );

  doc.end();
  await fin;
  return { buffer: Buffer.concat(partes), nombre: nombreArchivo(r, "pdf") };
}
