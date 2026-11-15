# Cobrandoo

Préstamos y cobros diarios (gota a gota) con roles dueño → supervisor → cobrador, cierre de caja diario y modo sin internet.

**Stack:** Next.js 16 · React 19 · JavaScript · Tailwind v4 · PostgreSQL con `pg` (sin ORM) · JWT (`jose`).

## Puesta en marcha

```bash
npm install
cp .env.example .env.local      # llena DATABASE_URL y JWT_SECRET
npm run db:migrate              # crea las tablas
SUPER_ADMIN_PASSWORD='...' npm run db:super-admin -- tucorreo@gmail.com "Tu Nombre"
npm run dev
```

Entra con el super admin → crea una organización → crea sus dueños, supervisores y cobradores.

## Estructura

```
migrations/            SQL numerado (001_base.sql, ...). Nunca editar uno ya aplicado: crear uno nuevo.
scripts/               migrate.mjs, crear-super-admin.mjs
src/proxy.js           protege páginas (verifica el JWT, sin base de datos)
src/server/
  db.js                pool de pg + query / uno / transaccion
  http.js              respuestas JSON y manejo de errores de las APIs
  auth/                tokens JWT, cookies, sesión actual
  repos/               SQL de cada tabla (solo consultas parametrizadas)
  services/            reglas de negocio (login, administración)
  jerarquia.js         quién puede ver a quién (CTE recursivo)
src/lib/               código compartido cliente/servidor (roles, validación Zod, formato COP, api)
src/components/        UI (ui/ = piezas base, shell/ = menú y navegación)
src/app/               páginas y rutas API
```

## Sesión

- Todos ingresan con **correo + contraseña** (el correo es único).
- Token de acceso de 15 min (`cb_at`) + token de renovación de 30 días (`cb_rt`, solo viaja a `/api/auth`). Los dos en cookies httpOnly.
- La renovación rota el token en cada uso; si reaparece uno viejo se cierra toda la cadena (posible robo).
- 5 intentos fallidos bloquean el usuario 15 minutos.
- Cambiar la clave o desactivar a un usuario cierra todas sus sesiones.

## Fases

1. ✅ Base, base de datos, login, roles, jerarquía y super admin
2. ✅ Clientes, rutas, préstamos (métodos 1 y 2), pagos y caja — motor en `src/lib/prestamos/` (pruebas: `npm test`), tarea diaria `/api/cron/diario` (requiere `CRON_SECRET`)
3. ✅ Modo sin internet + sincronización — PWA (`public/sw.js`), datos en IndexedDB y cola de envíos en `src/lib/offline/`. Funcionan sin señal: ruta, cobros, mi caja, gastos, nuevo cliente y nuevo préstamo. Operaciones hasta 7 días sin enviar.
4. Cierre de día, cuadre del supervisor, socket-core y notificaciones push
5. Link público del cliente, estadísticas y más métodos de préstamo
