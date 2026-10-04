import type { ReactNode } from 'react';
import type { MovimientoCorreccion } from '../../domain/correcciones';
import type {
  CarteraDeFactura,
  DevolucionResumen,
  ProductoDeLinea,
  ReintegroGenerado,
} from '../../shared/correcciones';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';

/**
 * Propiedades de {@link RecuadroCartera}.
 */
interface PropiedadesRecuadroCartera {
  /** Cartera de la factura. */
  cartera: CarteraDeFactura;
  /** «Abonado» (cliente) o «Pagado» (proveedor). */
  textoPagado: string;
  /** Si se muestra la columna «Devuelto» (ventanas de devolución). */
  conDevuelto?: boolean;
}

/**
 * Recuadro gris con el total, lo abonado (o pagado), lo devuelto y el saldo
 * de la factura, como en las maquetas de corrección y devolución.
 *
 * @param props - Propiedades del componente.
 * @returns El recuadro.
 */
export function RecuadroCartera({
  cartera,
  textoPagado,
  conDevuelto = false,
}: PropiedadesRecuadroCartera): ReactNode {
  const columnas: [string, number][] = [
    ['Total', cartera.total],
    [textoPagado, cartera.aplicado],
    ...(conDevuelto ? ([['Devuelto', cartera.devuelto]] as [string, number][]) : []),
    ['Saldo', cartera.saldo],
  ];
  return (
    <div
      className="recuadro-cartera"
      style={{ gridTemplateColumns: `repeat(${columnas.length}, auto)` }}
    >
      {columnas.map(([texto]) => (
        <span key={texto}>{texto}</span>
      ))}
      {columnas.map(([texto, valor]) => (
        <strong key={texto}>{formatearPesos(valor)}</strong>
      ))}
    </div>
  );
}

/**
 * Propiedades de {@link InsigniaEstado}.
 */
interface PropiedadesInsigniaEstado {
  /** Estado de la factura. */
  estado: 'activa' | 'anulada';
  /** Versión vigente. */
  version: number;
}

/**
 * Insignia «Activa · versión N» o «ANULADA · versión N».
 *
 * @param props - Propiedades del componente.
 * @returns La insignia.
 */
export function InsigniaEstado({ estado, version }: PropiedadesInsigniaEstado): ReactNode {
  return (
    <span className="texto-tenue">
      {estado === 'activa' ? (
        <span className="etiqueta etiqueta--activo">Activa</span>
      ) : (
        <span className="etiqueta etiqueta--error">ANULADA</span>
      )}{' '}
      · versión {version}
    </span>
  );
}

/**
 * Texto de la condición de una factura de cliente.
 *
 * @param factura - Condición, plazo, vencimiento y forma de pago.
 * @param factura.condicion - Contado o crédito.
 * @param factura.plazoDias - Plazo en días.
 * @param factura.vence - Vencimiento `AAAA-MM-DD`.
 * @param factura.formaPagoNombre - Forma de pago del contado.
 * @returns Texto como «Crédito, 8 días · vence 10/10/2026» o «Contado · Efectivo».
 */
export function textoCondicionVenta(factura: {
  condicion: 'contado' | 'credito';
  plazoDias: number;
  vence: string;
  formaPagoNombre: string | null;
}): string {
  if (factura.condicion === 'contado') {
    return `Contado${factura.formaPagoNombre ? ` · ${factura.formaPagoNombre}` : ''}`;
  }
  return `Crédito, ${factura.plazoDias} días · vence ${formatearFecha(factura.vence)}`;
}

/**
 * Texto de la condición de una factura de proveedor.
 *
 * @param compra - Plazo, vencimiento y abono automático de contado.
 * @param compra.plazoDias - Plazo en días.
 * @param compra.vence - Vencimiento `AAAA-MM-DD`.
 * @param compra.abonoContado - Abono automático si fue «Pagada de contado».
 * @returns Texto como «Pagada de contado (abono 12)» o «Crédito, 30 días · vence 28/10/2026».
 */
export function textoCondicionCompra(compra: {
  plazoDias: number;
  vence: string;
  abonoContado: { numero: number } | null;
}): string {
  if (compra.abonoContado) {
    return `Pagada de contado (abono ${compra.abonoContado.numero})`;
  }
  return `Crédito, ${compra.plazoDias} días · vence ${formatearFecha(compra.vence)}`;
}

/**
 * Describe los movimientos de inventario que hará una operación, para la
 * nota «Inventario al guardar».
 *
 * @param movimientos - Movimientos por producto (positivo entra, negativo sale).
 * @param productos - Productos de la factura, por código.
 * @param bodega - Nombre de la bodega.
 * @returns Frases como «vuelven 2 UND de 231 PAPA FRANCESA a Principal», o vacío.
 *
 * @example
 * textosInventario([{ productoCodigo: 231, cantidad: 2000, costoUnitario: 12292 }], productos, 'Principal');
 * // ['vuelven 2 UND de 231 PAPA FRANCESA a Principal']
 */
export function textosInventario(
  movimientos: readonly MovimientoCorreccion[],
  productos: ReadonlyMap<number, ProductoDeLinea>,
  bodega: string,
): string[] {
  return movimientos.map((m) => {
    const p = productos.get(m.productoCodigo);
    const unidad = p?.unidad ?? 'UND';
    const cantidad = `${formatearCantidad(Math.abs(m.cantidad), unidad)} ${unidad}`;
    const nombre = `${m.productoCodigo} ${p?.nombre ?? ''}`.trim();
    return m.cantidad > 0
      ? `vuelven ${cantidad} de ${nombre} a ${bodega}`
      : `salen ${cantidad} de ${nombre} de ${bodega}`;
  });
}

/**
 * Propiedades de {@link TablaDevoluciones}.
 */
interface PropiedadesTablaDevoluciones {
  /** Devoluciones de la factura (activas y anuladas). */
  devoluciones: readonly DevolucionResumen[];
  /** Nombre del documento para el texto de la tabla vacía («factura» o «compra»). */
  documento: string;
  /** Pide anular una devolución, o `undefined` si no se permite desde aquí. */
  alAnular?: (devolucion: DevolucionResumen) => void;
}

/**
 * Lista de devoluciones de una factura con su estado y el botón «Anular…»
 * en las activas.
 *
 * @param props - Propiedades del componente.
 * @returns La tabla.
 */
export function TablaDevoluciones({
  devoluciones,
  documento,
  alAnular,
}: PropiedadesTablaDevoluciones): ReactNode {
  return (
    <div className="tabla-contenedor correccion__devoluciones">
      <table className="tabla">
        <thead>
          <tr>
            <th className="num">Devolución</th>
            <th className="num">Fecha</th>
            <th>Bodega</th>
            <th className="num">Total</th>
            <th>Motivo</th>
            <th>Estado</th>
            {alAnular && <th />}
          </tr>
        </thead>
        <tbody>
          {devoluciones.length === 0 && (
            <tr>
              <td className="tabla__vacia" colSpan={alAnular ? 7 : 6}>
                Esta {documento} no tiene devoluciones.
              </td>
            </tr>
          )}
          {devoluciones.map((d) => (
            <tr key={d.id} className={d.estado === 'anulada' ? 'fila--inactiva' : undefined}>
              <td className="num">{d.numero}</td>
              <td className="num">{formatearFechaHora(d.fecha)}</td>
              <td>{d.bodegaNombre}</td>
              <td className="num">{agruparMiles(d.total)}</td>
              <td>{d.motivo || '—'}</td>
              <td className={d.estado === 'anulada' ? 'estado-anulado' : undefined}>
                {d.estado === 'anulada' ? 'ANULADA' : 'Activa'}
              </td>
              {alAnular && (
                <td className="num">
                  {d.estado === 'activa' && (
                    <button type="button" className="boton" onClick={() => alAnular(d)}>
                      Anular…
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Texto de un reintegro de una venta de contado.
 *
 * @param r - Reintegro registrado.
 * @returns Frase para los diálogos y avisos.
 */
export function textoReintegro(r: ReintegroGenerado): string {
  return r.sentido === 'entrega'
    ? `Se registró el reintegro ${r.numero}: se le devuelven ${formatearPesos(r.valor)} al cliente en ${r.formaPagoNombre}.`
    : `Se registró el reintegro ${r.numero}: se le cobran ${formatearPesos(r.valor)} al cliente en ${r.formaPagoNombre}.`;
}

/**
 * Texto del movimiento de saldo a favor de una operación ya guardada.
 *
 * @param movimiento - Positivo: se generó; negativo: se recuperó.
 * @param tercero - Nombre del cliente o proveedor.
 * @returns Frase para el diálogo de guardado, o `null` si no hubo movimiento.
 */
export function textoMovimientoFavor(movimiento: number, tercero: string): string | null {
  if (movimiento > 0) return `Quedaron ${formatearPesos(movimiento)} a favor de ${tercero}.`;
  if (movimiento < 0) {
    return `La factura recuperó ${formatearPesos(-movimiento)} del saldo a favor de ${tercero}.`;
  }
  return null;
}
