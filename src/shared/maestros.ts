import type { UnidadMedida } from './formato/cantidades';

/**
 * Datos del negocio para el encabezado de la factura (D-12, F-01). Es un
 * alias de tipo (no interfaz) para que sea asignable a JSON del historial.
 */
export type DatosNegocio = {
  /** Nombre del negocio, p. ej. «SALSAMENTARIA EL BUEN CIUDADANO». */
  nombre: string;
  /** NIT con dígito de verificación, p. ej. `70694229-1`. */
  nit: string;
  /** Régimen tributario impreso bajo el NIT. */
  regimen: string;
  /** Dirección. */
  direccion: string;
  /** Teléfono. */
  telefono: string;
};

/**
 * Régimen que se propone mientras no se configure otro (F-01).
 */
export const REGIMEN_POR_DEFECTO = 'No responsable de IVA';

/**
 * Datos del negocio antes de configurarlos por primera vez.
 */
export const DATOS_NEGOCIO_VACIOS: DatosNegocio = {
  nombre: '',
  nit: '',
  regimen: REGIMEN_POR_DEFECTO,
  direccion: '',
  telefono: '',
};

// ---------------------------------------------------------------------------
// Terceros (clientes y proveedores)
// ---------------------------------------------------------------------------

/**
 * Tipo de persona de un cliente o proveedor (§5.2).
 */
export type TipoPersona = 'natural' | 'juridica';

/**
 * Tipos de identificación admitidos (D-30).
 */
export type TipoIdentificacion = 'CC' | 'NIT' | 'CE' | 'PASAPORTE';

/**
 * Opción de una lista desplegable: valor guardado y texto mostrado.
 */
export interface OpcionLista<T extends string> {
  /** Valor que se guarda. */
  valor: T;
  /** Texto en pantalla. */
  etiqueta: string;
}

/**
 * Tipos de persona con su texto en pantalla.
 */
export const TIPOS_PERSONA: readonly OpcionLista<TipoPersona>[] = [
  { valor: 'natural', etiqueta: 'Persona natural' },
  { valor: 'juridica', etiqueta: 'Persona jurídica' },
];

/**
 * Tipos de identificación con su texto en pantalla (D-30).
 */
export const TIPOS_IDENTIFICACION: readonly OpcionLista<TipoIdentificacion>[] = [
  { valor: 'CC', etiqueta: 'Cédula de ciudadanía' },
  { valor: 'NIT', etiqueta: 'NIT' },
  { valor: 'CE', etiqueta: 'Cédula de extranjería' },
  { valor: 'PASAPORTE', etiqueta: 'Pasaporte' },
];

/**
 * Clase de tercero: los clientes y los proveedores comparten los mismos datos (§5.3).
 */
export type ClaseTercero = 'cliente' | 'proveedor';

/**
 * Datos que se escriben en la ficha de un cliente o proveedor.
 */
export interface DatosTercero {
  /** Persona natural o jurídica. */
  tipoPersona: TipoPersona;
  /** Nombre completo (natural) o razón social (jurídica). */
  nombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: TipoIdentificacion;
  /** Número de identificación (sin puntos). */
  numeroIdentificacion: string;
  /** Celular. */
  celular: string;
  /** Dirección. */
  direccion: string;
  /** Barrio (opcional, se imprime en la factura: F-09). */
  barrio: string;
  /** Ciudad (opcional, se imprime en la factura: F-09). */
  ciudad: string;
  /** Tope de crédito en pesos, o `null` sin tope. Solo aplica a clientes. */
  topeCredito: number | null;
}

/**
 * Datos para crear un tercero. Si `codigo` es `null` se toma el consecutivo.
 */
export interface DatosTerceroNuevo extends DatosTercero {
  /** Código elegido o `null` para el siguiente consecutivo. */
  codigo: number | null;
}

/**
 * Cliente o proveedor guardado.
 */
export interface Tercero extends DatosTercero {
  /** Código (clave). */
  codigo: number;
  /** Si está activo. */
  activo: boolean;
  /** Registro creado por el sistema (p. ej. «Consumidor final»): no se edita ni se inactiva. */
  esSistema: boolean;
}

// ---------------------------------------------------------------------------
// Productos
// ---------------------------------------------------------------------------

/**
 * Escalas de precio fijas (§5.1).
 */
export type EscalaPrecio = 'mayor' | 'menor' | 'minimo';

/**
 * Escalas en el orden en que se muestran, con su nombre.
 */
export const ESCALAS_PRECIO: readonly OpcionLista<EscalaPrecio>[] = [
  { valor: 'mayor', etiqueta: 'Mayor' },
  { valor: 'menor', etiqueta: 'Menor' },
  { valor: 'minimo', etiqueta: 'Mínimo' },
];

/**
 * Precio de cada escala en pesos enteros.
 */
export type PreciosProducto = Readonly<Record<EscalaPrecio, number>>;

/**
 * Datos editables de un producto.
 */
export interface DatosProducto {
  /** Nombre. */
  nombre: string;
  /** Código del proveedor al que pertenece (obligatorio). */
  proveedorCodigo: number;
  /** Unidad de medida. */
  unidad: UnidadMedida;
  /** Precios de las tres escalas. */
  precios: PreciosProducto;
}

/**
 * Datos para crear un producto: el costo inicial se escribe a mano (D-28).
 */
export interface DatosProductoNuevo extends DatosProducto {
  /** Código elegido o `null` para el siguiente consecutivo (desde 101). */
  codigo: number | null;
  /** Costo inicial en pesos. */
  costo: number;
}

/**
 * Stock inicial que se carga al crear un producto (D-45).
 */
export interface StockInicialNuevo {
  /** Bodega (la Principal por defecto en la ficha). */
  bodegaId: number;
  /** Cantidad en milésimas (en UND, unidades enteras). */
  cantidad: number;
}

/**
 * Petición para crear un producto desde la ficha, con su stock inicial opcional.
 */
export interface PeticionCrearProducto extends DatosProductoNuevo {
  /** Stock inicial, o `null` si no se escribió. */
  stockInicial: StockInicialNuevo | null;
}

/**
 * Producto como se muestra en la lista.
 */
export interface ProductoResumen extends DatosProducto {
  /** Código (clave). */
  codigo: number;
  /** Nombre del proveedor. */
  proveedorNombre: string;
  /** Costo de la última compra (o el inicial o corregido). */
  costo: number;
  /** Si está activo. */
  activo: boolean;
  /** Stock total en milésimas (suma del kardex en todas las bodegas). */
  stockTotal: number;
}

/**
 * Stock de un producto en una bodega.
 */
export interface StockEnBodega {
  /** Id de la bodega. */
  bodegaId: number;
  /** Nombre de la bodega. */
  bodegaNombre: string;
  /** Cantidad en milésimas. */
  cantidad: number;
}

/**
 * Producto con el detalle que muestra la ficha.
 */
export interface ProductoDetalle extends ProductoResumen {
  /** Stock por bodega (solo bodegas con movimientos). */
  stockPorBodega: StockEnBodega[];
  /** Stock inicial cargado por bodega (solo los distintos de cero); se muestra de solo lectura. */
  stockInicial: StockEnBodega[];
  /** Si tiene movimientos de inventario (entonces no se puede cambiar la unidad). */
  tieneMovimientos: boolean;
}

/**
 * Petición para corregir el costo a mano (D-35).
 */
export interface PeticionCorregirCosto {
  /** Código del producto. */
  codigo: number;
  /** Costo nuevo en pesos. */
  costo: number;
  /** Motivo (obligatorio). */
  motivo: string;
}

// ---------------------------------------------------------------------------
// Catálogos: bodegas y formas de pago
// ---------------------------------------------------------------------------

/**
 * Catálogos simples: bodegas y formas de pago (§5.4).
 */
export type TipoCatalogo = 'bodega' | 'forma-pago';

/**
 * Datos editables de una bodega o forma de pago.
 */
export interface DatosCatalogo {
  /** Nombre único dentro del catálogo. */
  nombre: string;
  /** Solo formas de pago: si al facturar calcula el cambio a devolver (efectivo). */
  calculaCambio: boolean;
}

/**
 * Bodega o forma de pago guardada.
 */
export interface RegistroCatalogo extends DatosCatalogo {
  /** Id interno. */
  id: number;
  /** Si está activo. */
  activo: boolean;
  /** La bodega «Principal»: siempre existe y no se puede inactivar (§5.4). */
  esPrincipal: boolean;
}

/**
 * Petición para crear un registro de catálogo.
 */
export interface PeticionCrearCatalogo {
  /** Catálogo. */
  tipo: TipoCatalogo;
  /** Datos. */
  datos: DatosCatalogo;
}

/**
 * Petición para editar un registro de catálogo.
 */
export interface PeticionEditarCatalogo extends PeticionCrearCatalogo {
  /** Id del registro. */
  id: number;
}

/**
 * Petición para inactivar o reactivar un registro.
 */
export interface PeticionCambiarEstado {
  /** Código o id del registro. */
  id: number;
  /** Estado deseado. */
  activo: boolean;
}

/**
 * Petición para inactivar o reactivar un registro de catálogo.
 */
export interface PeticionCambiarEstadoCatalogo extends PeticionCambiarEstado {
  /** Catálogo. */
  tipo: TipoCatalogo;
}

/**
 * Petición para inactivar o reactivar un cliente o proveedor.
 */
export interface PeticionCambiarEstadoTercero extends PeticionCambiarEstado {
  /** Clase de tercero. */
  clase: ClaseTercero;
}

/**
 * Petición para crear un cliente o proveedor.
 */
export interface PeticionCrearTercero {
  /** Clase de tercero. */
  clase: ClaseTercero;
  /** Datos. */
  datos: DatosTerceroNuevo;
}

/**
 * Petición para editar un cliente o proveedor.
 */
export interface PeticionEditarTercero {
  /** Clase de tercero. */
  clase: ClaseTercero;
  /** Código del registro. */
  codigo: number;
  /** Datos nuevos. */
  datos: DatosTercero;
}

/**
 * Petición para editar un producto.
 */
export interface PeticionEditarProducto {
  /** Código del producto. */
  codigo: number;
  /** Datos nuevos. */
  datos: DatosProducto;
}
