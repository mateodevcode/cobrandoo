import { z } from "zod";
import { manejar } from "@/server/http";
import { exigirUsuario } from "@/server/auth/session";
import { query } from "@/server/db";
import { excel, pdf } from "@/server/services/exportar.service";

export const maxDuration = 60;

const params = z.object({ formato: z.enum(["xlsx", "pdf"]), dias: z.coerce.number().refine((d) => [7, 30, 90].includes(d)).default(30) });
const TIPOS = { xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", pdf: "application/pdf" };

// Descarga del reporte en Excel o PDF (dueño y supervisor, sobre lo que pueden ver)
export const GET = manejar(async (req) => {
  const yo = await exigirUsuario(["dueno", "supervisor"]);
  const { formato, dias } = params.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { rows } = await query(`SELECT nombre FROM organizaciones WHERE id = $1`, [yo.org]);
  const { buffer, nombre } = formato === "xlsx" ? await excel(yo, dias) : await pdf(yo, dias, rows[0]?.nombre);
  return new Response(buffer, {
    headers: {
      "Content-Type": TIPOS[formato],
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
