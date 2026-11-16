/** @type {import('next').NextConfig} */
const nextConfig = {
  // Cache Components apagado: casi todo es dinámico por usuario y el modo offline vive en el cliente.
  cacheComponents: false,
  poweredByHeader: false,
  // Librerías de Node que se usan tal cual en el servidor (no se empaquetan)
  serverExternalPackages: ["web-push", "pg"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // El service worker siempre se revisa al abrir la app (para recibir actualizaciones)
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // Historial público del cliente: nunca en buscadores ni en cachés compartidas
        source: "/c/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
