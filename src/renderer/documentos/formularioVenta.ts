import {
  calcularCambio,
  calcularLineaVenta,
  ESCALA_POR_DEFECTO,
  nombreEscala,
  validarCajasEmpaque,
  type LineaVentaCalculada,
} from '../../domain/ventas';
import { ErrorDeNegocio } from '../../domain/errores';
import { leerCantidad } from '../../shared/formato/cantidades';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import {
  ESCALAS_PRECIO,
  type EscalaPrecio,
  type ProductoResumen,
  type RegistroCatalogo,
  type Tercero,
} from '../../shared/maestros';
import { fallo, type Resultado } from '../../shared/resultado';
import {
  CODIGO_CONSUMIDOR_FINAL,
  type CondicionPago,
  type PeticionGuardarFactura,
} from '../../shared/ventas';

/**
 * Línea de la factura de venta tal como se escribe en pantalla.
 */
export interface LineaVentaFormulario {
  /** Clave local de la fila (no se guarda). */
  id: number;
  /** Producto con sus precios vigentes. */
  producto: ProductoResumen;
  /** Escala elegida (Menor por defecto, F6 la cambia: D-81). */
  escala: EscalaPrecio;
  /** Cantidad escrita (1 por defecto, D-82). */
  cantidad: string;
  /** Precio escrito con F7, o `null` para vender al precio de la escala. */
  precio: string | null;
}

/**
 * Factura de venta tal como se escribe en pantalla (un borrador).
 */
export interface FormularioVenta {
  /** Cliente elegido. */
  cliente: Tercero | null;
  /** Contado o crédito. */
  condicion: CondicionPago;
  /** Plazo escrito, en días (solo crédito). */
  plazo: string;
  /** Id de la bodega (texto del `<select>`). */
  bodegaId: string;
  /** Líneas. */
  lineas: LineaVentaFormulario[];
  /** Forma de pago del contado (texto del `<select>`). */
  formaPagoId: string;
  /** Lo que entregó el cliente (contado con cambio). */
  recibido: string;
  /** «No. cajas de empaque» (opcional). */
  cajas: string;
}

/**
 * Formulario de un borrador vacío: «Consumidor final» de contado (D-82).
 *
 * @param consumidorFinal - Cliente «Consumidor final», o `null` si no se cargó.
 * @param bodegaId - Bodega propuesta (la Principal).
 * @param formaPagoId - Forma de pago propuesta.
 * @returns Formulario vacío.
 */
export function formularioVentaVacio(
  consumidorFinal: Tercero | null,
  bodegaId: string,
  formaPagoId: string,
): FormularioVenta {
  return {
    cliente: consumidorFinal,
    condicion: 'contado',
    plazo: '0',
    bodegaId,
    lineas: [],
    formaPagoId,
    recibido: '',
    cajas: '',
  };
}

/**
 * Forma de pago que se propone en el contado: la primera activa que calcula
 * cambio (efectivo) o, si no hay, la primera activa.
 *
 * @param formas - Formas de pago.
 * @returns Id como texto, o `''` si no hay formas activas.
 */
export function formaPagoPropuesta(formas: readonly RegistroCatalogo[]): string {
  const activas = formas.filter((f) => f.activo);
  const elegida = activas.find((f) => f.calculaCambio) ?? activas[0];
  return elegida ? String(elegida.id) : '';
}

/**
 * Indica si el borrador tiene algo que conservar: líneas, un cliente
 * distinto de «Consumidor final» o datos del pago escritos.
 *
 * @param f - Formulario.
 * @returns `true` si hay datos.
 */
export function ventaTieneDatos(f: FormularioVenta): boolean {
  return (
    f.lineas.length > 0 ||
    (f.cliente !== null && f.cliente.codigo !== CODIGO_CONSUMIDOR_FINAL) ||
    f.recibido.trim() !== '' ||
    f.cajas.trim() !== ''
  );
}

/**
 * Línea tal como se guarda en el borrador.
 */
interface LineaSerializada {
  /** Producto. */
  productoCodigo: number;
  /** Escala. */
  escala: EscalaPrecio;
  /** Cantidad escrita. */
  cantidad: string;
  /** Precio escrito con F7, o `null`. */
  precio: string | null;
  /** Precio de la escala cuando se escribió (para avisar si cambió, D-83). */
  precioEscala: number;
}

/**
 * Borrador tal como se guarda en disco (D-89).
 */
interface BorradorSerializado {
  /** Versión del formato. */
  version: 1;
  /** Cliente, o `null`. */
  clienteCodigo: number | null;
  /** Condición. */
  condicion: CondicionPago;
  /** Plazo escrito. */
  plazo: string;
  /** Bodega. */
  bodegaId: string;
  /** Forma de pago. */
  formaPagoId: string;
  /** Recibido escrito. */
  recibido: string;
  /** Cajas escritas. */
  cajas: string;
  /** Líneas. */
  lineas: LineaSerializada[];
}

/**
 * Convierte el borrador al JSON que se autoguarda.
 *
 * @param f - Formulario.
 * @returns Texto JSON.
 */
export function serializarBorrador(f: FormularioVenta): string {
  const borrador: BorradorSerializado = {
    version: 1,
    clienteCodigo: f.cliente?.codigo ?? null,
    condicion: f.condicion,
    plazo: f.plazo,
    bodegaId: f.bodegaId,
    formaPagoId: f.formaPagoId,
    recibido: f.recibido,
    cajas: f.cajas,
    lineas: f.lineas.map((l) => ({
      productoCodigo: l.producto.codigo,
      escala: l.escala,
      cantidad: l.cantidad,
      precio: l.precio,
      precioEscala: l.producto.precios[l.escala],
    })),
  };
  return JSON.stringify(borrador);
}

/**
 * Lee un texto de un objeto desconocido.
 *
 * @param valor - Valor leído del JSON.
 * @param porDefecto - Valor si no es texto.
 * @returns El texto.
 */
function texto(valor: unknown, porDefecto = ''): string {
  return typeof valor === 'string' ? valor : porDefecto;
}

/**
 * Lee un entero de un objeto desconocido.
 *
 * @param valor - Valor leído del JSON.
 * @returns El entero o `null`.
 */
function entero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isSafeInteger(valor) ? valor : null;
}

/**
 * Lee una escala de un objeto desconocido.
 *
 * @param valor - Valor leído del JSON.
 * @returns La escala, o la de por defecto si no es válida.
 */
function escala(valor: unknown): EscalaPrecio {
  return ESCALAS_PRECIO.find((e) => e.valor === valor)?.valor ?? ESCALA_POR_DEFECTO;
}

/**
 * Datos vigentes con que se reabre un borrador.
 */
export interface CatalogosVenta {
  /** Productos con sus precios vigentes (activos e inactivos). */
  productos: readonly ProductoResumen[];
  /** Clientes (activos e inactivos). */
  clientes: readonly Tercero[];
}

/**
 * Borrador reabierto con los avisos de lo que cambió.
 */
export interface BorradorRestaurado {
  /** Formulario con los precios vigentes. */
  formulario: FormularioVenta;
  /** Avisos para el usuario (precios cambiados, productos inactivos…). */
  avisos: string[];
}

/**
 * Reabre un borrador guardado en disco (D-83): toma los precios de escala
 * vigentes (salvo los alterados con F7) y avisa qué líneas cambiaron y de
 * cuánto a cuánto. Un producto que ya no existe se quita con aviso; uno
 * inactivo se deja (se marca en rojo y hay que quitarlo para guardar).
 *
 * @param contenido - JSON guardado.
 * @param catalogos - Productos y clientes vigentes.
 * @param nuevoId - Genera la clave local de cada línea.
 * @param vacio - Formulario vacío para completar lo que falte.
 * @returns El borrador, o `null` si el contenido no se puede leer.
 */
export function restaurarBorrador(
  contenido: string,
  catalogos: CatalogosVenta,
  nuevoId: () => number,
  vacio: FormularioVenta,
): BorradorRestaurado | null {
  let leido: unknown;
  try {
    leido = JSON.parse(contenido);
  } catch {
    return null;
  }
  if (typeof leido !== 'object' || leido === null || Array.isArray(leido)) {
    return null;
  }
  const d = leido as Record<string, unknown>;
  const avisos: string[] = [];

  const clienteCodigo = entero(d.clienteCodigo);
  let cliente = vacio.cliente;
  if (clienteCodigo !== null) {
    const encontrado = catalogos.clientes.find((c) => c.codigo === clienteCodigo);
    if (!encontrado) {
      avisos.push(`El cliente ${clienteCodigo} ya no existe: elija otro.`);
      cliente = null;
    } else {
      cliente = encontrado;
      if (!encontrado.activo) {
        avisos.push(
          `El cliente ${encontrado.codigo} - ${encontrado.nombre} está inactivo: no se le puede facturar.`,
        );
      }
    }
  }

  const lineas: LineaVentaFormulario[] = [];
  const crudas = Array.isArray(d.lineas) ? (d.lineas as unknown[]) : [];
  crudas.forEach((cruda, i) => {
    if (typeof cruda !== 'object' || cruda === null) return;
    const l = cruda as Record<string, unknown>;
    const codigo = entero(l.productoCodigo);
    const producto = catalogos.productos.find((p) => p.codigo === codigo);
    if (!producto) {
      avisos.push(
        `Línea ${i + 1}: el producto ${codigo ?? '?'} ya no existe y se quitó del borrador.`,
      );
      return;
    }
    const linea: LineaVentaFormulario = {
      id: nuevoId(),
      producto,
      escala: escala(l.escala),
      cantidad: texto(l.cantidad, '1'),
      precio: typeof l.precio === 'string' ? l.precio : null,
    };
    const renglon = `Línea ${lineas.length + 1} · ${producto.codigo} ${producto.nombre}`;
    const anterior = entero(l.precioEscala);
    const vigente = producto.precios[linea.escala];
    if (linea.precio === null && anterior !== null && anterior !== vigente) {
      avisos.push(
        `${renglon}: el precio ${nombreEscala(linea.escala)} cambió de ${formatearPesos(anterior)} a ${formatearPesos(vigente)}.`,
      );
    }
    if (!producto.activo) {
      avisos.push(`${renglon}: el producto está inactivo; quítelo para poder guardar.`);
    }
    lineas.push(linea);
  });

  return {
    formulario: {
      cliente,
      condicion: d.condicion === 'credito' ? 'credito' : 'contado',
      plazo: texto(d.plazo, vacio.plazo),
      bodegaId: texto(d.bodegaId, vacio.bodegaId),
      lineas,
      formaPagoId: texto(d.formaPagoId, vacio.formaPagoId),
      recibido: texto(d.recibido),
      cajas: texto(d.cajas),
    },
    avisos,
  };
}

/**
 * Cantidad y precio alterado de una línea leídos del texto.
 *
 * @param linea - Línea escrita.
 * @returns Cantidad en milésimas y precio alterado (`null` en `cantidad` o
 *   `precioValido: false` si no son válidos).
 */
export function leerLineaVenta(linea: LineaVentaFormulario): {
  cantidad: number | null;
  precioAlterado: number | null;
  precioValido: boolean;
} {
  const cantidad = leerCantidad(linea.cantidad, linea.producto.unidad);
  if (linea.precio === null) {
    return { cantidad, precioAlterado: null, precioValido: true };
  }
  const precio = leerPesos(linea.precio);
  return { cantidad, precioAlterado: precio, precioValido: precio !== null };
}

/**
 * Resultado del cálculo en vivo de la factura.
 */
export interface CalculoVentaPantalla {
  /** Cálculo de cada línea completa, por su clave local. */
  porLinea: ReadonlyMap<number, LineaVentaCalculada>;
  /** Total de las líneas completas. */
  total: number;
  /** Ahorro de las líneas completas. */
  ahorro: number;
  /** Errores que impiden guardar (precio bajo el costo, producto inactivo). */
  errores: string[];
  /** Avisos que no impiden guardar (precio bajo el Mínimo, D-87). */
  avisos: string[];
}

/**
 * Calcula la factura mientras se escribe, con la misma regla de línea que
 * usa el proceso principal al guardar (D-43). Las líneas a medio escribir se
 * omiten del total.
 *
 * @param f - Formulario.
 * @returns Totales, cálculo por línea, errores y avisos.
 */
export function calcularVentaEnPantalla(f: FormularioVenta): CalculoVentaPantalla {
  const porLinea = new Map<number, LineaVentaCalculada>();
  const errores: string[] = [];
  const avisos: string[] = [];
  let total = 0;
  let ahorro = 0;
  f.lineas.forEach((l, i) => {
    const renglon = `Línea ${i + 1} (${l.producto.codigo} - ${l.producto.nombre})`;
    if (!l.producto.activo) {
      errores.push(
        `${renglon}: el producto está inactivo y no se puede vender. Quítelo de la factura.`,
      );
    }
    const { cantidad, precioAlterado, precioValido } = leerLineaVenta(l);
    if (cantidad === null || cantidad <= 0 || !precioValido) return;
    let calculada: LineaVentaCalculada;
    try {
      calculada = calcularLineaVenta({
        producto: l.producto,
        escala: l.escala,
        cantidad,
        precioAlterado,
      });
    } catch (error) {
      if (error instanceof ErrorDeNegocio) {
        errores.push(`${renglon}: ${error.message}`);
        return;
      }
      throw error;
    }
    porLinea.set(l.id, calculada);
    total += calculada.total;
    ahorro += calculada.ahorro;
    if (calculada.bajoCosto) {
      errores.push(
        `${renglon}: el precio (${formatearPesos(calculada.precio)}) queda por debajo del costo ` +
          `(${formatearPesos(l.producto.costo)}). Use F7 para escribir un precio igual o mayor al costo.`,
      );
    } else if (calculada.bajoMinimo) {
      avisos.push(
        `${renglon}: el precio (${formatearPesos(calculada.precio)}) queda por debajo del Mínimo ` +
          `(${formatearPesos(l.producto.precios.minimo)}). Se puede vender (D-87).`,
      );
    }
  });
  return { porLinea, total, ahorro, errores, avisos };
}

/**
 * Avisos de stock: la venta se permite aunque el stock quede negativo
 * (§5.1), pero se avisa en ámbar. Suma las líneas de un mismo producto.
 *
 * @param f - Formulario.
 * @param stock - Stock por producto en la bodega elegida, en milésimas.
 * @param bodegaNombre - Nombre de la bodega para el mensaje.
 * @returns Textos de aviso y las claves de las líneas que dejan el stock negativo.
 */
export function avisosStock(
  f: FormularioVenta,
  stock: ReadonlyMap<number, number>,
  bodegaNombre: string,
): { textos: string[]; lineas: ReadonlySet<number> } {
  const vendido = new Map<number, number>();
  const textos: string[] = [];
  const lineas = new Set<number>();
  f.lineas.forEach((l, i) => {
    const cantidad = leerLineaVenta(l).cantidad;
    if (cantidad === null || cantidad <= 0) return;
    const codigo = l.producto.codigo;
    const acumulado = (vendido.get(codigo) ?? 0) + cantidad;
    vendido.set(codigo, acumulado);
    const disponible = stock.get(codigo) ?? 0;
    if (acumulado > disponible) {
      lineas.add(l.id);
      const unidad = l.producto.unidad;
      const quedara = disponible - acumulado;
      textos.push(
        `Línea ${i + 1} · ${codigo} ${l.producto.nombre}: en ${bodegaNombre} quedan ` +
          `${formatearMilesimas(disponible, unidad)} ${unidad}; el stock quedará en ` +
          `${formatearMilesimas(quedara, unidad)}. Se puede vender igual (§5.1).`,
      );
    }
  });
  return { textos, lineas };
}

/**
 * Formatea una cantidad en milésimas que puede ser negativa.
 *
 * @param milesimas - Cantidad.
 * @param unidad - Unidad del producto.
 * @returns Texto como `−3` o `1.500`.
 */
function formatearMilesimas(milesimas: number, unidad: ProductoResumen['unidad']): string {
  const absoluto = Math.abs(milesimas);
  const entera = Math.floor(absoluto / 1000);
  const decimales = absoluto % 1000;
  const cuerpo =
    unidad === 'KG'
      ? `${agruparMiles(entera)}.${String(decimales).padStart(3, '0')}`
      : agruparMiles(entera);
  return milesimas < 0 ? `−${cuerpo}` : cuerpo;
}

/**
 * Cambio a mostrar en el contado (D-90).
 *
 * @param total - Total de la factura.
 * @param recibido - Recibido escrito.
 * @param forma - Forma de pago elegida, o `undefined`.
 * @returns Cambio, `null` si la forma no calcula cambio o lo recibido no es válido.
 */
export function cambioEnPantalla(
  total: number,
  recibido: string,
  forma: RegistroCatalogo | undefined,
): number | null {
  if (!forma?.calculaCambio) return null;
  const valor = recibido.trim() === '' ? null : leerPesos(recibido);
  if (recibido.trim() !== '' && valor === null) return null;
  try {
    return calcularCambio(total, valor, true).cambio;
  } catch {
    return null;
  }
}

/**
 * Valida lo escrito y arma la petición para guardar. Las reglas de negocio
 * (costo, crédito, cambio) las vuelve a validar el proceso principal.
 *
 * @param f - Formulario.
 * @param ranura - Borrador del que sale (1 a 6).
 * @param formas - Formas de pago (para saber si calculan cambio).
 * @returns Petición lista, o el primer error para mostrar.
 */
export function peticionVenta(
  f: FormularioVenta,
  ranura: number,
  formas: readonly RegistroCatalogo[],
): Resultado<PeticionGuardarFactura> {
  if (f.cliente === null) {
    return fallo('VALIDACION', 'Elija el cliente.');
  }
  let plazoDias = 0;
  if (f.condicion === 'credito') {
    const plazo = f.plazo.trim() === '' ? '0' : f.plazo.trim();
    if (!/^\d+$/.test(plazo)) {
      return fallo('VALIDACION', 'El plazo debe ser un número entero de días.');
    }
    plazoDias = Number(plazo);
  }
  const bodegaId = Number(f.bodegaId);
  if (f.bodegaId === '' || !Number.isSafeInteger(bodegaId)) {
    return fallo('VALIDACION', 'Elija la bodega de donde sale la mercancía.');
  }
  if (f.lineas.length === 0) {
    return fallo('VALIDACION', 'Agregue al menos un producto a la factura.');
  }
  const lineas: PeticionGuardarFactura['lineas'] = [];
  for (const [i, l] of f.lineas.entries()) {
    const renglon = `Línea ${i + 1} (${l.producto.codigo} - ${l.producto.nombre})`;
    const { cantidad, precioAlterado, precioValido } = leerLineaVenta(l);
    if (cantidad === null || cantidad <= 0) {
      return fallo(
        'VALIDACION',
        l.producto.unidad === 'UND'
          ? `${renglon}: la cantidad debe ser un número entero de unidades mayor que cero.`
          : `${renglon}: la cantidad no es válida; use hasta tres decimales con punto (1.5).`,
      );
    }
    if (!precioValido) {
      return fallo(
        'VALIDACION',
        `${renglon}: el precio no es un valor válido en pesos (por ejemplo 14,500).`,
      );
    }
    lineas.push({
      productoCodigo: l.producto.codigo,
      escala: l.escala,
      cantidad,
      precioAlterado,
    });
  }
  let contado: PeticionGuardarFactura['contado'] = null;
  if (f.condicion === 'contado') {
    const formaPagoId = Number(f.formaPagoId);
    const forma = formas.find((fp) => fp.id === formaPagoId);
    if (f.formaPagoId === '' || !forma) {
      return fallo('VALIDACION', 'Elija la forma de pago de la factura de contado.');
    }
    let recibido: number | null = null;
    if (forma.calculaCambio && f.recibido.trim() !== '') {
      recibido = leerPesos(f.recibido);
      if (recibido === null) {
        return fallo(
          'VALIDACION',
          'Lo recibido no es un valor válido en pesos (por ejemplo 100,000).',
        );
      }
    }
    contado = { formaPagoId, recibido };
  }
  let cajasEmpaque: number | null = null;
  if (f.cajas.trim() !== '') {
    const cajas = /^\d+$/.test(f.cajas.trim()) ? Number(f.cajas.trim()) : Number.NaN;
    try {
      cajasEmpaque = validarCajasEmpaque(cajas);
    } catch (error) {
      if (error instanceof ErrorDeNegocio) return fallo('VALIDACION', error.message);
      throw error;
    }
  }
  return {
    ok: true,
    datos: {
      ranura,
      clienteCodigo: f.cliente.codigo,
      condicion: f.condicion,
      plazoDias,
      bodegaId,
      lineas,
      contado,
      cajasEmpaque,
    },
  };
}
