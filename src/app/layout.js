import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import { Dialogos } from "@/components/ui/Dialogos";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });

export const metadata = {
  title: { default: "Cobrandoo", template: "%s · Cobrandoo" },
  description: "Préstamos y cobros diarios, con o sin internet.",
  applicationName: "Cobrandoo",
  icons: {
    icon: [{ url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: "/icons/apple-touch-icon.png",
  },
  appleWebApp: { capable: true, title: "Cobrandoo", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#0b1b33",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-CO" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <Dialogos />
        <Toaster position="top-center" richColors closeButton />
      </body>
    </html>
  );
}
