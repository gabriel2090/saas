/**
 * ===========================================================================
 *  KEYMAP — ÚNICO archivo de atajos de teclado del sistema (D-03).
 * ===========================================================================
 *
 * Para cambiar un atajo, edita la `combinacion` aquí y nada más. Formato:
 * modificadores en el orden `Ctrl+Alt+Shift+` seguidos de la tecla.
 * Teclas válidas: letras (`K`), dígitos (`1`), `F1`…`F12`, `Escape`, `Enter`,
 * `Tab`, `PageDown`, `PageUp`, `ArrowUp`, `ArrowDown`, `ArrowLeft`,
 * `ArrowRight`, `Delete`, `Home`, `End`, `=` y `-`.
 *
 * Las pruebas de `keymap.test.ts` verifican que no haya combinaciones
 * repetidas dentro de un mismo ámbito y que todas estén bien escritas.
 */

import type { IdProceso } from './procesos';

/**
 * Dónde aplica un atajo:
 * - `global`: en toda la aplicación.
 * - `formulario`: navegación entre campos dentro de una ventana.
 * - `maestro`: ventanas de maestros (productos, clientes, proveedores, bodegas, formas de pago).
 * - `documento`: ventanas de documentos con líneas o reparto (factura de
 *   proveedor, abono, ajuste de inventario).
 * - `facturar`, `correccion`, `reimpresiones`: solo dentro de esas ventanas.
 * - `reporte`: ventanas de reportes (inventario valorizado, cuentas por cobrar
 *   y por pagar, kardex, historial de cambios y estados de cuenta).
 * - `cierre`: ventana del cierre de caja.
 * - `organizar`: teclas del menú «Organizar» mientras está abierto (D-110).
 */
export type AmbitoAtajo =
  | 'global'
  | 'formulario'
  | 'maestro'
  | 'documento'
  | 'facturar'
  | 'correccion'
  | 'reimpresiones'
  | 'reporte'
  | 'cierre'
  | 'organizar';

/**
 * Definición de un atajo de teclado.
 */
export interface DefinicionAtajo {
  /** Combinación normalizada, p. ej. `Ctrl+K`. */
  combinacion: string;
  /** Qué hace, en español (se muestra en ayudas y en el manual). */
  descripcion: string;
  /** Dónde aplica. */
  ambito: AmbitoAtajo;
  /**
   * Si se dispara aunque el foco esté en un campo de texto. Por ejemplo,
   * Ctrl+X no anula mientras se escribe, para que siga funcionando «cortar».
   */
  permitirEnCampoTexto: boolean;
}

/**
 * Atajos funcionales del sistema.
 */
export const ATAJOS = {
  // --- Globales ---
  retroceder: {
    combinacion: 'Escape',
    descripcion: 'Retroceder o cerrar la ventana activa',
    ambito: 'global',
    permitirEnCampoTexto: true,
  },
  cerrarTodas: {
    combinacion: 'Ctrl+0',
    descripcion: 'Cerrar todas las ventanas',
    ambito: 'global',
    permitirEnCampoTexto: true,
  },
  buscarProceso: {
    combinacion: 'Ctrl+K',
    descripcion: 'Buscar un proceso por nombre',
    ambito: 'global',
    permitirEnCampoTexto: true,
  },
  siguienteVentana: {
    combinacion: 'Ctrl+F6',
    descripcion: 'Pasar a la siguiente ventana abierta',
    ambito: 'global',
    permitirEnCampoTexto: true,
  },
  organizarVentanas: {
    combinacion: 'Ctrl+Shift+O',
    descripcion: 'Organizar las ventanas (columnas, 2 × 2, cascada…)',
    ambito: 'global',
    permitirEnCampoTexto: true,
  },

  // --- Menú «Organizar» (D-110): teclas sueltas mientras el menú está abierto ---
  organizarDosColumnas: {
    combinacion: '1',
    descripcion: 'Organizar en 2 columnas',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarTresColumnas: {
    combinacion: '2',
    descripcion: 'Organizar en 3 columnas',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarDosPorDos: {
    combinacion: '3',
    descripcion: 'Organizar en 2 × 2',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarCascada: {
    combinacion: '4',
    descripcion: 'Organizar en cascada',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarMaximizar: {
    combinacion: 'M',
    descripcion: 'Maximizar o restaurar la ventana activa',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarMitadIzquierda: {
    combinacion: 'I',
    descripcion: 'Llevar la ventana activa a la mitad izquierda',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarMitadDerecha: {
    combinacion: 'D',
    descripcion: 'Llevar la ventana activa a la mitad derecha',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarRestablecer: {
    combinacion: 'R',
    descripcion: 'Restablecer el tamaño y la posición de la ventana activa',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarRestablecerTodas: {
    combinacion: 'T',
    descripcion: 'Restablecer todas las ventanas',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },
  organizarBarra: {
    combinacion: 'B',
    descripcion: 'Cambiar la barra superior (ícono y nombre o solo íconos)',
    ambito: 'organizar',
    permitirEnCampoTexto: true,
  },

  // --- Navegación con flechas (campos, listas, tablas y botones) ---
  moverAbajo: {
    combinacion: 'ArrowDown',
    descripcion: 'Ir al campo o fila siguiente',
    ambito: 'formulario',
    permitirEnCampoTexto: true,
  },
  moverArriba: {
    combinacion: 'ArrowUp',
    descripcion: 'Ir al campo o fila anterior',
    ambito: 'formulario',
    permitirEnCampoTexto: true,
  },
  // Izquierda/derecha no actúan dentro de un campo de texto: ahí mueven el cursor.
  moverIzquierda: {
    combinacion: 'ArrowLeft',
    descripcion: 'Ir a la opción anterior',
    ambito: 'formulario',
    permitirEnCampoTexto: false,
  },
  moverDerecha: {
    combinacion: 'ArrowRight',
    descripcion: 'Ir a la opción siguiente',
    ambito: 'formulario',
    permitirEnCampoTexto: false,
  },
  aceptar: {
    combinacion: 'Enter',
    descripcion: 'Aceptar la opción seleccionada',
    ambito: 'formulario',
    permitirEnCampoTexto: true,
  },

  // --- Maestros (D-31) ---
  nuevoRegistro: {
    combinacion: 'F2',
    descripcion: 'Nuevo registro',
    ambito: 'maestro',
    permitirEnCampoTexto: true,
  },
  guardarRegistro: {
    combinacion: 'Ctrl+S',
    descripcion: 'Guardar el registro',
    ambito: 'maestro',
    permitirEnCampoTexto: true,
  },
  cambiarEstadoRegistro: {
    combinacion: 'F8',
    descripcion: 'Inactivar o reactivar el registro',
    ambito: 'maestro',
    permitirEnCampoTexto: true,
  },

  // --- Documentos: factura de proveedor, abono y ajuste (Fase 2) ---
  guardarDocumento: {
    combinacion: 'PageDown',
    descripcion: 'Guardar el documento',
    ambito: 'documento',
    permitirEnCampoTexto: true,
  },
  // Sin Ctrl, Supr no actúa mientras se escribe: ahí borra el carácter (D-60).
  quitarLinea: {
    combinacion: 'Delete',
    descripcion: 'Quitar la línea seleccionada',
    ambito: 'documento',
    permitirEnCampoTexto: false,
  },
  quitarLineaSiempre: {
    combinacion: 'Ctrl+Delete',
    descripcion: 'Quitar la línea seleccionada, aunque se esté escribiendo',
    ambito: 'documento',
    permitirEnCampoTexto: true,
  },

  // --- Facturar (Fase 3) ---
  // Desde el campo de código actúa sobre la última línea agregada (D-81).
  cambiarEscala: {
    combinacion: 'F6',
    descripcion: 'Cambiar la escala de la línea (Menor → Mínimo → Mayor)',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  alterarPrecio: {
    combinacion: 'F7',
    descripcion: 'Alterar el precio de la línea',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  guardarFactura: {
    combinacion: 'PageDown',
    descripcion: 'Guardar e imprimir la factura',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador1: {
    combinacion: 'Alt+1',
    descripcion: 'Ir al borrador 1',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador2: {
    combinacion: 'Alt+2',
    descripcion: 'Ir al borrador 2',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador3: {
    combinacion: 'Alt+3',
    descripcion: 'Ir al borrador 3',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador4: {
    combinacion: 'Alt+4',
    descripcion: 'Ir al borrador 4',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador5: {
    combinacion: 'Alt+5',
    descripcion: 'Ir al borrador 5',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  borrador6: {
    combinacion: 'Alt+6',
    descripcion: 'Ir al borrador 6',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },
  siguienteBorrador: {
    combinacion: 'Ctrl+Tab',
    descripcion: 'Pasar al siguiente borrador',
    ambito: 'facturar',
    permitirEnCampoTexto: true,
  },

  // --- Corrección de facturas (Fase 4) ---
  verDiscriminada: {
    combinacion: 'Ctrl+D',
    descripcion: 'Ver la factura discriminada para alterarla',
    ambito: 'correccion',
    permitirEnCampoTexto: true,
  },
  anularFactura: {
    combinacion: 'Ctrl+X',
    descripcion: 'Anular la factura (pide confirmación)',
    ambito: 'correccion',
    permitirEnCampoTexto: false,
  },
  guardarCorreccion: {
    combinacion: 'PageDown',
    descripcion: 'Guardar la corrección',
    ambito: 'correccion',
    permitirEnCampoTexto: true,
  },

  // --- Reimpresiones (Fase 4) ---
  verDocumento: {
    combinacion: 'Ctrl+D',
    descripcion: 'Visualizar el documento',
    ambito: 'reimpresiones',
    permitirEnCampoTexto: true,
  },
  imprimirDocumento: {
    combinacion: 'Ctrl+P',
    descripcion: 'Imprimir el documento',
    ambito: 'reimpresiones',
    permitirEnCampoTexto: true,
  },
  imprimirReporte: {
    combinacion: 'Ctrl+P',
    descripcion:
      'Imprimir el reporte (abre la vista previa para imprimir o guardar en PDF; el estado de cuenta se imprime directo)',
    ambito: 'reporte',
    permitirEnCampoTexto: true,
  },
  guardarPdfReporte: {
    combinacion: 'Ctrl+G',
    descripcion: 'Guardar el estado de cuenta en PDF',
    ambito: 'reporte',
    permitirEnCampoTexto: true,
  },
  exportarExcel: {
    combinacion: 'Ctrl+E',
    descripcion: 'Exportar el reporte a Excel',
    ambito: 'reporte',
    permitirEnCampoTexto: true,
  },
  actualizarReporte: {
    combinacion: 'F5',
    descripcion: 'Volver a calcular el reporte con el corte de este momento',
    ambito: 'reporte',
    permitirEnCampoTexto: true,
  },
  verDocumentoReporte: {
    combinacion: 'Ctrl+D',
    descripcion:
      'Ver el documento de la fila (kardex e historial de cambios), el kardex del producto (inventario valorizado) o el estado de cuenta del tercero (cuentas por cobrar y por pagar)',
    ambito: 'reporte',
    permitirEnCampoTexto: true,
  },

  // --- Cierre de caja (Fase 5d) ---
  guardarCierre: {
    combinacion: 'PageDown',
    descripcion: 'Guardar el cierre de caja',
    ambito: 'cierre',
    permitirEnCampoTexto: true,
  },
  contarBilletes: {
    combinacion: 'F8',
    descripcion: 'Abrir o cerrar el contador de billetes y monedas',
    ambito: 'cierre',
    permitirEnCampoTexto: true,
  },
  imprimirCierre: {
    combinacion: 'Ctrl+P',
    descripcion: 'Imprimir o guardar en PDF el cierre que se está viendo',
    ambito: 'cierre',
    permitirEnCampoTexto: true,
  },
  verDocumentoCierre: {
    combinacion: 'Ctrl+D',
    descripcion: 'Ver el documento seleccionado en el panel del concepto',
    ambito: 'cierre',
    permitirEnCampoTexto: true,
  },
  anularCierre: {
    combinacion: 'Ctrl+X',
    descripcion: 'Anular el cierre (solo el último vigente; pide confirmación)',
    ambito: 'cierre',
    permitirEnCampoTexto: false,
  },
} as const satisfies Record<string, DefinicionAtajo>;

/**
 * Identificador de un atajo funcional.
 */
export type IdAtajo = keyof typeof ATAJOS;

/**
 * Atajo de cada ícono/proceso. `null` = sin atajo todavía.
 *
 * El desarrollador define aquí los atajos de los íconos; no pueden repetir
 * una combinación global.
 */
export const ATAJOS_PROCESOS: Readonly<Record<IdProceso, string | null>> = {
  facturar: null,
  'factura-proveedor': null,
  'abono-cliente': null,
  'abono-proveedor': null,
  productos: null,
  clientes: null,
  proveedores: null,
  bodegas: null,
  'formas-pago': null,
  'datos-negocio': null,
  importador: null,
  'correccion-cliente': null,
  'correccion-proveedor': null,
  'devolucion-venta': null,
  'devolucion-compra': null,
  'ajustes-inventario': null,
  reimpresiones: null,
  'reporte-inventario': null,
  'cuentas-cobrar': null,
  'cuentas-pagar': null,
  kardex: null,
  'historial-cambios': null,
  'cierre-caja': null,
  'estados-cuenta': null,
  respaldos: null,
  'cambiar-contrasena': null,
};

/**
 * Combinaciones que Chromium/Electron tienen reservadas (imprimir, favoritos,
 * zoom, recargar, cerrar pestaña, herramientas de desarrollo). Siempre se
 * interceptan con `preventDefault` para que no actúe el navegador.
 */
export const COMBINACIONES_BLOQUEADAS: readonly string[] = [
  'Ctrl+P',
  'Ctrl+D',
  'Ctrl+0',
  'Ctrl+=',
  'Ctrl+-',
  'Ctrl+Shift+=',
  'Ctrl+R',
  'Ctrl+Shift+R',
  'F5',
  'Ctrl+W',
  'Ctrl+F',
  'Ctrl+G',
  'Ctrl+U',
  'Ctrl+S',
  'Ctrl+Shift+I',
];
