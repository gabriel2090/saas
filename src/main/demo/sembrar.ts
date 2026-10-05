import { sumarDias } from '../../domain/calendario';
import type { BaseDeDatos } from '../../data/conexion';
import { guardarConfiguracion } from '../../data/repositorios/configuracion.repo';
import { crearEjecutorTransacciones } from '../../data/transaccion';
import type { PeticionGuardarCompra } from '../../shared/compras';
import { aIsoLocal, formatearFecha } from '../../shared/formato/fechas';
import type { UnidadMedida } from '../../shared/formato/cantidades';
import type { DatosTerceroNuevo, EscalaPrecio, TipoPersona } from '../../shared/maestros';
import type { LineaVentaNueva, PeticionGuardarFactura } from '../../shared/ventas';
import { crearServicioAbonos } from '../servicios/abonos';
import { crearServicioAjustes } from '../servicios/ajustes';
import { crearServicioAutenticacion } from '../servicios/autenticacion';
import { crearServicioCatalogos } from '../servicios/catalogos';
import { crearServicioCompras } from '../servicios/compras';
import { crearServicioCorrecciones } from '../servicios/correcciones';
import { crearServicioDevoluciones } from '../servicios/devoluciones';
import { crearServicioImportador } from '../servicios/importador';
import { crearServicioNegocio } from '../servicios/negocio';
import { crearServicioProductos } from '../servicios/productos';
import { crearServicioSaldoFavor } from '../servicios/saldoFavor';
import { crearServicioTerceros } from '../servicios/terceros';
import { crearServicioVentas } from '../servicios/ventas';

/**
 * Contraseña de la base de ejemplo (se muestra al cargarla).
 */
export const CONTRASENA_DEMO = 'demo';

/**
 * Clave de configuración que marca una base como «de ejemplo»: solo una base
 * marcada se borra sin respaldarla al recargar o borrar los datos de ejemplo.
 */
export const CLAVE_MARCA_DEMO = 'demo.cargada';

/** Forma de pago «Efectivo» (sembrada por la migración inicial). */
const EFECTIVO = 1;

/** Forma de pago «Transferencia» (sembrada por la migración inicial). */
const TRANSFERENCIA = 2;

/** Forma de pago «Tarjeta» (sembrada por la migración inicial). */
const TARJETA = 3;

/** Bodega principal (sembrada por la migración inicial). */
const PRINCIPAL = 1;

/** «Consumidor final» (D-37). */
const CONSUMIDOR_FINAL = 0;

/** Primer número de factura de venta (como el talonario de las maquetas). */
const PRIMERA_FACTURA = 84761;

/**
 * Resultado de sembrar los datos de ejemplo.
 */
export interface DatosDemoSembrados {
  /** Clave de recuperación generada al crear la contraseña. */
  claveRecuperacion: string;
  /** Resumen legible de lo que se cargó, una línea por grupo. */
  resumen: string[];
}

/**
 * Opciones del sembrado.
 */
export interface OpcionesSembrarDemo {
  /** Día de hoy `AAAA-MM-DD` (por defecto, el día local actual). */
  hoy?: string;
  /** Desfase horario `±HH:MM` (por defecto, el local). */
  desfase?: string;
  /** Impresora térmica que se conserva de la base anterior, o `null`. */
  impresora?: string | null;
}

/**
 * Datos de un tercero de ejemplo.
 *
 * @param tipoPersona - Natural o jurídica.
 * @param nombre - Nombre o razón social.
 * @param numero - Identificación (NIT o cédula según el tipo de persona).
 * @param celular - Celular.
 * @param direccion - Dirección.
 * @param barrio - Barrio.
 * @param topeCredito - Tope de crédito, o `null` sin tope.
 * @returns Datos completos con el código consecutivo.
 */
function tercero(
  tipoPersona: TipoPersona,
  nombre: string,
  numero: string,
  celular: string,
  direccion: string,
  barrio: string,
  topeCredito: number | null = null,
): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona,
    nombre,
    tipoIdentificacion: tipoPersona === 'juridica' ? 'NIT' : 'CC',
    numeroIdentificacion: numero,
    celular,
    direccion,
    barrio,
    ciudad: 'BARRANQUILLA',
    topeCredito,
  };
}

/**
 * Producto de ejemplo: código, nombre, proveedor (por clave), unidad, costo
 * inicial y precios mayor, menor y mínimo.
 */
type ProductoDemo = [
  number,
  string,
  'agrina' | 'campina' | 'empaques',
  UnidadMedida,
  number,
  number,
  number,
  number,
];

/** Productos de ejemplo. */
const PRODUCTOS: readonly ProductoDemo[] = [
  [101, 'CAJA PIZZA 40*40 FD', 'empaques', 'UND', 2_050, 2_300, 2_500, 2_200],
  [102, 'CAJA PIZZA 30*30 FD', 'empaques', 'UND', 1_450, 1_700, 1_900, 1_600],
  [103, 'VASO DESECHABLE 12 OZ X 50', 'empaques', 'UND', 6_800, 8_000, 8_900, 7_500],
  [104, 'BOLSA PAPEL KRAFT #20 X 100', 'empaques', 'UND', 4_500, 5_500, 6_000, 5_000],
  [231, 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG', 'agrina', 'UND', 11_800, 16_000, 17_500, 12_300],
  [232, 'PAPA CASCO AGRINA *2.5 KG', 'agrina', 'UND', 11_500, 15_000, 16_500, 12_000],
  [233, 'YUCA PRECOCIDA AGRINA *1 KG', 'agrina', 'UND', 6_200, 8_000, 8_800, 6_500],
  [301, 'QUESO MOZZARELLA', 'campina', 'KG', 21_000, 25_000, 27_000, 22_000],
  [302, 'JAMON SANDWICH *1 KG', 'campina', 'UND', 15_800, 19_000, 21_000, 16_500],
  [304, 'PEPPERONI *500 G', 'campina', 'UND', 18_000, 22_000, 24_000, 19_000],
  [305, 'TOCINETA AHUMADA', 'campina', 'KG', 24_000, 29_000, 31_500, 25_500],
];

/**
 * Línea de venta corta: producto, cantidad (en unidades o kilos) y escala.
 *
 * @param productoCodigo - Producto.
 * @param cantidad - Cantidad en unidades o kilos (admite decimales en KG).
 * @param escala - Escala de precio.
 * @returns Línea de la petición.
 */
function linea(
  productoCodigo: number,
  cantidad: number,
  escala: EscalaPrecio = 'menor',
): LineaVentaNueva {
  return { productoCodigo, escala, cantidad: Math.round(cantidad * 1000), precioAlterado: null };
}

/**
 * Carga datos de ejemplo en una base recién migrada, usando los mismos
 * servicios que la app (todas las reglas de negocio aplican): datos del
 * negocio, contraseña, clientes, proveedores, productos, inventario inicial
 * importado (también en la Bodega Norte), saldos iniciales importados de
 * clientes y proveedores, compras (a crédito, de contado, corregida, devuelta
 * y anulada), ventas de contado y a crédito (vencidas, corregidas, devueltas
 * y anuladas), abonos, saldos a favor, un reintegro, un ajuste de inventario
 * y dos existencias negativas: un producto vendido sin haber registrado su
 * compra (Principal) y otro vendido desde la Bodega Norte sin existencias.
 *
 * Los documentos se fechan en los últimos 40 días con un reloj que avanza,
 * para que haya facturas vencidas y por vencer.
 *
 * @param db - Base recién migrada y vacía.
 * @param opciones - Día de hoy y desfase (inyectables en pruebas).
 * @returns Clave de recuperación y resumen.
 * @throws {ErrorDeNegocio} Si la base ya tiene contraseña o datos que choquen.
 */
export function sembrarDatosDemo(
  db: BaseDeDatos,
  opciones: OpcionesSembrarDemo = {},
): DatosDemoSembrados {
  const ahoraLocal = aIsoLocal();
  const hoy = opciones.hoy ?? ahoraLocal.slice(0, 10);
  const desfase = opciones.desfase ?? ahoraLocal.slice(-6);
  let ahora = `${hoy}T08:00:00.000${desfase}`;
  /**
   * Mueve el reloj de todos los servicios.
   *
   * @param diasAtras - Días antes de hoy.
   * @param hora - Hora `HH:MM`.
   */
  const el = (diasAtras: number, hora: string): void => {
    ahora = `${sumarDias(hoy, -diasAtras)}T${hora}:00.000${desfase}`;
  };
  const reloj = (): string => ahora;
  const dia = (): string => ahora.slice(0, 10);

  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const autenticacion = crearServicioAutenticacion(db, ejecutar);
  const terceros = crearServicioTerceros(db, ejecutar);
  const productos = crearServicioProductos(db, ejecutar);
  const catalogos = crearServicioCatalogos(db, ejecutar);
  const compras = crearServicioCompras(db, ejecutar, { hoy: dia });
  const ventas = crearServicioVentas(db, ejecutar, { reloj });
  const abonos = crearServicioAbonos(db, ejecutar, { hoy: dia });
  const ajustes = crearServicioAjustes(db, ejecutar);
  const correcciones = crearServicioCorrecciones(db, ejecutar);
  const devoluciones = crearServicioDevoluciones(db, ejecutar);
  const saldoFavor = crearServicioSaldoFavor(db, ejecutar);
  const importador = crearServicioImportador(db, ejecutar, { hoy: dia });

  /**
   * Importa filas con el importador de la app y exige que entren todas.
   *
   * @param tipo - Qué se importa.
   * @param filas - Valores de cada fila.
   * @throws {Error} Si alguna fila no entra (los datos de ejemplo están mal).
   */
  const importar = (
    tipo: Parameters<typeof importador.importar>[0],
    filas: Record<string, string>[],
  ): void => {
    const r = importador.importar(
      tipo,
      filas.map((valores, i) => ({ numero: i + 2, valores })),
    );
    if (r.errores.length > 0) {
      throw new Error(`Datos de ejemplo: ${r.errores.map((e) => e.mensaje).join(' ')}`);
    }
  };
  /**
   * Fecha `dd/mm/aaaa` de hace unos días, como se escribe en un archivo.
   *
   * @param diasAtras - Días antes de hoy.
   * @returns Fecha corta.
   */
  const fechaArchivo = (diasAtras: number): string => formatearFecha(sumarDias(hoy, -diasAtras));

  // --- Configuración -------------------------------------------------------
  el(45, '07:30');
  const claveRecuperacion = autenticacion.crear(CONTRASENA_DEMO);
  crearServicioNegocio(db, ejecutar).guardar({
    nombre: 'SALSAMENTARIA EL BUEN CIUDADANO',
    nit: '70694229-1',
    regimen: 'No responsable de IVA',
    direccion: 'CRA 25 # 122-04 LA PRADERA',
    telefono: '3042620852',
  });
  const norte = catalogos.crear('bodega', { nombre: 'Bodega Norte', calculaCambio: false }).id;
  ventas.configurar({ siguienteNumero: PRIMERA_FACTURA, impresora: opciones.impresora ?? null });

  const proveedores = {
    agrina: terceros.crear(
      'proveedor',
      tercero(
        'juridica',
        'AGRINA S.A.S.',
        '900123456',
        '3005551201',
        'CL 30 # 1-45',
        'ZONA INDUSTRIAL',
      ),
    ).codigo,
    campina: terceros.crear(
      'proveedor',
      tercero(
        'juridica',
        'DISTRIBUIDORA LA CAMPIÑA LTDA',
        '800654321',
        '3015552202',
        'CRA 46 # 70-12',
        'EL PRADO',
      ),
    ).codigo,
    empaques: terceros.crear(
      'proveedor',
      tercero(
        'juridica',
        'EMPAQUES DEL CARIBE S.A.S.',
        '901777888',
        '3025553303',
        'VIA 40 # 85-90',
        'LAS FLORES',
      ),
    ).codigo,
  };
  const clientes = {
    juan: terceros.crear(
      'cliente',
      tercero(
        'natural',
        'JUAN JJ FERTILIA',
        '212121354',
        '3042620852',
        'CARR 25 #122-04',
        'LA PRADERA',
        2_000_000,
      ),
    ).codigo,
    nonna: terceros.crear(
      'cliente',
      tercero(
        'juridica',
        'PIZZERIA LA NONNA S.A.S.',
        '901234567',
        '3104441010',
        'CL 84 # 43-20',
        'ALTO PRADO',
      ),
    ).codigo,
    fogon: terceros.crear(
      'cliente',
      tercero(
        'juridica',
        'RESTAURANTE EL FOGON',
        '900987654',
        '3114442020',
        'CRA 54 # 68-15',
        'EL GOLF',
      ),
    ).codigo,
    pollo: terceros.crear(
      'cliente',
      tercero('natural', 'ASADERO DON POLLO', '72145698', '3124443030', 'CL 17 # 8-30', 'REBOLO'),
    ).codigo,
    maria: terceros.crear(
      'cliente',
      tercero(
        'natural',
        'MARIA FERNANDA ROJAS',
        '1045678912',
        '3134444040',
        'CRA 38 # 74-51',
        'RECREO',
      ),
    ).codigo,
    hotel: terceros.crear(
      'cliente',
      tercero(
        'juridica',
        'HOTEL BRISAS DEL MAR',
        '890112233',
        '3144445050',
        'CRA 1 # 2-10',
        'PUERTO COLOMBIA',
        500_000,
      ),
    ).codigo,
  };
  for (const [codigo, nombre, proveedor, unidad, costo, mayor, menor, minimo] of PRODUCTOS) {
    productos.crear({
      codigo,
      nombre,
      proveedorCodigo: proveedores[proveedor],
      unidad,
      costo,
      precios: { mayor, menor, minimo },
    });
  }

  // --- Inventario inicial y saldos iniciales (importados al empezar) -------
  importar('stock', [
    { producto: '302', bodega: '', cantidad: '8' },
    { producto: '231', bodega: 'Bodega Norte', cantidad: '20' },
    { producto: '301', bodega: 'Bodega Norte', cantidad: '6.5' },
  ]);
  /**
   * Fila de saldo inicial con plazo en días.
   *
   * @param terceroCodigo - Cliente o proveedor.
   * @param numero - Número de la factura.
   * @param diasAtras - Días antes de hoy de la fecha de la factura.
   * @param plazo - Plazo en días.
   * @param saldo - Saldo pendiente.
   * @returns Valores de la fila.
   */
  const saldoInicial = (
    terceroCodigo: number,
    numero: string,
    diasAtras: number,
    plazo: number,
    saldo: number,
  ): Record<string, string> => ({
    tercero: String(terceroCodigo),
    numero,
    fecha: fechaArchivo(diasAtras),
    vence: '',
    plazo: String(plazo),
    saldo: String(saldo),
  });
  importar('saldos-clientes', [
    saldoInicial(clientes.maria, '84590', 60, 30, 85_000),
    saldoInicial(clientes.hotel, '84655', 50, 60, 140_000),
  ]);
  importar('saldos-proveedores', [
    saldoInicial(proveedores.campina, 'FV-0712', 55, 30, 640_000),
    saldoInicial(proveedores.empaques, 'EC-1201', 48, 60, 210_000),
  ]);

  /**
   * Compra sin flete ni descuento.
   *
   * @param proveedor - Proveedor.
   * @param numero - Factura del proveedor.
   * @param plazoDias - Plazo.
   * @param lineas - Producto, cantidad (unidades o kilos) y costo unitario.
   * @param contado - Forma de pago si fue «Pagada de contado».
   * @returns Petición completa.
   */
  const compra = (
    proveedor: number,
    numero: string,
    plazoDias: number,
    lineas: [number, number, number][],
    contado: number | null = null,
  ): PeticionGuardarCompra => ({
    proveedorCodigo: proveedor,
    numeroProveedor: numero,
    fecha: dia(),
    plazoDias,
    bodegaId: PRINCIPAL,
    ordenCompra: '',
    lineas: lineas.map(([productoCodigo, cantidad, costoUnitario]) => ({
      productoCodigo,
      cantidad: Math.round(cantidad * 1000),
      costoUnitario,
    })),
    flete: 0,
    fleteProveedor: false,
    descuento: { modo: 'pesos', valor: 0 },
    descuentoEnCosto: false,
    contado: contado === null ? null : { formaPagoId: contado },
  });

  /**
   * Venta a crédito o de contado desde la bodega principal.
   *
   * @param cliente - Cliente.
   * @param lineas - Líneas.
   * @param pago - Plazo en días (crédito) o forma de pago y recibido (contado).
   * @param bodegaId - Bodega de la que sale (por defecto, la Principal).
   * @returns Petición completa.
   */
  const venta = (
    cliente: number,
    lineas: LineaVentaNueva[],
    pago: { plazo: number } | { forma: number; recibido?: number },
    bodegaId: number = PRINCIPAL,
  ): PeticionGuardarFactura => ({
    ranura: null,
    clienteCodigo: cliente,
    condicion: 'plazo' in pago ? 'credito' : 'contado',
    plazoDias: 'plazo' in pago ? pago.plazo : 0,
    bodegaId,
    lineas,
    contado: 'plazo' in pago ? null : { formaPagoId: pago.forma, recibido: pago.recibido ?? null },
    cajasEmpaque: null,
  });

  /**
   * Abono aplicado completo a una sola factura.
   *
   * @param tipo - Cliente o proveedor.
   * @param terceroCodigo - Tercero.
   * @param facturaId - Factura.
   * @param valor - Valor.
   * @param formaPagoId - Forma de pago.
   * @param observacion - Observación.
   * @returns Id del abono.
   */
  const abonar = (
    tipo: 'cliente' | 'proveedor',
    terceroCodigo: number,
    facturaId: number,
    valor: number,
    formaPagoId: number,
    observacion = '',
  ): number =>
    abonos.guardar({
      tipo,
      terceroCodigo,
      fecha: dia(),
      formaPagoId,
      valor,
      observacion,
      aplicaciones: [{ facturaId, valor }],
    }).id;

  // --- Compras (llenan el inventario) --------------------------------------
  el(40, '09:15');
  const c1 = compras.guardar(
    compra(proveedores.agrina, 'FE-5521', 30, [
      [231, 120, 11_800],
      [232, 60, 11_500],
      [233, 80, 6_200],
    ]),
  );
  el(35, '10:40');
  const c2 = compras.guardar({
    ...compra(proveedores.campina, 'FV-0883', 15, [
      [301, 40, 21_000],
      [302, 30, 15_800],
      [304, 25, 18_000],
      [305, 20, 24_000],
    ]),
    flete: 30_000,
    descuento: { modo: 'porcentaje', valor: 200 },
    descuentoEnCosto: true,
  });
  el(30, '08:50');
  compras.guardar(
    compra(
      proveedores.empaques,
      'EC-1290',
      0,
      [
        [101, 300, 2_050],
        [102, 200, 1_450],
        [103, 40, 6_800],
      ],
      EFECTIVO,
    ),
  );

  // --- Ventas, abonos y correcciones, en orden de fechas -------------------
  el(30, '11:20');
  ventas.guardar(venta(clientes.pollo, [linea(231, 10), linea(233, 6)], { plazo: 8 }));
  el(25, '16:05');
  const v2 = ventas.guardar(
    venta(clientes.juan, [linea(231, 4), linea(101, 5, 'mayor')], { plazo: 8 }),
  );
  el(20, '09:30');
  abonar('cliente', clientes.juan, v2.id, 70_000, EFECTIVO);
  abonar('proveedor', proveedores.campina, c2.id, c2.total, TRANSFERENCIA, 'Pago total FV-0883');
  el(20, '15:10');
  const v3 = ventas.guardar(
    venta(
      clientes.nonna,
      [
        linea(101, 100, 'mayor'),
        linea(102, 50, 'mayor'),
        linea(301, 5.5, 'mayor'),
        linea(304, 4, 'mayor'),
      ],
      { plazo: 15 },
    ),
  );
  el(15, '12:45');
  ventas.guardar(
    venta(clientes.maria, [linea(231, 2), linea(305, 0.5)], { forma: EFECTIVO, recibido: 60_000 }),
  );
  el(12, '10:00');
  const c4 = compras.guardar(
    compra(proveedores.agrina, 'FE-5698', 30, [
      [231, 80, 12_000],
      [233, 40, 6_300],
    ]),
  );
  abonar('proveedor', proveedores.agrina, c1.id, 1_500_000, TRANSFERENCIA, 'Abono FE-5521');
  el(10, '14:30');
  abonar('cliente', clientes.nonna, v3.id, 300_000, TRANSFERENCIA);
  ventas.guardar(
    venta(clientes.hotel, [linea(302, 3), linea(305, 2), linea(103, 4)], { plazo: 30 }),
  );
  el(8, '09:40');
  const v6 = ventas.guardar(venta(clientes.fogon, [linea(231, 6), linea(232, 4)], { plazo: 8 }));
  const c5 = compras.guardar(
    compra(proveedores.empaques, 'EC-1333', 15, [
      [101, 100, 2_050],
      [103, 10, 6_800],
    ]),
  );
  el(7, '16:20');
  // Sale de la Bodega Norte, que no tiene pepperoni: queda en negativo.
  ventas.guardar(venta(clientes.pollo, [linea(231, 4), linea(304, 3)], { forma: EFECTIVO }, norte));
  el(6, '11:00');
  const abonoCheque = abonar('cliente', clientes.nonna, v3.id, 50_000, EFECTIVO, 'Cheque 004512');
  const c6 = compras.guardar(compra(proveedores.campina, 'FV-0901', 15, [[302, 10, 15_800]]));
  el(5, '10:20');
  devoluciones.guardar({
    tipo: 'venta',
    facturaId: v3.id,
    version: 1,
    devolucionesConocidas: 0,
    bodegaId: PRINCIPAL,
    lineas: [{ renglon: 1, cantidad: 10_000 }],
    motivo: 'Cajas mojadas',
  });
  abonar('proveedor', proveedores.empaques, c5.id, c5.total, EFECTIVO, 'Pago EC-1333');
  el(4, '17:15');
  abonos.anular({ id: abonoCheque, motivo: 'Cheque devuelto por el banco' });
  const v7 = ventas.guardar(
    venta(CONSUMIDOR_FINAL, [linea(103, 1), linea(101, 2)], { forma: TARJETA }),
  );
  correcciones.anular({
    tipo: 'cliente',
    facturaId: v7.id,
    version: 1,
    motivo: 'Se cobró dos veces con tarjeta',
  });
  correcciones.anular({
    tipo: 'proveedor',
    facturaId: c6.id,
    version: 1,
    motivo: 'La factura se registró dos veces',
  });
  el(3, '09:05');
  abonar('cliente', clientes.fogon, v6.id, v6.total, TRANSFERENCIA);
  devoluciones.guardar({
    tipo: 'compra',
    facturaId: c5.id,
    version: 1,
    devolucionesConocidas: 0,
    bodegaId: PRINCIPAL,
    lineas: [{ renglon: 2, cantidad: 2_000 }],
    motivo: 'Vasos rotos',
  });
  el(2, '10:30');
  correcciones.corregirVenta({
    facturaId: v2.id,
    version: 1,
    cambios: [
      { renglon: 1, cantidad: 2_000, precio: 17_500 },
      { renglon: 2, cantidad: 5_000, precio: 1_900 },
    ],
    motivo: 'Devolvió 2 papas y se le dejó la caja a 1,900',
  });
  correcciones.corregirCompra({
    facturaId: c4.id,
    version: 1,
    cambios: [
      { renglon: 1, cantidad: 78_000, costoUnitario: 12_000 },
      { renglon: 2, cantidad: 40_000, costoUnitario: 6_300 },
    ],
    flete: 0,
    descuento: { modo: 'pesos', valor: 0 },
    motivo: 'Llegaron 78 papas',
  });
  ajustes.registrar({
    productoCodigo: 305,
    bodegaId: PRINCIPAL,
    tipo: 'dano',
    cantidad: 300,
    motivo: 'Se rompió la cadena de frío',
  });
  el(1, '15:40');
  const v6Devuelta = devoluciones.guardar({
    tipo: 'venta',
    facturaId: v6.id,
    version: 1,
    devolucionesConocidas: 0,
    bodegaId: PRINCIPAL,
    lineas: [{ renglon: 2, cantidad: 2_000 }],
    motivo: 'Papa casco en mal estado',
  });
  saldoFavor.reintegrar({
    tipo: 'cliente',
    terceroCodigo: clientes.fogon,
    formaPagoId: EFECTIVO,
    valor: 10_000,
    observacion: 'Parte en efectivo',
    disponibleEsperado: v6Devuelta.movimientoFavor,
  });
  const v9 = ventas.guardar(venta(clientes.juan, [linea(231, 3)], { plazo: 8 }));

  // --- Hoy -----------------------------------------------------------------
  el(0, '09:10');
  abonar('cliente', clientes.juan, v9.id, 20_000, abonos.contexto('cliente').formaSaldoFavor.id);
  ventas.guardar(
    venta(CONSUMIDOR_FINAL, [linea(233, 1), linea(101, 1)], { forma: EFECTIVO, recibido: 20_000 }),
  );
  el(0, '10:25');
  ventas.guardar(venta(clientes.pollo, [linea(232, 2), linea(301, 1.25)], { forma: EFECTIVO }));
  el(0, '11:05');
  // Bolsas vendidas sin haber registrado la compra: la Principal queda en negativo.
  ventas.guardar(venta(CONSUMIDOR_FINAL, [linea(104, 3)], { forma: EFECTIVO, recibido: 20_000 }));

  ejecutar((ctx) => guardarConfiguracion(ctx, CLAVE_MARCA_DEMO, ahora));

  const contar = (tabla: string): number =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
  return {
    claveRecuperacion,
    resumen: [
      `${contar('clientes') - 1} clientes y ${contar('proveedores')} proveedores`,
      `${contar('productos')} productos en la Principal y la Bodega Norte, con inventario inicial importado y dos existencias negativas (104 en la Principal y 304 en la Bodega Norte)`,
      `${contar('facturas_cliente')} facturas de venta (contado, crédito, vencida, corregida, devuelta, anulada y 2 saldos iniciales)`,
      `${contar('facturas_proveedor')} compras (a crédito, de contado, corregida, devuelta, anulada y 2 saldos iniciales)`,
      `${contar('abonos')} abonos de clientes y proveedores (uno anulado, uno con saldo a favor)`,
      `${contar('devoluciones')} devoluciones, ${contar('reintegros')} reintegros y saldos a favor de JUAN JJ FERTILIA, RESTAURANTE EL FOGON y EMPAQUES DEL CARIBE`,
    ],
  };
}
