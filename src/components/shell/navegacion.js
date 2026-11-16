// Menú por rol. `pronto: true` = módulo de una fase siguiente (se muestra deshabilitado).
// `movil: false` = solo en la barra lateral de escritorio (la barra inferior tiene 4 espacios).
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
    return [{ href: "/admin", etiqueta: "Organizaciones", icono: Building2 }];
  }
  if (rol === "cobrador") {
    return [
      { href: "/inicio", etiqueta: "Inicio", icono: Home },
      { href: "/ruta", etiqueta: "Ruta", icono: Route },
      { href: "/clientes", etiqueta: "Clientes", icono: Users },
      { href: "/caja", etiqueta: "Caja", icono: Wallet },
      { href: "/prestamos", etiqueta: "Préstamos", icono: HandCoins, movil: false },
      { href: "/metodos", etiqueta: "Métodos", icono: BookOpen, movil: false },
    ];
  }
  // dueño y supervisor
  return [
    { href: "/inicio", etiqueta: "Inicio", icono: Home },
    { href: "/prestamos", etiqueta: "Préstamos", icono: HandCoins, movil: false },
    { href: "/clientes", etiqueta: "Clientes", icono: Users },
    { href: "/cuadres", etiqueta: "Cuadres", icono: ClipboardCheck },
    { href: "/equipo", etiqueta: "Equipo", icono: UsersRound },
    { href: "/ruta", etiqueta: "Rutas", icono: Route, movil: false },
    { href: "/caja", etiqueta: "Mi caja", icono: Wallet, movil: false },
    { href: "/reportes", etiqueta: "Reportes", icono: BarChart3, movil: false },
    { href: "/metodos", etiqueta: "Métodos", icono: BookOpen, movil: false },
  ];
}
