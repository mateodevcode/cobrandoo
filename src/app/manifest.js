export default function manifest() {
  return {
    name: "Cobrandoo",
    short_name: "Cobrandoo",
    description: "Préstamos y cobros diarios, con o sin internet.",
    lang: "es-CO",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f6fb",
    theme_color: "#0b1b33",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Ruta de hoy", url: "/ruta" },
      { name: "Mi caja", url: "/caja" },
    ],
  };
}
