// Menú por rol. `pronto: true` = módulo de una fase siguiente (se muestra deshabilitado).
import {
  Building2,
  Home,
  Route,
  Users,
  Wallet,
  ClipboardCheck,
  BarChart3,
  Settings,
  UsersRound,
  HandCoins,
} from "lucide-react";

export function menuPara(rol) {
  if (rol === "super_admin") {
    return [{ href: "/admin", etiqueta: "Organizaciones", icono: Building2 }];
  }
  if (rol === "cobrador") {
    return [
      { href: "/inicio", etiqueta: "Inicio", icono: Home },
      { href: "/ruta", etiqueta: "Ruta", icono: Route, pronto: true },
      { href: "/clientes", etiqueta: "Clientes", icono: Users, pronto: true },
      { href: "/caja", etiqueta: "Caja", icono: Wallet, pronto: true },
    ];
  }
  // dueño y supervisor
  return [
    { href: "/inicio", etiqueta: "Inicio", icono: Home },
    { href: "/prestamos", etiqueta: "Préstamos", icono: HandCoins, pronto: true },
    { href: "/clientes", etiqueta: "Clientes", icono: Users, pronto: true },
    { href: "/equipo", etiqueta: "Equipo", icono: UsersRound, pronto: true },
    { href: "/cuadres", etiqueta: "Cuadres", icono: ClipboardCheck, pronto: true },
    { href: "/reportes", etiqueta: "Reportes", icono: BarChart3, pronto: true },
    { href: "/ajustes", etiqueta: "Ajustes", icono: Settings, pronto: true },
  ];
}
