# Guía de diseño de la interfaz

Documenta el estilo visual que ya tiene la aplicación (construido en la Fase 0, en `src/renderer/estilos/global.css`) y las reglas que debe seguir toda pantalla nueva. No hay capturas del sistema anterior; lo único que se copia de él es la factura impresa (ver `DECISIONES.md`, F-01 a F-09).

Los componentes marcados **(propuesto)** aún no están en la app: viven en `docs/maquetas/componentes-propuestos.css` y pasan a `global.css` cuando se aprueba la maqueta correspondiente.

## 1. Principios

1. **Aplicación de escritorio clásica, no página web.** Ventanas con barra de título, bordes finos, degradados suaves en botones y barras, sin animaciones ni tarjetas flotantes.
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
| `--color-alerta`          | `#9a5b00` | Texto de advertencia (propuesto).                         |
| `--color-alerta-fondo`    | `#fff4dc` | Fondo de advertencias y filas con alerta (propuesto).     |
| `--color-solo-lectura`    | `#eef1f5` | Fondo de campos no editables (propuesto).                 |
| `--color-fila-par`        | `#f5f7fa` | Filas pares de las tablas (propuesto).                    |

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

- **Barra de iconos** (`.barra-iconos`): degradado claro, botones de 92 px con ícono lineal de 26 px y texto de 11 px. No reciben foco con Tab.
- **Escritorio** (`.escritorio`): gris azulado; sin ventanas muestra un texto de ayuda centrado.
- **Barra de estado** (`.barra-estado`): 12 px, gris; a la derecha, los atajos de la ventana activa o los globales.

## 5. Ventanas internas

- Borde de 1 px, esquinas de 4 px arriba, sombra suave; la activa tiene sombra más marcada y barra de título `--color-titulo`; las demás, `--color-titulo-inactivo`.
- Barra de título: nombre del proceso en negrita; si hay cambios sin guardar, se añade «• sin guardar» en texto normal.
- Botón × a la derecha (rojo al pasar el ratón). Cerrar siempre pide confirmación.
- Contenido con 16 px de margen interno.
- Una instancia por proceso (D-04).

## 6. Componentes

### 6.1 Botones (`.boton`)

- Normal: degradado blanco a gris claro, borde `--color-borde`, esquinas de 3 px.
- Principal (`.boton--primario`): fondo azul, texto blanco. **Uno solo por ventana o diálogo** (la acción de guardar o aceptar).
- Deshabilitado: 60 % de opacidad.
- Si tiene atajo, se muestra dentro del botón con `.atajo` (propuesto): «Guardar Ctrl+S».

### 6.2 Barra de herramientas de ventana (`.barra-herramientas`, propuesto)

Fila superior de la ventana: acciones (Nuevo, Guardar, Inactivar…), separador, búsqueda, filtros y, a la derecha, un resumen en gris («12 productos · 1 inactivo»). Una línea fina la separa del contenido.

### 6.3 Campos (`.campo`)

- Etiqueta arriba, 12 px, gris. Los obligatorios llevan « *».
- Campo con borde de 1 px, esquinas de 2 px y relleno de 5×7 px.
- Solo lectura: fondo `--color-solo-lectura` y texto gris (propuesto).
- Numéricos (`.campo--num`): alineados a la derecha (propuesto).
- Ayuda debajo con `.campo__ayuda`, 11 px gris (propuesto).
- Opciones cortas excluyentes (UND/KG) con `.segmentado`: la elegida va en azul (propuesto).
- Grupos de campos relacionados en `.grupo` (fieldset con título pequeño en negrita, propuesto).

### 6.4 Tablas (`.tabla`, propuesto)

- Encabezado fijo al desplazar, fondo `#e9edf2`, texto `--color-titulo` en negrita.
- Filas de 13 px, compactas, con línea divisoria tenue y filas pares en `--color-fila-par`.
- Columnas de cifras con `.num`: a la derecha y con dígitos del mismo ancho.
- Fila seleccionada: fondo azul, texto blanco (`.fila--seleccionada`).
- Registro inactivo: texto gris en cursiva y etiqueta «Inactivo» (`.fila--inactiva`).
- Fila con advertencia: fondo ámbar (`.fila--alerta`).

### 6.5 Etiquetas de estado (`.etiqueta`, propuesto)

Píldora de 11 px: «Activo» en verde (`.etiqueta--activo`) e «Inactivo» en gris (`.etiqueta--inactivo`).

### 6.6 Avisos (`.aviso`)

Recuadro de 13 px con esquinas de 3 px dentro del formulario: `.aviso--error` (rojo), `.aviso--exito` (verde) y `.aviso--alerta` (ámbar, con «⚠» al inicio, propuesto). Los mensajes dicen qué pasa y, si aplica, qué hacer.

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
- **Izquierda, lista:** tabla con las columnas clave, ordenada por código. ↑/↓ cambia la selección y la ficha se actualiza.
- **Derecha, ficha:** título «Producto 105» con su etiqueta de estado, campos agrupados, datos calculados o derivados en solo lectura (código existente, costo, stock por bodega).
- Si la ficha tiene cambios sin guardar, la barra de título lo indica y cambiar de fila o cerrar pide confirmación.

## 10. Maquetas

Las maquetas son HTML estático que usa el CSS real de la app. Para regenerar la imagen:

```
npx electron docs/maquetas/capturar.mjs docs/maquetas/productos.html docs/maquetas/productos.png 1280 800
```

No abre la aplicación ni toca sus datos.
