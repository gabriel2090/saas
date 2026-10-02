import type {
  AbonoGuardado,
  ContextoAbono,
  ContextoAbonoProveedor,
  PeticionAnularAbono,
  PeticionGuardarAbono,
} from '../abonos';
import type { AjusteResumen, PeticionAjuste } from '../ajustes';
import type {
  CompraGuardada,
  ContextoCompra,
  ContextoCompraProveedor,
  PeticionGuardarCompra,
  StockProducto,
} from '../compras';
import type { DocumentoImprimible } from '../impresion';
import type {
  PeticionGuardarReporte,
  PeticionImportacion,
  ResultadoImportacion,
  ResultadoValidacionImportacion,
} from '../importacion';
import type {
  ClaseTercero,
  DatosNegocio,
  PeticionCambiarEstado,
  PeticionCambiarEstadoCatalogo,
  PeticionCambiarEstadoTercero,
  PeticionCorregirCosto,
  PeticionCrearProducto,
  PeticionCrearCatalogo,
  PeticionCrearTercero,
  PeticionEditarCatalogo,
  PeticionEditarProducto,
  PeticionEditarTercero,
  ProductoDetalle,
  ProductoResumen,
  RegistroCatalogo,
  Tercero,
  TipoCatalogo,
} from '../maestros';
import type { Resultado } from '../resultado';
import type {
  BorradorGuardado,
  ConfiguracionFacturacion,
  ContextoFacturar,
  CreditoCliente,
  FacturaGuardada,
  ImpresoraSistema,
  PeticionConfigurarFacturacion,
  PeticionGuardarBorrador,
  PeticionGuardarFactura,
} from '../ventas';

/**
 * Estado de la autenticación al abrir la app.
 */
export interface EstadoAutenticacion {
  /** Si ya se creó la contraseña (si no, es el primer arranque). */
  tieneContrasena: boolean;
  /** Si hay una clave de recuperación vigente (habilita «¿Olvidó la contraseña?»). */
  tieneClaveRecuperacion: boolean;
}

/**
 * Clave de recuperación recién generada, para mostrarla una sola vez (D-22).
 */
export interface ClaveRecuperacion {
  /** Clave agrupada, p. ej. `ABCD-EFGH-…`. */
  claveRecuperacion: string;
}

/**
 * Datos para restablecer la contraseña con la clave de recuperación.
 */
export interface PeticionRestablecerContrasena {
  /** Clave de recuperación escrita por el usuario. */
  clave: string;
  /** Contraseña nueva. */
  nueva: string;
}

/**
 * Información general del sistema que el renderer muestra en la barra de estado.
 */
export interface InfoSistema {
  /** Versión de la aplicación. */
  version: string;
  /** Carpeta donde vive la base de datos. */
  carpetaDatos: string;
  /** Carpeta donde se guardan los respaldos. */
  carpetaRespaldos: string;
  /** Fecha ISO del último respaldo hecho, o `null` si aún no hay. */
  ultimoRespaldo: string | null;
  /** Si la app corre sin empaquetar, con la carpeta de datos de desarrollo (D-21). */
  desarrollo: boolean;
}

/**
 * Datos para cambiar la contraseña.
 */
export interface PeticionCambiarContrasena {
  /** Contraseña actual, para confirmar que quien la cambia la conoce. */
  actual: string;
  /** Contraseña nueva. */
  nueva: string;
}

/**
 * Error capturado en el renderer que se envía al log local del proceso principal.
 */
export interface PeticionRegistrarError {
  /** Dónde ocurrió (componente, acción). */
  contexto: string;
  /** Mensaje del error. */
  mensaje: string;
  /** Pila del error, si existe. */
  pila?: string;
}

/**
 * Contrato tipado de todos los canales IPC de tipo petición/respuesta.
 *
 * Cada canal declara el tipo de su petición y de su respuesta; el preload y
 * los manejadores del proceso principal se tipan a partir de este mapa, así
 * que un canal nuevo solo se declara aquí.
 */
export interface ContratoIpc {
  'autenticacion:estado': { peticion: void; respuesta: EstadoAutenticacion };
  'autenticacion:crear': { peticion: string; respuesta: ClaveRecuperacion };
  'autenticacion:ingresar': { peticion: string; respuesta: void };
  'autenticacion:cambiar': { peticion: PeticionCambiarContrasena; respuesta: void };
  'autenticacion:restablecer': {
    peticion: PeticionRestablecerContrasena;
    respuesta: ClaveRecuperacion;
  };
  'autenticacion:generarClave': { peticion: void; respuesta: ClaveRecuperacion };
  'sistema:info': { peticion: void; respuesta: InfoSistema };
  'sistema:registrarError': { peticion: PeticionRegistrarError; respuesta: void };
  'sistema:copiarTexto': { peticion: string; respuesta: void };
  'app:confirmarCierre': { peticion: void; respuesta: void };

  'negocio:obtener': { peticion: void; respuesta: DatosNegocio };
  'negocio:guardar': { peticion: DatosNegocio; respuesta: DatosNegocio };

  'productos:listar': { peticion: void; respuesta: ProductoResumen[] };
  'productos:obtener': { peticion: number; respuesta: ProductoDetalle };
  'productos:siguienteCodigo': { peticion: void; respuesta: number };
  'productos:crear': { peticion: PeticionCrearProducto; respuesta: ProductoDetalle };
  'productos:editar': { peticion: PeticionEditarProducto; respuesta: ProductoDetalle };
  'productos:cambiarEstado': { peticion: PeticionCambiarEstado; respuesta: ProductoDetalle };
  'productos:corregirCosto': { peticion: PeticionCorregirCosto; respuesta: ProductoDetalle };

  'terceros:listar': { peticion: ClaseTercero; respuesta: Tercero[] };
  'terceros:siguienteCodigo': { peticion: ClaseTercero; respuesta: number };
  'terceros:crear': { peticion: PeticionCrearTercero; respuesta: Tercero };
  'terceros:editar': { peticion: PeticionEditarTercero; respuesta: Tercero };
  'terceros:cambiarEstado': { peticion: PeticionCambiarEstadoTercero; respuesta: Tercero };

  'catalogos:listar': { peticion: TipoCatalogo; respuesta: RegistroCatalogo[] };
  'catalogos:crear': { peticion: PeticionCrearCatalogo; respuesta: RegistroCatalogo };
  'catalogos:editar': { peticion: PeticionEditarCatalogo; respuesta: RegistroCatalogo };
  'catalogos:cambiarEstado': {
    peticion: PeticionCambiarEstadoCatalogo;
    respuesta: RegistroCatalogo;
  };

  'importador:validar': {
    peticion: PeticionImportacion;
    respuesta: ResultadoValidacionImportacion;
  };
  'importador:importar': { peticion: PeticionImportacion; respuesta: ResultadoImportacion };
  'importador:guardarReporte': { peticion: PeticionGuardarReporte; respuesta: boolean };

  'compras:contexto': { peticion: void; respuesta: ContextoCompra };
  'compras:contextoProveedor': { peticion: number; respuesta: ContextoCompraProveedor };
  'compras:stockBodega': { peticion: number; respuesta: StockProducto[] };
  'compras:guardar': { peticion: PeticionGuardarCompra; respuesta: CompraGuardada };

  'abonos:contexto': { peticion: void; respuesta: ContextoAbono };
  'abonos:contextoProveedor': { peticion: number; respuesta: ContextoAbonoProveedor };
  'abonos:guardar': { peticion: PeticionGuardarAbono; respuesta: AbonoGuardado };
  'abonos:anular': { peticion: PeticionAnularAbono; respuesta: void };

  'ajustes:listar': { peticion: void; respuesta: AjusteResumen[] };
  'ajustes:stock': { peticion: PeticionStockAjuste; respuesta: number };
  'ajustes:registrar': { peticion: PeticionAjuste; respuesta: AjusteResumen };

  'ventas:contexto': { peticion: void; respuesta: ContextoFacturar };
  'ventas:creditoCliente': { peticion: number; respuesta: CreditoCliente };
  'ventas:guardar': { peticion: PeticionGuardarFactura; respuesta: FacturaGuardada };
  'ventas:borradores': { peticion: void; respuesta: BorradorGuardado[] };
  'ventas:guardarBorrador': { peticion: PeticionGuardarBorrador; respuesta: void };
  'ventas:borrarBorrador': { peticion: number; respuesta: void };

  'facturacion:configuracion': { peticion: void; respuesta: ConfiguracionFacturacion };
  'facturacion:configurar': {
    peticion: PeticionConfigurarFacturacion;
    respuesta: ConfiguracionFacturacion;
  };
  'facturacion:impresoras': { peticion: void; respuesta: ImpresoraSistema[] };

  'impresion:html': { peticion: DocumentoImprimible; respuesta: string };
  'impresion:imprimir': { peticion: DocumentoImprimible; respuesta: boolean };
  'impresion:pdf': { peticion: DocumentoImprimible; respuesta: boolean };
}

/**
 * Producto y bodega para consultar el stock antes de un ajuste.
 */
export interface PeticionStockAjuste {
  /** Producto. */
  productoCodigo: number;
  /** Bodega. */
  bodegaId: number;
}

/**
 * Nombre de un canal IPC válido.
 */
export type CanalIpc = keyof ContratoIpc;

/**
 * Tipo de la petición de un canal.
 */
export type PeticionDe<C extends CanalIpc> = ContratoIpc[C]['peticion'];

/**
 * Tipo de la respuesta de un canal (sin envolver en `Resultado`).
 */
export type RespuestaDe<C extends CanalIpc> = ContratoIpc[C]['respuesta'];

/**
 * Lista blanca de canales que el preload deja invocar. Debe coincidir con
 * {@link ContratoIpc}; la prueba de contrato lo verifica.
 */
export const CANALES_IPC: readonly CanalIpc[] = [
  'autenticacion:estado',
  'autenticacion:crear',
  'autenticacion:ingresar',
  'autenticacion:cambiar',
  'autenticacion:restablecer',
  'autenticacion:generarClave',
  'sistema:info',
  'sistema:registrarError',
  'sistema:copiarTexto',
  'app:confirmarCierre',
  'negocio:obtener',
  'negocio:guardar',
  'productos:listar',
  'productos:obtener',
  'productos:siguienteCodigo',
  'productos:crear',
  'productos:editar',
  'productos:cambiarEstado',
  'productos:corregirCosto',
  'terceros:listar',
  'terceros:siguienteCodigo',
  'terceros:crear',
  'terceros:editar',
  'terceros:cambiarEstado',
  'catalogos:listar',
  'catalogos:crear',
  'catalogos:editar',
  'catalogos:cambiarEstado',
  'importador:validar',
  'importador:importar',
  'importador:guardarReporte',
  'compras:contexto',
  'compras:contextoProveedor',
  'compras:stockBodega',
  'compras:guardar',
  'abonos:contexto',
  'abonos:contextoProveedor',
  'abonos:guardar',
  'abonos:anular',
  'ajustes:listar',
  'ajustes:stock',
  'ajustes:registrar',
  'ventas:contexto',
  'ventas:creditoCliente',
  'ventas:guardar',
  'ventas:borradores',
  'ventas:guardarBorrador',
  'ventas:borrarBorrador',
  'facturacion:configuracion',
  'facturacion:configurar',
  'facturacion:impresoras',
  'impresion:html',
  'impresion:imprimir',
  'impresion:pdf',
];

/**
 * Evento que el proceso principal envía al renderer cuando el usuario intenta
 * cerrar la ventana de Electron, para que el renderer confirme si hay cambios.
 */
export const EVENTO_SOLICITUD_CIERRE = 'app:solicitudCierre';

/**
 * API que el preload expone en `window.api`.
 */
export interface ApiPreload {
  /**
   * Invoca un canal IPC del proceso principal.
   *
   * @param canal - Canal a invocar (debe estar en {@link CANALES_IPC}).
   * @param peticion - Datos de la petición.
   * @returns Promesa con el resultado tipado de la operación.
   */
  invocar<C extends CanalIpc>(
    canal: C,
    peticion: PeticionDe<C>,
  ): Promise<Resultado<RespuestaDe<C>>>;
  /**
   * Registra la función que se llama cuando el usuario intenta cerrar la aplicación.
   *
   * @param manejador - Función a llamar.
   * @returns Función para quitar el registro.
   */
  alSolicitarCierre(manejador: () => void): () => void;
}
