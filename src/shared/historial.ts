import type { DocumentoVisible } from './kardex';

/**
 * Acción registrada en el historial (igual que en el dominio de auditoría).
 */
export type AccionVisor = 'crear' | 'editar' | 'anular' | 'inactivar' | 'reactivar' | 'sistema';

/**
 * Acciones del filtro, en el orden del selector, con su nombre en pantalla.
 */
export const ACCIONES_VISOR: readonly { valor: AccionVisor; etiqueta: string }[] = [
  { valor: 'crear', etiqueta: 'Crear' },
  { valor: 'editar', etiqueta: 'Editar' },
  { valor: 'anular', etiqueta: 'Anular' },
  { valor: 'inactivar', etiqueta: 'Inactivar' },
  { valor: 'reactivar', etiqueta: 'Reactivar' },
  { valor: 'sistema', etiqueta: 'Sistema' },
];

/**
 * Tipo de documento del filtro del visor (agrupa entidades del historial).
 */
export type TipoDocumentoHistorial =
  | 'factura-cliente'
  | 'factura-proveedor'
  | 'abono-cliente'
  | 'abono-proveedor'
  | 'devolucion'
  | 'reintegro'
  | 'ajuste'
  | 'cierre-caja'
  | 'producto'
  | 'cliente'
  | 'proveedor'
  | 'configuracion'
  | 'sistema';

/**
 * Tipos de documento del filtro, en el orden de la maqueta, con su nombre y
 * las entidades del historial que abarca.
 */
export const TIPOS_DOCUMENTO_HISTORIAL: readonly {
  valor: TipoDocumentoHistorial;
  etiqueta: string;
  entidades: readonly string[];
}[] = [
  { valor: 'factura-cliente', etiqueta: 'Factura de venta', entidades: ['factura_cliente'] },
  {
    valor: 'factura-proveedor',
    etiqueta: 'Factura de proveedor',
    entidades: ['factura_proveedor'],
  },
  { valor: 'abono-cliente', etiqueta: 'Abono de cliente', entidades: ['abono_cliente'] },
  { valor: 'abono-proveedor', etiqueta: 'Abono a proveedor', entidades: ['abono_proveedor'] },
  {
    valor: 'devolucion',
    etiqueta: 'Devolución',
    entidades: ['devolucion_venta', 'devolucion_compra'],
  },
  { valor: 'reintegro', etiqueta: 'Reintegro', entidades: ['reintegro'] },
  { valor: 'ajuste', etiqueta: 'Ajuste de inventario', entidades: ['ajuste_inventario'] },
  { valor: 'cierre-caja', etiqueta: 'Cierre de caja', entidades: ['cierre_caja'] },
  { valor: 'producto', etiqueta: 'Producto', entidades: ['producto'] },
  { valor: 'cliente', etiqueta: 'Cliente', entidades: ['cliente'] },
  { valor: 'proveedor', etiqueta: 'Proveedor', entidades: ['proveedor'] },
  {
    valor: 'configuracion',
    etiqueta: 'Configuración',
    entidades: ['configuracion', 'consecutivo', 'bodega', 'forma_pago'],
  },
  {
    valor: 'sistema',
    etiqueta: 'Sistema',
    entidades: ['importacion', 'autenticacion', 'respaldo', 'sistema'],
  },
];

/**
 * Máximo de registros que devuelve una consulta del visor.
 */
export const MAXIMO_REGISTROS_HISTORIAL = 500;

/**
 * Filtros del visor del historial de cambios (§5, D-146: con periodo).
 */
export interface PeticionHistorial {
  /** Primer día, `AAAA-MM-DD`. */
  desde: string;
  /** Último día, `AAAA-MM-DD`. */
  hasta: string;
  /** Tipo de documento, o `null` para todos. */
  tipo: TipoDocumentoHistorial | null;
  /** Acción, o `null` para todas. */
  accion: AccionVisor | null;
  /** Número del documento o texto del tipo, el documento o el resumen; vacío trae todos. */
  texto: string;
}

/**
 * Registro del historial tal como se lista en el visor.
 */
export interface RegistroVisor {
  /** Id del registro. */
  id: number;
  /** Fecha y hora (ISO con zona). */
  fecha: string;
  /** Tipo en palabras, p. ej. `Factura de venta`. */
  tipo: string;
  /** Documento en palabras, p. ej. `84795` o `Abono 58`. */
  documento: string;
  /** Acción. */
  accion: AccionVisor;
  /** Motivo o resumen legible. */
  resumen: string;
}

/**
 * Resultado del visor.
 */
export interface ReporteHistorial {
  /** Momento de la consulta (ISO con zona). */
  corte: string;
  /** Registros, del más reciente al más antiguo. */
  registros: RegistroVisor[];
  /** Si hay más registros que {@link MAXIMO_REGISTROS_HISTORIAL} con estos filtros. */
  truncado: boolean;
}

/**
 * Campo que cambió entre el «antes» y el «después» de un registro.
 */
export interface CampoCambiado {
  /** Nombre del campo en palabras (o el técnico si no tiene traducción). */
  campo: string;
  /** Valor anterior ya formateado (vacío si no existía). */
  antes: string;
  /** Valor nuevo ya formateado (vacío si dejó de existir). */
  despues: string;
}

/**
 * Detalle de un registro del historial para el panel derecho del visor.
 */
export interface DetalleCambio {
  /** Id del registro. */
  id: number;
  /** Título, p. ej. `Factura de venta 84783 · Editar`. */
  titulo: string;
  /** Datos generales: etiqueta y valor (fecha y hora, tercero, versión, motivo). */
  datos: { etiqueta: string; valor: string }[];
  /** Solo los campos que cambiaron. */
  campos: CampoCambiado[];
  /** Documento que abre «Ver documento», o `null`. */
  ver: DocumentoVisible | null;
}
