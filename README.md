# Inventario y Facturación

Aplicación de escritorio para Windows (100 % offline) de inventario, facturación, cuentas por cobrar y cuentas por pagar. La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md), las decisiones tomadas en [`docs/DECISIONES.md`](docs/DECISIONES.md) y la arquitectura en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

**Estado:** Fase 0 (base) terminada: estructura, migraciones, contraseña, ventanas internas, barra de iconos, buscador de procesos, `keymap`, historial de cambios y respaldos automáticos.

## Requisitos

- Windows 10/11 x64.
- Node.js 22 o superior y npm.
- No hace falta Visual Studio: `better-sqlite3` 13 trae binarios precompilados que sirven para Node y para Electron (D-10).

## Instalación para desarrollo

```powershell
npm install
npm run dev
```

`npm run dev` abre la aplicación con recarga en caliente. En desarrollo, **F12** abre las herramientas de desarrollo.

Para no tocar los datos reales mientras se prueba, use otra carpeta de datos (solo funciona sin empaquetar, D-15):

```powershell
npx electron-vite build
npx electron . --carpeta-datos="C:\ruta\temporal"
```

## Scripts

| Script                     | Qué hace                                                                        |
| -------------------------- | ------------------------------------------------------------------------------- |
| `npm run dev`              | Inicia la app en modo desarrollo.                                               |
| `npm run build`            | Verifica tipos y compila a `out/`.                                              |
| `npm run typecheck`        | TypeScript estricto para el proceso principal y la interfaz.                    |
| `npm run lint`             | ESLint (incluye la obligación de TSDoc en todo), sin advertencias permitidas.   |
| `npm run format`           | Formatea con Prettier.                                                          |
| `npm run test`             | Pruebas unitarias (dominio, formatos, atajos, gestor de ventanas, componentes). |
| `npm run test:integracion` | Pruebas de migraciones, repositorios y servicios contra SQLite en memoria.      |
| `npm run test:todo`        | Ambas suites.                                                                   |
| `npm run empaquetar`       | Genera el instalador `.exe` en `release/` (se completa en la Fase 6).           |

## Dónde quedan los datos

En la app instalada, todo vive en `%APPDATA%\Inventario y Facturación`:

- `datos\inventario.db`: base de datos SQLite (modo WAL).
- `respaldos\`: copias automáticas tras cada cambio (rotación: últimas 20, una por hora de 48 h y una diaria de 30 días).
- `logs\sistema.log`: registro técnico de errores.

Para volver a la pantalla de «primer inicio» en un equipo de pruebas, cierre la app y borre esa carpeta.

## Estructura

```text
src/
  main/      proceso principal: arranque, ventana segura, IPC, servicios (contraseña, respaldos), log
  preload/   puente seguro (contextBridge) con lista blanca de canales
  domain/    reglas de negocio puras (dinero, auditoría, contraseña, política de respaldos)
  data/      conexión SQLite, migrador, migraciones SQL, transacciones, repositorios
  shared/    contrato IPC, keymap, catálogo de procesos, formatos (moneda, cantidades, fechas)
  renderer/  interfaz React: acceso, escritorio MDI, barra de iconos, buscador, diálogos, atajos
tests/integracion/  pruebas con SQLite en memoria
```

## Atajos de teclado

Todos los atajos están en un único archivo: [`src/shared/keymap.ts`](src/shared/keymap.ts). Los atajos de los íconos se definen en `ATAJOS_PROCESOS` de ese mismo archivo.

| Atajo   | Acción                                                                  |
| ------- | ----------------------------------------------------------------------- |
| Ctrl+K  | Buscar un proceso por nombre («abono», «factura»…) y abrirlo con Enter. |
| Esc     | Retroceder; si cierra una ventana, pide confirmación.                   |
| Ctrl+0  | Cerrar todas las ventanas (con confirmación).                           |
| Ctrl+F6 | Pasar a la siguiente ventana abierta.                                   |
| ↑ / ↓   | Navegar entre campos, listas y opciones.                                |
| ← / →   | Cambiar de botón en los diálogos.                                       |
