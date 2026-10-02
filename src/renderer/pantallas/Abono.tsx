import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION, repartirAbono } from '../../domain/abonos';
import { textoVencimiento } from '../../domain/calendario';
import { claveComparacion } from '../../domain/texto';
import type {
  AbonoGuardado,
  AbonoResumen,
  ContextoAbono,
  ContextoAbonoTercero,
  FacturaPendiente,
  TipoAbono,
} from '../../shared/abonos';
import { formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import type { DocumentoImprimible } from '../../shared/impresion';
import { ATAJOS } from '../../shared/keymap';
import type { RegistroCatalogo, Tercero } from '../../shared/maestros';
import { CODIGO_CONSUMIDOR_FINAL } from '../../shared/ventas';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { Buscador } from '../documentos/Buscador';
import { Deuda } from '../documentos/Deuda';
import {
  DialogoAbonoGuardado,
  DialogoAnularAbono,
  textoFacturaAbonada,
} from '../documentos/DialogosAbono';
import { VistaPrevia } from '../documentos/VistaPrevia';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Abono tal como se escribe en pantalla.
 */
interface FormularioAbono {
  /** Fecha escrita, `dd/mm/aaaa`. */
  fecha: string;
  /** Forma de pago (texto del `<select>`). */
  formaPagoId: string;
  /** Valor escrito. */
  valor: string;
  /** Observación (se imprime en el recibo). */
  observacion: string;
  /** Valor a aplicar a cada factura, escrito (id de la factura → texto). */
  aplicar: Readonly<Record<number, string>>;
}

/**
 * Formulario vacío.
 *
 * @param hoy - Día de hoy `AAAA-MM-DD`.
 * @returns Formulario sin datos.
 */
function formularioVacio(hoy: string): FormularioAbono {
  return { fecha: formatearFecha(hoy), formaPagoId: '', valor: '', observacion: '', aplicar: {} };
}

/**
 * Reparte el valor escrito entre las facturas, de la más antigua a la más
 * reciente (D-51), y lo deja como texto en cada «Aplicar».
 *
 * @param valor - Valor escrito.
 * @param facturas - Facturas pendientes en orden de antigüedad.
 * @returns Texto de «Aplicar» por factura.
 */
function repartoEscrito(
  valor: string,
  facturas: readonly FacturaPendiente[],
): Record<number, string> {
  const pesos = leerPesos(valor) ?? 0;
  return Object.fromEntries(
    repartirAbono(pesos, facturas).map((a) => [a.facturaId, agruparMiles(a.valor)]),
  );
}

/**
 * Texto de un tercero en el buscador.
 *
 * @param t - Cliente o proveedor.
 * @returns `código - nombre`, con la marca de inactivo.
 */
const textoTercero = (t: Tercero): string =>
  `${t.codigo} - ${t.nombre}${t.activo ? '' : ' (inactivo)'}`;

/**
 * Lo que cambia entre el abono de cliente y el de proveedor.
 */
interface ConfiguracionAbono {
  /** «Cliente» o «Proveedor». */
  tercero: string;
  /** Título de la columna del número de factura. */
  columnaNumero: string;
  /** Si se muestra la columna con el número de la factura del proveedor. */
  conReferencia: boolean;
  /** Documento imprimible del recibo. */
  documento: DocumentoImprimible['tipo'];
}

/**
 * Configuración de cada tipo de abono.
 */
const CONFIGURACION: Readonly<Record<TipoAbono, ConfiguracionAbono>> = {
  cliente: {
    tercero: 'Cliente',
    columnaNumero: 'Factura',
    conReferencia: false,
    documento: 'abono-cliente',
  },
  proveedor: {
    tercero: 'Proveedor',
    columnaNumero: 'Compra',
    conReferencia: true,
    documento: 'abono-proveedor',
  },
};

/**
 * Propiedades de {@link PantallaAbono}.
 */
interface PropiedadesPantallaAbono {
  /** Cliente o proveedor. */
  tipo: TipoAbono;
}

/**
 * Ventana de abono (§8), igual para clientes y proveedores: registra un pago
 * repartido entre las facturas con saldo (las más antiguas primero, D-51),
 * muestra los abonos anteriores con «Ver recibo» y «Anular…», e imprime el
 * recibo (tirilla para el cliente, hoja carta para el proveedor, D-93). Las
 * facturas que son saldo inicial llevan su marca (D-86). Av. Pág guarda.
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
function PantallaAbono({ tipo }: PropiedadesPantallaAbono): ReactNode {
  const config = CONFIGURACION[tipo];
  const terceroMinuscula = config.tercero.toLowerCase();
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const [contexto, setContexto] = useState<ContextoAbono | null>(null);
  const [terceros, setTerceros] = useState<Tercero[]>([]);
  const [formasPago, setFormasPago] = useState<RegistroCatalogo[]>([]);
  const [tercero, setTercero] = useState<Tercero | null>(null);
  const [datosTercero, setDatosTercero] = useState<ContextoAbonoTercero | null>(null);
  const [f, setF] = useState<FormularioAbono | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState<(AbonoGuardado & { valor: number }) | null>(null);
  const [vista, setVista] = useState<DocumentoImprimible | null>(null);
  const [anulando, setAnulando] = useState<AbonoResumen | null>(null);
  const campoTercero = useRef<HTMLInputElement>(null);
  const cargado = f !== null;

  // La ventana abre mientras se cargan los datos: al terminar, el foco va al tercero.
  useEffect(() => {
    if (cargado) campoTercero.current?.focus();
  }, [cargado]);

  const cargarContexto = useCallback(async (): Promise<ContextoAbono | null> => {
    const r = await invocar('abonos:contexto', tipo);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setContexto(r.datos);
    return r.datos;
  }, [tipo]);

  useEffect(() => {
    void (async () => {
      const [ctx, lista, fp] = await Promise.all([
        cargarContexto(),
        invocar('terceros:listar', tipo),
        invocar('catalogos:listar', 'forma-pago'),
      ]);
      if (lista.ok) {
        // «Consumidor final» compra de contado: nunca tiene cartera que abonar.
        setTerceros(
          tipo === 'cliente'
            ? lista.datos.filter((t) => t.codigo !== CODIGO_CONSUMIDOR_FINAL)
            : lista.datos,
        );
      }
      if (fp.ok) setFormasPago(fp.datos);
      if (ctx) setF(formularioVacio(ctx.hoy));
    })();
  }, [cargarContexto, tipo]);

  /**
   * Carga deuda, facturas pendientes y abonos del tercero, y reparte de
   * nuevo el valor escrito.
   *
   * @param codigo - Cliente o proveedor.
   */
  const cargarTercero = useCallback(
    async (codigo: number): Promise<void> => {
      const r = await invocar('abonos:contextoTercero', { tipo, codigo });
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
        return;
      }
      setDatosTercero(r.datos);
      setF((actual) =>
        actual ? { ...actual, aplicar: repartoEscrito(actual.valor, r.datos.facturas) } : actual,
      );
    },
    [tipo],
  );

  // El tercero elegido no cuenta: se conserva a propósito después de guardar.
  const tieneDatos = f !== null && (f.valor.trim() !== '' || f.observacion.trim() !== '');

  useEffect(() => {
    marcarCambios(tieneDatos);
  }, [tieneDatos, marcarCambios]);

  const cambiar = (cambios: Partial<FormularioAbono>): void => {
    setF((actual) => (actual ? { ...actual, ...cambios } : actual));
    setAviso(null);
  };

  const elegirTercero = (t: Tercero): void => {
    setTercero(t);
    setDatosTercero(null);
    setAviso(null);
    void cargarTercero(t.codigo);
  };

  const limpiar = async (): Promise<void> => {
    if (!contexto) return;
    if (
      tieneDatos &&
      !(await confirmar({
        titulo: 'Limpiar el abono',
        mensaje: 'Se borrará todo lo escrito en este abono. ¿Desea continuar?',
        textoAceptar: 'Limpiar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }))
    ) {
      return;
    }
    setTercero(null);
    setDatosTercero(null);
    setF(formularioVacio(contexto.hoy));
    setAviso(null);
  };

  const facturas = datosTercero?.facturas ?? [];
  const aplicadoPorFactura = facturas.map((fa) => ({
    factura: fa,
    texto: f?.aplicar[fa.id] ?? '0',
    valor: leerPesos(f?.aplicar[fa.id] ?? '0'),
  }));
  const aplicado = aplicadoPorFactura.reduce((suma, a) => suma + (a.valor ?? 0), 0);
  const valor = f ? leerPesos(f.valor) : null;

  const guardar = async (): Promise<void> => {
    if (!f || ocupado) return;
    const error = validarFormulario(f, tercero, config, valor, aplicadoPorFactura);
    if (error !== null) {
      setAviso({ tipo: 'error', texto: error });
      return;
    }
    const fecha = leerFecha(f.fecha) ?? '';
    if (tercero === null || valor === null) return;
    setOcupado(true);
    const r = await invocar('abonos:guardar', {
      tipo,
      terceroCodigo: tercero.codigo,
      fecha,
      formaPagoId: Number(f.formaPagoId),
      valor,
      observacion: f.observacion,
      aplicaciones: aplicadoPorFactura
        .filter((a) => (a.valor ?? 0) > 0)
        .map((a) => ({ facturaId: a.factura.id, valor: a.valor ?? 0 })),
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    setGuardado({ ...r.datos, valor });
    const ctx = await cargarContexto();
    // Se conserva el tercero y la forma de pago: es común abonar a varias facturas seguidas.
    setF({ ...formularioVacio(ctx?.hoy ?? contexto?.hoy ?? ''), formaPagoId: f.formaPagoId });
    await cargarTercero(tercero.codigo);
  };

  const imprimirOriginal = async (id: number): Promise<string | null> => {
    const r = await invocar('impresion:imprimir', {
      tipo: config.documento,
      id,
      reimpresion: false,
      tirilla: tipo === 'cliente',
    });
    if (!r.ok) return r.error.mensaje;
    return r.datos ? null : 'La impresión se canceló. Puede intentarlo de nuevo.';
  };

  const hayDialogo = guardado !== null || vista !== null || anulando !== null;
  useAtajos({ guardarDocumento: () => void guardar() }, { activo: activa && !hayDialogo });

  if (!f) {
    return (
      <div className="documento">
        {aviso ? (
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        ) : (
          <p className="texto-tenue">Cargando…</p>
        )}
      </div>
    );
  }

  const deudaTotal = datosTercero?.deuda.total ?? 0;
  const columnas = config.conReferencia ? 9 : 8;

  return (
    <div className="documento">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={ocupado}
          onClick={() => void guardar()}
        >
          Guardar
          <span className="atajo">{textoCombinacion(ATAJOS.guardarDocumento.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={() => void limpiar()}>
          Limpiar
        </button>
        <span className="barra-herramientas__separador" />
        <span className="texto-tenue">
          Abono No. <strong>{contexto?.siguienteNumero ?? '…'}</strong> (se confirma al guardar)
        </span>
      </div>

      <div className="documento__encabezado abono__encabezado">
        <label className="campo documento__proveedor">
          <span>{config.tercero} *</span>
          <Buscador
            registros={terceros}
            clave={(t) => t.codigo}
            texto={textoTercero}
            coincide={(t, b) =>
              String(t.codigo).startsWith(b) || claveComparacion(t.nombre).includes(b)
            }
            exacto={(t, escrito) => String(t.codigo) === escrito}
            seleccionado={tercero}
            alElegir={elegirTercero}
            campo={campoTercero}
            ayuda="Código o parte del nombre…"
            etiqueta={config.tercero}
          />
        </label>
        <Deuda deuda={datosTercero?.deuda ?? null} />
        <label className="campo campo--num">
          <span>Fecha *</span>
          <input
            value={f.fecha}
            placeholder="dd/mm/aaaa"
            onChange={(e) => cambiar({ fecha: e.target.value })}
          />
        </label>
        <label className="campo">
          <span>Forma de pago *</span>
          <select value={f.formaPagoId} onChange={(e) => cambiar({ formaPagoId: e.target.value })}>
            <option value="">— Seleccione —</option>
            {formasPago
              .filter((fp) => fp.activo || String(fp.id) === f.formaPagoId)
              .map((fp) => (
                <option key={fp.id} value={String(fp.id)}>
                  {fp.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="campo campo--num">
          <span>Valor del abono *</span>
          <input
            value={f.valor}
            inputMode="numeric"
            onChange={(e) =>
              cambiar({ valor: e.target.value, aplicar: repartoEscrito(e.target.value, facturas) })
            }
          />
        </label>
        <label className="campo abono__observacion">
          <span>Observación</span>
          <input
            value={f.observacion}
            maxLength={LARGO_MAXIMO_OBSERVACION}
            placeholder="Opcional (se imprime en el recibo)"
            onChange={(e) => cambiar({ observacion: e.target.value })}
          />
        </label>
      </div>

      <fieldset className="grupo">
        <legend>
          Facturas pendientes · se reparte a las más antiguas primero; puede cambiar cada monto
        </legend>
        <div className="tabla-contenedor abono__facturas">
          <table className="tabla tabla--precios">
            <thead>
              <tr>
                <th className="num">{config.columnaNumero}</th>
                {config.conReferencia && <th>Factura proveedor</th>}
                <th className="num">Fecha</th>
                <th className="num">Vence</th>
                <th>Estado</th>
                <th className="num">Total</th>
                <th className="num">Saldo</th>
                <th className="num">Aplicar</th>
                <th className="num">Saldo después</th>
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 && (
                <tr>
                  <td className="tabla__vacia" colSpan={columnas}>
                    {tercero === null
                      ? `Elija el ${terceroMinuscula} para ver sus facturas pendientes.`
                      : datosTercero === null
                        ? 'Cargando…'
                        : `Este ${terceroMinuscula} no tiene facturas con saldo.`}
                  </td>
                </tr>
              )}
              {aplicadoPorFactura.map(({ factura: fa, texto, valor: v }) => {
                const estado = contexto ? textoVencimiento(fa.vence, contexto.hoy) : null;
                const marca = fa.saldoInicial && (
                  <span
                    className="etiqueta etiqueta--saldo-inicial"
                    title="Saldo pendiente importado del sistema anterior"
                  >
                    Saldo inicial
                  </span>
                );
                return (
                  <tr key={fa.id} className={v === null ? 'fila--alerta' : undefined}>
                    <td className="num">
                      {fa.numero}
                      {!config.conReferencia && marca}
                    </td>
                    {config.conReferencia && (
                      <td>
                        {fa.referencia}
                        {marca}
                      </td>
                    )}
                    <td className="num">{formatearFecha(fa.fecha)}</td>
                    <td className="num">{formatearFecha(fa.vence)}</td>
                    <td className={estado?.vencida ? 'texto-error' : undefined}>
                      {estado?.texto ?? ''}
                    </td>
                    <td className="num">{agruparMiles(fa.total)}</td>
                    <td className="num">{agruparMiles(fa.saldo)}</td>
                    <td>
                      <input
                        value={texto}
                        inputMode="numeric"
                        aria-label={`Aplicar a la ${config.columnaNumero.toLowerCase()} ${fa.numero}`}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          cambiar({ aplicar: { ...f.aplicar, [fa.id]: e.target.value } })
                        }
                      />
                    </td>
                    <td className="num">{v === null ? '—' : agruparMiles(fa.saldo - v)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="reparto">
          <button
            type="button"
            className="boton"
            tabIndex={-1}
            disabled={facturas.length === 0}
            onClick={() => cambiar({ aplicar: repartoEscrito(f.valor, facturas) })}
          >
            Repartir de nuevo
          </button>
          <span>
            Aplicado: <strong>{formatearPesos(aplicado)}</strong>
          </span>
          <span>
            Sin aplicar:{' '}
            <strong className={valor !== null && valor !== aplicado ? 'texto-error' : undefined}>
              {formatearPesos((valor ?? 0) - aplicado)}
            </strong>
          </span>
          <span>
            Deuda después del abono: <strong>{formatearPesos(deudaTotal - aplicado)}</strong>
          </span>
        </div>
      </fieldset>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <fieldset className="grupo">
        <legend>Abonos anteriores de este {terceroMinuscula}</legend>
        <div className="tabla-contenedor abono__anteriores">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">Abono</th>
                <th className="num">Fecha</th>
                <th>Forma de pago</th>
                <th className="num">Valor</th>
                <th>Facturas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(datosTercero?.abonos.length ?? 0) === 0 && (
                <tr>
                  <td className="tabla__vacia" colSpan={7}>
                    {tercero === null ? '—' : 'Sin abonos anteriores.'}
                  </td>
                </tr>
              )}
              {datosTercero?.abonos.map((a) => (
                <tr key={a.id} className={a.estado === 'anulado' ? 'fila--inactiva' : undefined}>
                  <td className="num">{a.numero}</td>
                  <td className="num">{formatearFecha(a.fecha)}</td>
                  <td>{a.formaPagoNombre}</td>
                  <td className="num">{agruparMiles(a.valor)}</td>
                  <td>
                    {a.aplicaciones.map((ap) => textoFacturaAbonada(tipo, ap)).join(', ')}
                    {a.origen === 'contado' && (
                      <span className="etiqueta etiqueta--activo">contado</span>
                    )}
                  </td>
                  <td
                    className={a.estado === 'anulado' ? 'estado-anulado' : undefined}
                    title={a.motivoAnulacion ?? undefined}
                  >
                    {a.estado === 'anulado' ? 'ANULADO' : 'Activo'}
                  </td>
                  <td className="num abono__acciones">
                    <button
                      type="button"
                      className="boton"
                      onClick={() =>
                        setVista({ tipo: config.documento, id: a.id, reimpresion: true })
                      }
                    >
                      Ver recibo
                    </button>
                    {a.estado === 'activo' && (
                      <button type="button" className="boton" onClick={() => setAnulando(a)}>
                        Anular…
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>

      {guardado && (
        <DialogoAbonoGuardado
          tipo={tipo}
          numero={guardado.numero}
          valor={guardado.valor}
          alImprimir={() => imprimirOriginal(guardado.id)}
          alCerrar={() => setGuardado(null)}
        />
      )}
      {vista && (
        <VistaPrevia
          documento={vista}
          titulo="Recibo de abono (reimpresión)"
          alCerrar={() => setVista(null)}
        />
      )}
      {anulando && (
        <DialogoAnularAbono
          abono={anulando}
          alCancelar={() => setAnulando(null)}
          alAnular={() => {
            setAviso({ tipo: 'exito', texto: `Abono ${anulando.numero} anulado.` });
            setAnulando(null);
            if (tercero) void cargarTercero(tercero.codigo);
          }}
        />
      )}
    </div>
  );
}

/**
 * Valida lo escrito antes de enviarlo. Las reglas de negocio las vuelve a
 * validar el proceso principal con los saldos del momento.
 *
 * @param f - Formulario.
 * @param tercero - Cliente o proveedor elegido.
 * @param config - Textos del tipo de abono.
 * @param valor - Valor leído.
 * @param aplicaciones - «Aplicar» leído de cada factura.
 * @returns Mensaje del primer error, o `null` si se puede enviar.
 */
function validarFormulario(
  f: FormularioAbono,
  tercero: Tercero | null,
  config: ConfiguracionAbono,
  valor: number | null,
  aplicaciones: readonly { factura: FacturaPendiente; valor: number | null }[],
): string | null {
  if (tercero === null) return `Elija el ${config.tercero.toLowerCase()}.`;
  if (leerFecha(f.fecha) === null) return 'La fecha no es válida: use el formato dd/mm/aaaa.';
  if (f.formaPagoId === '') return 'Elija la forma de pago.';
  if (valor === null || valor <= 0) {
    return 'Escriba el valor del abono en pesos, sin centavos (por ejemplo 500,000).';
  }
  const invalida = aplicaciones.find((a) => a.valor === null);
  if (invalida) {
    return `El valor a aplicar a la ${config.columnaNumero.toLowerCase()} ${invalida.factura.numero} no es un valor válido en pesos.`;
  }
  return null;
}

/**
 * Ventana «Abono de cliente» (§8, Fase 3b): cobra facturas a crédito y
 * saldos iniciales; el recibo sale en la tirilla (D-93).
 *
 * @returns La ventana.
 */
export function AbonoCliente(): ReactNode {
  return <PantallaAbono tipo="cliente" />;
}

/**
 * Ventana «Abono a proveedor» (§8, Fase 2): paga compras y saldos iniciales;
 * el recibo sale en hoja carta.
 *
 * @returns La ventana.
 */
export function AbonoProveedor(): ReactNode {
  return <PantallaAbono tipo="proveedor" />;
}
