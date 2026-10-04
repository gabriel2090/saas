import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION } from '../../domain/abonos';
import { anularVenta, corregirVenta, type CorreccionVenta } from '../../domain/correcciones';
import { ErrorDeNegocio } from '../../domain/errores';
import type {
  CambioLineaVentaPedido,
  CorreccionGuardada,
  FacturaClienteParaCorregir,
  LineaVentaDeFactura,
} from '../../shared/correcciones';
import { formatearCantidad, leerCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import { ATAJOS } from '../../shared/keymap';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { DialogoGuardado } from '../documentos/DialogoGuardado';
import { DialogoMotivo } from '../documentos/DialogoMotivo';
import { pedirFactura, usePedidoFactura } from '../documentos/pedidosVentana';
import {
  InsigniaEstado,
  RecuadroCartera,
  textoCondicionVenta,
  textoMovimientoFavor,
  textoReintegro,
  textosInventario,
} from '../documentos/piezasCorreccion';
import { useCandado } from '../documentos/useCandado';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';
import { useVentanas } from '../ventanas/ProveedorVentanas';

/**
 * Cantidad y precio escritos de una línea en la vista discriminada.
 */
interface EdicionLinea {
  /** Cantidad escrita. */
  cantidad: string;
  /** Precio escrito. */
  precio: string;
}

/**
 * Nombre de cada escala para la columna «Escala».
 */
const NOMBRE_ESCALA = { mayor: 'Mayor', menor: 'Menor', minimo: 'Mínimo' } as const;

/**
 * Edición inicial de las líneas: lo que tiene la versión vigente.
 *
 * @param lineas - Líneas de la factura.
 * @returns Cantidad y precio escritos por renglón.
 */
function edicionInicial(lineas: readonly LineaVentaDeFactura[]): Record<number, EdicionLinea> {
  return Object.fromEntries(
    lineas.map((l) => [
      l.renglon,
      {
        cantidad: formatearCantidad(l.cantidad, l.producto.unidad),
        precio: agruparMiles(l.precio),
      },
    ]),
  );
}

/**
 * Resultado de leer la vista discriminada.
 */
interface LecturaCorreccion {
  /** Cambios leídos (solo las líneas que cambiaron). */
  cambios: CambioLineaVentaPedido[];
  /** Corrección calculada con el dominio, o `null` si no hay cambios o hay un error. */
  calculo: CorreccionVenta | null;
  /** Primer error para mostrar, o `null`. */
  error: string | null;
}

/**
 * Lee lo escrito y calcula la corrección con la misma regla que usa el
 * proceso principal al guardar (§9.1, D-127).
 *
 * @param factura - Factura vigente.
 * @param edicion - Cantidad y precio escritos por renglón.
 * @returns Cambios, cálculo y error.
 */
function leerCorreccion(
  factura: FacturaClienteParaCorregir,
  edicion: Readonly<Record<number, EdicionLinea>>,
): LecturaCorreccion {
  const cambios: CambioLineaVentaPedido[] = [];
  for (const l of factura.lineas) {
    const e = edicion[l.renglon];
    if (!e) continue;
    const texto = `Línea ${l.renglon} (${l.producto.codigo} - ${l.producto.nombre})`;
    const cantidad = e.cantidad.trim() === '' ? 0 : leerCantidad(e.cantidad, l.producto.unidad);
    if (cantidad === null) {
      return {
        cambios: [],
        calculo: null,
        error:
          l.producto.unidad === 'UND'
            ? `${texto}: la cantidad debe ser un número entero de unidades (0 quita la línea).`
            : `${texto}: la cantidad no es válida; use hasta tres decimales con punto (12.5).`,
      };
    }
    const precio = leerPesos(e.precio);
    if (precio === null) {
      return {
        cambios: [],
        calculo: null,
        error: `${texto}: el precio no es un valor válido en pesos (por ejemplo 14,500).`,
      };
    }
    if (cantidad !== l.cantidad || precio !== l.precio) {
      cambios.push({ renglon: l.renglon, cantidad, precio });
    }
  }
  if (cambios.length === 0) return { cambios, calculo: null, error: null };
  try {
    const calculo = corregirVenta({
      lineas: factura.lineas,
      cambios,
      condicion: factura.condicion,
      cartera: {
        aplicado: factura.cartera.aplicado,
        devuelto: factura.cartera.devuelto,
        trasladado: factura.cartera.trasladado,
        disponible: factura.saldoFavor,
      },
    });
    return { cambios, calculo, error: null };
  } catch (error) {
    if (error instanceof ErrorDeNegocio) return { cambios, calculo: null, error: error.message };
    throw error;
  }
}

/**
 * Por qué no se puede corregir la factura, o `null` si se puede.
 *
 * @param f - Factura.
 * @returns Razón y qué hacer.
 */
function razonNoCorregible(f: FacturaClienteParaCorregir): string | null {
  if (f.estado === 'anulada') {
    return `La factura ${f.numero} está anulada: ya no se corrige. Si la venta sí se hizo, haga una factura nueva en Facturar.`;
  }
  if (f.origen === 'saldo_inicial') {
    return `La factura ${f.numero} es un saldo inicial importado: no tiene productos que corregir. Si el saldo está mal, anúlela con ${textoCombinacion(ATAJOS.anularFactura.combinacion)}.`;
  }
  const activas = f.devoluciones.filter((d) => d.estado === 'activa').length;
  if (activas > 0) {
    return `La factura ${f.numero} tiene devoluciones activas (${activas}): no se puede corregirla mientras existan. Anúlelas en «Devolución…» y vuelva a intentarlo.`;
  }
  return null;
}

/**
 * Por qué no se puede anular la factura, o `null` si se puede.
 *
 * @param f - Factura.
 * @returns Razón y qué hacer.
 */
function razonNoAnulable(f: FacturaClienteParaCorregir): string | null {
  if (f.estado === 'anulada') return `La factura ${f.numero} ya está anulada.`;
  const activas = f.devoluciones.filter((d) => d.estado === 'activa').length;
  if (activas > 0) {
    return `La factura ${f.numero} tiene devoluciones activas (${activas}): no se puede anularla mientras existan. Anúlelas en «Devolución…» y vuelva a intentarlo.`;
  }
  return null;
}

/**
 * Datos del diálogo «Factura N corregida».
 */
interface DatosGuardada {
  /** Respuesta del proceso principal. */
  respuesta: CorreccionGuardada;
  /** Frases de inventario calculadas antes de guardar. */
  inventario: string[];
}

/**
 * Ventana «Corrección de factura de cliente» (§9.1): se escribe el número
 * de la factura y aparece su resumen (abonos aplicados y versiones). Con
 * Ctrl+D se ve discriminada para corregir cantidades y precios (se guarda
 * como versión nueva con Av. Pág); Ctrl+X la anula; «Devolución…» abre la
 * devolución de venta con esa factura.
 *
 * @returns La ventana.
 */
export function CorreccionCliente(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const { abrir } = useVentanas();
  const confirmar = useConfirmar();
  const conCandado = useCandado();
  const [numero, setNumero] = useState('');
  const [factura, setFactura] = useState<FacturaClienteParaCorregir | null>(null);
  const [discriminada, setDiscriminada] = useState(false);
  const [edicion, setEdicion] = useState<Record<number, EdicionLinea>>({});
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [anulando, setAnulando] = useState(false);
  const [guardada, setGuardada] = useState<DatosGuardada | null>(null);
  const campoNumero = useRef<HTMLInputElement>(null);
  const tabla = useRef<HTMLTableSectionElement>(null);

  useEffect(() => {
    campoNumero.current?.focus();
  }, []);

  const lectura = factura && discriminada ? leerCorreccion(factura, edicion) : null;
  const conCambios = (lectura?.cambios.length ?? 0) > 0 || motivo.trim() !== '';

  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  /**
   * Carga una factura y vuelve al resumen.
   *
   * @param texto - Número escrito.
   * @returns La factura cargada, o `null` si no se pudo.
   */
  const cargar = async (texto: string): Promise<FacturaClienteParaCorregir | null> => {
    const limpio = texto.trim();
    if (!/^\d+$/.test(limpio)) {
      setAviso({
        tipo: 'error',
        texto: 'Escriba el número de la factura (solo dígitos) y pulse Enter.',
      });
      return null;
    }
    const r = await invocar('correcciones:buscarVenta', Number(limpio));
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setFactura(r.datos);
    setNumero(String(r.datos.numero));
    setDiscriminada(false);
    setEdicion(edicionInicial(r.datos.lineas));
    setMotivo('');
    return r.datos;
  };

  const buscar = async (texto: string): Promise<void> => {
    if (
      conCambios &&
      !(await confirmar({
        titulo: 'Descartar la corrección',
        mensaje: 'Se perderán los cambios escritos en esta factura. ¿Desea continuar?',
        textoAceptar: 'Descartar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }))
    ) {
      return;
    }
    setAviso(null);
    await cargar(texto);
  };

  usePedidoFactura('correccion-cliente', (texto) => void buscar(texto));

  const verDiscriminada = (): void => {
    if (!factura) {
      setAviso({ tipo: 'error', texto: 'Escriba primero el número de la factura y pulse Enter.' });
      return;
    }
    const razon = razonNoCorregible(factura);
    if (razon) {
      setAviso({ tipo: 'error', texto: razon });
      return;
    }
    setAviso(null);
    setDiscriminada(true);
    window.setTimeout(() => tabla.current?.querySelector('input')?.focus(), 0);
  };

  const pedirAnular = (): void => {
    if (!factura) {
      setAviso({ tipo: 'error', texto: 'Escriba primero el número de la factura y pulse Enter.' });
      return;
    }
    const razon = razonNoAnulable(factura);
    if (razon) {
      setAviso({ tipo: 'error', texto: razon });
      return;
    }
    try {
      // Calcula de antemano para avisar si el saldo a favor que dejó la factura ya se usó.
      anularVenta(factura.lineas, factura.condicion, factura.cartera.total, {
        aplicadoQueda: factura.cartera.aplicado,
        trasladado: factura.cartera.trasladado,
        disponible: factura.saldoFavor,
      });
    } catch (error) {
      if (error instanceof ErrorDeNegocio) {
        setAviso({ tipo: 'error', texto: error.message });
        return;
      }
      throw error;
    }
    setAviso(null);
    setAnulando(true);
  };

  const anular = async (motivoAnulacion: string): Promise<string | null> => {
    if (!factura) return null;
    const r = await invocar('correcciones:anular', {
      tipo: 'cliente',
      facturaId: factura.id,
      version: factura.version,
      motivo: motivoAnulacion,
    });
    if (!r.ok) return r.error.mensaje;
    setAnulando(false);
    await cargar(String(factura.numero));
    const partes = [
      `Factura ${r.datos.numero} anulada.`,
      textoMovimientoFavor(r.datos.movimientoFavor, factura.tercero.nombre),
      r.datos.reintegro ? textoReintegro(r.datos.reintegro) : null,
    ];
    setAviso({ tipo: 'exito', texto: partes.filter((p) => p !== null).join(' ') });
    return null;
  };

  const guardar = async (): Promise<void> => {
    if (!factura || !discriminada || !lectura) return;
    if (lectura.error) {
      setAviso({ tipo: 'error', texto: lectura.error });
      return;
    }
    if (!lectura.calculo) {
      setAviso({
        tipo: 'error',
        texto:
          'No hay cambios que guardar: la factura quedaría igual. Cambie una cantidad o un precio, o cierre la ventana.',
      });
      return;
    }
    const inventario = textosInventario(
      lectura.calculo.movimientos,
      new Map(factura.lineas.map((l) => [l.producto.codigo, l.producto])),
      factura.bodegaNombre,
    );
    setOcupado(true);
    const r = await invocar('correcciones:corregirVenta', {
      facturaId: factura.id,
      version: factura.version,
      cambios: lectura.cambios,
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
    const numeroFactura = guardada?.respuesta.numero;
    setGuardada(null);
    if (numeroFactura !== undefined) void cargar(String(numeroFactura));
  };

  const imprimirCorregida = async (): Promise<string | null> => {
    if (!guardada) return null;
    const r = await invocar('impresion:imprimir', {
      tipo: 'factura-cliente',
      id: guardada.respuesta.facturaId,
      reimpresion: false,
    });
    if (!r.ok) return r.error.mensaje;
    return r.datos ? null : 'La impresión se canceló. Puede intentarlo de nuevo.';
  };

  const abrirDevolucion = (): void => {
    if (!factura) {
      setAviso({ tipo: 'error', texto: 'Escriba primero el número de la factura y pulse Enter.' });
      return;
    }
    pedirFactura('devolucion-venta', String(factura.numero));
    abrir('devolucion-venta');
  };

  const hayDialogo = anulando || guardada !== null;
  useAtajos(
    {
      verDiscriminada,
      anularFactura: pedirAnular,
      guardarCorreccion: () => void conCandado(guardar),
    },
    { activo: activa && !hayDialogo },
  );

  const calculo = lectura?.calculo ?? null;

  return (
    <div className={`documento${discriminada ? ' documento--lineas' : ''}`}>
      <div className="barra-herramientas">
        <label className="correccion__numero">
          Factura No.
          <input
            ref={campoNumero}
            value={numero}
            inputMode="numeric"
            aria-label="Número de la factura"
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar(numero);
              }
            }}
          />
        </label>
        <span className="barra-herramientas__separador" />
        {discriminada ? (
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
        ) : (
          <button type="button" className="boton" tabIndex={-1} onClick={verDiscriminada}>
            Ver discriminada
            <span className="atajo">{textoCombinacion(ATAJOS.verDiscriminada.combinacion)}</span>
          </button>
        )}
        <button type="button" className="boton" tabIndex={-1} onClick={pedirAnular}>
          Anular factura
          <span className="atajo">{textoCombinacion(ATAJOS.anularFactura.combinacion)}</span>
        </button>
        {!discriminada && (
          <button type="button" className="boton" tabIndex={-1} onClick={abrirDevolucion}>
            Devolución…
          </button>
        )}
        <span className="correccion__version">
          {factura &&
            (discriminada ? (
              <span className="texto-tenue">
                Versión vigente: {factura.version} · se guardará como versión {factura.version + 1}
              </span>
            ) : (
              <InsigniaEstado estado={factura.estado} version={factura.version} />
            ))}
        </span>
      </div>

      {factura && (
        <div className="correccion__encabezado">
          <label className="campo">
            <span>Cliente</span>
            <input
              readOnly
              tabIndex={-1}
              value={`${factura.tercero.codigo} - ${factura.tercero.nombre} · ${factura.tercero.identificacion}`}
            />
          </label>
          <label className="campo">
            <span>Fecha</span>
            <input readOnly tabIndex={-1} value={formatearFechaHora(factura.fecha)} />
          </label>
          <label className="campo campo--ancho">
            <span>Condición</span>
            <input readOnly tabIndex={-1} value={textoCondicionVenta(factura)} />
          </label>
          <label className="campo">
            <span>Bodega</span>
            <input readOnly tabIndex={-1} value={factura.bodegaNombre} />
          </label>
          <RecuadroCartera cartera={factura.cartera} textoPagado="Abonado" />
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {factura && !discriminada && <ResumenFactura factura={factura} />}

      {factura && discriminada && lectura && (
        <>
          <div className="tabla-contenedor documento__lineas">
            <table className="tabla tabla--precios">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th className="num">Código</th>
                  <th>Producto</th>
                  <th>Und</th>
                  <th>Escala</th>
                  <th className="num">Costo</th>
                  <th className="num">Cantidad</th>
                  <th className="num">Precio</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody ref={tabla}>
                {factura.lineas.map((l) => (
                  <FilaCorreccion
                    key={l.renglon}
                    linea={l}
                    edicion={edicion[l.renglon] ?? { cantidad: '', precio: '' }}
                    calculo={calculo}
                    alCambiar={(cambios) => {
                      setEdicion((actual) => ({
                        ...actual,
                        [l.renglon]: {
                          ...(actual[l.renglon] ?? { cantidad: '', precio: '' }),
                          ...cambios,
                        },
                      }));
                      setAviso(null);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <div className="documento__pie">
            <div className="documento__avisos">
              {lectura.error && <Aviso tipo="error">{lectura.error}</Aviso>}
              {calculo?.avisos.map((t) => (
                <Aviso key={t} tipo="alerta">
                  {t}
                </Aviso>
              ))}
              <p className="nota-inventario">
                {calculo && calculo.movimientos.length > 0
                  ? `Inventario al guardar: ${textosInventario(
                      calculo.movimientos,
                      new Map(factura.lineas.map((l) => [l.producto.codigo, l.producto])),
                      factura.bodegaNombre,
                    ).join('; ')} (movimiento de corrección).`
                  : 'Inventario al guardar: sin cambios.'}{' '}
                Cantidad 0 quita la línea.
              </p>
              {calculo && <AvisoEfectoVenta factura={factura} calculo={calculo} />}
              <label className="campo">
                <span>Motivo de la corrección (opcional)</span>
                <input
                  value={motivo}
                  maxLength={LARGO_MAXIMO_OBSERVACION}
                  placeholder="Por ejemplo: devolvió 2 papas y se le dejó la caja a 1,900"
                  onChange={(e) => setMotivo(e.target.value)}
                />
              </label>
            </div>
            <TotalesCorreccionVenta factura={factura} calculo={calculo} />
          </div>
        </>
      )}

      {!factura && (
        <p className="correccion__nota">
          Escriba el número de la factura y pulse Enter para ver su resumen: abonos aplicados y
          versiones. Desde ahí la puede corregir (
          {textoCombinacion(ATAJOS.verDiscriminada.combinacion)}), anular (
          {textoCombinacion(ATAJOS.anularFactura.combinacion)}) o registrarle una devolución.
        </p>
      )}

      {anulando && factura && (
        <DialogoMotivo
          titulo={`¿Anular la factura ${factura.numero}?`}
          textoAceptar="Anular factura"
          ejemploMotivo="se facturó al cliente equivocado"
          alAceptar={anular}
          alCancelar={() => setAnulando(false)}
        >
          <ExplicacionAnularVenta factura={factura} />
        </DialogoMotivo>
      )}

      {guardada && (
        <DialogoGuardado
          titulo={`Factura ${guardada.respuesta.numero} corregida (versión ${guardada.respuesta.version})`}
          textoImprimir="Imprimir factura corregida"
          alImprimir={imprimirCorregida}
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
            {[
              textoMovimientoFavor(
                guardada.respuesta.movimientoFavor,
                factura?.tercero.nombre ?? '',
              ),
              guardada.respuesta.reintegro ? textoReintegro(guardada.respuesta.reintegro) : null,
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
 * Propiedades de {@link ResumenFactura}.
 */
interface PropiedadesResumenFactura {
  /** Factura cargada. */
  factura: FacturaClienteParaCorregir;
}

/**
 * Resumen de la factura: abonos aplicados, versiones y la nota con lo que
 * se puede hacer.
 *
 * @param props - Propiedades del componente.
 * @returns El resumen.
 */
function ResumenFactura({ factura }: PropiedadesResumenFactura): ReactNode {
  const lineas = factura.lineas.length;
  return (
    <>
      <div className="correccion__paneles">
        <fieldset className="grupo">
          <legend>Abonos aplicados</legend>
          <div className="tabla-contenedor correccion__tabla-chica">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="num">Abono</th>
                  <th className="num">Fecha</th>
                  <th>Forma de pago</th>
                  <th className="num">Aplicado</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {factura.abonos.length === 0 && (
                  <tr>
                    <td className="tabla__vacia" colSpan={5}>
                      {factura.condicion === 'contado'
                        ? 'Venta de contado: no tiene abonos.'
                        : 'Sin abonos.'}
                    </td>
                  </tr>
                )}
                {factura.abonos.map((a) => (
                  <tr key={a.id} className={a.estado === 'anulado' ? 'fila--inactiva' : undefined}>
                    <td className="num">{a.numero}</td>
                    <td className="num">{formatearFecha(a.fecha)}</td>
                    <td>{a.formaPagoNombre}</td>
                    <td className="num">{agruparMiles(a.valor)}</td>
                    <td className={a.estado === 'anulado' ? 'estado-anulado' : undefined}>
                      {a.estado === 'anulado' ? 'ANULADO' : 'Activo'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
        <fieldset className="grupo">
          <legend>Versiones</legend>
          <div className="tabla-contenedor correccion__tabla-chica">
            <table className="tabla">
              <thead>
                <tr>
                  <th className="num">Versión</th>
                  <th className="num">Fecha</th>
                  <th className="num">Total</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {factura.versiones.map((v) => (
                  <tr key={v.version}>
                    <td className="num">{v.version}</td>
                    <td className="num">{formatearFechaHora(v.fecha)}</td>
                    <td className="num">{agruparMiles(v.total)}</td>
                    <td className={v.version === 1 ? 'texto-tenue' : undefined}>
                      {v.version === 1 ? 'Original' : (v.motivo ?? '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      </div>
      <p className="correccion__nota">
        {factura.estado === 'anulada' ? (
          <>
            Anulada el {formatearFechaHora(factura.anuladaEn ?? '')}
            {factura.motivoAnulacion ? ` · ${factura.motivoAnulacion}` : ''}. Ya no se corrige ni se
            le hacen devoluciones.
          </>
        ) : (
          <>
            {lineas} {lineas === 1 ? 'línea' : 'líneas'} · Su ahorro fue de{' '}
            {formatearPesos(factura.ahorro)}. Pulse{' '}
            <strong>{textoCombinacion(ATAJOS.verDiscriminada.combinacion)}</strong> para verla línea
            por línea y corregir cantidades o precios.{' '}
            <strong>{textoCombinacion(ATAJOS.anularFactura.combinacion)}</strong> la anula (pide
            confirmación). «Devolución…» abre la devolución de venta con esta factura.
          </>
        )}
      </p>
    </>
  );
}

/**
 * Propiedades de {@link FilaCorreccion}.
 */
interface PropiedadesFilaCorreccion {
  /** Línea vigente. */
  linea: LineaVentaDeFactura;
  /** Lo escrito en la línea. */
  edicion: EdicionLinea;
  /** Corrección calculada (para el total y «bajo el costo»), o `null`. */
  calculo: CorreccionVenta | null;
  /** Cambia cantidad o precio. */
  alCambiar: (cambios: Partial<EdicionLinea>) => void;
}

/**
 * Fila de la vista discriminada: cantidad y precio editables, con el valor
 * anterior tachado cuando cambian, y la etiqueta «bajo el costo».
 *
 * @param props - Propiedades del componente.
 * @returns La fila.
 */
function FilaCorreccion({
  linea,
  edicion,
  calculo,
  alCambiar,
}: PropiedadesFilaCorreccion): ReactNode {
  const { producto } = linea;
  const cantidad =
    edicion.cantidad.trim() === '' ? 0 : leerCantidad(edicion.cantidad, producto.unidad);
  const precio = leerPesos(edicion.precio);
  const corregida = calculo?.lineas.find((c) => c.renglonAnterior === linea.renglon);
  const cambioCantidad = cantidad !== null && cantidad !== linea.cantidad;
  const cambioPrecio = precio !== null && precio !== linea.precio;
  const bajoCosto = precio !== null && precio < linea.costo;
  const total = calculo ? (corregida?.total ?? 0) : linea.total;
  return (
    <tr className={bajoCosto ? 'fila--alerta' : undefined}>
      <td className="num">{linea.renglon}</td>
      <td className="num">{producto.codigo}</td>
      <td>
        {producto.nombre}
        {bajoCosto && <span className="etiqueta etiqueta--alerta">bajo el costo</span>}
      </td>
      <td>{producto.unidad}</td>
      <td>
        {NOMBRE_ESCALA[linea.escala]} · {agruparMiles(linea.precioEscala)}
      </td>
      <td className={`num${bajoCosto ? ' texto-alerta' : ''}`}>{agruparMiles(linea.costo)}</td>
      <td className="num">
        {cambioCantidad && (
          <span className="valor-anterior">
            {formatearCantidad(linea.cantidad, producto.unidad)}
          </span>
        )}
        <input
          className={cambioCantidad ? 'campo--cambiado' : undefined}
          value={edicion.cantidad}
          inputMode={producto.unidad === 'KG' ? 'decimal' : 'numeric'}
          aria-label={`Cantidad de la línea ${linea.renglon}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
        />
      </td>
      <td className="num">
        {cambioPrecio && <span className="valor-anterior">{agruparMiles(linea.precio)}</span>}
        <input
          className={cambioPrecio ? 'campo--cambiado' : undefined}
          value={edicion.precio}
          inputMode="numeric"
          aria-label={`Precio de la línea ${linea.renglon}`}
          onFocus={(e) => e.target.select()}
          onChange={(e) => alCambiar({ precio: e.target.value })}
        />
      </td>
      <td className="num">
        {total !== linea.total && (
          <span className="valor-anterior">{agruparMiles(linea.total)}</span>
        )}
        {agruparMiles(total)}
      </td>
    </tr>
  );
}

/**
 * Propiedades de {@link AvisoEfectoVenta}.
 */
interface PropiedadesAvisoEfectoVenta {
  /** Factura vigente. */
  factura: FacturaClienteParaCorregir;
  /** Corrección calculada. */
  calculo: CorreccionVenta;
}

/**
 * Aviso de lo que pasará con el dinero: saldo a favor que se genera o se
 * recupera (crédito), o reintegro que se entrega o se cobra (contado).
 *
 * @param props - Propiedades del componente.
 * @returns El aviso, o nada si no hay efecto que avisar.
 */
function AvisoEfectoVenta({ factura, calculo }: PropiedadesAvisoEfectoVenta): ReactNode {
  const { efecto } = calculo;
  const nombre = `${factura.tercero.codigo} - ${factura.tercero.nombre}`;
  if (efecto.tipo === 'contado') {
    const forma = factura.formaPagoNombre ?? 'la forma de pago de la venta';
    if (efecto.devolver > 0) {
      return (
        <Aviso tipo="exito">
          Es una venta de contado: al guardar se registra un reintegro y se le devuelven{' '}
          <strong>{formatearPesos(efecto.devolver)}</strong> al cliente en {forma}.
        </Aviso>
      );
    }
    if (efecto.cobrar > 0) {
      return (
        <Aviso tipo="alerta">
          Es una venta de contado: al guardar se registra un reintegro y se le cobran{' '}
          <strong>{formatearPesos(efecto.cobrar)}</strong> al cliente en {forma}.
        </Aviso>
      );
    }
    return null;
  }
  if (efecto.movimientoFavor > 0) {
    return (
      <Aviso tipo="exito">
        Lo abonado ({formatearPesos(factura.cartera.aplicado)}) supera el total corregido (
        {formatearPesos(calculo.total)}): quedan{' '}
        <strong>{formatearPesos(efecto.movimientoFavor)} a favor</strong> de {nombre}. Se puede usar
        en un abono con la forma «Saldo a favor» o devolverle en dinero desde Abono de cliente.
      </Aviso>
    );
  }
  if (efecto.movimientoFavor < 0) {
    return (
      <Aviso tipo="alerta">
        La factura recupera {formatearPesos(-efecto.movimientoFavor)} del saldo a favor que había
        dejado a {nombre}.
      </Aviso>
    );
  }
  return null;
}

/**
 * Propiedades de {@link TotalesCorreccionVenta}.
 */
interface PropiedadesTotalesCorreccionVenta {
  /** Factura vigente. */
  factura: FacturaClienteParaCorregir;
  /** Corrección calculada, o `null` si aún no hay cambios. */
  calculo: CorreccionVenta | null;
}

/**
 * Panel de totales de la corrección: total anterior y corregido,
 * diferencia, lo abonado, saldo nuevo, saldo a favor y ahorro.
 *
 * @param props - Propiedades del componente.
 * @returns La tabla de totales.
 */
function TotalesCorreccionVenta({
  factura,
  calculo,
}: PropiedadesTotalesCorreccionVenta): ReactNode {
  const total = calculo?.total ?? factura.cartera.total;
  const diferencia = calculo?.diferencia ?? 0;
  const efecto = calculo?.efecto ?? null;
  return (
    <table className="totales">
      <tbody>
        <tr>
          <th>Total anterior</th>
          <td className="num">{agruparMiles(factura.cartera.total)}</td>
        </tr>
        <tr className="totales__total">
          <th>Total corregido</th>
          <td className="num">{formatearPesos(total)}</td>
        </tr>
        <tr>
          <th>Diferencia</th>
          <td className={`num${diferencia < 0 ? ' texto-error' : ''}`}>
            {diferencia < 0 ? `− ${agruparMiles(-diferencia)}` : agruparMiles(diferencia)}
          </td>
        </tr>
        {factura.condicion === 'credito' ? (
          <>
            <tr>
              <th>Ya abonado</th>
              <td className="num">{agruparMiles(factura.cartera.aplicado)}</td>
            </tr>
            <tr>
              <th>Saldo nuevo</th>
              <td className="num">
                {agruparMiles(efecto?.tipo === 'credito' ? efecto.saldo : factura.cartera.saldo)}
              </td>
            </tr>
            <tr className="totales__favor">
              <th>Saldo a favor del cliente</th>
              <td className="num">
                {agruparMiles(efecto?.tipo === 'credito' ? Math.max(0, efecto.movimientoFavor) : 0)}
              </td>
            </tr>
          </>
        ) : (
          <tr className="totales__favor">
            <th>
              {efecto?.tipo === 'contado' && efecto.cobrar > 0
                ? 'Se le cobra al cliente'
                : 'Se le devuelve al cliente'}
            </th>
            <td className="num">
              {agruparMiles(
                efecto?.tipo === 'contado' ? Math.max(efecto.devolver, efecto.cobrar) : 0,
              )}
            </td>
          </tr>
        )}
        <tr className="texto-tenue">
          <th>Su ahorro fue de</th>
          <td className="num">{agruparMiles(calculo?.ahorro ?? factura.ahorro)}</td>
        </tr>
      </tbody>
    </table>
  );
}

/**
 * Propiedades de {@link ExplicacionAnularVenta}.
 */
interface PropiedadesExplicacionAnularVenta {
  /** Factura a anular. */
  factura: FacturaClienteParaCorregir;
}

/**
 * Explicación del diálogo de anulación: qué vuelve al inventario, qué deja
 * de deberse y qué pasa con lo abonado.
 *
 * @param props - Propiedades del componente.
 * @returns El texto del diálogo.
 */
function ExplicacionAnularVenta({ factura }: PropiedadesExplicacionAnularVenta): ReactNode {
  const abonos = factura.abonos.filter((a) => a.estado === 'activo').map((a) => a.numero);
  const textoAbonos =
    abonos.length === 1 ? `abono ${abonos[0] ?? ''}` : `abonos ${abonos.join(', ')}`;
  const nLineas = factura.lineas.length;
  const productos = factura.lineas
    .map(
      (l) =>
        `${formatearCantidad(l.cantidad, l.producto.unidad)} ${l.producto.unidad} de ${l.producto.codigo}`,
    )
    .join(', ');
  const favor = factura.cartera.aplicado - factura.cartera.trasladado;
  return (
    <>
      <p className="dialogo__mensaje">
        La factura conserva su número y queda marcada como <strong>ANULADA</strong>; no se puede
        deshacer. Al anularla:
      </p>
      <ul className="dialogo__lista">
        {nLineas > 0 && (
          <li>
            Vuelven a {factura.bodegaNombre} {nLineas === 1 ? 'la línea' : `las ${nLineas} líneas`}:{' '}
            {productos}.
          </li>
        )}
        {factura.condicion === 'contado' ? (
          <li>
            Es de contado: se registra un reintegro y se le devuelven{' '}
            {formatearPesos(factura.cartera.total)} al cliente en{' '}
            {factura.formaPagoNombre ?? 'la forma de pago de la venta'}.
          </li>
        ) : (
          <>
            <li>Su saldo ({formatearPesos(factura.cartera.saldo)}) deja de deberse.</li>
            {favor > 0 && (
              <li>
                Lo abonado ({formatearPesos(favor)}, {textoAbonos}) queda como{' '}
                <strong>saldo a favor</strong> de {factura.tercero.nombre}.{' '}
                {abonos.length === 1
                  ? `El ${textoAbonos} no se toca.`
                  : `Los ${textoAbonos} no se tocan.`}
              </li>
            )}
            {favor < 0 && (
              <li>
                La factura había dejado {formatearPesos(factura.cartera.trasladado)} de saldo a
                favor: se le descuentan {formatearPesos(-favor)} a {factura.tercero.nombre}.
              </li>
            )}
          </>
        )}
      </ul>
    </>
  );
}
