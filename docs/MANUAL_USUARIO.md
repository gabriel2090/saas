# Manual de usuario

Guía de uso diario de Inventario y Facturación. Se completa fase a fase; por ahora cubre las ventanas y cómo organizarlas, la configuración de la facturación, la ventana Facturar, las reimpresiones, los reportes, el cierre de caja, el abono de cliente, la importación de saldos iniciales y los respaldos.

## Ventanas y «Organizar»

Cada proceso abre su ventana dentro del escritorio. Puede tener varias a la vez y verlas lado a lado.

- **Mover y cambiar el tamaño:** arrastre la ventana por su título. Para cambiar el tamaño, arrastre cualquier borde o esquina. Cada ventana tiene un tamaño mínimo para que su contenido se pueda usar.
- **Maximizar:** doble clic en el título o el botón □. Otro doble clic la devuelve a como estaba.
- **Encajar arrastrando:** lleve la ventana al borde izquierdo o derecho para ocupar la mitad, a una esquina para un cuarto o al borde de arriba para maximizarla. Arriba al centro aparece «Suelte sobre una zona» con los diseños de 2 columnas, 3 columnas y 2 × 2: suelte sobre una casilla para ponerla ahí. Si la zona es más angosta que el mínimo de la ventana, la vista previa sale en ámbar y dice cómo quedará.
- **Llenar el resto:** al encajar una ventana, la zona libre pregunta qué ventana va ahí. Elija con ↑/↓ y Enter, o deje la zona libre con Esc.
- **Organizar (Ctrl+Shift+O)** o el botón «Organizar» de la barra: reparte las ventanas en 2 columnas (1), 3 columnas (2), 2 × 2 (3) o cascada (4). Para la ventana activa: maximizar (M), mitad izquierda (I), mitad derecha (D) y restablecer su tamaño y posición (R). «Restablecer todas» (T) devuelve todas a su tamaño inicial. Las opciones que no caben en la pantalla salen en gris con la razón. El clic derecho en el título de una ventana abre el mismo menú.
- **Borde compartido:** con dos ventanas encajadas lado a lado, arrastrar el borde entre ellas cambia el tamaño de las dos.
- **Teclado:** Ctrl+F6 pasa a la siguiente ventana; con el escritorio organizado, va de izquierda a derecha y de arriba abajo.
- **Barra superior:** por defecto muestra ícono y nombre. Con clic derecho sobre la barra, o con «B» en Organizar, se cambia a solo íconos (al pasar el ratón se ve el nombre).
- La aplicación **recuerda** el tamaño y la posición de cada ventana y el modo de la barra para la próxima vez.
- En Productos, Clientes y Proveedores, si la ventana es angosta (por ejemplo en tercios), la ficha pasa debajo de la lista.

## Configurar la facturación

Abra «Datos del negocio» (Ctrl+K y escriba «negocio»). En la sección **Facturación**:

- **Próxima factura No.**: el número con el que saldrá la siguiente factura de venta. Póngalo antes de la primera factura (por ejemplo, el que sigue a la última del sistema anterior). Si ya hay facturas, debe ser mayor que la última; la ayuda bajo el campo dice cuál fue.
- **Impresora térmica**: la impresora de tirillas de 80 mm. Si la elige, la factura se imprime sola al guardarla, sin preguntar. Con «Preguntar con el diálogo de impresión de Windows» se abre el diálogo de Windows en cada factura. Si la impresora guardada deja de estar instalada, aparece como «(no instalada)».

Guarde con Ctrl+S o con el botón «Guardar».

## Facturar

Abra Facturar con su ícono o con Ctrl+K y «facturar». La ventana tiene **6 borradores** (pestañas) para atender varias ventas a la vez; cada uno se guarda solo mientras escribe.

### Hacer una venta

1. **Cliente**: empieza en «Consumidor final» (venta de contado). Escriba el código o el nombre y elija con ↑/↓ y Enter. Un cliente registrado pasa la venta a **crédito** con el plazo de su última factura a crédito (8 días si no tiene).
2. **Código**: escriba el código o el nombre del producto y pulse Enter. La línea se agrega con cantidad 1.
3. **Cantidad**: escriba la cantidad (reemplaza el 1) y pulse Enter; el cursor vuelve al código para el siguiente producto.
4. Repita con cada producto y pulse **Av. Pág** (o «Guardar e imprimir»).

### Escala y precio

- La escala de cada línea empieza en **Menor**. **F6** la cambia (Menor → Mínimo → Mayor) en la línea donde está el cursor; desde el código, en la última línea agregada.
- **F7** permite escribir otro precio para la línea. Por debajo del Mínimo sale un aviso ámbar; por debajo del costo no se puede guardar. Pulsar F7 otra vez sobre ese precio lo devuelve al de la escala.
- Si se rebajó el precio, la tirilla imprime «SU AHORRO FUE DE».

### Contado y crédito

- **Contado**: elija la forma de pago. En efectivo escriba lo **recibido** y la ventana calcula el **cambio**; si lo deja vacío, se toma el valor exacto.
- **Crédito**: el recuadro muestra el cupo, lo que debe el cliente y lo disponible. Si tiene facturas vencidas o la venta supera el disponible, el recuadro se pone en rojo, no deja guardar y explica la razón. «Cambiar a contado» (o Av. Pág) pasa la venta a contado.
- Un producto sin stock suficiente muestra un aviso, pero la venta se puede guardar.

### Borradores

- **Alt+1 … Alt+6** van a cada borrador y **Ctrl+Tab** pasa al siguiente. La pestaña muestra el cliente y el total.
- Al cerrar Facturar, los borradores **no se pierden**: vuelven al abrirla, aun después de un apagón.
- Al reabrir un borrador, los precios se actualizan a los vigentes (salvo los alterados con F7) y un aviso dice cuáles cambiaron.
- «Limpiar borrador» descarta el borrador actual (pide confirmación). **Supr** quita la línea donde está el cursor.

### Impresión

Al guardar, la factura queda registrada (descuenta el inventario y, si es a crédito, queda en la cartera del cliente) y se imprime la tirilla. Si la impresora falla o está apagada, la factura **ya quedó guardada**: arregle la impresora y pulse «Reintentar impresión». Para volver a imprimir una factura anterior, use la ventana **Reimpresiones**.

## Reimpresiones

Abra «Reimpresiones» desde la barra superior (o Ctrl+K y «reimpresiones»).

1. Elija el **documento**: factura de cliente, factura de proveedor, abono de cliente o abono a proveedor. La lista muestra los más recientes primero.
2. Para encontrar uno, escriba en **Buscar** el número del documento, el código o parte del nombre del cliente o proveedor (en facturas de proveedor, también el número de la factura del proveedor). **Desde** y **Hasta** (`dd/mm/aaaa`) limitan las fechas; vacías, no limitan.
3. Con las flechas elija el documento y pulse **Ctrl+D** (o Intro) para **verlo**: solo se muestra, no se imprime. Esc cierra la vista.
4. **Ctrl+P** lo **imprime** en la impresora térmica (tirilla de 80 mm).

Todo lo que se reimprime sale con la leyenda **REIMPRESION**. Las facturas anuladas salen además con **ANULADA**, los abonos anulados con **ANULADO**, y las facturas corregidas con **CORREGIDA**, su versión y el recuadro de la corrección. Los saldos iniciales importados no aparecen: no se emitieron en esta aplicación.

## Reportes: inventario valorizado, cuentas por cobrar y cuentas por pagar

Ábralos con Ctrl+K y «inventario valorizado», «cuentas por cobrar» o «cuentas por pagar». Los tres son **a hoy**: muestran la situación en el momento en que se abren, con la fecha y hora de **corte** arriba a la derecha. **F5** («Actualizar») los vuelve a calcular. En los tres:

- **Ctrl+P** («Imprimir o guardar PDF») abre la vista previa en hoja carta, con «Imprimir» y «Guardar PDF». Cada hoja lleva el número de página.
- **Ctrl+E** («Exportar a Excel») guarda un libro .xlsx con las cifras como números, listo para sumar o filtrar en Excel.
- Lo impreso y lo exportado respetan los filtros que tenga la pantalla.

**Inventario valorizado.** Una fila por producto con su existencia en cada bodega, la existencia total, el costo actual y el valor a costo. Puede limitar a una bodega, a un proveedor o a un producto (código o parte del nombre), mostrar los productos sin existencia e incluir los inactivos. El **valor total suma solo las existencias positivas**: las negativas se ven en rojo y su valor aparece aparte, en el indicador «Existencias negativas». Si un producto tiene existencia en una bodega y negativo en otra, su valor es el de la bodega con existencia.

**Cuentas por cobrar y por pagar.** Las facturas con saldo (y las compras, en cuentas por pagar) agrupadas por cliente o proveedor. Primero aparece el que tiene la factura vencida más antigua, y dentro de cada uno, de la más antigua a la más reciente. La columna «Días» dice «Vencida N», «Vence hoy» o «Faltan N»; las vencidas se resaltan en rojo. Cada grupo cierra con su saldo, lo vencido, su saldo a favor y el neto. «Devuelto / corregido» es lo que bajaron las devoluciones y las correcciones. Filtros: un cliente o proveedor (borre el campo para volver a todos), «Todas» o «Solo vencidas», y la casilla para incluir a los que no deben nada pero tienen saldo a favor. Los saldos iniciales importados aparecen con su etiqueta.

En el inventario valorizado, **Ctrl+D** («Ver kardex») abre el kardex del producto elegido, en la bodega del filtro (o en todas). En cuentas por cobrar y por pagar, **Ctrl+D** («Estado de cuenta») abre el estado de cuenta del cliente o proveedor de la fila elegida.

## Kardex

Ábralo con Ctrl+K y «kardex», o desde el inventario valorizado con Ctrl+D. Escriba en **Producto** el código o parte del nombre y pulse Intro. Por defecto muestra la bodega **Principal** desde el primer día del mes anterior hasta hoy; cambie la **Bodega** (o elija «Todas», que agrega la columna «Bodega») y el periodo **Desde** / **Hasta** (`dd/mm/aaaa`).

- La primera fila es el **saldo anterior**: la existencia al cierre del día antes de «Desde».
- Cada movimiento muestra fecha y hora, qué fue (compra, venta, corrección, devolución, anulación, ajuste o inventario inicial), el documento, el cliente o proveedor, la entrada o la salida, el **saldo** después del movimiento y el costo unitario. Las correcciones indican la versión de la factura («Factura 84762 · versión 2»); las anulaciones devuelven la cantidad y llevan la marca **ANULADA**.
- La última fila suma las entradas y las salidas del periodo; arriba, los indicadores muestran el saldo final y su valor al costo actual. Un saldo negativo se ve en rojo.
- **Ctrl+D** («Ver documento») muestra la factura o la compra de la fila (en una devolución, la factura devuelta). Los ajustes y el inventario inicial no tienen documento para ver.
- **Ctrl+P** imprime o guarda el kardex en PDF (hoja carta). **Ctrl+E** lo exporta a Excel con las mismas filas (saldo anterior, movimientos y totales). **F5** lo vuelve a calcular.

## Estados de cuenta

Ábralo con Ctrl+K y «estados de cuenta», o desde cuentas por cobrar o por pagar con Ctrl+D. Elija **Cliente** o **Proveedor**, escriba el código o parte del nombre y pulse Intro. Por defecto muestra desde el primer día del mes anterior hasta hoy; cambie **Desde** / **Hasta** (`dd/mm/aaaa`). La hoja se ve tal como se imprime:

- **Movimientos del periodo**: la primera fila es el **saldo anterior** y luego cada factura, compra, abono, corrección, devolución, anulación y reintegro, con el **saldo corrido**. El saldo es lo que se debe menos el saldo a favor; si queda a favor dice «A favor N». Un abono pagado con saldo a favor no cambia el saldo. Las anulaciones aparecen en su fecha y el documento anulado lleva la marca ANULADA.
- **Facturas (o compras) pendientes** a la fecha «Hasta», con los días de vencimiento contados a ese día.
- Al final: saldo pendiente, vencido, saldo a favor y **neto a pagar**.
- Al cliente solo le aparecen las facturas a crédito (las de contado no afectan su cuenta). Al proveedor le aparecen todas las compras; las de contado, con su pago.
- **Ctrl+P** lo imprime y **Ctrl+G** lo guarda en PDF con el nombre «Estado de cuenta {cliente o proveedor} {fecha}.pdf». Cada página repite el encabezado y lleva «Página N de M». **F5** lo vuelve a calcular. No se exporta a Excel.

## Cierre de caja

Ábralo con Ctrl+K y «cierre de caja». El cierre cubre **desde el cierre anterior vigente hasta el momento de guardarlo**: nada queda sin cerrar ni se cuenta dos veces. La tabla muestra, por forma de pago (Efectivo, Transferencia, Tarjeta…):

- Ventas de contado, abonos recibidos de clientes y reintegros que recibe el negocio (suman); abonos pagados a proveedores, incluidas las compras de contado, y reintegros que entrega el negocio (restan); y **Anulaciones de días anteriores**: lo que se anuló hoy de un tramo ya cerrado, con su signo.
- **Movimiento del tramo**, la **base inicial** (la que dejó el cierre anterior; en el primer cierre se digita), lo **esperado en caja**, lo **contado** y la **diferencia** («Faltan 2,000», «Sobran 500»).

Con ↑/↓ en la tabla se cambia de concepto y a la derecha aparecen sus documentos; **Ctrl+D** muestra el documento elegido.

Para cerrar:

1. Cuente el efectivo y digítelo, o pulse **F8** para el contador de billetes y monedas: escriba cuántos hay de cada uno e Intro pasa el total al efectivo contado (Esc cierra el contador).
2. Transferencia y tarjeta vienen con lo esperado; cámbielas solo si hay diferencia (con «-» adelante si salió más de lo que entró).
3. Escriba la **base que queda en caja** (por defecto, la misma base inicial; no puede ser mayor que el efectivo contado). El recuadro verde dice cuánto efectivo se retira o se consigna.
4. Si hay diferencia, puede escribir una observación. **Av. Pág** guarda el cierre; se puede guardar con diferencia y queda registrada.

Los avisos explican lo que no es dinero (abonos pagados con saldo a favor), las anulaciones de días anteriores y los abonos cuya fecha es distinta del día en que se registraron (cuentan en el cierre del día en que se registraron).

En **Ver** se eligen los cierres guardados. Un cierre guardado **no se edita**: **Ctrl+P** lo imprime o lo guarda en PDF y **Ctrl+X** lo anula, pero **solo el último**; el próximo cierre cubrirá su tramo. Si mientras tenía la ventana abierta alguien registró una venta o un abono, al guardar sale un aviso y el cierre se recalcula sin perder lo digitado.

## Historial de cambios

Ábralo con Ctrl+K y «historial de cambios». Es de **solo lectura**: el historial no se puede editar ni borrar. Muestra los cambios de los **últimos 7 días**, del más reciente al más antiguo; cambie el periodo con **Desde** / **Hasta**, y filtre por **Tipo de documento**, **Acción** (crear, editar, anular, inactivar, reactivar, sistema) o **Número o texto** (número del documento, nombre del cliente, producto, motivo…). Si hay más de 500 cambios con esos filtros se muestran los 500 más recientes y un aviso para acotar la búsqueda.

A la derecha está el **detalle** del registro elegido: fecha y hora, cliente o proveedor, versión y motivo, y una tabla con **solo los campos que cambiaron**, el valor de antes (tachado) y el de después. **Ctrl+D** muestra la factura, la compra o el abono del registro; **Ctrl+P** imprime o guarda en PDF la lista con los filtros que tenga la pantalla.

## Abono de cliente

Abra «Abono de cliente» con Ctrl+K y «abono». Funciona igual que el abono a proveedor.

1. **Cliente**: escriba el código o el nombre. «Consumidor final» no aparece: sus ventas son de contado. La ventana muestra lo que debe, lo vencido, sus facturas con saldo y sus abonos anteriores.
2. **Fecha**, **Forma de pago** y **Valor del abono**. El valor se reparte solo, de la factura más antigua a la más reciente; puede cambiar el monto de cada factura o pulsar «Repartir de nuevo». Lo aplicado debe sumar el valor del abono.
3. Guarde con **Av. Pág** (o «Guardar»). El abono recibe su número (los abonos de cliente llevan su propia numeración, aparte de los de proveedor).
4. En el mensaje de abono guardado, **Imprimir recibo** imprime la tirilla de 80 mm en la impresora térmica, con el saldo pendiente total del cliente. Si falla, el mismo botón sirve para reintentar.
5. En la lista de abonos anteriores, **Ver recibo** abre el recibo en hoja carta (marcado REIMPRESION), para imprimirlo o guardarlo en PDF.

Las facturas marcadas **«Saldo inicial»** vienen del sistema anterior y se abonan como cualquier otra. Para corregir un abono mal hecho, use «Anular…» en la lista de abonos anteriores: el saldo vuelve a las facturas y el abono queda como ANULADO.

## Importar saldos iniciales

Antes de empezar a facturar, cargue lo que le deben los clientes y lo que usted les debe a los proveedores. Abra el **Importador** (Ctrl+K y «importar») y elija «Saldos iniciales de clientes» o «Saldos iniciales de proveedores». Importe primero los clientes y los proveedores.

El archivo (CSV o Excel) lleva **una fila por factura pendiente**:

| Columna | Qué va |
| --- | --- |
| Código del cliente / proveedor | Código del tercero en esta aplicación. |
| Número de factura | Número de la factura en el sistema anterior. En clientes debe ser un número entero. |
| Fecha | Fecha de la factura (`dd/mm/aaaa`, o celda de fecha de Excel). No puede ser futura. |
| Vence / Plazo | Basta con una de las dos; si pone ambas deben coincidir. |
| Saldo | Lo que falta por pagar de esa factura, en pesos. |

- La vista previa marca cada fila con error (cliente que no existe, factura repetida, fechas inválidas…). Se pueden importar solo las filas válidas.
- Si un número de factura de cliente alcanza la «Próxima factura No.», la fila lleva un aviso: al importar, la próxima factura queda después del número más alto importado.
- Cada fila entra como una factura «Saldo inicial»: no mueve inventario, se abona y cuenta en el crédito del cliente como cualquier otra (una vencida bloquea el crédito si el cliente tiene tope).
- Un saldo importado no se puede editar ni borrar; si quedó mal, se podrá anular cuando llegue la anulación de facturas.

## Respaldos

Abra **Respaldos** (Ctrl+K y «respaldos»). Ahí ve las copias de esta instalación, de la más reciente a la más antigua, con su tipo: automática, manual, previa a migración o previa a restauración.

- **Respaldar ahora** guarda una copia en el momento.
- **Cambiar carpeta** pide otra carpeta, comprueba que se pueda escribir y deja ahí una copia manual. Las copias que ya estaban en la carpeta anterior se quedan donde estaban.
- **Abrir carpeta** abre esa carpeta en el explorador de Windows.
- **F5** vuelve a leer la lista.

### Restaurar una copia

1. Elija la fila con las flechas o el clic y pulse **Restaurar esta copia…**. También puede usar **Restaurar desde archivo…** si la copia está en otra carpeta o en un USB.
2. Lea qué documentos se perderían (los que están hoy y no vienen en esa copia) y, si quiere, **Guardar lista en PDF**.
3. Escriba la **contraseña de ahora**. Si la olvidó y tiene la clave de recuperación, puede usar esa clave: sirve para autorizar, pero no se gasta. Al restaurar **vuelve la contraseña que tenía esa copia**, que puede ser distinta de la actual.
4. La aplicación hace primero una copia «previa a restauración», cierra la base y la reemplaza. Luego se reinicia sola.

Si algo falla antes de reemplazar el archivo, la base con la que estaba trabajando sigue igual. Si falla a mitad del reemplazo, el mensaje dice dónde quedó la copia previa: no siga trabajando y use esa copia o la que estaba restaurando.

### Si al abrir sale «No se puede abrir la base de datos»

Esa pantalla aparece **antes** de pedir la contraseña, porque la contraseña está dentro de la base y la base no pasó la verificación. No se puede entrar al sistema con una base dañada.

- La aplicación propone la **última copia válida**. El aviso dice solo a partir de qué hora se perderían los movimientos.
- **Restaurar la copia recomendada y reiniciar** la deja en su lugar. La base dañada **no se borra**: queda en la carpeta de datos con un nombre como `inventario-20261004-151530-danada.db`, por si soporte la necesita.
- **Elegir otra copia…** pasa a la siguiente copia válida de la lista. **Restaurar desde archivo…** usa una copia que tenga guardada en otra unidad.
- **Copiar datos para soporte** copia la versión del programa, las rutas y el resultado del chequeo. No copia facturas, nombres ni valores.
- **Salir** cierra el programa sin cambiar nada.

### Copia externa

En la misma ventana puede indicar una **carpeta de copia externa**: un USB, otra unidad o una carpeta que se sincronice (OneDrive, por ejemplo). Cada día se guarda ahí un archivo `respaldo-diaria-AAAAMMDD.db`. El programa no borra las copias anteriores de esa carpeta.

Si el USB no está conectado o la carpeta no se puede escribir, **el trabajo no se detiene**: la copia de este equipo se sigue guardando y la barra de estado, abajo, avisa que la copia externa no está disponible. Cuando vuelva a conectar la unidad, la siguiente copia diaria se escribirá ahí. **Quitar** deja de usar esa carpeta; no borra los archivos que ya se copiaron.
