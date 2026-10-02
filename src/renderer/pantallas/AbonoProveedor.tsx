import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION, repartirAbono } from '../../domain/abonos';
import { textoVencimiento } from '../../domain/calendario';
import { claveComparacion } from '../../domain/texto';
import type {
  AbonoGuardado,
  AbonoResumen,
  ContextoAbono,
  ContextoAbonoProveedor,
  FacturaPendiente,
} from '../../shared/abonos';
import { formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import type { DocumentoImprimible } from '../../shared/impresion';
import { ATAJOS } from '../../shared/keymap';
import type { RegistroCatalogo, Tercero } from '../../shared/maestros';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { Buscador } from '../documentos/Buscador';
import { Deuda } from '../documentos/Deuda';
import { DialogoAbonoGuardado, DialogoAnularAbono } from '../documentos/DialogosAbono';
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
 * Texto de un proveedor en el buscador.
 *
 * @param p - Proveedor.
 * @returns `código - nombre`, con la marca de inactivo.
 */
const textoProveedor = (p: Tercero): string =>
  `${p.codigo} - ${p.nombre}${p.activo ? '' : ' (inactivo)'}`;

/**
 * Ventana «Abono a proveedor» (§8): registra un pago repartido entre las
 * compras con saldo, muestra los abonos anteriores con «Ver recibo» y
 * «Anular…», e imprime el recibo en hoja carta. Av. Pág guarda.
 *
 * @returns La ventana.
 */
export function AbonoProveedor(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const [contexto, setContexto] = useState<ContextoAbono | null>(null);
  const [proveedores, setProveedores] = useState<Tercero[]>([]);
  const [formasPago, setFormasPago] = useState<RegistroCatalogo[]>([]);
  const [proveedor, setProveedor] = useState<Tercero | null>(null);
  const [datosProveedor, setDatosProveedor] = useState<ContextoAbonoProveedor | null>(null);
  const [f, setF] = useState<FormularioAbono | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardado, setGuardado] = useState<(AbonoGuardado & { valor: number }) | null>(null);
  const [vista, setVista] = useState<DocumentoImprimible | null>(null);
  const [anulando, setAnulando] = useState<AbonoResumen | null>(null);
  const campoProveedor = useRef<HTMLInputElement>(null);
  const cargado = f !== null;

  // La ventana abre mientras se cargan los datos: al terminar, el foco va al proveedor.
  useEffect(() => {
    if (cargado) campoProveedor.current?.focus();
  }, [cargado]);

  const cargarContexto = useCallback(async (): Promise<ContextoAbono | null> => {
    const r = await invocar('abonos:contexto', undefined);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setContexto(r.datos);
    return r.datos;
  }, []);

  useEffect(() => {
    void (async () => {
      const [ctx, prov, fp] = await Promise.all([
        cargarContexto(),
        invocar('terceros:listar', 'proveedor'),
        invocar('catalogos:listar', 'forma-pago'),
      ]);
      if (prov.ok) setProveedores(prov.datos);
      if (fp.ok) setFormasPago(fp.datos);
      if (ctx) setF(formularioVacio(ctx.hoy));
    })();
  }, [cargarContexto]);

  /**
   * Carga deuda, facturas pendientes y abonos del proveedor, y reparte de
   * nuevo el valor escrito.
   *
   * @param codigo - Proveedor.
   */
  const cargarProveedor = useCallback(async (codigo: number): Promise<void> => {
    const r = await invocar('abonos:contextoProveedor', codigo);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    setDatosProveedor(r.datos);
    setF((actual) =>
      actual ? { ...actual, aplicar: repartoEscrito(actual.valor, r.datos.facturas) } : actual,
    );
  }, []);

  // El proveedor elegido no cuenta: se conserva a propósito después de guardar.
  const tieneDatos = f !== null && (f.valor.trim() !== '' || f.observacion.trim() !== '');

  useEffect(() => {
    marcarCambios(tieneDatos);
  }, [tieneDatos, marcarCambios]);

  const cambiar = (cambios: Partial<FormularioAbono>): void => {
    setF((actual) => (actual ? { ...actual, ...cambios } : actual));
    setAviso(null);
  };

  const elegirProveedor = (p: Tercero): void => {
    setProveedor(p);
    setDatosProveedor(null);
    setAviso(null);
    void cargarProveedor(p.codigo);
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
    setProveedor(null);
    setDatosProveedor(null);
    setF(formularioVacio(contexto.hoy));
    setAviso(null);
  };

  const facturas = datosProveedor?.facturas ?? [];
  const aplicadoPorFactura = facturas.map((fa) => ({
    factura: fa,
    texto: f?.aplicar[fa.id] ?? '0',
    valor: leerPesos(f?.aplicar[fa.id] ?? '0'),
  }));
  const aplicado = aplicadoPorFactura.reduce((suma, a) => suma + (a.valor ?? 0), 0);
  const valor = f ? leerPesos(f.valor) : null;

  const guardar = async (): Promise<void> => {
    if (!f || ocupado) return;
    const error = validarFormulario(f, proveedor, valor, aplicadoPorFactura);
    if (error !== null) {
      setAviso({ tipo: 'error', texto: error });
      return;
    }
    const fecha = leerFecha(f.fecha) ?? '';
    if (proveedor === null || valor === null) return;
    setOcupado(true);
    const r = await invocar('abonos:guardar', {
      proveedorCodigo: proveedor.codigo,
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
    // Se conserva el proveedor y la forma de pago: es común abonar a varias compras seguidas.
    setF({ ...formularioVacio(ctx?.hoy ?? contexto?.hoy ?? ''), formaPagoId: f.formaPagoId });
    await cargarProveedor(proveedor.codigo);
  };

  const imprimirOriginal = async (id: number): Promise<string | null> => {
    const r = await invocar('impresion:imprimir', {
      tipo: 'abono-proveedor',
      id,
      reimpresion: false,
    });
    return r.ok ? null : r.error.mensaje;
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

  const deudaTotal = datosProveedor?.deuda.total ?? 0;

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
          <span>Proveedor *</span>
          <Buscador
            registros={proveedores}
            clave={(p) => p.codigo}
            texto={textoProveedor}
            coincide={(p, b) =>
              String(p.codigo).startsWith(b) || claveComparacion(p.nombre).includes(b)
            }
            exacto={(p, escrito) => String(p.codigo) === escrito}
            seleccionado={proveedor}
            alElegir={elegirProveedor}
            campo={campoProveedor}
            ayuda="Código o parte del nombre…"
            etiqueta="Proveedor"
          />
        </label>
        <Deuda deuda={datosProveedor?.deuda ?? null} />
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
                <th className="num">Compra</th>
                <th>Factura proveedor</th>
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
                  <td className="tabla__vacia" colSpan={9}>
                    {proveedor === null
                      ? 'Elija el proveedor para ver sus facturas pendientes.'
                      : datosProveedor === null
                        ? 'Cargando…'
                        : 'Este proveedor no tiene facturas con saldo.'}
                  </td>
                </tr>
              )}
              {aplicadoPorFactura.map(({ factura: fa, texto, valor: v }) => {
                const estado = contexto ? textoVencimiento(fa.vence, contexto.hoy) : null;
                return (
                  <tr key={fa.id} className={v === null ? 'fila--alerta' : undefined}>
                    <td className="num">{fa.numero}</td>
                    <td>{fa.numeroProveedor}</td>
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
                        aria-label={`Aplicar a la compra ${fa.numero}`}
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
        <legend>Abonos anteriores de este proveedor</legend>
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
              {(datosProveedor?.abonos.length ?? 0) === 0 && (
                <tr>
                  <td className="tabla__vacia" colSpan={7}>
                    {proveedor === null ? '—' : 'Sin abonos anteriores.'}
                  </td>
                </tr>
              )}
              {datosProveedor?.abonos.map((a) => (
                <tr key={a.id} className={a.estado === 'anulado' ? 'fila--inactiva' : undefined}>
                  <td className="num">{a.numero}</td>
                  <td className="num">{formatearFecha(a.fecha)}</td>
                  <td>{a.formaPagoNombre}</td>
                  <td className="num">{agruparMiles(a.valor)}</td>
                  <td>
                    {a.aplicaciones.map((ap) => `Compra ${ap.compraNumero}`).join(', ')}
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
                        setVista({ tipo: 'abono-proveedor', id: a.id, reimpresion: true })
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
            if (proveedor) void cargarProveedor(proveedor.codigo);
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
 * @param proveedor - Proveedor elegido.
 * @param valor - Valor leído.
 * @param aplicaciones - «Aplicar» leído de cada factura.
 * @returns Mensaje del primer error, o `null` si se puede enviar.
 */
function validarFormulario(
  f: FormularioAbono,
  proveedor: Tercero | null,
  valor: number | null,
  aplicaciones: readonly { factura: FacturaPendiente; valor: number | null }[],
): string | null {
  if (proveedor === null) return 'Elija el proveedor.';
  if (leerFecha(f.fecha) === null) return 'La fecha no es válida: use el formato dd/mm/aaaa.';
  if (f.formaPagoId === '') return 'Elija la forma de pago.';
  if (valor === null || valor <= 0) {
    return 'Escriba el valor del abono en pesos, sin centavos (por ejemplo 500,000).';
  }
  const invalida = aplicaciones.find((a) => a.valor === null);
  if (invalida) {
    return `El valor a aplicar a la compra ${invalida.factura.numero} no es un valor válido en pesos.`;
  }
  return null;
}
