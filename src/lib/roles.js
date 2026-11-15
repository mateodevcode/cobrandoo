// Roles y reglas de jerarquía compartidas entre cliente y servidor.

export const ROLES = {
  SUPER_ADMIN: "super_admin",
  DUENO: "dueno",
  SUPERVISOR: "supervisor",
  COBRADOR: "cobrador",
};

export const ROLES_ORG = [ROLES.DUENO, ROLES.SUPERVISOR, ROLES.COBRADOR];

export const NOMBRE_ROL = {
  super_admin: "Super admin",
  dueno: "Dueño",
  supervisor: "Supervisor",
  cobrador: "Cobrador",
};

/** Roles que pueden ser jefe directo de cada rol. */
export const JEFES_PERMITIDOS = {
  dueno: [],
  supervisor: [ROLES.DUENO],
  cobrador: [ROLES.SUPERVISOR, ROLES.DUENO],
};

export const ESTADOS_USUARIO = ["activo", "inactivo", "suspendido"];
