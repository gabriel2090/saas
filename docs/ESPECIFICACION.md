# PROMPT PARA CURSOR — Sistema de Inventario y Facturación (escritorio, 100 % offline)

## 0. Cómo quiero que trabajes

Eres un ingeniero de software senior. Vas a construir, de principio a fin, una aplicación de escritorio para Windows de **inventario, facturación, cuentas por cobrar y cuentas por pagar**. Antes de escribir código:

1. Crea el archivo `docs/ESPECIFICACION.md` copiando esta especificación y manténlo actualizado cuando se tome una decisión nueva.
2. Crea reglas de proyecto en `.cursor/rules/` con las convenciones de la sección 12.
3. Trabaja **por fases** (sección 13). Al empezar cada fase, resume tu plan; al terminar, deja el código compilando, con pruebas pasando y documentado, y espera mi confirmación antes de pasar a la siguiente.
4. **No inventes requisitos.** Si algo es ambiguo, usa el supuesto indicado en la sección 14, anótalo en `docs/DECISIONES.md` y avísame. Si no hay supuesto, pregunta.
5. Todo el texto de la interfaz, los mensajes de error, los reportes y los comentarios del código va **en español**.

---

## 1. Contexto del producto

- Es para un negocio de ventas al por mayor y al detal que vende productos por **unidades y por kilogramos**.
- Se instala en **un solo PC con Windows** y debe funcionar **sin internet**.
- Las facturas son **solo de control interno**: no son facturas electrónicas ni hay autorización de la DIAN. El negocio es **no responsable de IVA**: el sistema **no maneja IVA**.
- Reemplaza a un sistema de escritorio clásico que el cliente ya usa; por eso el flujo es muy **orientado al teclado** y con **varias ventanas apiladas**.
- Imprime en una **impresora térmica Epson TM-T20II (80 mm)** y también debe poder guardar/imprimir en otros formatos y en PDF.

## 2. Stack y arquitectura

- **Electron + React + TypeScript (modo estricto) + Vite**.
- **SQLite** con `better-sqlite3` (síncrono, transacciones). Base de datos local en la carpeta de datos de la aplicación.
- **Vitest** para pruebas; **electron-builder** para el instalador de Windows (.exe).
- Para importar archivos: `xlsx` (SheetJS) y lectura de CSV.
- Arquitectura por capas, sin saltarse ninguna:
  - `src/main/` — proceso principal: base de datos, impresión, respaldos, IPC.
  - `src/preload/` — puente seguro (`contextBridge`); `contextIsolation` activado, sin `nodeIntegration` en el renderer.
  - `src/domain/` — **reglas de negocio puras** (precios, costos, abonos, cartera, stock). Sin dependencias de Electron ni de la base de datos. Es lo más probado.
  - `src/data/` — repositorios y migraciones SQL versionadas.
  - `src/renderer/` — interfaz React: gestor de ventanas, pantallas, atajos.
  - `src/shared/` — tipos y utilidades compartidas (formato de moneda, número a letras, fechas).

## 3. Reglas globales

- **Dinero:** guardar y calcular en **pesos enteros** (`INTEGER`). Nunca usar `float` para dinero.
- **Cantidades:** guardar en **milésimas** (`INTEGER`), es decir, 1,500 kg = 1500. Las unidades enteras se guardan igual (1 und = 1000) y se muestran sin decimales.
- **Fechas:** guardar en ISO 8601; mostrar `dd/mm/aaaa` y hora en 12 horas.
- **Nunca borrar documentos:** facturas, abonos, ajustes y devoluciones se **anulan** (quedan marcados, con fecha y motivo opcional). Los maestros (productos, clientes, proveedores) se **inactivan**, no se borran si tienen movimientos.
- **Transacciones atómicas:** cada operación que toque factura + inventario + cartera se guarda completa o no se guarda nada.
- **Stock derivado de movimientos:** el stock de un producto en una bodega es la suma de sus movimientos de kardex. No se guarda como número suelto editable.
- **Historial de cambios (auditoría):** toda creación, edición y anulación de un documento registra fecha/hora, entidad, id, acción y el contenido antes/después (JSON).
- **Formato de moneda:** pesos colombianos, separador de miles con **coma** (`$ 1,250,000`), igual que la factura actual, sin decimales (ver D-02 en `docs/DECISIONES.md`).

## 4. Modelo de datos (entidades principales)

Diseña las tablas, índices y claves foráneas con migraciones versionadas. Como mínimo:

- `bodegas`, `proveedores`, `clientes`, `productos`
- `formas_pago` (catálogo configurable: efectivo, transferencia, etc.)
- `movimientos_inventario` (kardex: producto, bodega, tipo, cantidad con signo, costo, documento origen, fecha)
- `facturas_cliente`, `facturas_cliente_lineas`, `facturas_cliente_versiones` (historial de ediciones)
- `facturas_proveedor`, `facturas_proveedor_lineas`, `facturas_proveedor_versiones`
- `abonos` (cabecera: tipo cliente/proveedor, número, fecha, forma de pago, valor, estado), `abonos_aplicaciones` (abono ↔ factura con valor aplicado; relación muchos a muchos)
- `ajustes_inventario` (mermas, daños, conteo físico), `devoluciones` (de venta y de compra)
- `cierres_caja`
- `historial_cambios`
- `configuracion` (datos del negocio, consecutivos, rutas de respaldo, hash de contraseña, atajos)

## 5. Maestros

### 5.1 Productos
- Código interno numérico **desde 101 en adelante** (autoincremental, editable solo al crear). Se usa para buscar al facturar. **No hay código de barras.**
- Nombre, proveedor (obligatorio, un producto pertenece a un proveedor), unidad de medida (**UND** o **KG**), estado activo/inactivo.
- **Costo** = costo de la **última compra** (se actualiza al registrar una factura de proveedor).
- **Tres escalas de precio fijas:** `mayor`, `menor` y `mínimo`. Cada una se guarda como precio. Junto a cada escala se muestra el **% de ganancia sobre el costo** = `(precio − costo) / costo × 100`.
- Al cambiar el costo por una compra nueva: **se mantienen los precios** de las escalas, se recalcula el % mostrado y se **alerta** si alguna escala queda por debajo del costo.
- Stock por bodega calculado desde el kardex. **Se permite vender con stock en cero o negativo.**

### 5.2 Clientes
- Código propio autoincremental (ver supuesto en sección 14).
- Datos **obligatorios al registrar:** tipo de persona (natural o jurídica), nombre completo o razón social según el tipo, tipo de identificación (cédula, NIT, etc.), número de identificación, celular, dirección.
- Existe un cliente genérico **«Consumidor final»**, creado por el sistema, que es el predeterminado al facturar y no exige datos.
- **Crédito:** plazo en días por factura (se elige al facturar) y **tope de crédito opcional** por cliente: se puede asignar y quitar. Con tope asignado, **la venta a crédito se bloquea** si superaría el tope o si el cliente tiene facturas vencidas.

### 5.3 Proveedores
- Código propio autoincremental, mismos datos obligatorios que el cliente.
- Muestran su **deuda actual** al registrar una factura de proveedor.

### 5.4 Bodegas y formas de pago
- Puede haber **varias bodegas**; siempre existe una «Principal». Cada factura y cada ajuste indica la bodega.
- Catálogo de formas de pago configurable por el usuario (efectivo, transferencia, tarjeta, etc.).

## 6. Compras (factura de proveedor)

- Campos: proveedor, número de factura del proveedor (texto libre), fecha, **plazo en días** (calcula el vencimiento), bodega, orden de compra (opcional), líneas (producto por código/nombre, cantidad, costo, total).
- **Flete opcional:** un campo «Valor a distribuir en costo» que se reparte proporcionalmente al valor de cada línea y se suma al costo del producto. Si no hay flete, no se usa.
- **Descuento** opcional sobre el total.
- Al guardar: entra stock a la bodega (movimiento de kardex), se actualiza el costo del producto a la última compra y se crea la **cuenta por pagar** con su vencimiento.
- Muestra subtotal, descuento, total a pagar y la deuda del proveedor.

## 7. Ventas (factura de cliente)

- **Ventana de facturar con hasta 6 pestañas de borrador simultáneas** (solo para factura de cliente). Varias facturas pueden estar escritas sin guardar en la misma ventana. Al guardar una, esa pestaña **queda limpia y abierta**, lista para la siguiente.
- Un borrador **no afecta stock ni cartera** hasta que se guarda. Los borradores se **autoguardan en disco** para sobrevivir a un apagón. Al cerrar la ventana con borradores pendientes se pide confirmación.
- El **número consecutivo se asigna al guardar**, no al abrir la pestaña, para no dejar huecos. Consecutivo simple, sin prefijo ni resolución (inicio configurable).
- Cliente: por defecto «Consumidor final»; o buscar uno registrado por código, nombre o identificación.
- Condición de pago: contado o **crédito con plazo en días** (calcula el vencimiento). Para contado se registra con qué forma de pago se recibió y el cambio.
- Líneas: se agrega el producto escribiendo su **código (101…)** y Enter, o buscando por nombre. Cada producto trae su precio y se **elige la escala por producto** (mayor, menor o mínimo; no por cliente). Cantidad con decimales si es KG.
- **F7** permite alterar el precio de la línea. **Al facturar, el precio no puede quedar por debajo del costo** (se bloquea con mensaje claro).
- **«Su ahorro fue de»** = suma de `(precio de la escala elegida − precio vendido) × cantidad` solo en las líneas donde el precio vendido es menor al de la escala. Si es cero, no se imprime.
- Total en letras, total en números, saldo del crédito, cambio, número de líneas, campo «No. cajas de empaque».
- **Av. Pág** guarda la factura (movimiento de kardex de salida, cartera si es a crédito) y la **envía a imprimir**.

## 8. Cuentas por cobrar, cuentas por pagar y abonos

- **Abonos de cliente y de proveedor** funcionan igual: un abono tiene su número consecutivo, fecha, **forma de pago** y valor, y se **aplica por factura**, pudiendo repartirse entre **varias facturas** a la vez. Validar que no se aplique más que el saldo pendiente.
- Los abonos se pueden **anular**: el saldo vuelve a las facturas a las que se había aplicado y queda en el historial.
- Cada abono genera un **recibo imprimible** (tirilla o PDF).
- **Estado de cuenta** por cliente y por proveedor en PDF: facturas pendientes, abonos aplicados, saldo y días de vencimiento.

## 9. Corrección, anulación, devoluciones, ajustes y reimpresiones

### 9.1 Corrección de facturas
Hay **dos ventanas separadas:** corrección de factura de proveedor y corrección de factura de cliente.
- Se busca la factura; **Ctrl+D** abre la vista **discriminada** (línea por línea) para alterarla.
- Se pueden cambiar **cantidades y precio de venta**, y aquí **sí se permite un precio menor al costo**. Lo puede hacer cualquier persona que haya entrado al sistema, pero **queda registrado** en el historial.
- Al guardar con **Av. Pág**: se genera una nueva versión de la factura, se **ajusta el inventario** (movimientos de corrección), se **recalcula la cartera** y se puede **reimprimir con los cambios**. Si el nuevo total queda por debajo de lo ya abonado, se genera un saldo a favor.
- **Ctrl+X** anula la factura **(pide confirmación)**: queda marcada como ANULADA, conserva su número, devuelve el stock, ajusta la cartera y queda en el historial.

### 9.2 Devoluciones y ajustes
- **Devolución de venta** (reingresa stock y reduce la cartera o genera saldo) y **devolución de compra** (egresa stock y reduce la deuda).
- **Ajustes de inventario:** mermas, daños y conteo físico, por producto y bodega, con motivo.

### 9.3 Ventana de reimpresiones
- Permite reimprimir **facturas de proveedor, facturas de cliente y abonos** (de clientes y de proveedores).
- **Ctrl+D** solo **visualiza** (no se puede alterar). **Ctrl+P** envía a imprimir.
- Toda reimpresión sale marcada con la leyenda **REIMPRESION**.

## 10. Interfaz y atajos de teclado

- **Ventana principal** con una **barra superior de iconos** con las funciones más usadas ancladas. Cada ícono abre su ventana y tiene un **atajo propio** (los define una tabla de configuración, ver abajo).
- **Buscador de procesos** (por ejemplo, **Ctrl+K**): se escribe «abono», «factura», etc. y se abre esa ventana, sin tener que ir al ícono.
- **Ventanas internas apiladas** (estilo MDI) dentro de una sola ventana de Electron: la activa va al frente, se puede cambiar entre ellas y las demás se ven detrás. No usar pestañas del navegador.
- **Atajos globales:**
  - **Esc:** retrocede; si cierra una ventana, **pide confirmación** (más aún si hay cambios sin guardar).
  - **Flechas:** navegar por campos, listas y tablas.
  - **Ctrl+0:** cierra todas las ventanas abiertas (con confirmación si hay cambios pendientes).
- **Atajos por ventana:** Facturar → F7, Av. Pág. Corrección → Ctrl+D, Ctrl+X, Av. Pág. Reimpresiones → Ctrl+D, Ctrl+P.
- Cambiar entre borradores de factura: **Alt+1 a Alt+6** (o Ctrl+Tab).
- **Intercepta** los atajos que Chromium/Electron ya usa (Ctrl+P, Ctrl+D, Ctrl+0, Ctrl+X, Av. Pág) con `preventDefault`. Ctrl+X solo anula cuando no se está escribiendo en un campo de texto. Av. Pág solo guarda/imprime dentro de las ventanas indicadas.
- **Todos los atajos viven en un único archivo de configuración** (`keymap`) fácil de modificar, porque el desarrollador definirá los de los íconos.
- Acceso: pantalla de **contraseña única** al iniciar. No hay roles: quien entra puede hacer todo. Guardar la contraseña con hash (scrypt o bcrypt) y permitir cambiarla.

## 11. Impresión, reportes y extras

### 11.1 Impresión
- Impresión silenciosa por el **driver de Windows** a la Epson TM-T20II (80 mm) con una plantilla HTML/CSS de ancho de tirilla. Vista previa antes de imprimir cuando aplique.
- Diseño de la factura **lo más parecido posible al actual**, con: nombre del negocio, NIT, «No responsable de IVA», dirección y teléfono; «FACTURA DE VENTA» con número; fecha de generación y de expedición; leyenda REIMPRESION cuando aplique; condición de pago y fecha de vencimiento; datos del cliente (código, nombre, identificación, dirección, barrio, ciudad, teléfono); tabla de producto, cantidad y valor; número de líneas; total en letras; total; saldo de crédito; cambio; «Su ahorro fue de»; «Gracias por su compra»; «No. cajas de empaque».
- **No incluir** textos de autorización DIAN ni numeración con resolución (es control interno).
- Alternativas: imprimir en **hoja carta** y **exportar a PDF** (`printToPDF`).

### 11.2 Reportes mínimos
- **Inventario:** por bodega, con cantidad y valor a costo.
- **Cuentas por cobrar:** todas (vencidas y no vencidas), **resaltando las vencidas** y mostrando los **días de vencimiento**, agrupadas por cliente.
- **Cuentas por pagar:** equivalente para proveedores.

### 11.3 Extras incluidos en esta versión
1. **Kardex por producto y bodega:** entradas, salidas, saldo y documento de origen.
2. **Visor del historial de cambios** con filtros por fecha, tipo de documento y acción.
3. **Cierre de caja diario:** ventas de contado, abonos recibidos y pagados por forma de pago, total esperado y total contado (arqueo), guardado como documento.
4. **Estado de cuenta** (cliente y proveedor) y **recibo de abono** imprimibles.
5. **Importador desde el sistema actual:** archivos CSV/XLSX con **mapeo de columnas, vista previa, validación y reporte de errores**, ejecutado en una sola transacción. Debe poder cargar productos, clientes, proveedores, stock inicial y saldos iniciales de cartera.

## 12. Calidad del código

- **Documenta absolutamente todo con TSDoc en español** (`/** ... */`): cada función, método, clase, interfaz, tipo, enum y constante (también las no exportadas) explica **para qué sirve**, con `@param`, `@returns`, `@throws` y, en reglas de negocio complejas, un `@example`. Los comentarios en línea explican el **porqué** de la lógica no obvia. El objetivo: que cualquier programador entienda el sistema sin preguntar.
- TypeScript estricto, sin `any`. ESLint y Prettier configurados.
- **Pruebas unitarias (Vitest)** obligatorias para `src/domain/`: cálculo de % de ganancia, distribución de flete, ahorro, validación de precio bajo costo, aplicación de abonos a varias facturas, anulación de abonos, cartera vencida, stock desde kardex, versiones de factura. Pruebas de integración para las migraciones y los repositorios con una base de datos en memoria.
- Manejo de errores claro: mensajes en español para el usuario, detalle técnico en un registro (log) local.
- Entregables: `README.md` (cómo instalar, desarrollar y empaquetar), `docs/ARQUITECTURA.md` con diagrama entidad-relación (Mermaid), `docs/MANUAL_USUARIO.md` con los atajos y flujos.

## 13. Fases de trabajo

0. **Base:** estructura del proyecto, migraciones, contraseña, gestor de ventanas internas, barra de iconos, buscador de procesos, `keymap`, historial de cambios (infraestructura).
1. **Maestros e importador:** productos, clientes, proveedores, bodegas, formas de pago; pantalla **«Datos del negocio»** (nombre, NIT, régimen, dirección, teléfono) para el encabezado de la factura; importador CSV/XLSX.
2. **Compras y cuentas por pagar:** factura de proveedor, flete, abonos a proveedores.
3. **Ventas y cuentas por cobrar** (dividida en dos, D-80):
   - **3a:** factura de cliente con 6 borradores, escalas, F7, tope de crédito e impresión térmica. Se detiene para probar con la impresora real.
   - **3b:** abonos de clientes e importador de saldos iniciales de cartera.
4. **Correcciones:** corrección de facturas, anulaciones, devoluciones, ajustes, ventana de reimpresiones.
5. **Reportes y extras:** inventario, cuentas por cobrar y por pagar, kardex, visor del historial, cierre de caja, estados de cuenta.
6. **Cierre:** respaldos, instalador de Windows, pulido, documentación y pruebas finales.

**Respaldos (desde la fase 0, se completan en la 6):** copia local **casi instantánea** tras cada transacción confirmada (SQLite en modo WAL + copia con *debounce* de unos segundos) en una carpeta configurable, con **rotación** (últimas 20 copias, una por hora de las últimas 48 horas y una diaria de los últimos 30 días; ver D-07), **restauración desde la propia app** y verificación de integridad (`PRAGMA integrity_check`) al iniciar.

## 14. Supuestos por confirmar (anótalos en `docs/DECISIONES.md`)

- Códigos de clientes y proveedores: autoincrementales, que arrancan en **10001** y son configurables.
- Los datos obligatorios del cliente aplican al **registrarlo**; el «Consumidor final» no exige datos.
- El bloqueo por crédito aplica solo a clientes con tope asignado: se bloquea si la venta superaría el tope o si hay facturas vencidas.
- El flete se reparte proporcionalmente al valor de cada línea de la compra.
- El nombre impreso del documento será «FACTURA DE VENTA», por ser el que usa el cliente hoy.
- Formato exacto del archivo exportado del sistema actual: pendiente; por eso el importador usa mapeo de columnas.

## 15. Fuera de alcance de esta versión (segunda fase)

Panel de inicio con indicadores, alertas de stock mínimo, reporte de utilidades y productos más vendidos, traslados entre bodegas, cotizaciones y pedidos, roles de usuario, exportación de reportes a Excel, respaldo automático a unidad USB. Funciones del sistema actual en la factura de proveedor cuyo significado falta confirmar (P-05 en `docs/DECISIONES.md`): columnas «Tip», «Cont» y «B», F4 «Calcula multiplicación», F6 «Calcula descuento», importar la compra desde un archivo y «Marcar servicios».

---

**Primer paso ahora:** crea `docs/ESPECIFICACION.md` y `.cursor/rules/`, y entrégame el plan detallado de la **Fase 0** (estructura de carpetas, esquema inicial de la base de datos y lista de dependencias) para que lo apruebe antes de escribir código.