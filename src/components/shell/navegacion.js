// Menú por rol. En escritorio se ven todas las opciones en la barra lateral.
// En el celular, la barra inferior muestra las 3 marcadas con `barra: true` (+ el botón de acción)
// y TODAS las demás quedan en el panel "Más": ninguna opción se pierde en el celular.
// `pronto: true` = módulo de una fase siguiente (se muestra deshabilitado).
import {
  Building2,
  Home,
  Route,
  Users,
  Wallet,
  ClipboardCheck,
  BarChart3,
  UsersRound,
  HandCoins,
  BookOpen,
} from "lucide-react";

export function menuPara(rol) {
  if (rol === "super_admin") {
    return [{ href: "/admin", etiqueta: "Organizaciones", icono: Building2, barra: true }];
  }
  if (rol === "cobrador") {
    return [
      { href: "/inicio", etiqueta: "Inicio", icono: Home, barra: true },
      { href: "/ruta", etiqueta: "Ruta", icono: Route, barra: true },
      { href: "/caja", etiqueta: "Caja", icono: Wallet, barra: true },
      { href: "/clientes", etiqueta: "Clientes", icono: Users },
      { href: "/prestamos", etiqueta: "Préstamos", icono: HandCoins },
      { href: "/metodos", etiqueta: "Métodos", icono: BookOpen },
    ];
  }
  // dueño y supervisor
  return [
    { href: "/inicio", etiqueta: "Inicio", icono: Home, barra: true },
    { href: "/cuadres", etiqueta: "Cuadres", icono: ClipboardCheck, barra: true },
    { href: "/equipo", etiqueta: "Equipo", icono: UsersRound, barra: true },
    { href: "/clientes", etiqueta: "Clientes", icono: Users },
    { href: "/prestamos", etiqueta: "Préstamos", icono: HandCoins },
    { href: "/ruta", etiqueta: "Rutas", icono: Route },
    { href: "/caja", etiqueta: "Mi caja", icono: Wallet },
    { href: "/reportes", etiqueta: "Reportes", icono: BarChart3 },
    { href: "/metodos", etiqueta: "Métodos", icono: BookOpen },
  ];
}
