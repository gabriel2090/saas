import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION } from '../../domain/abonos';
import { leerPorcentaje, textoPorcentaje, type LineaCompraCalculada } from '../../domain/compras';
import {
  anularCompra,
  corregirCompra,
  type Anulacion,
  type CorreccionCompra,
  type SituacionCosto,
} from '../../domain/correcciones';
import { ErrorDeNegocio } from '../../domain/errores';
import type { DescuentoCompra } from '../../shared/compras';
import type {
  CambioLineaCompraPedido,
  CorreccionGuardada,
  FacturaProveedorParaCorregir,
  LineaCompraDeFactura,
} from '../../shared/correcciones';
import { formatearCantidad, leerCantidad } from '../../shared/formato/cantidades';
import { formatearFecha } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import { ATAJOS } from '../../shared/keymap';
import type { EscalaPrecio } from '../../shared/maestros';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { DialogoGuardado } from '../documentos/DialogoGuardado';
import { DialogoMotivo } from '../documentos/DialogoMotivo';
import { usePedidoFactura } from '../documentos/pedidosVentana';
import {
  InsigniaEstado,
  RecuadroCartera,
  textoCondicionCompra,
  textoMovimientoFavor,
  textosInventario,
} from '../documentos/piezasCorreccion';
import { useCandado } from '../documentos/useCandado';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Cantidad y costo escritos de una línea.
 */
interface EdicionLinea {
  /** Cantidad escrita. */
  cantidad: string;
  /** Costo unitario escrito. */
  costo: string;
}

/**
 * Lo escrito en la corrección de la compra.
 */
interface EdicionCompra {
  /** Cantidad y costo por renglón. */
  lineas: Record<number, EdicionLinea>;
  /** Flete escrito. */
  flete: string;
  /** Descuento escrito (en el modo con que se registró la compra). */
  descuento: string;
}

/**
 * Nombre de cada escala en los avisos.
 */
const NOMBRE_ESCALA: Readonly<Record<EscalaPrecio, string>> = {
  mayor: 'Mayor',
  menor: 'Menor',
  minimo: 'Mínimo',
};

/**
 * Edición inicial: lo que tiene la versión vigente.
 *
 * @param c - Compra.
 * @returns Lo escrito al cargar.
 */
function edicionInicial(c: FacturaProveedorParaCorregir): EdicionCompra {
  return {
    lineas: Object.fromEntries(
      c.lineas.map((l) => [
        l.renglon,
        {
          cantidad: formatearCantidad(l.cantidad, l.producto.unidad),
          costo: agruparMiles(l.costoUnitario),
        },
      ]),
    ),
    flete: agruparMiles(c.flete),
    descuento:
      c.descuento.modo === 'pesos'
        ? agruparMiles(c.descuento.valor)
        : textoPorcentaje(c.descuento.valor),
  };
}

/**
 * Situación del costo de cada producto, como la pide el dominio.
 *
 * @param c - Compra.
 * @returns Código → situación.
 */
function situaciones(c: FacturaProveedorParaCorregir): Map<number, SituacionCosto> {
  return new Map(
    c.costos.map((s) => [
      s.productoCodigo,
      { esUltima: s.esUltima, costoCompraAnterior: s.costoCompraAnterior },
    ]),
  );
}

/**
 * Resultado de leer la corrección escrita.
 */
interface LecturaCorreccion {
  /** Cambios de línea leídos (solo los que cambiaron). */
  cambios: CambioLineaCompraPedido[];
  /** Flete leído. */
  flete: number;
  /** Descuento leído. */
  descuento: DescuentoCompra;
  /** Corrección calculada, o `null` si no hay cambios o hay un error. */
  calculo: CorreccionCompra | null;
  /** Primer error para mostrar, o `null`. */
  error: string | null;
}

/**
 * Lee lo escrito y calcula la corrección con la misma regla que usa el
 * proceso principal (§9.1, D-126, D-127).
 *
 * @param c - Compra vigente.
 * @param e - Lo escrito.
 * @returns Cambios, cálculo y error.
 */
function leerCorreccion(c: FacturaProveedorParaCorregir, e: EdicionCompra): LecturaCorreccion {
  const base = { cambios: [], flete: c.flete, descuento: c.descuento, calculo: null };
  const cambios: CambioLineaCompraPedido[] = [];
  for (const l of c.lineas) {
    const escrito = e.lineas[l.renglon];
    if (!escrito) continue;
    const texto = `Línea ${l.renglon} (${l.producto.codigo} - ${l.producto.nombre})`;
    const cantidad =
      escrito.cantidad.trim() === '' ? 0 : leerCantidad(escrito.cantidad, l.producto.unidad);
    if (cantidad === null) {
      return {
        ...base,
        error:
          l.producto.unidad === 'UND'
            ? `${texto}: la cantidad debe ser un número entero de unidades (0 quita la línea).`
            : `${texto}: la cantidad no es válida; use hasta tres decimales con punto (12.5).`,
      };
    }
    const costo = leerPesos(escrito.costo);
    if (costo === null) {
      return {
        ...base,
        error: `${texto}: el costo no es un valor válido en pesos (por ejemplo 13,200).`,
      };
    }
    if (cantidad !== l.cantidad || costo !== l.costoUnitario) {
      cambios.push({ renglon: l.renglon, cantidad, costoUnitario: costo });
    }
  }
  const flete = e.flete.trim() === '' ? 0 : leerPesos(e.flete);
  if (flete === null) {
    return { ...base, error: 'El flete no es un valor válido en pesos (por ejemplo 30,000).' };
  }
  const valorDescuento =
    e.descuento.trim() === ''
      ? 0
      : c.descuento.modo === 'pesos'
        ? leerPesos(e.descuento)
        : leerPorcentaje(e.descuento);
  if (valorDescuento === null) {
    return {
      ...base,
      error:
        c.descuento.modo === 'pesos'
          ? 'El descuento no es un valor válido en pesos (por ejemplo 20,000).'
          : 'El porcentaje de descuento no es válido: hasta dos decimales con punto (2.5).',
    };
  }
  const descuento: DescuentoCompra = { modo: c.descuento.modo, valor: valorDescuento };
  if (cambios.length === 0 && flete === c.flete && valorDescuento === c.descuento.valor) {
    return { cambios, flete, descuento, calculo: null, error: null };
  }
  try {
    const calculo = corregirCompra({
      proveedorCodigo: c.tercero.codigo,
      lineas: c.lineas,
      cambios,
      fleteAnterior: c.flete,
      flete,
      fleteProveedor: c.fleteProveedor,
      descuentoAnterior: c.descuento,
      descuento,
      descuentoEnCosto: c.descuentoEnCosto,
      totalAnterior: c.cartera.total,
      costos: situaciones(c),
      cartera: {
        aplicado: c.cartera.aplicado,
        devuelto: c.cartera.devuelto,
        trasladado: c.cartera.trasladado,
        disponible: c.saldoFavor,
      },
    });
    return { cambios, flete, descuento, calculo, error: null };
  } catch (error) {
    if (error instanceof ErrorDeNegocio) {
      return { cambios, flete, descuento, calculo: null, error: error.message };
    }
    throw error;
  }
}

/**
 * Por qué no se puede corregir la compra, o `null` si se puede.
 *
 * @param c - Compra.
 * @returns Razón y qué hacer.
 */
function razonNoCorregible(c: FacturaProveedorParaCorregir): string | null {
  if (c.estado === 'anulada') {
    return `La compra ${c.numero} está anulada${c.motivoAnulacion ? ` (${c.motivoAnulacion})` : ''}: ya no se corrige. Si la compra sí se hizo, regístrela de nuevo en Factura de proveedor.`;
  }
  if (c.origen === 'saldo_inicial') {
    return `La compra ${c.numero} es un saldo inicial importado: no tiene productos que corregir. Si el saldo está mal, anúlela con ${textoCombinacion(ATAJOS.anularFactura.combinacion)}.`;
  }
  const activas = c.devoluciones.filter((d) => d.estado === 'activa').length;
  if (activas > 0) {
    return `La compra ${c.numero} tiene devoluciones activas (${activas}): no se puede corregirla ni anularla mientras existan. Anúlelas en Devolución de compra y vuelva a intentarlo.`;
  }
  return null;
}

/**
 * Datos del diálogo de anulación de una compra.
 */
interface DatosAnular {
  /** Cálculo de la anulación. */
  anulacion: Anulacion;
  /** Avisos de stock negativo por producto. */
  negativos: string[];
}

/**
 * Datos del diálogo «Compra N corregida».
 */
interface DatosGuardada {
  /** Respuesta del proceso principal. */
  respuesta: CorreccionGuardada;
  /** Frases de inventario calculadas antes de guardar. */
  inventario: string[];
}

/**
 * Ventana «Corrección de factura de proveedor» (§9.1): se busca la compra
 * por su número interno o por la factura del proveedor y se corrigen
 * cantidades, costos, flete y descuento (Av. Pág guarda una versión nueva).
 * El costo del producto cambia solo si es su última compra (D-126). Ctrl+X
 * anula la compra.
 *
 * @returns La ventana.
 */
export function CorreccionProveedor(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const conCandado = useCandado();
  const [texto, setTexto] = useState('');
  const [compra, setCompra] = useState<FacturaProveedorParaCorregir | null>(null);
  const [edicion, setEdicion] = useState<EdicionCompra | null>(null);
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState<DatosAnular | null>(null);
  const [guardada, setGuardada] = useState<DatosGuardada | null>(null);
  const campoNumero = useRef<HTMLInputElement>(null);
  const tabla = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    campoNumero.current?.focus();
  }, []);

  const razon = compra ? razonNoCorregible(compra) : null;
  const lectura = compra && edicion && razon === null ? leerCorreccion(compra, edicion) : null;
  const conCambios = lectura?.calculo != null || motivo.trim() !== '';

  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  const cargar = async (buscado: string): Promise<FacturaProveedorParaCorregir | null> => {
    if (buscado.trim() === '') {
      setAviso({
        tipo: 'error',
        texto: 'Escriba la «Compra No.» o el número de la factura del proveedor y pulse Enter.',
      });
      return null;
    }
    const r = await invocar('correcciones:buscarCompra', buscado);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setCompra(r.datos);
    setTexto(String(r.datos.numero));
    setEdicion(edicionInicial(r.datos));
    setMotivo('');
    window.setTimeout(() => tabla.current?.querySelector('input')?.focus(), 0);
    return r.datos;
  };

  const buscar = async (buscado: string): Promise<void> => {
    if (
      conCambios &&
      !(await confirmar({
        titulo: 'Descartar la corrección',
        mensaje: 'Se perderán los cambios escritos en esta compra. ¿Desea continuar?',
        textoAceptar: 'Descartar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }))
    ) {
      return;
    }
    setAviso(null);
    await cargar(buscado);
  };

  usePedidoFactura('correccion-proveedor', (numero) => void buscar(numero));

  const pedirAnular = async (): Promise<void> => {
    if (!compra) {
      setAviso({
        tipo: 'error',
        texto: 'Escriba primero la «Compra No.» o la factura del proveedor y pulse Enter.',
      });
      return;
    }
    if (compra.estado === 'anulada') {
      setAviso({ tipo: 'error', texto: `La compra ${compra.numero} ya está anulada.` });
      return;
    }
    const activas = compra.devoluciones.filter((d) => d.estado === 'activa').length;
    if (activas > 0) {
      setAviso({
        tipo: 'error',
        texto: `La compra ${compra.numero} tiene devoluciones activas (${activas}): no se puede anularla mientras existan. Anúlelas en Devolución de compra y vuelva a intentarlo.`,
      });
      return;
    }
    const contado = compra.abonos.find((a) => a.origen === 'contado' && a.estado === 'activo');
    let anulacion: Anulacion;
    try {
      anulacion = anularCompra(
        compra.lineas,
        {
          aplicadoQueda: compra.cartera.aplicado - (contado?.valor ?? 0),
          trasladado: compra.cartera.trasladado,
          disponible: compra.saldoFavor,
        },
        situaciones(compra),
      );
    } catch (error) {
      if (error instanceof ErrorDeNegocio) {
        setAviso({ tipo: 'error', texto: error.message });
        return;
      }
      throw error;
    }
    const negativos: string[] = [];
    if (anulacion.movimientos.length > 0) {
      const stock = await invocar('compras:stockBodega', compra.bodegaId);
      if (stock.ok) {
        const mapa = new Map(stock.datos.map((s) => [s.productoCodigo, s.cantidad]));
        const productos = new Map(compra.lineas.map((l) => [l.producto.codigo, l.producto]));
        for (const m of anulacion.movimientos) {
          const queda = (mapa.get(m.productoCodigo) ?? 0) + m.cantidad;
          const p = productos.get(m.productoCodigo);
          if (queda < 0 && p) {
            negativos.push(
              `${p.codigo} quedaría en −${formatearCantidad(-queda, p.unidad)} ${p.unidad} (ya se vendió parte); se permite, como en los ajustes.`,
            );
          }
        }
      }
    }
    setAviso(null);
    setAnulando({ anulacion, negativos });
  };

  const anular = async (motivoAnulacion: string): Promise<string | null> => {
    if (!compra) return null;
    const r = await invocar('correcciones:anular', {
      tipo: 'proveedor',
      facturaId: compra.id,
      version: compra.version,
      motivo: motivoAnulacion,
    });
    if (!r.ok) return r.error.mensaje;
    setAnulando(null);
    await cargar(String(compra.numero));
    const partes = [
      `Compra ${r.datos.numero} anulada.`,
      r.datos.abonoContadoAnulado === null
        ? null
        : `Se anuló con ella el abono ${r.datos.abonoContadoAnulado} de contado.`,
      textoMovimientoFavor(r.datos.movimientoFavor, compra.tercero.nombre),
      ...r.datos.costos.map(
        (c) =>
          `El costo de ${c.productoCodigo} volvió de ${formatearPesos(c.anterior)} a ${formatearPesos(c.nuevo)}.`,
      ),
    ];
    setAviso({ tipo: 'exito', texto: partes.filter((p) => p !== null).join(' ') });
    return null;
  };

  const guardar = async (): Promise<void> => {
    if (!compra || !lectura) {
      if (razon) setAviso({ tipo: 'error', texto: razon });
      return;
    }
    if (lectura.error) {
      setAviso({ tipo: 'error', texto: lectura.error });
      return;
    }
    if (!lectura.calculo) {
      setAviso({
        tipo: 'error',
        texto:
          'No hay cambios que guardar: la compra quedaría igual. Cambie una cantidad, un costo, el flete o el descuento, o cierre la ventana.',
      });
      return;
    }
    const inventario = textosInventario(
      lectura.calculo.movimientos,
      new Map(compra.lineas.map((l) => [l.producto.codigo, l.producto])),
      compra.bodegaNombre,
    );
    setOcupado(true);
    const r = await invocar('correcciones:corregirCompra', {
      facturaId: compra.id,
      version: compra.version,
      cambios: lectura.cambios,
      flete: lectura.flete,
      descuento: lectura.descuento,
      motivo,
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    setGuardada({ respuesta: r.datos, inventario });
    setAviso(null);
  };

  const cerrarGuardada = (): void => {
    const numero = guardada?.respuesta.numero;
    setGuardada(null);
    if (numero !== undefined) void cargar(String(numero));
  };

  const hayDialogo = anulando !== null || guardada !== null;
  useAtajos(
    {
      anularFactura: () => void pedirAnular(),
      guardarCorreccion: () => void conCandado(guardar),
    },
    { activo: activa && !hayDialogo },
  );

  const calculo = lectura?.calculo ?? null;
  const porRenglon = new Map<number, LineaCompraCalculada>();
  calculo?.renglonesAnteriores.forEach((renglon, i) => {
    const l = calculo.calculo.lineas[i];
    if (l) porRenglon.set(renglon, l);
  });
  const productos = new Map(compra?.lineas.map((l) => [l.producto.codigo, l.producto]) ?? []);

  return (
    <div className="documento documento--lineas">
      <div className="barra-herramientas">
        <label className="correccion__numero">
          Compra No.
          <input
            ref={campoNumero}
            value={texto}
            aria-label="Compra No. o factura del proveedor"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar(texto);
              }
            }}
          />
          <span className="texto-tenue">o factura del proveedor</span>
        </label>
        <span className="barra-herramientas__separador" />
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={ocupado}
          onClick={() => void conCandado(guardar)}
        >
          Guardar corrección
          <span className="atajo">{textoCombinacion(ATAJOS.guardarCorreccion.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={() => void pedirAnular()}>
          Anular compra
          <span className="atajo">{textoCombinacion(ATAJOS.anularFactura.combinacion)}</span>
        </button>
        <span className="correccion__version">
          {compra &&
            (razon === null ? (
              <span className="texto-tenue">
                Versión vigente: {compra.version} · se guardará como versión {compra.version + 1}
              </span>
            ) : (
              <InsigniaEstado estado={compra.estado} version={compra.version} />
            ))}
        </span>
      </div>

      {compra && (
        <div className="correccion__encabezado">
          <label className="campo">
            <span>Proveedor</span>
            <input
              readOnly
              tabIndex={-1}
              value={`${compra.tercero.codigo} - ${compra.tercero.nombre} · ${compra.tercero.identificacion}`}
            />
          </label>
          <label className="campo">
            <span>Factura del proveedor</span>
            <input readOnly tabIndex={-1} value={compra.numeroProveedor} />
          </label>
          <label className="campo">
            <span>Fecha</span>
            <input readOnly tabIndex={-1} value={formatearFecha(compra.fecha)} />
          </label>
          <label className="campo campo--ancho">
            <span>Condición</span>
            <input readOnly tabIndex={-1} value={textoCondicionCompra(compra)} />
          </label>
          <label className="campo">
            <span>Bodega</span>
            <input readOnly tabIndex={-1} value={compra.bodegaNombre} />
          </label>
          <RecuadroCartera cartera={compra.cartera} textoPagado="Pagado" />
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {razon && <Aviso tipo="alerta">{razon}</Aviso>}

      {!compra && (
        <p className="correccion__nota">
          Escriba la «Compra No.» o el número de la factura del proveedor y pulse Enter. Podrá
          corregir cantidades, costos, flete y descuento (
          {textoCombinacion(ATAJOS.guardarCorreccion.combinacion)} guarda) o anular la compra (
          {textoCombinacion(ATAJOS.anularFactura.combinacion)}).
        </p>
      )}

      {compra && edicion && (
        <>
          <div className="tabla-contenedor documento__lineas">
            <table className="tabla tabla--precios">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th className="num">Código</th>
                  <th>Producto</th>
                  <th>Und</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Costo unitario</th>
                  <th className="num">Total</th>
                  <th className="num">Flete</th>
                  <th className="num">Costo nuevo</th>
                  <th className="num">Costo del producto</th>
                </tr>
              </thead>
              <tbody ref={tabla}>
                {compra.lineas.length === 0 && (
                  <tr>
                    <td className="tabla__vacia" colSpan={10}>
                      Saldo inicial importado: no tiene productos.
                    </td>
                  </tr>
                )}
                {compra.lineas.map((l) => (
                  <FilaCorreccionCompra
                    key={l.renglon}
                    linea={l}
                    edicion={edicion.lineas[l.renglon] ?? { cantidad: '', costo: '' }}
                    calculada={calculo ? (porRenglon.get(l.renglon) ?? null) : undefined}
                    correccion={calculo}
                    editable={razon === null}
                    alCambiar={(cambios) => {
                      setEdicion((actual) =>
                        actual
                          ? {
                              ...actual,
                              lineas: {
                                ...actual.lineas,
                                [l.renglon]: {
                                  ...(actual.lineas[l.renglon] ?? { cantidad: '', costo: '' }),
                                  ...cambios,
                                },
                              },
                            }
                          : actual,
                      );
                      setAviso(null);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="documento__pie">
            <div className="documento__avisos">
              {lectura?.error && <Aviso tipo="error">{lectura.error}</Aviso>}
              {calculo && (
                <p className="nota-inventario">
                  {calculo.movimientos.length > 0
                    ? `Inventario al guardar: ${textosInventario(calculo.movimientos, productos, compra.bodegaNombre).join('; ')} (movimiento de corrección).`
                    : 'Inventario al guardar: sin cambios.'}
                </p>
              )}
              {calculo && <AvisosCostos compra={compra} calculo={calculo} />}
              {calculo && <AvisoEfectoCompra compra={compra} calculo={calculo} />}
              {razon === null && (
                <label className="campo">
                  <span>Motivo de la corrección (opcional)</span>
                  <input
                    value={motivo}
                    maxLength={LARGO_MAXIMO_OBSERVACION}
                    placeholder="Por ejemplo: llegaron 48 cajas y el queso se facturó a 17,900"
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
              )}
            </div>
            <table className="totales">
              <tbody>
                <tr>
                  <th>
                    Flete
                    {compra.fleteProveedor
                      ? ' (lo cobra el proveedor)'
                      : ' (se reparte en el costo)'}
                  </th>
                  <td>
                    <input
                      value={edicion.flete}
                      inputMode="numeric"
                      aria-label="Flete"
                      disabled={razon !== null}
                      onChange={(e) => {
                        setEdicion({ ...edicion, flete: e.target.value });
                        setAviso(null);
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Descuento{compra.descuento.modo === 'porcentaje' ? ' (%)' : ''}</th>
                  <td>
                    <input
                      value={edicion.descuento}
                      inputMode="decimal"
                      aria-label="Descuento"
                      disabled={razon !== null}
                      onChange={(e) => {
                        setEdicion({ ...edicion, descuento: e.target.value });
                        setAviso(null);
                      }}
                    />
                  </td>
                </tr>
                <tr>
                  <th>Total anterior</th>
                  <td className="num">{agruparMiles(compra.cartera.total)}</td>
                </tr>
                <tr className="totales__total">
                  <th>Total corregido</th>
                  <td className="num">
                    {formatearPesos(calculo?.calculo.total ?? compra.cartera.total)}
                  </td>
                </tr>
                <tr>
                  <th>Diferencia</th>
                  <td className={`num${(calculo?.diferencia ?? 0) < 0 ? ' texto-error' : ''}`}>
                    {(calculo?.diferencia ?? 0) < 0
                      ? `− ${agruparMiles(-(calculo?.diferencia ?? 0))}`
                      : agruparMiles(calculo?.diferencia ?? 0)}
                  </td>
                </tr>
                <tr>
                  <th>Ya pagado</th>
                  <td className="num">{agruparMiles(compra.cartera.aplicado)}</td>
                </tr>
                <tr>
                  <th>Saldo nuevo</th>
                  <td className="num">
                    {agruparMiles(calculo?.efecto.saldo ?? compra.cartera.saldo)}
                  </td>
                </tr>
                <tr className="totales__favor">
                  <th>Saldo a favor con el proveedor</th>
                  <td className="num">
                    {agruparMiles(Math.max(0, calculo?.efecto.movimientoFavor ?? 0))}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {anulando && compra && (
        <DialogoMotivo
          titulo={`¿Anular la compra ${compra.numero} (${compra.numeroProveedor} de ${compra.tercero.nombre})?`}
          textoAceptar="Anular compra"
          ejemploMotivo="la factura se registró dos veces"
          alAceptar={anular}
          alCancelar={() => setAnulando(null)}
        >
          <ExplicacionAnularCompra compra={compra} datos={anulando} />
        </DialogoMotivo>
      )}

      {guardada && (
        <DialogoGuardado
          titulo={`Compra ${guardada.respuesta.numero} corregida (versión ${guardada.respuesta.version})`}
          alCerrar={cerrarGuardada}
        >
          <p className="dialogo__mensaje">
            Total: {formatearPesos(guardada.respuesta.totalAnterior)} →{' '}
            <strong>{formatearPesos(guardada.respuesta.total)}</strong>.
          </p>
          <ul className="dialogo__lista">
            {guardada.inventario.map((t) => (
              <li key={t}>{t.charAt(0).toUpperCase() + t.slice(1)}.</li>
            ))}
            {guardada.respuesta.costos.map((c) => (
              <li key={c.productoCodigo}>
                El costo de {c.productoCodigo} pasó de {formatearPesos(c.anterior)} a{' '}
                {formatearPesos(c.nuevo)}.
              </li>
            ))}
            {[
              textoMovimientoFavor(
                guardada.respuesta.movimientoFavor,
                compra?.tercero.nombre ?? '',
              ),
            ]
              .filter((t) => t !== null)
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
        </DialogoGuardado>
      )}
    </div>
  );
}

/**
 * Propiedades de {@link FilaCorreccionCompra}.
 */
interface PropiedadesFilaCorreccionCompra {
  /** Línea vigente. */
  linea: LineaCompraDeFactura;
  /** Lo escrito en la línea. */
  edicion: EdicionLinea;
  /**
   * Cálculo nuevo de la línea: `undefined` si no hay cambios (se muestra lo
   * vigente) y `null` si la línea se quitó (cantidad 0).
   */
  calculada: LineaCompraCalculada | null | undefined;
  /** Corrección calculada, o `null`. */
  correccion: CorreccionCompra | null;
  /** Si se pueden editar cantidad y costo. */
  editable: boolean;
  /** Cambia cantidad o costo. */
  alCambiar: (cambios: Partial<EdicionLinea>) => void;
}

/**
 * Fila de la corrección de compra: cantidad y costo editables con el valor
 * anterior tachado, el total, el flete y el costo nuevo de la línea, y cómo
 * queda el costo del producto («12,292 → 12,311» o «(no cambia)»).
 *
 * @param props - Propiedades del componente.
 * @returns La fila.
 */
function FilaCorreccionCompra({
  linea,
  edicion,
  calculada,
  correccion,
  editable,
  alCambiar,
}: PropiedadesFilaCorreccionCompra): ReactNode {
  const { producto } = linea;
  const cantidad =
    edicion.cantidad.trim() === '' ? 0 : leerCantidad(edicion.cantidad, producto.unidad);
  const costo = leerPesos(edicion.costo);
  const cambioCantidad = cantidad !== null && cantidad !== linea.cantidad;
  const cambioCosto = costo !== null && costo !== linea.costoUnitario;
  const total = calculada === undefined ? linea.total : (calculada?.total ?? 0);
  const flete = calculada === undefined ? linea.flete : (calculada?.flete ?? 0);
  const costoNuevo = calculada === undefined ? linea.costoNuevo : (calculada?.costoNuevo ?? 0);
  const cambioCostoProducto = correccion?.costos.find((c) => c.productoCodigo === producto.codigo);
  const revisar =
    cambioCostoProducto !== undefined &&
    escalasBajo(producto.precios, cambioCostoProducto.nuevo).length > 0;
  return (
    <tr className={revisar ? 'fila--alerta' : undefined}>
      <td className="num">{linea.renglon}</td>
      <td className="num">{producto.codigo}</td>
      <td>
        {producto.nombre}
        {revisar && <span className="etiqueta etiqueta--alerta">revisar precios</span>}
      </td>
      <td>{producto.unidad}</td>
      <td className="num">
        {cambioCantidad && (
          <span className="valor-anterior">
            {formatearCantidad(linea.cantidad, producto.unidad)}
          </span>
        )}
        <input
          className={cambioCantidad ? 'campo--cambiado' : undefined}
          value={edicion.cantidad}
          disabled={!editable}
          inputMode={producto.unidad === 'KG' ? 'decimal' : 'numeric'}
          aria-label={`Cantidad de la línea ${linea.renglon}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
        />
      </td>
      <td className="num">
        {cambioCosto && <span className="valor-anterior">{agruparMiles(linea.costoUnitario)}</span>}
        <input
          className={cambioCosto ? 'campo--cambiado' : undefined}
          value={edicion.costo}
          disabled={!editable}
          inputMode="numeric"
          aria-label={`Costo unitario de la línea ${linea.renglon}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => alCambiar({ costo: e.target.value })}
        />
      </td>
      <td className="num">
        {total !== linea.total && (
          <span className="valor-anterior">{agruparMiles(linea.total)}</span>
        )}
        {agruparMiles(total)}
      </td>
      <td className="num texto-tenue">{agruparMiles(flete)}</td>
      <td className="num">
        {costoNuevo !== linea.costoNuevo && (
          <span className="valor-anterior">{agruparMiles(linea.costoNuevo)}</span>
        )}
        {calculada === null ? '—' : agruparMiles(costoNuevo)}
      </td>
      <td className="num">
        {cambioCostoProducto ? (
          <>
            {agruparMiles(cambioCostoProducto.anterior)} →{' '}
            <strong>{agruparMiles(cambioCostoProducto.nuevo)}</strong>
          </>
        ) : (
          <span className="texto-tenue">{agruparMiles(producto.costo)} (no cambia)</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Escalas cuyo precio queda por debajo de un costo.
 *
 * @param precios - Precios del producto.
 * @param costo - Costo a comparar.
 * @returns Escalas por debajo del costo.
 */
function escalasBajo(
  precios: Readonly<Record<EscalaPrecio, number>>,
  costo: number,
): EscalaPrecio[] {
  return (['mayor', 'menor', 'minimo'] as const).filter((e) => precios[e] < costo);
}

/**
 * Propiedades de {@link AvisosCostos}.
 */
interface PropiedadesAvisosCostos {
  /** Compra vigente. */
  compra: FacturaProveedorParaCorregir;
  /** Corrección calculada. */
  calculo: CorreccionCompra;
}

/**
 * Avisos ámbar sobre el costo de los productos: cuáles cambian (y si algún
 * precio queda por debajo), cuáles no cambian porque hay una compra
 * posterior, y los que vuelven al costo de la compra anterior.
 *
 * @param props - Propiedades del componente.
 * @returns Los avisos, o nada.
 */
function AvisosCostos({ compra, calculo }: PropiedadesAvisosCostos): ReactNode {
  const textos: string[] = [];
  const cambiados = new Set(calculo.costos.map((c) => c.productoCodigo));
  for (const c of calculo.costos) {
    const linea = compra.lineas.find((l) => l.producto.codigo === c.productoCodigo);
    if (!linea || !calculo.calculo.costosNuevos.has(c.productoCodigo)) continue;
    const bajo = escalasBajo(linea.producto.precios, c.nuevo);
    textos.push(
      `${c.productoCodigo}: esta compra es la última del producto, así que su costo pasa de ${formatearPesos(c.anterior)} a ${formatearPesos(c.nuevo)}` +
        (bajo.length > 0
          ? ` y el precio ${bajo.map((e) => `${NOMBRE_ESCALA[e]} (${formatearPesos(linea.producto.precios[e])})`).join(', ')} queda por debajo: revise los precios en Productos.`
          : '.'),
    );
  }
  for (const s of compra.costos) {
    if (cambiados.has(s.productoCodigo) || !s.compraPosterior) continue;
    const linea = compra.lineas.find((l) => l.producto.codigo === s.productoCodigo);
    textos.push(
      `${s.productoCodigo}: hubo una compra posterior (No. ${s.compraPosterior.numero}, ${formatearFecha(s.compraPosterior.fecha)}); el costo del producto se queda en ${formatearPesos(linea?.producto.costo ?? 0)}.`,
    );
  }
  textos.push(...calculo.avisos);
  if (textos.length === 0) return null;
  return (
    <Aviso tipo="alerta">
      {textos.map((t) => (
        <span key={t} className="aviso__linea">
          {t}
        </span>
      ))}
    </Aviso>
  );
}

/**
 * Propiedades de {@link AvisoEfectoCompra}.
 */
interface PropiedadesAvisoEfectoCompra {
  /** Compra vigente. */
  compra: FacturaProveedorParaCorregir;
  /** Corrección calculada. */
  calculo: CorreccionCompra;
}

/**
 * Aviso del efecto en el saldo a favor con el proveedor.
 *
 * @param props - Propiedades del componente.
 * @returns El aviso, o nada.
 */
function AvisoEfectoCompra({ compra, calculo }: PropiedadesAvisoEfectoCompra): ReactNode {
  const { movimientoFavor } = calculo.efecto;
  if (movimientoFavor > 0) {
    return (
      <Aviso tipo="exito">
        Se pagó {formatearPesos(compra.cartera.aplicado)} y la compra corregida suma{' '}
        {formatearPesos(calculo.calculo.total)}: quedan{' '}
        <strong>{formatearPesos(movimientoFavor)} a favor</strong> con {compra.tercero.nombre}, para
        descontar en el próximo abono (forma «Saldo a favor») o registrar como devuelto por el
        proveedor.
      </Aviso>
    );
  }
  if (movimientoFavor < 0) {
    return (
      <Aviso tipo="alerta">
        La compra recupera {formatearPesos(-movimientoFavor)} del saldo a favor que había dejado con{' '}
        {compra.tercero.nombre}.
      </Aviso>
    );
  }
  return null;
}

/**
 * Propiedades de {@link ExplicacionAnularCompra}.
 */
interface PropiedadesExplicacionAnularCompra {
  /** Compra a anular. */
  compra: FacturaProveedorParaCorregir;
  /** Cálculo de la anulación y stock negativo. */
  datos: DatosAnular;
}

/**
 * Explicación del diálogo de anulación de una compra: qué sale del
 * inventario (y si queda negativo), qué deja de deberse, qué pasa con lo
 * pagado y qué costos vuelven.
 *
 * @param props - Propiedades del componente.
 * @returns El texto del diálogo.
 */
function ExplicacionAnularCompra({ compra, datos }: PropiedadesExplicacionAnularCompra): ReactNode {
  const { anulacion, negativos } = datos;
  const contado = compra.abonos.find((a) => a.origen === 'contado' && a.estado === 'activo');
  const manuales = compra.abonos
    .filter((a) => a.origen === 'manual' && a.estado === 'activo')
    .map((a) => a.numero);
  const favor = anulacion.efecto.tipo === 'credito' ? anulacion.efecto.movimientoFavor : 0;
  const productos = compra.lineas
    .map(
      (l) =>
        `${formatearCantidad(l.cantidad, l.producto.unidad)} ${l.producto.unidad} de ${l.producto.codigo}`,
    )
    .join(', ');
  const textoAbonos =
    manuales.length === 1 ? `abono ${manuales[0] ?? ''}` : `abonos ${manuales.join(', ')}`;
  return (
    <>
      <p className="dialogo__mensaje">
        La compra conserva su número y queda marcada como <strong>ANULADA</strong>; no se puede
        deshacer. Al anularla:
      </p>
      <ul className="dialogo__lista">
        {compra.lineas.length > 0 && (
          <li>
            Salen de {compra.bodegaNombre} {productos} (total de la compra{' '}
            {formatearPesos(compra.cartera.total)}).
            {negativos.map((n) => (
              <span key={n} className="texto-alerta">
                {' '}
                {n}
              </span>
            ))}
          </li>
        )}
        {compra.cartera.saldo > 0 && (
          <li>Su saldo ({formatearPesos(compra.cartera.saldo)}) deja de deberse.</li>
        )}
        {contado && <li>Su abono automático de contado ({contado.numero}) se anula con ella.</li>}
        {favor > 0 && (
          <li>
            Lo abonado ({formatearPesos(favor)}, {textoAbonos}) queda como{' '}
            <strong>saldo a favor</strong> con {compra.tercero.nombre}.{' '}
            {manuales.length === 1
              ? `El ${textoAbonos} no se toca.`
              : `Los ${textoAbonos} no se tocan.`}
          </li>
        )}
        {favor < 0 && (
          <li>
            La compra había dejado saldo a favor: se descuentan {formatearPesos(-favor)} del saldo a
            favor con {compra.tercero.nombre}.
          </li>
        )}
        {anulacion.avisos.map((t) => (
          <li key={t} className="texto-alerta">
            {t}
          </li>
        ))}
        {compra.costos
          .filter((s) => s.compraPosterior !== null)
          .map((s) => (
            <li key={s.productoCodigo}>
              {s.productoCodigo}: hubo una compra posterior; su costo no cambia.
            </li>
          ))}
      </ul>
    </>
  );
}
