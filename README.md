# Inventario y Facturación

Aplicación de escritorio para Windows (100 % offline) de inventario, facturación, cuentas por cobrar y cuentas por pagar. La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md), las decisiones tomadas en [`docs/DECISIONES.md`](docs/DECISIONES.md) y la arquitectura en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

**Estado:** Fase 2 (compras y cuentas por pagar) en revisión. Incluye:

- **Fase 0:** estructura, migraciones, contraseña, ventanas internas, barra de iconos, buscador de procesos, `keymap`, historial de cambios y respaldos automáticos.
- **Fase 1:**
  - Clave de recuperación de la contraseña.
  - Datos del negocio.
  - Productos (tres escalas de precio, % de ganancia, «Corregir costo…» y stock por bodega), clientes, proveedores, bodegas y formas de pago.
  - Kardex.
  - Importador CSV/XLSX.
- **Fase 2:**
  - Factura de proveedor: flete y descuento repartidos en el costo, costo nuevo por línea, avisos («revisar precios», variación de costo mayor a 25 %), stock por bodega, último plazo del proveedor y «Pagada de contado».
  - Abono a proveedor: reparto automático a las compras más antiguas, abonos anteriores, anulación con su efecto en el saldo y recibo en hoja carta (imprimir o PDF).
  - Ajustes de inventario: merma, daño y conteo físico.

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

Sin empaquetar, la app usa su propia carpeta `%APPDATA%\Inventario y Facturación (desarrollo)` y nunca los datos reales (D-21); la barra de estado muestra «Datos de desarrollo». Para probar con una carpeta vacía (D-15):

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

## Importar datos del sistema anterior

En el buscador (Ctrl+K) escriba «importar». El asistente acepta CSV (también los de Excel en español, separados por punto y coma) y libros de Excel:

1. Elija qué importar. El orden recomendado es proveedores, clientes, productos y por último el stock inicial.
2. Asigne las columnas; el asistente propone la asignación por el nombre del encabezado. Indique también el formato de los números: punto decimal (`1,250.5`) o coma decimal (`1.250,5`).
3. Revise la vista previa: cada fila con problemas muestra su error, y en ámbar las que reemplazan un stock inicial ya cargado.
4. «Importar solo las filas válidas» guarda todo en una sola operación. Los errores se pueden exportar a Excel para corregirlos y volver a importar esas filas.

Se conservan los códigos del archivo y el consecutivo sigue desde el mayor (D-25). Los valores en pesos van sin centavos. Las celdas numéricas de Excel se toman por su valor; en las de texto, un valor ambiguo para el formato elegido (`13.200` con punto decimal) se marca como error en lugar de adivinar (D-40).

El stock inicial se puede volver a importar (reemplaza al anterior) mientras el producto no tenga otros movimientos de inventario (D-39). También se puede cargar al crear un producto, desde su ficha (D-45).

## Estructura

```text
src/
  main/      proceso principal: arranque, ventana segura, IPC, servicios (contraseña, respaldos,
             maestros, importador, compras, abonos, ajustes), impresión, log
  preload/   puente seguro (contextBridge) con lista blanca de canales
  domain/    reglas de negocio puras (dinero, auditoría, contraseña, respaldos, maestros, ganancia,
             stock, importación, compras, abonos, ajustes, fechas de documentos)
  data/      conexión SQLite, migrador, migraciones SQL, transacciones, repositorios
  shared/    contrato IPC, keymap, catálogo de procesos, formatos (moneda, cantidades, fechas, %)
  renderer/  interfaz React: acceso, escritorio MDI, barra de iconos, buscador, diálogos, atajos,
             maestros (lista + ficha), importador y documentos (compra, abono, ajuste)
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

En las ventanas de maestros (productos, clientes, proveedores, bodegas y formas de pago):

| Atajo  | Acción                                              |
| ------ | --------------------------------------------------- |
| F2     | Nuevo registro.                                     |
| Ctrl+S | Guardar la ficha.                                   |
| F8     | Inactivar o reactivar el registro (nunca se borra). |
| ↑ / ↓  | Con el foco en la lista, cambiar de registro.       |
| Enter  | Con el foco en la lista, pasar a editar la ficha.   |

En la factura de proveedor, el abono y el ajuste de inventario:

| Atajo     | Acción                                                                |
| --------- | --------------------------------------------------------------------- |
| Av. Pág   | Guardar el documento.                                                 |
| Supr      | Quitar la línea de la compra (si no se está escribiendo).             |
| Ctrl+Supr | Quitar la línea de la compra siempre.                                 |
| ↑ / ↓     | En las sugerencias de productos o proveedores, elegir; Enter la toma. |
