import {
  calcularCompra,
  leerPorcentaje,
  type CompraCalculada,
  type LineaCompraCalculada,
} from '../../domain/compras';
import { ErrorDeNegocio } from '../../domain/errores';
import type { DescuentoCompra, ModoDescuento, PeticionGuardarCompra } from '../../shared/compras';
import { leerCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { leerPesos } from '../../shared/formato/moneda';
import type { ProductoResumen, Tercero } from '../../shared/maestros';
import { fallo, type Resultado } from '../../shared/resultado';

/**
 * Línea de la compra tal como se escribe en pantalla.
 */
export interface LineaFormulario {
  /** Clave local de la fila (no se guarda). */
  id: number;
  /** Producto. */
  producto: ProductoResumen;
  /** Cantidad escrita. */
  cantidad: string;
  /** Costo unitario escrito. */
  costo: string;
}

/**
 * Factura de proveedor tal como se escribe en pantalla.
 */
export interface FormularioCompra {
  /** Proveedor elegido. */
  proveedor: Tercero | null;
  /** Número de la factura del proveedor. */
  numeroProveedor: string;
  /** Fecha escrita, `dd/mm/aaaa`. */
  fecha: string;
  /** Plazo escrito, en días. */
  plazo: string;
  /** Id de la bodega (texto del `<select>`). */
  bodegaId: string;
  /** Orden de compra (opcional). */
  ordenCompra: string;
  /** Líneas. */
  lineas: LineaFormulario[];
  /** Flete escrito. */
  flete: string;
  /** Si el flete lo cobra el proveedor (D-59). */
  fleteProveedor: boolean;
  /** Cómo se escribe el descuento. */
  descuentoModo: ModoDescuento;
  /** Descuento escrito. */
  descuento: string;
  /** Si el descuento se reparte en el costo (D-47). */
  descuentoEnCosto: boolean;
  /** «Pagada de contado» (D-48). */
  contado: boolean;
  /** Forma de pago del contado (texto del `<select>`). */
  formaPagoId: string;
}

/**
 * Formulario de una compra nueva.
 *
 * @param hoy - Día de hoy `AAAA-MM-DD`.
 * @param bodegaId - Bodega propuesta (la Principal).
 * @returns Formulario vacío.
 */
export function formularioCompraVacio(hoy: string, bodegaId: string): FormularioCompra {
  return {
    proveedor: null,
    numeroProveedor: '',
    fecha: formatearFecha(hoy),
    plazo: '0',
    bodegaId,
    ordenCompra: '',
    lineas: [],
    flete: '',
    fleteProveedor: false,
    descuentoModo: 'pesos',
    descuento: '',
    descuentoEnCosto: false,
    contado: false,
    formaPagoId: '',
  };
}

/**
 * Indica si el usuario escribió algo que se perdería al limpiar o cerrar.
 *
 * @param f - Formulario.
 * @returns `true` si hay datos.
 */
export function compraTieneDatos(f: FormularioCompra): boolean {
  return (
    f.proveedor !== null ||
    f.numeroProveedor.trim() !== '' ||
    f.ordenCompra.trim() !== '' ||
    f.lineas.length > 0 ||
    f.flete.trim() !== '' ||
    f.descuento.trim() !== ''
  );
}

/**
 * Lee un valor en pesos opcional: vacío cuenta como cero.
 *
 * @param texto - Texto escrito.
 * @returns Pesos, o `null` si no es válido.
 */
function pesosOpcionales(texto: string): number | null {
  return texto.trim() === '' ? 0 : leerPesos(texto);
}

/**
 * Lee el descuento escrito.
 *
 * @param f - Formulario.
 * @returns Descuento, o `null` si no es válido.
 */
function leerDescuento(f: FormularioCompra): DescuentoCompra | null {
  if (f.descuento.trim() === '') {
    return { modo: f.descuentoModo, valor: 0 };
  }
  const valor = f.descuentoModo === 'pesos' ? leerPesos(f.descuento) : leerPorcentaje(f.descuento);
  return valor === null ? null : { modo: f.descuentoModo, valor };
}

/**
 * Cantidad y costo de una línea leídos del texto.
 *
 * @param linea - Línea escrita.
 * @returns Cantidad en milésimas y costo en pesos (`null` si no son válidos).
 */
export function leerLinea(linea: LineaFormulario): {
  cantidad: number | null;
  costo: number | null;
} {
  return {
    cantidad: leerCantidad(linea.cantidad, linea.producto.unidad),
    costo: leerPesos(linea.costo),
  };
}

/**
 * Resultado del cálculo en vivo de la pantalla.
 */
export interface CalculoPantalla {
  /** Compra calculada con las líneas completas, o `null` si aún no hay. */
  compra: CompraCalculada | null;
  /** Cálculo de cada línea completa, por su clave local. */
  porLinea: ReadonlyMap<number, LineaCompraCalculada>;
  /** Por qué no se pudo calcular, o `null`. */
  error: string | null;
}

/**
 * Calcula la compra mientras se escribe, con la misma regla que usa el
 * proceso principal al guardar (D-43). Las líneas a medio escribir se omiten.
 *
 * @param f - Formulario.
 * @returns Compra calculada y errores para mostrar.
 */
export function calcularEnPantalla(f: FormularioCompra): CalculoPantalla {
  const vacio = { compra: null, porLinea: new Map<number, LineaCompraCalculada>() };
  const flete = pesosOpcionales(f.flete);
  if (flete === null) {
    return { ...vacio, error: 'El flete no es un valor válido en pesos (por ejemplo 30,000).' };
  }
  const descuento = leerDescuento(f);
  if (descuento === null) {
    return {
      ...vacio,
      error:
        f.descuentoModo === 'pesos'
          ? 'El descuento no es un valor válido en pesos (por ejemplo 20,000).'
          : 'El porcentaje de descuento no es válido: hasta dos decimales con punto (2.5).',
    };
  }
  const completas = f.lineas.flatMap((l) => {
    const { cantidad, costo } = leerLinea(l);
    return cantidad !== null && cantidad > 0 && costo !== null
      ? [{ id: l.id, entrada: { producto: l.producto, cantidad, costoUnitario: costo } }]
      : [];
  });
  if (completas.length === 0 || f.proveedor === null) {
    return { ...vacio, error: null };
  }
  try {
    const compra = calcularCompra({
      proveedorCodigo: f.proveedor.codigo,
      lineas: completas.map((c) => c.entrada),
      flete,
      fleteProveedor: f.fleteProveedor,
      descuento,
      descuentoEnCosto: f.descuentoEnCosto,
    });
    const porLinea = new Map<number, LineaCompraCalculada>();
    completas.forEach((c, i) => {
      const calculada = compra.lineas[i];
      if (calculada) porLinea.set(c.id, calculada);
    });
    return { compra, porLinea, error: null };
  } catch (error) {
    if (error instanceof ErrorDeNegocio) {
      return { ...vacio, error: error.message };
    }
    throw error;
  }
}

/**
 * Valida lo escrito y arma la petición para guardar. Las reglas de negocio
 * las vuelve a validar el proceso principal.
 *
 * @param f - Formulario.
 * @returns Petición lista, o el primer error para mostrar.
 */
export function peticionCompra(f: FormularioCompra): Resultado<PeticionGuardarCompra> {
  if (f.proveedor === null) {
    return fallo('VALIDACION', 'Elija el proveedor.');
  }
  const fecha = leerFecha(f.fecha);
  if (fecha === null) {
    return fallo('VALIDACION', 'La fecha no es válida: use el formato dd/mm/aaaa.');
  }
  const plazo = f.plazo.trim() === '' ? '0' : f.plazo.trim();
  if (!/^\d+$/.test(plazo)) {
    return fallo('VALIDACION', 'El plazo debe ser un número entero de días.');
  }
  const bodegaId = Number(f.bodegaId);
  if (f.bodegaId === '' || !Number.isSafeInteger(bodegaId)) {
    return fallo('VALIDACION', 'Elija la bodega donde entra la mercancía.');
  }
  if (f.lineas.length === 0) {
    return fallo('VALIDACION', 'Agregue al menos un producto a la compra.');
  }
  const lineas = [];
  for (const [i, l] of f.lineas.entries()) {
    const renglon = `Línea ${i + 1} (${l.producto.codigo} - ${l.producto.nombre})`;
    const { cantidad, costo } = leerLinea(l);
    if (cantidad === null) {
      return fallo(
        'VALIDACION',
        l.producto.unidad === 'UND'
          ? `${renglon}: la cantidad debe ser un número entero de unidades.`
          : `${renglon}: la cantidad no es válida; use hasta tres decimales con punto (12.5).`,
      );
    }
    if (costo === null) {
      return fallo(
        'VALIDACION',
        `${renglon}: el costo no es un valor válido en pesos (por ejemplo 13,200).`,
      );
    }
    lineas.push({ productoCodigo: l.producto.codigo, cantidad, costoUnitario: costo });
  }
  const flete = pesosOpcionales(f.flete);
  if (flete === null) {
    return fallo('VALIDACION', 'El flete no es un valor válido en pesos (por ejemplo 30,000).');
  }
  const descuento = leerDescuento(f);
  if (descuento === null) {
    return fallo('VALIDACION', 'El descuento no es válido.');
  }
  let contado: PeticionGuardarCompra['contado'] = null;
  if (f.contado) {
    const formaPagoId = Number(f.formaPagoId);
    if (f.formaPagoId === '' || !Number.isSafeInteger(formaPagoId)) {
      return fallo('VALIDACION', 'Elija la forma de pago de la compra de contado.');
    }
    contado = { formaPagoId };
  }
  return {
    ok: true,
    datos: {
      proveedorCodigo: f.proveedor.codigo,
      numeroProveedor: f.numeroProveedor,
      fecha,
      plazoDias: Number(plazo),
      bodegaId,
      ordenCompra: f.ordenCompra,
      lineas,
      flete,
      fleteProveedor: f.fleteProveedor,
      descuento,
      descuentoEnCosto: f.descuentoEnCosto,
      contado,
    },
  };
}
