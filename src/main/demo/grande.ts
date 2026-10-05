import { sumarDias } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import { listarCatalogo } from '../../data/repositorios/catalogos.repo';
import { crearEjecutorTransacciones } from '../../data/transaccion';
import { aIsoLocal } from '../../shared/formato/fechas';
import { agruparMiles } from '../../shared/formato/moneda';
import type { LineaVentaNueva } from '../../shared/ventas';
import { crearServicioAbonos } from '../servicios/abonos';
import { crearServicioCompras } from '../servicios/compras';
import { crearServicioImportador } from '../servicios/importador';
import { crearServicioVentas } from '../servicios/ventas';

/** Forma de pago «Efectivo» (sembrada por la migración inicial). */
const EFECTIVO = 1;

/** Forma de pago «Transferencia» (sembrada por la migración inicial). */
const TRANSFERENCIA = 2;

/** «Consumidor final» (D-37). */
const CONSUMIDOR_FINAL = 0;

/** Primer código de los productos masivos (los de ejemplo van del 101 al 305). */
const PRIMER_PRODUCTO = 1001;

/**
 * Tamaño del modo de datos grandes. Con los valores por defecto el kardex
 * queda con unos 50,000 movimientos: 6,000 de inventario inicial, unos 9,600
 * de compras y unos 34,400 de ventas.
 */
export interface OpcionesDatosGrandes {
  /** Día de hoy `AAAA-MM-DD` (por defecto, el día local actual). */
  hoy?: string;
  /** Desfase horario `±HH:MM` (por defecto, el local). */
  desfase?: string;
  /** Productos nuevos (por defecto 5,000). */
  productos?: number;
  /** Compras (por defecto 1,200, de 8 renglones). */
  compras?: number;
  /** Ventas (por defecto 8,600, de 4 renglones en promedio). */
  ventas?: number;
  /** Días hacia atrás en que se reparten los documentos (por defecto 360). */
  dias?: number;
  /** Semilla del generador pseudoaleatorio (los datos salen siempre iguales). */
  semilla?: number;
}

/** Familias de producto para armar nombres buscables. */
const FAMILIAS = [
  'SALCHICHA',
  'JAMON',
  'QUESO',
  'MORTADELA',
  'CHORIZO',
  'TOCINETA',
  'PEPPERONI',
  'SALAMI',
  'PECHUGA',
  'ALAS',
  'PAPA FRANCESA',
  'YUCA',
  'ARVEJA',
  'MAIZ',
  'SALSA TOMATE',
  'MAYONESA',
  'MOSTAZA',
  'ACEITE',
  'HARINA',
  'AREPA',
  'CAJA PIZZA',
  'VASO',
  'BOLSA',
  'SERVILLETA',
  'CONTENEDOR',
] as const;

/** Marcas (inventadas) para los nombres. */
const MARCAS = [
  'ZENU',
  'RANCHERA',
  'PIETRAN',
  'COLANTA',
  'ALQUERIA',
  'AGRINA',
  'FRESCAMPO',
  'LA CAMPIÑA',
  'DON POLLO',
  'SURTIFRUVER',
  'DARNEL',
  'FAMILIA',
  'SAN JORGE',
  'BRISAS',
  'EL REY',
  'LA FINCA',
  'DEL CARIBE',
  'SABANERA',
  'PREMIUM',
  'ECONOMICA',
] as const;

/** Presentaciones: texto y si se vende por kilo. */
const PRESENTACIONES: readonly [string, boolean][] = [
  ['*250 G', false],
  ['*500 G', false],
  ['*1 KG', false],
  ['*2.5 KG', false],
  ['X 12', false],
  ['X 50', false],
  ['X 100', false],
  ['GRANEL', true],
  ['TAJADO', true],
  ['FAMILIAR', false],
];

/**
 * Generador pseudoaleatorio pequeño y reproducible (mulberry32).
 *
 * @param semilla - Semilla entera.
 * @returns Función que da números en [0, 1).
 */
function generador(semilla: number): () => number {
  let estado = semilla >>> 0;
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Agrega a una base que ya tiene los datos de ejemplo un volumen grande de
 * datos para medir tiempos (inventario, kardex, búsquedas, historial): miles
 * de productos importados con inventario inicial en las dos bodegas, clientes
 * y proveedores importados y un año de compras, ventas y abonos registrados
 * con los servicios de la app (las mismas reglas y el mismo historial).
 *
 * Una venta a crédito que el negocio rechazaría (p. ej., por facturas
 * vencidas) se registra de contado.
 *
 * @param db - Base con los datos de ejemplo ya sembrados.
 * @param opciones - Tamaño, día de hoy y semilla.
 * @returns Resumen legible de lo que se agregó.
 * @throws {Error} Si alguna importación falla (los datos generados están mal).
 */
export function sembrarDatosGrandes(
  db: BaseDeDatos,
  opciones: OpcionesDatosGrandes = {},
): string[] {
  const ahoraLocal = aIsoLocal();
  const hoy = opciones.hoy ?? ahoraLocal.slice(0, 10);
  const desfase = opciones.desfase ?? ahoraLocal.slice(-6);
  const cuantosProductos = opciones.productos ?? 5_000;
  const cuantasCompras = opciones.compras ?? 1_200;
  const cuantasVentas = opciones.ventas ?? 8_600;
  const dias = opciones.dias ?? 360;
  const azar = generador(opciones.semilla ?? 20261004);
  /**
   * Entero al azar en un rango cerrado.
   *
   * @param min - Mínimo.
   * @param max - Máximo.
   * @returns Entero entre `min` y `max`.
   */
  const entre = (min: number, max: number): number => min + Math.floor(azar() * (max - min + 1));

  let ahora = `${sumarDias(hoy, -dias - 1)}T07:00:00.000${desfase}`;
  const reloj = (): string => ahora;
  const dia = (): string => ahora.slice(0, 10);
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const importador = crearServicioImportador(db, ejecutar, { hoy: dia });
  const compras = crearServicioCompras(db, ejecutar, { hoy: dia });
  const ventas = crearServicioVentas(db, ejecutar, { reloj });
  const abonos = crearServicioAbonos(db, ejecutar, { hoy: dia });

  /**
   * Importa filas y exige que entren todas.
   *
   * @param tipo - Qué se importa.
   * @param filas - Valores de cada fila.
   * @throws {Error} Si alguna fila no entra.
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
      throw new Error(`Datos grandes (${tipo}): ${r.errores[0]?.mensaje ?? ''}`);
    }
  };

  // --- Maestros ------------------------------------------------------------
  importar(
    'proveedores',
    Array.from({ length: 20 }, (_, i) => ({
      codigo: '',
      tipoPersona: 'Jurídica',
      nombre: `DISTRIBUIDORA ${MARCAS[i % MARCAS.length] ?? ''} ${i + 1} S.A.S.`,
      tipoIdentificacion: 'NIT',
      numeroIdentificacion: String(910_000_000 + i),
      celular: `300${String(1_000_000 + i)}`,
      direccion: `CL ${10 + i} # ${i + 1}-20`,
      barrio: 'ZONA INDUSTRIAL',
      ciudad: 'BARRANQUILLA',
    })),
  );
  importar(
    'clientes',
    Array.from({ length: 300 }, (_, i) => ({
      codigo: '',
      tipoPersona: 'Natural',
      nombre: `CLIENTE ${FAMILIAS[i % FAMILIAS.length] ?? ''} ${MARCAS[i % MARCAS.length] ?? ''} ${i + 1}`,
      tipoIdentificacion: 'CC',
      numeroIdentificacion: String(1_100_000_000 + i),
      celular: `310${String(1_000_000 + i)}`,
      direccion: `CRA ${20 + (i % 50)} # ${i % 90}-15`,
      barrio: 'CENTRO',
      ciudad: 'BARRANQUILLA',
    })),
  );
  const proveedores = (
    db.prepare('SELECT codigo FROM proveedores').all() as { codigo: number }[]
  ).map((p) => p.codigo);
  const clientes = (
    db
      .prepare('SELECT codigo FROM clientes WHERE es_sistema = 0 AND tope_credito IS NULL')
      .all() as {
      codigo: number;
    }[]
  ).map((c) => c.codigo);

  const productos: { codigo: number; kg: boolean; costo: number }[] = [];
  const filasProductos: Record<string, string>[] = [];
  for (let i = 0; i < cuantosProductos; i++) {
    const familia = FAMILIAS[i % FAMILIAS.length] ?? '';
    const marca = MARCAS[Math.floor(i / FAMILIAS.length) % MARCAS.length] ?? '';
    const [presentacion, kg] = PRESENTACIONES[
      Math.floor(i / (FAMILIAS.length * MARCAS.length)) % PRESENTACIONES.length
    ] ??
      PRESENTACIONES[0] ?? ['', false];
    const costo = entre(20, 1_200) * 50;
    const codigo = PRIMER_PRODUCTO + i;
    productos.push({ codigo, kg, costo });
    filasProductos.push({
      codigo: String(codigo),
      nombre: `${familia} ${marca} ${presentacion}`,
      proveedor: String(proveedores[i % proveedores.length] ?? ''),
      unidad: kg ? 'KG' : 'UND',
      costo: String(costo),
      precioMayor: String(Math.round((costo * 1.2) / 50) * 50),
      precioMenor: String(Math.round((costo * 1.3) / 50) * 50),
      precioMinimo: String(Math.round((costo * 1.1) / 50) * 50),
    });
  }
  importar('productos', filasProductos);

  /**
   * Cantidad al azar, en el texto del archivo.
   *
   * @param kg - Si se vende por kilo.
   * @param min - Mínimo en unidades o kilos.
   * @param max - Máximo en unidades o kilos.
   * @returns Texto con punto decimal.
   */
  const cantidadTexto = (kg: boolean, min: number, max: number): string =>
    kg ? (entre(min * 20, max * 20) / 20).toFixed(3) : String(entre(min, max));
  const norte = listarCatalogo(db, 'bodega').find((b) => !b.esPrincipal)?.nombre ?? '';
  importar('stock', [
    ...productos.map((p) => ({
      producto: String(p.codigo),
      bodega: '',
      cantidad: cantidadTexto(p.kg, 20, 200),
    })),
    ...productos
      .filter((_, i) => i % 5 === 0)
      .map((p) => ({
        producto: String(p.codigo),
        bodega: norte,
        cantidad: cantidadTexto(p.kg, 5, 40),
      })),
  ]);

  /**
   * Productos distintos al azar.
   *
   * @param cuantos - Cuántos.
   * @returns Productos sin repetir.
   */
  const algunos = (cuantos: number): typeof productos => {
    const elegidos = new Map<number, (typeof productos)[number]>();
    while (elegidos.size < cuantos) {
      const p = productos[entre(0, productos.length - 1)];
      if (p) {
        elegidos.set(p.codigo, p);
      }
    }
    return [...elegidos.values()];
  };
  /**
   * Milésimas al azar para una línea.
   *
   * @param kg - Si se vende por kilo.
   * @param min - Mínimo en unidades o kilos.
   * @param max - Máximo en unidades o kilos.
   * @returns Milésimas.
   */
  const milesimas = (kg: boolean, min: number, max: number): number =>
    kg ? entre(min * 20, max * 20) * 50 : entre(min, max) * 1000;

  // --- Un año de compras, ventas y abonos, día por día ----------------------
  const creditoPorDia = new Map<string, { id: number; cliente: number; total: number }[]>();
  let comprasHechas = 0;
  let ventasHechas = 0;
  let abonosHechos = 0;
  for (let d = dias; d >= 1; d--) {
    const fecha = sumarDias(hoy, -d);
    /**
     * Documentos que deben llevarse hechos al terminar este día, para
     * repartirlos parejo en el periodo.
     *
     * @param total - Total del periodo.
     * @returns Acumulado al final del día.
     */
    const hechasHasta = (total: number): number => Math.round((total * (dias - d + 1)) / dias);
    const comprasDelDia = hechasHasta(cuantasCompras) - comprasHechas;
    const ventasDelDia = hechasHasta(cuantasVentas) - ventasHechas;
    const pasos = comprasDelDia + ventasDelDia;
    let minuto = 7 * 60;
    /** Adelanta el reloj dentro de la jornada de 7 a. m. a 7 p. m. */
    const avanzar = (): void => {
      minuto += Math.max(1, Math.floor((12 * 60) / Math.max(1, pasos)));
      const h = String(Math.floor(minuto / 60) % 24).padStart(2, '0');
      const m = String(minuto % 60).padStart(2, '0');
      ahora = `${fecha}T${h}:${m}:00.000${desfase}`;
    };

    for (let i = 0; i < comprasDelDia; i++) {
      avanzar();
      const contado = azar() < 0.7;
      const proveedor = proveedores[entre(0, proveedores.length - 1)] ?? 0;
      compras.guardar({
        proveedorCodigo: proveedor,
        numeroProveedor: `G-${comprasHechas + 1}`,
        fecha,
        plazoDias: contado ? 0 : 30,
        bodegaId: 1,
        ordenCompra: '',
        lineas: algunos(8).map((p) => ({
          productoCodigo: p.codigo,
          cantidad: milesimas(p.kg, 10, 60),
          costoUnitario: p.costo,
        })),
        flete: 0,
        fleteProveedor: false,
        descuento: { modo: 'pesos', valor: 0 },
        descuentoEnCosto: false,
        contado: contado ? { formaPagoId: EFECTIVO } : null,
      });
      comprasHechas++;
    }

    for (let i = 0; i < ventasDelDia; i++) {
      avanzar();
      const lineas: LineaVentaNueva[] = algunos(entre(1, 7)).map((p) => ({
        productoCodigo: p.codigo,
        escala: 'menor',
        cantidad: milesimas(p.kg, 1, 6),
        precioAlterado: null,
      }));
      const contado = {
        ranura: null,
        clienteCodigo: CONSUMIDOR_FINAL,
        condicion: 'contado' as const,
        plazoDias: 0,
        bodegaId: 1,
        lineas,
        contado: { formaPagoId: EFECTIVO, recibido: null },
        cajasEmpaque: null,
      };
      if (azar() < 0.25) {
        const cliente = clientes[entre(0, clientes.length - 1)] ?? CONSUMIDOR_FINAL;
        try {
          const f = ventas.guardar({
            ...contado,
            clienteCodigo: cliente,
            condicion: 'credito',
            plazoDias: 15,
            contado: null,
          });
          const lista = creditoPorDia.get(fecha) ?? [];
          lista.push({ id: f.id, cliente, total: f.total });
          creditoPorDia.set(fecha, lista);
        } catch (error) {
          if (!(error instanceof ErrorDeNegocio)) {
            throw error;
          }
          ventas.guardar({ ...contado, clienteCodigo: cliente });
        }
      } else {
        ventas.guardar(contado);
      }
      ventasHechas++;
    }

    // El 85 % de las ventas a crédito se paga completa a los 12 días.
    for (const f of creditoPorDia.get(sumarDias(fecha, -12)) ?? []) {
      if (azar() < 0.85) {
        avanzar();
        abonos.guardar({
          tipo: 'cliente',
          terceroCodigo: f.cliente,
          fecha,
          formaPagoId: TRANSFERENCIA,
          valor: f.total,
          observacion: '',
          aplicaciones: [{ facturaId: f.id, valor: f.total }],
        });
        abonosHechos++;
      }
    }
  }

  const movimientos = (
    db.prepare('SELECT COUNT(*) AS n FROM movimientos_inventario').get() as { n: number }
  ).n;
  return [
    `${agruparMiles(cuantosProductos)} productos más, con inventario inicial en las dos bodegas`,
    '300 clientes y 20 proveedores más',
    `${agruparMiles(comprasHechas)} compras, ${agruparMiles(ventasHechas)} ventas y ${agruparMiles(abonosHechos)} abonos en ${dias} días`,
    `${agruparMiles(movimientos)} movimientos de inventario en total`,
  ];
}
