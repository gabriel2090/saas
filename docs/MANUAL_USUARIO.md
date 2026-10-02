# Manual de usuario

Guía de uso diario de Inventario y Facturación. Se completa fase a fase; por ahora cubre la configuración de la facturación y la ventana Facturar.

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

Al guardar, la factura queda registrada (descuenta el inventario y, si es a crédito, queda en la cartera del cliente) y se imprime la tirilla. Si la impresora falla o está apagada, la factura **ya quedó guardada**: arregle la impresora y pulse «Reintentar impresión». La reimpresión de facturas anteriores llega en una fase próxima.
