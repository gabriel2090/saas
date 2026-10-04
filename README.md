# Inventario y Facturación

Aplicación de escritorio para Windows (100 % offline) de inventario, facturación, cuentas por cobrar y cuentas por pagar. La especificación completa está en [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md), las decisiones tomadas en [`docs/DECISIONES.md`](docs/DECISIONES.md) y la arquitectura en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md).

**Estado:** Fase 3c (espacio y ventanas) en revisión; la 3b está aprobada y la 3a queda pendiente de la prueba con la impresora térmica real. Guía de uso: [`docs/MANUAL_USUARIO.md`](docs/MANUAL_USUARIO.md). Incluye:

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
- **Fase 3a:**
  - Facturar con 6 borradores autoguardados (sobreviven a cerrar la ventana o a un apagón), escala por línea, precio alterado (F7), revisión de crédito con bloqueo y «Cambiar a contado», contado con cambio y «Su ahorro fue de».
  - Tirilla «FACTURA DE VENTA» de 80 mm impresa en silencio en la impresora elegida, con «Reintentar impresión» si falla.
  - En «Datos del negocio»: el consecutivo inicial de la factura y la impresora térmica.
- **Fase 3b:**
  - Abono de cliente: la misma ventana del abono a proveedor (reparto a las facturas más antiguas, abonos anteriores y anulación), con su propio consecutivo y recibo en tirilla de 80 mm o en hoja carta (vista previa y PDF).
  - Importador de saldos iniciales de clientes y de proveedores: cada documento pendiente del sistema anterior entra como factura «Saldo inicial» que se abona y cuenta en el crédito como las demás.
- **Fase 3c:**
  - Ventanas con maximizar, cambio de tamaño por los cuatro bordes y esquinas, y tamaño mínimo por proceso.
  - Encaje al arrastrar (mitades, cuartos y la tira «Suelte sobre una zona» para tercios), asistente que llena la zona libre, borde compartido y menú «Organizar» (Ctrl+Shift+O o clic derecho en el título).
  - Barra superior delgada (ícono y nombre; solo íconos como preferencia), barra de estado de 19 px y modo angosto de los maestros.
  - Tamaño, posición y modo de la barra se recuerdan entre sesiones (migración `0006_interfaz`).

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

| Script                          | Qué hace                                                                                                                                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                   | Inicia la app en modo desarrollo.                                                                                                                                                               |
| `npm run dev:datos-demo`        | Con la app de desarrollo cerrada, reemplaza la base de desarrollo por datos de ejemplo (contraseña `demo`). Si la base anterior no era de ejemplo, la guarda en `datos-anterior-…`.             |
| `npm run dev:datos-demo:borrar` | Borra la base de ejemplo de desarrollo (una base que no sea de ejemplo no se toca).                                                                                                             |
| `npm run test:e2e:correcciones` | Prueba de punta a punta de las ventanas de la Fase 4a, con capturas.                                                                                                                            |
| `npm run build`                 | Verifica tipos y compila a `out/`.                                                                                                                                                              |
| `npm run typecheck`             | TypeScript estricto para el proceso principal y la interfaz.                                                                                                                                    |
| `npm run lint`                  | ESLint (incluye la obligación de TSDoc en todo), sin advertencias permitidas.                                                                                                                   |
| `npm run format`                | Formatea con Prettier.                                                                                                                                                                          |
| `npm run test`                  | Pruebas unitarias (dominio, formatos, atajos, gestor de ventanas, componentes).                                                                                                                 |
| `npm run test:integracion`      | Pruebas de migraciones, repositorios y servicios contra SQLite en memoria.                                                                                                                      |
| `npm run test:todo`             | Ambas suites.                                                                                                                                                                                   |
| `npm run test:e2e`              | Prueba de punta a punta de las ventanas en la app real, con carpeta temporal. `-- --veces=8` la repite para detectar fallas intermitentes; el registro queda en `%TEMP%\saas-e2e\registro.log`. |
| `npm run empaquetar`            | Genera el instalador `.exe` en `release/` (se completa en la Fase 6).                                                                                                                           |

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
             maestros, importador, compras, abonos, ajustes, ventas), impresión (carta y tirilla), log
  preload/   puente seguro (contextBridge) con lista blanca de canales
  domain/    reglas de negocio puras (dinero, auditoría, contraseña, respaldos, maestros, ganancia,
             stock, importación, compras, abonos, ajustes, ventas, fechas de documentos)
  data/      conexión SQLite, migrador, migraciones SQL, transacciones, repositorios
  shared/    contrato IPC, keymap, catálogo de procesos, formatos (moneda, cantidades, fechas, %)
  renderer/  interfaz React: acceso, escritorio MDI, barra de iconos, buscador, diálogos, atajos,
             maestros (lista + ficha), importador y documentos (compra, abono, ajuste, facturar)
tests/integracion/  pruebas con SQLite en memoria
```

## Atajos de teclado

Todos los atajos están en un único archivo: [`src/shared/keymap.ts`](src/shared/keymap.ts). Los atajos de los íconos se definen en `ATAJOS_PROCESOS` de ese mismo archivo.

| Atajo        | Acción                                                                  |
| ------------ | ----------------------------------------------------------------------- |
| Ctrl+K       | Buscar un proceso por nombre («abono», «factura»…) y abrirlo con Enter. |
| Esc          | Retroceder; si cierra una ventana, pide confirmación.                   |
| Ctrl+0       | Cerrar todas las ventanas (con confirmación).                           |
| Ctrl+F6      | Pasar a la siguiente ventana abierta.                                   |
| Ctrl+Shift+O | Menú «Organizar»: 1–4 diseños, M/I/D/R/T ventana activa, B barra.       |
| ↑ / ↓        | Navegar entre campos, listas y opciones.                                |
| ← / →        | Cambiar de botón en los diálogos.                                       |

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

En Facturar:

| Atajo         | Acción                                                                     |
| ------------- | -------------------------------------------------------------------------- |
| Enter         | Cliente → código → cantidad → código (agrega la línea con cantidad 1).     |
| F6            | Cambiar la escala de la línea (Menor → Mínimo → Mayor).                    |
| F7            | Alterar el precio de la línea; otra vez sobre el precio, lo devuelve.      |
| Av. Pág       | Guardar e imprimir (o, si el crédito está bloqueado, «Cambiar a contado»). |
| Alt+1 … Alt+6 | Ir al borrador 1 a 6.                                                      |
| Ctrl+Tab      | Pasar al siguiente borrador.                                               |
| Supr          | Quitar la línea (si no se está escribiendo).                               |
