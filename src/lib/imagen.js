"use client";

/**
 * Reduce una foto del celular (que puede pesar 3-8 MB) a un JPEG de ~200-400 KB:
 * lado mayor de 1600 px, calidad 0.75. Así se guarda en el teléfono y se sube rápido con poca señal.
 * Respeta la orientación EXIF (createImageBitmap con imageOrientation).
 */
export async function comprimirFoto(archivo, { lado = 1600, calidad = 0.75 } = {}) {
  let img;
  try {
    img = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  } catch {
    img = await cargarImagen(archivo);
  }
  const escala = Math.min(1, lado / Math.max(img.width, img.height));
  const w = Math.round(img.width * escala);
  const h = Math.round(img.height * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(img, 0, 0, w, h);
  img.close?.();
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
  if (!blob) throw new Error("No se pudo procesar la foto");
  return blob;
}

function cargarImagen(archivo) {
  return new Promise((ok, mal) => {
    const url = URL.createObjectURL(archivo);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      mal(new Error("Ese archivo no es una imagen"));
    };
    img.src = url;
  });
}
