// Genera los íconos PNG de la app (PWA) a partir de un SVG. Uso: node scripts/generar-iconos.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const svg = (padding) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0b1b33"/>
  <g transform="translate(${padding} ${padding}) scale(${(512 - padding * 2) / 512})">
    <rect x="96" y="96" width="320" height="320" rx="88" fill="#14b8a6"/>
    <path d="M318 206a78 78 0 1 0 0 100" fill="none" stroke="#0b1b33" stroke-width="44" stroke-linecap="round"/>
  </g>
</svg>`;

await mkdir("public/icons", { recursive: true });
for (const [nombre, tam, pad] of [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["maskable-512.png", 512, 60], // con margen para íconos recortados en círculo (Android)
  ["apple-touch-icon.png", 180, 0],
]) {
  await sharp(Buffer.from(svg(pad))).resize(tam, tam).png().toFile(`public/icons/${nombre}`);
  console.log("✓", nombre);
}
await sharp(Buffer.from(svg(0))).resize(32, 32).png().toFile("public/icons/favicon-32.png");
console.log("✓ favicon-32.png");
