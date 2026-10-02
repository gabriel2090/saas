# Guía de diseño de la interfaz

Documenta el estilo visual que ya tiene la aplicación (construido en la Fase 0, en `src/renderer/estilos/global.css`) y las reglas que debe seguir toda pantalla nueva. No hay capturas del sistema anterior; lo único que se copia de él es la factura impresa (ver `DECISIONES.md`, F-01 a F-09).

Todos los componentes de esta guía están en `global.css` (los de la maqueta de productos se aprobaron el 02/10/2026). Un componente nuevo se propone primero en una maqueta y solo pasa a `global.css` cuando se aprueba.

## 1. Principios

1. **Aplicación de escritorio clásica, no página web.** Ventanas con barra de título, bordes finos, sin animaciones ni tarjetas flotantes. Los **degradados son sutiles** (dos tonos muy cercanos) y **solo van en botones y barras** (barra de iconos, botones); ventanas, campos, tablas y avisos usan colores planos.
2. **Pensada para el teclado.** Todo se puede hacer sin ratón; el foco siempre se ve (borde ámbar) y cada acción frecuente tiene atajo, que se muestra en el propio botón.
3. **Densa pero legible.** Se ven muchas filas a la vez: letra de 13–14 px, filas compactas, cifras alineadas a la derecha.
4. **Sin sorpresas.** Lo que no se puede editar se ve gris; las alertas usan siempre los mismos colores; las confirmaciones usan el mismo diálogo.
5. **Todo en español**, con mayúsculas solo al inicio de frase (los nombres de producto y cliente se guardan como los escriba el usuario).

## 2. Paleta

Definida como variables CSS en `:root`. No se usan colores sueltos fuera de estas variables (salvo grises de borde secundarios ya presentes).

| Variable                  | Valor     | Uso                                                       |
| ------------------------- | --------- | --------------------------------------------------------- |
| `--color-fondo`           | `#dfe5ec` | Fondo general (pantalla de acceso).                       |
| `--color-escritorio`      | `#c9d3de` | Escritorio donde se apilan las ventanas.                  |
| `--color-panel`           | `#ffffff` | Fondo de ventanas y diálogos.                             |
| `--color-borde`           | `#8a9bb0` | Bordes de ventanas, campos, botones y tablas.             |
| `--color-titulo`          | `#2f4a6d` | Barra de título activa, encabezados, títulos.             |
| `--color-titulo-inactivo` | `#7d8fa6` | Barra de título de ventanas que no están al frente.       |
| `--color-primario`        | `#2563a8` | Botón principal, fila seleccionada, opción activa.        |
| `--color-primario-oscuro` | `#1b4d85` | Borde y degradado del botón principal.                    |
| `--color-texto`           | `#1d2733` | Texto normal.                                             |
| `--color-tenue`           | `#5b6878` | Etiquetas de campo, ayudas, datos de solo lectura.        |
| `--color-error`           | `#b42318` | Errores, stock en cero, acciones destructivas.            |
| `--color-exito`           | `#1d7a3a` | Confirmaciones, estado «Activo».                          |
| `--color-foco`            | `#f2b01e` | Contorno del elemento con foco.                           |
| `--color-alerta`          | `#9a5b00` | Texto de advertencia.                                     |
| `--color-alerta-fondo`    | `#fff4dc` | Fondo de advertencias y filas con alerta.                 |
| `--color-solo-lectura`    | `#eef1f5` | Fondo de campos no editables.                             |
| `--color-fila-par`        | `#f5f7fa` | Filas pares de las tablas.                                |

**Error vs. alerta:** rojo = no se puede continuar o algo está mal (stock en cero, dato inválido). Ámbar = se puede continuar, pero conviene revisar (precio bajo el costo).

## 3. Tipografía

- Fuente: **Segoe UI** (respaldo Tahoma), la del sistema en Windows.
- Tamaños: 14 px base; 13 px en tablas y avisos; 12 px en etiquetas de campo y barra de estado; 11 px en atajos, etiquetas de estado y textos de la barra de iconos; 15–20 px solo en títulos.
- Negrita (600) solo en barras de título, encabezados de tabla, títulos de grupo y etiquetas de estado.
- Cifras con `font-variant-numeric: tabular-nums` para que las columnas queden alineadas.

## 4. Estructura de la ventana principal

```
┌──────────────────────────────────────────────────────────────┐
│ Barra de iconos (procesos anclados)            Buscar Ctrl+K │
├──────────────────────────────────────────────────────────────┤
│ Escritorio: ventanas internas apiladas (MDI)                 │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Barra de estado: versión · último respaldo · atajos globales │
└──────────────────────────────────────────────────────────────┘
```

- **Barra de iconos** (`.barra-iconos`): degradado claro, botones de 92 px con ícono lineal de 26 px y texto de 11 px. No reciben foco con Tab. Mide 75 px de alto; la Fase 3c propone adelgazarla (§11.4).
- **Escritorio** (`.escritorio`): gris azulado; sin ventanas muestra un texto de ayuda centrado.
- **Barra de estado** (`.barra-estado`): 12 px, gris; a la derecha, los atajos de la ventana activa o los globales.

## 5. Ventanas internas

- Borde de 1 px, esquinas de 4 px arriba, sombra suave; la activa tiene sombra más marcada y barra de título `--color-titulo`; las demás, `--color-titulo-inactivo`.
- Barra de título: nombre del proceso en negrita; si hay cambios sin guardar, se añade «• sin guardar» en texto normal.
- Botón × a la derecha (rojo al pasar el ratón). Cerrar siempre pide confirmación.
- Contenido con 16 px de margen interno.
- Una instancia por proceso (D-04).
- **Se pueden agrandar** arrastrando el asa de la esquina inferior derecha (mínimo 360×200 px). Cada proceso abre con un tamaño inicial (`src/renderer/ventanas/tamanos.ts`); los maestros, con 1040×640 px. Las listas aprovechan el espacio extra mostrando columnas adicionales (§6.4). La Fase 3c propone redimensionar por todos los bordes, maximizar, tamaño mínimo por proceso, recordar tamaño y posición, y dividir el escritorio (§11).

## 6. Componentes

### 6.1 Botones (`.boton`)

- Normal: degradado sutil de blanco a gris muy claro, borde `--color-borde`, esquinas de 3 px.
- Principal (`.boton--primario`): fondo azul, texto blanco. **Uno solo por ventana o diálogo** (la acción de guardar o aceptar).
- Deshabilitado: 60 % de opacidad.
- Si tiene atajo, se muestra dentro del botón con `.atajo`: «Guardar Ctrl+S».

### 6.2 Barra de herramientas de ventana (`.barra-herramientas`)

Fila superior de la ventana: acciones (Nuevo, Guardar, Inactivar…), separador, búsqueda, filtros y, a la derecha, un resumen en gris («12 productos · 1 inactivo»). Una línea fina la separa del contenido.

### 6.3 Campos (`.campo`)

- Etiqueta arriba, 12 px, gris. Los obligatorios llevan « *».
- Campo con borde de 1 px, esquinas de 2 px y relleno de 5×7 px.
- Solo lectura: fondo `--color-solo-lectura` y texto gris.
- Numéricos (`.campo--num`): alineados a la derecha.
- Ayuda debajo con `.campo__ayuda`, 11 px gris.
- Opciones cortas excluyentes (UND/KG) con `.segmentado`: la elegida va en azul.
- Grupos de campos relacionados en `.grupo` (fieldset con título pequeño en negrita).

### 6.4 Tablas (`.tabla`)

- Encabezado fijo al desplazar, fondo `#e9edf2`, texto `--color-titulo` en negrita.
- Filas de 13 px, compactas, con línea divisoria tenue y filas pares en `--color-fila-par`.
- Columnas de cifras con `.num`: a la derecha y con dígitos del mismo ancho.
- Fila seleccionada: fondo azul, texto blanco (`.fila--seleccionada`).
- Registro inactivo: texto gris en cursiva y etiqueta «Inactivo» (`.fila--inactiva`).
- Fila con advertencia: fondo ámbar (`.fila--alerta`); fila con error: fondo rojo claro (`.fila--error`, vista previa del importador).
- **Columnas extra** (`.col-extra`): la lista (`.maestro__lista`) es un contenedor CSS; las columnas marcadas `.col-extra` solo aparecen si la lista mide 780 px o más, es decir, cuando el usuario agranda la ventana. En productos, las columnas extra son «P. menor» y «P. mínimo».

### 6.5 Etiquetas de estado (`.etiqueta`)

Píldora de 11 px: «Activo» en verde (`.etiqueta--activo`) e «Inactivo» en gris (`.etiqueta--inactivo`).

### 6.6 Avisos (`.aviso`)

Recuadro de 13 px con esquinas de 3 px dentro del formulario: `.aviso--error` (rojo), `.aviso--exito` (verde) y `.aviso--alerta` (ámbar). Todos llevan al inicio un ícono lineal del mismo set de la barra (`IconoInterfaz`: triángulo de alerta, círculo con equis, círculo con visto); no se usan emojis ni símbolos de texto. Se usan con el componente `Aviso`. Los mensajes dicen qué pasa y, si aplica, qué hacer.

### 6.7 Diálogos y buscador

- Capa oscura semitransparente; el diálogo aparece arriba al centro (15 % del alto).
- Diálogo de 420 px: barra de título azul, mensaje, botones a la derecha (el principal, último).
- Buscador de procesos de 520 px: campo grande de 16 px y lista con la opción activa en azul.

## 7. Foco y teclado

- El foco siempre visible: contorno ámbar de 2 px (`:focus-visible`).
- Al traer una ventana al frente, el foco entra al primer campo.
- Flechas ↑/↓ recorren campos, filas y botones; ←/→ solo fuera de campos de texto.
- Los atajos salen **solo** de `src/shared/keymap.ts` y se muestran en botones, ayudas emergentes y barra de estado.

## 8. Formato de datos en pantalla

| Dato                 | En pantalla                                                                                   | Referencia |
| -------------------- | --------------------------------------------------------------------------------------------- | ---------- |
| Dinero en textos     | `$ 1,250,000` y `-$ 500` (`formatearPesos`)                                                    | D-02       |
| Dinero en tablas     | Sin «$», con comas: `13,200`; el encabezado o la etiqueta indica «($)» (`agruparMiles`)        | —          |
| Cantidad UND         | Sin decimales: `23`                                                                            | D-13       |
| Cantidad KG          | Tres decimales con punto: `12.350`                                                             | D-13       |
| % de ganancia        | Un decimal: `17.4 %`; «—» si el costo es cero                                                  | D-32       |
| Fecha y hora         | `02/10/2026 12:20 a. m.`                                                                       | D-20       |

La factura impresa tiene su propio formato, copiado de la actual (F-03 a F-06).

## 9. Patrones de pantalla

### 9.1 Maestro (productos, clientes, proveedores, bodegas, formas de pago)

Maqueta de referencia: `docs/maquetas/productos.html` → `docs/maquetas/productos.png`.

- **Barra de herramientas:** Nuevo (F2), Guardar (Ctrl+S, botón principal), Inactivar/Reactivar (F8), búsqueda por código o nombre, casilla «Mostrar inactivos» y resumen.
- **Izquierda, lista:** tabla con las columnas clave, ordenada por código. ↑/↓ cambia la selección y la ficha se actualiza. Si la ventana se agranda, aparecen columnas extra.
- **Derecha, ficha:** título «Producto 105» con su etiqueta de estado, campos agrupados, datos calculados o derivados en solo lectura (código existente, costo, stock por bodega).
- Si la ficha tiene cambios sin guardar, la barra de título lo indica y cambiar de fila o cerrar pide confirmación.

### 9.2 Ficha del producto

- La lista muestra solo el precio mayor; **las tres escalas se ven en la ficha**, cada una con su % de ganancia.
- Precio por debajo del costo: la fila de la escala se marca en ámbar y aparece el aviso «El precio … está por debajo del costo ($ …). Se puede guardar, pero al facturar no se podrá vender por debajo del costo.» (D-34).
- **Costo:** al crear el producto se escribe a mano; después es de solo lectura y lo cambian las facturas de proveedor. Debajo de la tabla de precios está el botón **«Corregir costo…»**, que abre un diálogo con el costo nuevo y un **motivo obligatorio**; la corrección queda en el historial de cambios (D-35).

## 10. Maquetas

Las maquetas son HTML estático que usa el CSS real de la app. Para regenerar la imagen:

```
npx electron docs/maquetas/capturar.mjs docs/maquetas/productos.html docs/maquetas/productos.png 1280 800
```

No abre la aplicación ni toca sus datos. Las maquetas con varios estados reciben la variante como quinto parámetro (por ejemplo `espacio-ventanas.html` con `dos-columnas`).

## 11. Espacio y ventanas (Fase 3c) — propuesta pendiente de aprobación

Maqueta: `docs/maquetas/espacio-ventanas.html`, con una imagen por variante (`docs/maquetas/espacio-*.png`). Los componentes nuevos están en el bloque de estilos de la maqueta y pasan a `global.css` solo cuando se aprueben.

### 11.1 Espacio disponible

Medido en la app: hoy la barra de iconos mide 75 px y la de estado 23 px. Con la barra adelgazada (36 px) y la de estado delgada (19 px) el escritorio gana 43 px de alto. Medidas en píxeles de la app (una pantalla de 1920×1080 con la escala de Windows al 125 % equivale a 1536×864). La fila de 1536×864 está medida en la app; las otras dos son cálculos con la barra de tareas de Windows 11 y la barra de título de la ventana principal:

| Pantalla                          | Escritorio hoy | Escritorio propuesto | 2 columnas | 3 columnas | 2 × 2     |
| --------------------------------- | -------------- | -------------------- | ---------- | ---------- | --------- |
| 1366×768 (100 %)                  | 1366×591       | 1366×634             | 683×634    | 455×634    | 683×317   |
| 1920×1080 al 125 % (1536×864)     | 1536×696       | 1536×739             | 768×739    | 512×739    | 768×369   |
| 1920×1080 (100 %)                 | 1920×903       | 1920×946             | 960×946    | 640×946    | 960×473   |

### 11.2 Tamaño de las ventanas

- **Redimensionar por los cuatro bordes y las cuatro esquinas** (zona sensible de 6 px en los bordes y 12 px en las esquinas, con el cursor de Windows correspondiente). Se conserva el asa visible de la esquina inferior derecha.
- **Maximizar:** doble clic en la barra de título o el botón □ (junto al ×). Maximizada ocupa todo el escritorio, sin bordes redondeados; otro doble clic, o arrastrarla por el título, la restaura a su tamaño anterior.
- **Tamaño mínimo por proceso** (no se puede achicar más). Entre el mínimo y el tamaño natural, el contenido se desplaza dentro de la ventana; las tablas se encogen primero. Mínimos propuestos (ventana completa, con su barra de título), según el ancho mínimo medido de cada contenido:

| Proceso                                  | Mínimo (ancho × alto) |
| ---------------------------------------- | --------------------- |
| Facturar                                 | 760 × 480             |
| Factura de proveedor                     | 720 × 460             |
| Abono de cliente, Abono a proveedor      | 560 × 440             |
| Ajustes de inventario                    | 560 × 420             |
| Productos, Clientes, Proveedores         | 680 × 360 (440 × 420 en modo angosto, §11.3) |
| Bodegas, Formas de pago                  | 440 × 300 (con modo angosto) |
| Importar datos                           | 560 × 400             |
| Datos del negocio                        | 420 × 360             |
| Procesos de fases futuras                | 480 × 320 hasta que tengan el suyo |

- **Se recuerdan tamaño y posición por proceso** entre sesiones (también si quedó maximizada o encajada). Al abrir, si no cabe en el escritorio actual (otra pantalla u otra escala), se ajusta para que la barra de título quede visible y respetando el mínimo. «Restablecer su tamaño y posición» (menú Organizar o clic derecho en el título) vuelve al tamaño inicial de `tamanos.ts`; «Restablecer todas las ventanas» lo hace con todas.
- La ventana principal ya abre maximizada; se mantiene.

### 11.3 Dividir el escritorio

Hasta 4 ventanas a la vez, cada una de un proceso distinto (D-04). Una ventana **encajada** pierde la sombra y las esquinas redondeadas; la activa se distingue por la barra de título azul y un contorno del mismo color.

- **Arrastrar a un borde o esquina** (maqueta `#arrastre`): al acercar el puntero a 8 px del borde izquierdo o derecho aparece la vista previa de la **mitad**; en una esquina, el **cuadrante**; en el borde superior, **maximizar**. Al arrastrar aparece arriba al centro la tira **«Suelte sobre una zona»** con los diseños 2 columnas, 3 columnas y 2 × 2: soltar sobre una celda encaja la ventana ahí (así se llega a los **tercios**). La vista previa es azul translúcida con la medida de la zona.
- **Asistente de encaje** (maqueta `#asistente`): al encajar una ventana, la zona libre ofrece las demás ventanas abiertas («¿Qué ventana va en la mitad derecha?»): ↑/↓ y Enter elige, Esc la deja libre. Las que no caben en esa zona salen en gris con la razón.
- **Organizar** (botón a la derecha de la barra, junto a «Buscar», y atajo **Ctrl+Shift+O**, maqueta `#dos-columnas`): menú con 2 columnas (1), 3 columnas (2), 2 × 2 (3) y Cascada (4); para la ventana activa: Maximizar o restaurar (M), Mitad izquierda (I), Mitad derecha (D), Restablecer su tamaño y posición (R) y Restablecer todas (T); y la preferencia de la barra superior (B). Cada opción se elige con su tecla o con ↑/↓ y Enter. Las teclas del menú se definen en el `keymap`.
  - Se reparten las ventanas en su orden de uso: la activa va a la izquierda (o arriba a la izquierda). Si hay más ventanas que zonas, las sobrantes quedan detrás en cascada. Con 3 ventanas, «2 × 2» deja la activa en la mitad izquierda y las otras dos en los cuadrantes derechos.
- **Zona más pequeña que el mínimo** (maquetas `#ajuste-1366` y `#menu-1366`): las zonas empiezan iguales; si una ventana no cabe, su columna (o fila) crece hasta su mínimo y las vecinas se achican sin bajar del suyo. La vista previa del arrastre se pone ámbar y dice cómo quedará («La mitad mide 683 px y Facturar necesita al menos 760 px de ancho: quedará de 760 px y la otra zona, de 606 px»). Si ni así cabe, la opción del menú sale en gris con la razón («No caben: cada columna mediría 455 px y Facturar necesita 760»).
- **Borde compartido:** arrastrar el borde entre dos ventanas encajadas cambia el tamaño de ambas, sin bajar de sus mínimos.
- **Al cambiar el tamaño del escritorio** (otra pantalla, ventana principal restaurada), las ventanas encajadas siguen su zona en proporción y las sueltas se ajustan para seguir visibles.
- **Modo angosto de los maestros** (maqueta `#tres-columnas`): por debajo de 680 px de ancho, la ficha pasa debajo de la lista (como las columnas extra de §6.4, con una consulta de contenedor). Así Productos, Clientes y Proveedores caben en tercios.
- **Teclado:** la ventana activa recibe el teclado y sus atajos; Ctrl+F6 pasa a la siguiente (con el escritorio organizado, en orden de lectura: de izquierda a derecha y de arriba abajo); un clic en cualquier parte de una ventana la activa; Esc cierra la activa. La barra de estado muestra los atajos de la activa.

Qué cabe con los mínimos propuestos (barra adelgazada):

| Pantalla                      | 2 columnas                                          | 3 columnas                                                     | 2 × 2                                                     |
| ----------------------------- | --------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------- |
| 1366×768                      | Facturar (760) + una de hasta 606: abono, ajustes, maestro angosto, datos del negocio | Solo maestros angostos y Datos del negocio                     | No (cada fila mediría 317 px)                             |
| 1920×1080 al 125 % (1536×864) | Cualquier par                                       | Maestros angostos y un abono (ajustado a 560 + 488 + 488); sin Facturar | Maestros y ventanas simples; sin documentos               |
| 1920×1080 (100 %)             | Cualquier par                                       | Facturar ajustada (760 + 580 + 580) con abonos o maestros angostos | Facturar arriba ajustada (filas de 480 y 466) con abono y maestros (maqueta `#dos-por-dos`) |

### 11.4 Barra superior y barra de estado

Maqueta `#barra`, con las dos opciones frente a la barra actual:

- **Opción 1 — ícono y nombre en una línea** (`.barra-iconos--linea`): ícono de 20 px y nombre de 12 px al lado; 36 px de alto. Los nombres largos («Factura de proveedor») caben en una línea.
- **Opción 2 — solo íconos** (`.barra-iconos--iconos`): botones de 38 px con ícono de 20 px; 34 px de alto. Al pasar el ratón o llegar con el teclado aparece la **ayuda emergente** (`.ayuda-emergente`) con el nombre y el atajo del proceso, si lo tiene (hoy solo «Buscar», Ctrl+K; los atajos de los íconos se definen en `ATAJOS_PROCESOS` del `keymap`).
- **Barra de estado delgada** (`.barra-estado--delgada`): 11 px de letra y 1 px de relleno; 19 px de alto.
- La preferencia se cambia en el menú Organizar (B) o con clic derecho sobre la barra, y se recuerda entre sesiones.

### 11.5 Dónde se guardan las preferencias

Tamaño y posición por proceso y la preferencia de la barra se guardan en la base, en una tabla de preferencias de interfaz (migración nueva), **fuera del historial de cambios**: no son documentos ni datos del negocio, igual que los borradores (D-89).
