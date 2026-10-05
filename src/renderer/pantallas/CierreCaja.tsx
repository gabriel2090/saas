import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  DENOMINACIONES,
  documentosDeConcepto,
  efectivoARetirar,
  esperadoPorForma,
  textoDiferencia,
  totalConteo,
} from '../../domain/cierre-caja';
import {
  CONCEPTOS_CIERRE,
  NOMBRE_CONCEPTO,
  type CierreGuardado,
  type CierreResumen,
  type ConceptoCierre,
  type ConteoDenominacion,
  type DocumentoCierre,
  type EstadoCierreNuevo,
  type FilaConceptoCierre,
} from '../../shared/cierreCaja';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import {
  agruparMiles,
  formatearPesos,
  leerPesos,
  leerPesosConSigno,
  pesosConSigno,
} from '../../shared/formato/moneda';
import type { DocumentoImprimible } from '../../shared/impresion';
import { ATAJOS } from '../../shared/keymap';
import { textoCombinacion } from '../atajos/combinacion';
import { ATRIBUTO_FLECHAS_PROPIAS, ATRIBUTO_FOCO_INICIAL } from '../atajos/navegacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { DialogoMotivo } from '../documentos/DialogoMotivo';
import { useCandado } from '../documentos/useCandado';
import { VistaPrevia } from '../documentos/VistaPrevia';
import { NOMBRE_DOCUMENTO } from '../reportes/MarcoReporte';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Lo que se ve: el cierre nuevo (sin guardar) o el número de un cierre guardado.
 */
type VistaCierre = 'nuevo' | number;

/**
 * Signo que se muestra junto a cada concepto (las anulaciones traen el suyo).
 */
const SIGNO_VISIBLE: Readonly<Record<ConceptoCierre, string>> = {
  ventas: '+',
  abonosClientes: '+',
  reintegrosRecibe: '+',
  abonosProveedores: '−',
  reintegrosEntrega: '−',
  anulacionesAnteriores: '±',
};

/**
 * Aclaración que acompaña el nombre de algunos conceptos.
 */
const ACLARACION_CONCEPTO: Readonly<Partial<Record<ConceptoCierre, string>>> = {
  abonosProveedores: 'incluye compras de contado',
};

/**
 * Clave de una denominación en el contador.
 *
 * @param d - Billete o moneda.
 * @param d.tipo - Billete o moneda.
 * @param d.valor - Valor en pesos.
 * @returns Clave como `billete-50000`.
 */
function claveDenominacion(d: { tipo: string; valor: number }): string {
  return `${d.tipo}-${d.valor}`;
}

/**
 * Lee la cantidad de billetes o monedas escrita en el contador.
 *
 * @param texto - Texto escrito.
 * @returns Cantidad (vacío = 0), o `null` si no es un entero.
 */
function leerCantidadBilletes(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === '') return 0;
  return /^\d{1,6}$/.test(limpio) ? Number(limpio) : null;
}

/**
 * Texto de los cierres anulados entre el anterior vigente y este.
 *
 * @param anulados - Números de los cierres anulados.
 * @returns P. ej. «el 10 está anulado», o vacío si no hay.
 */
function textoAnulados(anulados: readonly number[]): string {
  if (anulados.length === 0) return '';
  if (anulados.length === 1) return `el ${anulados[0]} está anulado`;
  return `los ${anulados.slice(0, -1).join(', ')} y ${anulados[anulados.length - 1]} están anulados`;
}

/**
 * Clase de la celda de un valor: los negativos se ven en rojo.
 *
 * @param valor - Pesos.
 * @returns Clases de la celda.
 */
function claseValor(valor: number): string {
  return valor < 0 ? 'num negativo' : 'num';
}

/**
 * Clase de la celda de una diferencia.
 *
 * @param diferencia - Contado menos esperado, o `null` si falta el contado.
 * @returns Clases de la celda.
 */
function claseDiferencia(diferencia: number | null): string {
  if (diferencia === null || diferencia === 0) return 'num texto-tenue';
  return diferencia < 0 ? 'num texto-error' : 'num';
}

/**
 * Ventana «Cierre de caja» (Fase 5d, D-150 a D-155): arqueo del tramo desde el
 * cierre anterior vigente hasta el momento de guardar. Muestra los conceptos
 * por forma de pago, la base inicial automática, lo esperado, lo contado y la
 * diferencia; el efectivo se digita o se cuenta con el contador de billetes
 * (F8) y las demás formas vienen con lo esperado. A la derecha, los
 * documentos del concepto elegido (↑/↓). Los cierres guardados se ven, se
 * imprimen (Ctrl+P) y solo el último vigente se anula (Ctrl+X).
 *
 * @returns El contenido de la ventana.
 */
export function CierreCaja(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const conCandado = useCandado();
  const [vista, setVista] = useState<VistaCierre>('nuevo');
  const [lista, setLista] = useState<CierreResumen[]>([]);
  const [nuevo, setNuevo] = useState<EstadoCierreNuevo | null>(null);
  const [guardado, setGuardado] = useState<CierreGuardado | null>(null);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [baseInicialTexto, setBaseInicialTexto] = useState('');
  const [contadoTexto, setContadoTexto] = useState<Readonly<Record<number, string>>>({});
  const [baseQuedaTexto, setBaseQuedaTexto] = useState<string | null>(null);
  const [observacion, setObservacion] = useState('');
  const [conteoTexto, setConteoTexto] = useState<Readonly<Record<string, string>>>({});
  const [contando, setContando] = useState(false);
  const [concepto, setConcepto] = useState<ConceptoCierre>('ventas');
  const [documentoElegido, setDocumentoElegido] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState(false);
  const [documentoAbierto, setDocumentoAbierto] = useState<{
    imprimible: DocumentoImprimible;
    titulo: string;
  } | null>(null);
  const [anulando, setAnulando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const campoEfectivo = useRef<HTMLInputElement>(null);
  const tablaConceptos = useRef<HTMLDivElement>(null);
  const panelDocumentos = useRef<HTMLDivElement>(null);
  const panelBilletes = useRef<HTMLDivElement>(null);
  const filaDocumento = useRef<HTMLTableRowElement>(null);
  const enfocadoAlCargar = useRef(false);

  const cargarLista = useCallback((): void => {
    void invocar('cierres:listar', undefined).then((r) => {
      if (r.ok) setLista(r.datos);
    });
  }, []);

  const cargarNuevo = useCallback((): void => {
    void invocar('cierres:nuevo', undefined).then((r) => {
      if (r.ok) {
        setNuevo(r.datos);
        setErrorCarga(null);
      } else {
        setErrorCarga(r.error.mensaje);
      }
    });
  }, []);

  useEffect(cargarLista, [cargarLista]);

  // El cierre nuevo llega hasta «ahora»: se recalcula cada vez que la ventana vuelve al frente.
  useEffect(() => {
    if (vista === 'nuevo' && activa) cargarNuevo();
  }, [vista, activa, cargarNuevo]);

  useEffect(() => {
    if (vista === 'nuevo') return undefined;
    let vigente = true;
    void invocar('cierres:obtener', vista).then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setGuardado(r.datos);
        setErrorCarga(null);
      } else {
        setGuardado(null);
        setErrorCarga(r.error.mensaje);
      }
    });
    return () => {
      vigente = false;
    };
  }, [vista]);

  useEffect(() => {
    if (vista === 'nuevo' && nuevo && !enfocadoAlCargar.current) {
      enfocadoAlCargar.current = true;
      campoEfectivo.current?.focus();
    }
  }, [vista, nuevo]);

  const esNuevo = vista === 'nuevo';
  const tieneDatos =
    esNuevo &&
    (Object.keys(contadoTexto).length > 0 ||
      baseInicialTexto.trim() !== '' ||
      baseQuedaTexto !== null ||
      observacion.trim() !== '' ||
      Object.values(conteoTexto).some((t) => t.trim() !== ''));

  useEffect(() => {
    marcarCambios(tieneDatos);
  }, [tieneDatos, marcarCambios]);

  const calculo = (esNuevo ? nuevo : guardado)?.calculo ?? null;
  const formas = calculo?.formas ?? [];
  const indiceBase = formas.findIndex((f) => f.recibeBase);
  const formaBase = formas[indiceBase] ?? null;

  let baseInicial: number | null = null;
  if (esNuevo && nuevo) {
    baseInicial = nuevo.baseInicial ?? leerPesos(baseInicialTexto);
  } else if (!esNuevo && guardado) {
    baseInicial = guardado.baseInicial;
  }
  const esperado =
    esNuevo && calculo
      ? esperadoPorForma(formas, calculo.movimiento, baseInicial ?? 0)
      : (guardado?.arqueo.map((a) => a.esperado) ?? []);
  const contado: (number | null)[] = formas.map((f, i) => {
    if (!esNuevo) return guardado?.arqueo[i]?.contado ?? null;
    const texto = contadoTexto[f.id];
    if (texto !== undefined) return leerPesosConSigno(texto);
    return f.seCuenta ? null : (esperado[i] ?? 0);
  });
  const diferencia = formas.map((_, i) => {
    const c = contado[i];
    return c === null || c === undefined ? null : c - (esperado[i] ?? 0);
  });
  const contadoBase = indiceBase >= 0 ? (contado[indiceBase] ?? null) : null;
  let baseQueda: number | null;
  if (!esNuevo) baseQueda = guardado?.baseQueda ?? null;
  else baseQueda = baseQuedaTexto === null ? baseInicial : leerPesos(baseQuedaTexto);
  const retirar =
    contadoBase !== null && baseQueda !== null ? efectivoARetirar(contadoBase, baseQueda) : null;

  const conteo: ConteoDenominacion[] = DENOMINACIONES.map((d) => ({
    ...d,
    cantidad: leerCantidadBilletes(conteoTexto[claveDenominacion(d)] ?? '') ?? 0,
  }));
  const conteoInvalido = DENOMINACIONES.some(
    (d) => leerCantidadBilletes(conteoTexto[claveDenominacion(d)] ?? '') === null,
  );
  const totalContado = totalConteo(conteo);

  const documentos = calculo ? documentosDeConcepto(calculo.documentos, concepto) : [];
  const elegido = documentos.find((d) => d.clave === documentoElegido) ?? documentos[0] ?? null;
  const ultimoVigente = lista.find((c) => c.estado === 'activo')?.numero ?? null;

  useEffect(() => {
    filaDocumento.current?.scrollIntoView({ block: 'nearest' });
  }, [elegido?.clave]);

  const limpiarAviso = (): void => setAviso(null);

  const cambiarVista = (valor: string): void => {
    limpiarAviso();
    setContando(false);
    setGuardado(null);
    setVista(valor === 'nuevo' ? 'nuevo' : Number(valor));
  };

  const guardar = async (): Promise<void> => {
    if (!esNuevo || !nuevo || !calculo) return;
    if (nuevo.baseInicial === null && baseInicial === null) {
      setAviso({
        tipo: 'error',
        texto: 'Escriba la base inicial (el efectivo con que abrió la caja).',
      });
      return;
    }
    const invalida = formas.find((f, i) => contado[i] === null && contadoTexto[f.id] !== undefined);
    if (invalida && (contadoTexto[invalida.id] ?? '').trim() !== '') {
      setAviso({ tipo: 'error', texto: `El contado de ${invalida.nombre} no es un valor válido.` });
      return;
    }
    const faltante = formas.find((_, i) => contado[i] === null);
    if (faltante) {
      setAviso({ tipo: 'error', texto: `Escriba el valor contado de ${faltante.nombre}.` });
      campoEfectivo.current?.focus();
      return;
    }
    if (baseQueda === null) {
      setAviso({ tipo: 'error', texto: 'La base que queda en caja no es un valor válido.' });
      return;
    }
    const filasConteo = conteo.filter((c) => c.cantidad > 0);
    setOcupado(true);
    const r = await invocar('cierres:guardar', {
      huella: nuevo.huella,
      baseInicial: nuevo.baseInicial === null ? baseInicial : null,
      contado: formas.map((f, i) => ({ formaPagoId: f.id, valor: contado[i] ?? 0 })),
      // El conteo solo se guarda si cuadra con el efectivo: si no, el efectivo se digitó aparte.
      conteo:
        filasConteo.length > 0 && !conteoInvalido && totalContado === contadoBase
          ? filasConteo
          : null,
      baseQueda,
      observacion,
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      if (r.error.codigo === 'CONFLICTO') cargarNuevo();
      return;
    }
    setBaseInicialTexto('');
    setContadoTexto({});
    setBaseQuedaTexto(null);
    setObservacion('');
    setConteoTexto({});
    setContando(false);
    setNuevo(null);
    enfocadoAlCargar.current = false;
    setGuardado(r.datos);
    setVista(r.datos.numero);
    setAviso({ tipo: 'exito', texto: `Cierre ${r.datos.numero} guardado.` });
    cargarLista();
  };

  const imprimir = (): void => {
    if (esNuevo) {
      setAviso({ tipo: 'alerta', texto: 'Guarde el cierre para imprimirlo o guardarlo en PDF.' });
      return;
    }
    if (guardado) setImprimiendo(true);
  };

  const verDocumento = (): void => {
    const d = elegido;
    if (!d) {
      setAviso({ tipo: 'alerta', texto: 'Elija un documento en el panel de la derecha.' });
      return;
    }
    if (!d.ver) {
      setAviso({ tipo: 'alerta', texto: `${d.documento} no tiene una vista para mostrar.` });
      return;
    }
    limpiarAviso();
    setDocumentoAbierto({
      imprimible: { tipo: d.ver.tipo, id: d.ver.id, reimpresion: true, tirilla: true },
      titulo: `${NOMBRE_DOCUMENTO[d.ver.tipo]} ${d.ver.numero} (reimpresión)`,
    });
  };

  const pedirAnular = (): void => {
    if (esNuevo || !guardado) return;
    if (guardado.estado === 'anulado') {
      setAviso({ tipo: 'alerta', texto: `El cierre ${guardado.numero} ya está anulado.` });
      return;
    }
    if (!guardado.esUltimo) {
      setAviso({
        tipo: 'alerta',
        texto: `Solo se puede anular el último cierre (el ${ultimoVigente ?? '—'}).`,
      });
      return;
    }
    limpiarAviso();
    setAnulando(true);
  };

  const anular = async (motivo: string): Promise<string | null> => {
    if (!guardado) return null;
    const r = await invocar('cierres:anular', { numero: guardado.numero, motivo });
    if (!r.ok) return r.error.mensaje;
    setAnulando(false);
    setGuardado(r.datos);
    setAviso({
      tipo: 'exito',
      texto: `Cierre ${r.datos.numero} anulado. Su tramo lo cubrirá el próximo cierre.`,
    });
    cargarLista();
    return null;
  };

  const pasarConteo = (): void => {
    if (conteoInvalido) {
      setAviso({ tipo: 'error', texto: 'Escriba en el contador cantidades enteras.' });
      return;
    }
    if (formaBase) {
      setContadoTexto((t) => ({ ...t, [formaBase.id]: agruparMiles(totalContado) }));
    }
    setContando(false);
    limpiarAviso();
    campoEfectivo.current?.focus();
  };

  /**
   * Mueve el concepto o el documento según dónde esté el foco.
   *
   * @param direccion - `1` abajo, `-1` arriba.
   * @returns Manejador del atajo.
   */
  const mover =
    (direccion: 1 | -1): (() => boolean) =>
    () => {
      const foco = document.activeElement;
      if (tablaConceptos.current?.contains(foco)) {
        const i = CONCEPTOS_CIERRE.indexOf(concepto);
        const destino =
          CONCEPTOS_CIERRE[Math.min(Math.max(i + direccion, 0), CONCEPTOS_CIERRE.length - 1)];
        if (destino) setConcepto(destino);
        return true;
      }
      if (panelDocumentos.current?.contains(foco) && documentos.length > 0) {
        const i = elegido ? documentos.indexOf(elegido) : -1;
        const destino = documentos[Math.min(Math.max(i + direccion, 0), documentos.length - 1)];
        if (destino) setDocumentoElegido(destino.clave);
        return true;
      }
      return false;
    };

  useAtajos(
    {
      guardarCierre: () => void conCandado(guardar),
      contarBilletes: () => {
        if (esNuevo && formaBase) setContando((c) => !c);
      },
      imprimirCierre: imprimir,
      verDocumentoCierre: verDocumento,
      anularCierre: pedirAnular,
      moverAbajo: mover(1),
      moverArriba: mover(-1),
      aceptar: () => {
        if (!contando || !panelBilletes.current?.contains(document.activeElement)) return false;
        pasarConteo();
        return true;
      },
      retroceder: () => {
        if (!contando) return false;
        setContando(false);
        campoEfectivo.current?.focus();
        return true;
      },
    },
    { activo: activa && !imprimiendo && documentoAbierto === null && !anulando },
  );

  const valorFila = (f: FilaConceptoCierre): number => f.valores.reduce((s, v) => s + v, 0);
  const movimientoTotal = calculo ? calculo.movimiento.reduce((s, v) => s + v, 0) : 0;
  const esperadoTotal = esperado.reduce((s, v) => s + v, 0);
  const contadoCompleto = contado.every((c) => c !== null);
  const contadoTotal = contado.reduce<number>((s, v) => s + (v ?? 0), 0);
  const diferenciaTotal = contadoCompleto ? contadoTotal - esperadoTotal : null;

  return (
    <div className="reporte">
      <div className="barra-herramientas">
        {esNuevo && (
          <>
            <button
              type="button"
              className="boton boton--primario"
              tabIndex={-1}
              disabled={ocupado || !nuevo}
              onClick={() => void conCandado(guardar)}
            >
              Guardar cierre
              <span className="atajo">{textoCombinacion(ATAJOS.guardarCierre.combinacion)}</span>
            </button>
            <button
              type="button"
              className="boton"
              tabIndex={-1}
              disabled={!formaBase}
              onClick={() => setContando((c) => !c)}
            >
              Contar billetes
              <span className="atajo">{textoCombinacion(ATAJOS.contarBilletes.combinacion)}</span>
            </button>
          </>
        )}
        <button
          type="button"
          className="boton"
          tabIndex={-1}
          disabled={esNuevo || !guardado}
          title={esNuevo ? 'Guarde el cierre para imprimirlo' : undefined}
          onClick={imprimir}
        >
          Imprimir o guardar PDF
          <span className="atajo">{textoCombinacion(ATAJOS.imprimirCierre.combinacion)}</span>
        </button>
        <button
          type="button"
          className="boton"
          tabIndex={-1}
          disabled={!elegido?.ver}
          onClick={verDocumento}
        >
          Ver documento
          <span className="atajo">{textoCombinacion(ATAJOS.verDocumentoCierre.combinacion)}</span>
        </button>
        {!esNuevo && guardado && guardado.estado === 'activo' && (
          <button
            type="button"
            className={guardado.esUltimo ? 'boton boton--peligro' : 'boton'}
            tabIndex={-1}
            disabled={!guardado.esUltimo}
            title={
              guardado.esUltimo
                ? undefined
                : `Solo se puede anular el último cierre (el ${ultimoVigente ?? '—'})`
            }
            onClick={pedirAnular}
          >
            Anular cierre…
            <span className="atajo">{textoCombinacion(ATAJOS.anularCierre.combinacion)}</span>
          </button>
        )}
        <label className="campo campo--en-linea">
          <span>Ver</span>
          <select value={String(vista)} onChange={(e) => cambiarVista(e.target.value)}>
            <option value="nuevo">Cierre nuevo (sin guardar)</option>
            {lista.map((c) => (
              <option key={c.numero} value={String(c.numero)}>
                {`Cierre ${c.numero} · ${formatearFechaHora(c.hasta)}${c.estado === 'anulado' ? ' · ANULADO' : ''}`}
              </option>
            ))}
          </select>
        </label>
        <span className="barra-herramientas__separador" />
        <span className="barra-herramientas__resumen">
          {resumenCierre(esNuevo ? nuevo : null, esNuevo ? null : guardado)}
        </span>
      </div>
      {errorCarga && <Aviso tipo="error">{errorCarga}</Aviso>}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {calculo && (
        <div className="cierre">
          <div className="cierre__principal">
            <div
              className="tabla-contenedor cierre__conceptos"
              ref={tablaConceptos}
              tabIndex={0}
              {...{ [ATRIBUTO_FLECHAS_PROPIAS]: '' }}
              {...(esNuevo ? {} : { [ATRIBUTO_FOCO_INICIAL]: '' })}
            >
              <table className="tabla tabla--cierre">
                <thead>
                  <tr>
                    <th className="signo" />
                    <th>Concepto</th>
                    {formas.map((f) => (
                      <th key={f.id} className="num">
                        {f.nombre}
                      </th>
                    ))}
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {calculo.filas.map((f) => (
                    <tr
                      key={f.concepto}
                      className={f.concepto === concepto ? 'concepto--activo' : undefined}
                      onClick={() => setConcepto(f.concepto)}
                    >
                      <td className="signo">{SIGNO_VISIBLE[f.concepto]}</td>
                      <td>
                        {NOMBRE_CONCEPTO[f.concepto]}{' '}
                        <span className="texto-tenue">
                          {ACLARACION_CONCEPTO[f.concepto]
                            ? `(${ACLARACION_CONCEPTO[f.concepto]}) `
                            : ''}
                          ({f.cantidad})
                        </span>
                      </td>
                      {f.valores.map((v, i) => (
                        <td key={formas[i]?.id ?? i} className={claseValor(v)}>
                          {pesosConSigno(v)}
                        </td>
                      ))}
                      <td className={claseValor(valorFila(f))}>{pesosConSigno(valorFila(f))}</td>
                    </tr>
                  ))}
                  <tr className="neto">
                    <td className="signo">=</td>
                    <td>Movimiento del tramo</td>
                    {calculo.movimiento.map((v, i) => (
                      <td key={formas[i]?.id ?? i} className={claseValor(v)}>
                        {pesosConSigno(v)}
                      </td>
                    ))}
                    <td className={claseValor(movimientoTotal)}>
                      {pesosConSigno(movimientoTotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="signo">+</td>
                    <td>
                      Base inicial{' '}
                      <span className="texto-tenue">
                        {esNuevo && nuevo?.baseInicial === null
                          ? '(primer cierre: escriba el efectivo con que abrió la caja)'
                          : '(automática: la que dejó el cierre anterior vigente)'}
                      </span>
                    </td>
                    {formas.map((f) => (
                      <td key={f.id} className="num">
                        {f.recibeBase &&
                          (esNuevo && nuevo?.baseInicial === null ? (
                            <input
                              className="a-mano"
                              value={baseInicialTexto}
                              inputMode="numeric"
                              placeholder="0"
                              aria-label="Base inicial"
                              onChange={(e) => {
                                setBaseInicialTexto(e.target.value);
                                limpiarAviso();
                              }}
                            />
                          ) : (
                            agruparMiles(baseInicial ?? 0)
                          ))}
                      </td>
                    ))}
                    <td className="num">{baseInicial === null ? '' : agruparMiles(baseInicial)}</td>
                  </tr>
                  <tr className="esperado">
                    <td className="signo">=</td>
                    <td>Esperado en caja</td>
                    {esperado.map((v, i) => (
                      <td key={formas[i]?.id ?? i} className={claseValor(v)}>
                        {pesosConSigno(v)}
                      </td>
                    ))}
                    <td className={claseValor(esperadoTotal)}>{pesosConSigno(esperadoTotal)}</td>
                  </tr>
                  <tr className="contado">
                    <td className="signo" />
                    <td>Contado (arqueo)</td>
                    {formas.map((f, i) => {
                      const valor = contado[i];
                      const texto =
                        contadoTexto[f.id] ??
                        (valor === null || valor === undefined ? '' : pesosConSigno(valor));
                      return (
                        <td key={f.id} className="num">
                          <input
                            ref={f.recibeBase ? campoEfectivo : undefined}
                            className={
                              !esNuevo
                                ? undefined
                                : f.seCuenta
                                  ? 'a-mano'
                                  : contadoTexto[f.id] === undefined
                                    ? 'precargado'
                                    : undefined
                            }
                            value={texto}
                            readOnly={!esNuevo}
                            tabIndex={esNuevo ? undefined : -1}
                            inputMode="numeric"
                            placeholder={f.seCuenta ? '0' : undefined}
                            aria-label={`Contado de ${f.nombre}`}
                            {...(esNuevo && f.recibeBase ? { [ATRIBUTO_FOCO_INICIAL]: '' } : {})}
                            onChange={(e) => {
                              const escrito = e.target.value;
                              setContadoTexto((t) => ({ ...t, [f.id]: escrito }));
                              limpiarAviso();
                            }}
                          />
                        </td>
                      );
                    })}
                    <td className="num">{contadoCompleto ? pesosConSigno(contadoTotal) : ''}</td>
                  </tr>
                  <tr className="diferencia">
                    <td className="signo" />
                    <td>Diferencia</td>
                    {diferencia.map((d, i) => (
                      <td key={formas[i]?.id ?? i} className={claseDiferencia(d)}>
                        {d === null ? '' : textoDiferencia(d)}
                      </td>
                    ))}
                    <td className={claseDiferencia(diferenciaTotal)}>
                      {diferenciaTotal === null ? '' : textoDiferencia(diferenciaTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            {esNuevo && formaBase && (
              <p className="nota-cierre">
                {`${formaBase.nombre} se cuenta: digítelo o use el contador de billetes y monedas (${textoCombinacion(ATAJOS.contarBilletes.combinacion)}).`}
                {formas.some((f) => !f.seCuenta) &&
                  ` ${formas
                    .filter((f) => !f.seCuenta)
                    .map((f) => f.nombre)
                    .join(
                      ' y ',
                    )} vienen con lo esperado; cámbielas solo si hay diferencia (con «-» adelante si salió más de lo que entró).`}
              </p>
            )}

            <AvisosCierre
              documentos={calculo.documentos}
              saldoFavor={calculo.saldoFavor}
              otraFecha={calculo.otraFecha}
            />
            {esNuevo && diferencia.some((d) => d !== null && d !== 0) && (
              <Aviso tipo="alerta">
                {formas
                  .map((f, i) => ({ f, d: diferencia[i] ?? 0 }))
                  .filter((x) => x.d !== 0)
                  .map(
                    (x) =>
                      `${x.d < 0 ? 'Faltan' : 'Sobran'} ${formatearPesos(Math.abs(x.d))} en ${x.f.nombre.toLowerCase()}.`,
                  )
                  .join(' ')}{' '}
                Puede guardar así; la diferencia queda registrada con el cierre.
              </Aviso>
            )}
            {!esNuevo && guardado && (
              <AvisoGuardado cierre={guardado} ultimoVigente={ultimoVigente} />
            )}

            <div className="cierre__base">
              <label className="campo">
                <span>Observación (opcional)</span>
                <input
                  value={esNuevo ? observacion : (guardado?.observacion ?? '')}
                  readOnly={!esNuevo}
                  tabIndex={esNuevo ? undefined : -1}
                  placeholder={esNuevo ? 'Por ejemplo: faltante por cambio mal dado' : undefined}
                  onChange={(e) => {
                    setObservacion(e.target.value);
                    limpiarAviso();
                  }}
                />
              </label>
              <label
                className="campo"
                title={
                  contadoBase === null
                    ? undefined
                    : `No puede ser mayor que el efectivo contado (${agruparMiles(contadoBase)})`
                }
              >
                <span>Base que queda en caja</span>
                <input
                  value={
                    !esNuevo
                      ? agruparMiles(guardado?.baseQueda ?? 0)
                      : (baseQuedaTexto ?? (baseInicial === null ? '' : agruparMiles(baseInicial)))
                  }
                  readOnly={!esNuevo}
                  tabIndex={esNuevo ? undefined : -1}
                  inputMode="numeric"
                  onChange={(e) => {
                    setBaseQuedaTexto(e.target.value);
                    limpiarAviso();
                  }}
                />
              </label>
              <div className={`retiro${retirar !== null && retirar < 0 ? ' retiro--error' : ''}`}>
                Efectivo a retirar o consignar
                <strong>{retirar === null ? '—' : formatearPesos(retirar)}</strong>
              </div>
            </div>
          </div>

          {contando && esNuevo ? (
            <aside className="cierre__detalle" ref={panelBilletes}>
              <h3>Contador de billetes y monedas</h3>
              <div className="tabla-contenedor">
                <table className="tabla tabla--billetes">
                  <thead>
                    <tr>
                      <th>Denominación</th>
                      <th className="num">Cantidad</th>
                      <th className="num">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {DENOMINACIONES.map((d, i) => {
                      const clave = claveDenominacion(d);
                      const texto = conteoTexto[clave] ?? '';
                      const cantidad = leerCantidadBilletes(texto);
                      const subtotal = cantidad === null ? null : cantidad * d.valor;
                      return (
                        <FilaBillete
                          key={clave}
                          seccion={
                            DENOMINACIONES[i - 1]?.tipo === d.tipo
                              ? null
                              : d.tipo === 'billete'
                                ? 'Billetes'
                                : 'Monedas'
                          }
                          valor={d.valor}
                          texto={texto}
                          subtotal={subtotal}
                          enfocar={i === 0}
                          alCambiar={(t) => setConteoTexto((c) => ({ ...c, [clave]: t }))}
                        />
                      );
                    })}
                    <tr className="total">
                      <td colSpan={2}>Total contado</td>
                      <td className="num">{agruparMiles(totalContado)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="nota-cierre">
                Enter pasa el total al efectivo contado; Esc cierra el contador. Es opcional:
                también se puede digitar el efectivo directo.
              </p>
            </aside>
          ) : (
            <aside className="cierre__detalle">
              <h3>{NOMBRE_CONCEPTO[concepto]} del tramo</h3>
              <div
                className="tabla-contenedor"
                ref={panelDocumentos}
                tabIndex={0}
                {...{ [ATRIBUTO_FLECHAS_PROPIAS]: '' }}
              >
                <table className="tabla tabla--seleccionable">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Tercero</th>
                      <th>Forma</th>
                      <th className="num">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documentos.length === 0 && (
                      <tr>
                        <td className="tabla__vacia" colSpan={4}>
                          No hay documentos en este concepto.
                        </td>
                      </tr>
                    )}
                    {documentos.map((d) => {
                      const seleccionado = d.clave === elegido?.clave;
                      return (
                        <tr
                          key={d.clave}
                          ref={seleccionado ? filaDocumento : undefined}
                          className={seleccionado ? 'fila--seleccionada' : undefined}
                          title={d.nota || undefined}
                          onClick={() => setDocumentoElegido(d.clave)}
                        >
                          <td>{d.documento}</td>
                          <td>{d.tercero}</td>
                          <td>{d.formaPago}</td>
                          <td className={claseValor(d.valor)}>{pesosConSigno(d.valor)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="nota-cierre">
                {elegido?.nota
                  ? elegido.nota
                  : '↑/↓ en la tabla de conceptos cambia de concepto; aquí, de documento.'}
              </p>
            </aside>
          )}
        </div>
      )}

      {imprimiendo && guardado && (
        <VistaPrevia
          reporte={{ reporte: 'cierre-caja', filtros: { numero: guardado.numero } }}
          titulo={`Cierre de caja ${guardado.numero}`}
          alCerrar={() => setImprimiendo(false)}
        />
      )}
      {documentoAbierto && (
        <VistaPrevia
          documento={documentoAbierto.imprimible}
          titulo={documentoAbierto.titulo}
          soloVer
          tirilla
          alCerrar={() => setDocumentoAbierto(null)}
        />
      )}
      {anulando && guardado && (
        <DialogoMotivo
          titulo={`¿Anular el cierre ${guardado.numero}?`}
          textoAceptar="Anular cierre"
          ejemploMotivo="se contó mal el efectivo"
          alAceptar={anular}
          alCancelar={() => setAnulando(false)}
        >
          <p className="dialogo__mensaje">
            El cierre {guardado.numero} conserva su número y queda marcado como{' '}
            <strong>ANULADO</strong>; no se puede deshacer. El próximo cierre cubrirá su tramo{' '}
            {guardado.anteriorNumero === null
              ? 'desde el principio'
              : `desde el cierre ${guardado.anteriorNumero}`}{' '}
            y partirá de la base que dejó ese cierre.
          </p>
        </DialogoMotivo>
      )}
    </div>
  );
}

/**
 * Texto del resumen de la barra: número y tramo del cierre que se ve.
 *
 * @param nuevo - Cierre nuevo, si es el que se ve.
 * @param guardado - Cierre guardado, si es el que se ve.
 * @returns Texto del resumen.
 */
function resumenCierre(nuevo: EstadoCierreNuevo | null, guardado: CierreGuardado | null): string {
  if (nuevo) {
    const a = nuevo.anterior;
    const anulados = textoAnulados(nuevo.anuladosEntre);
    return a
      ? `Cierre No. ${nuevo.numero} · tramo desde el cierre ${a.numero} vigente (${formatearFechaHora(a.hasta)}${anulados ? `; ${anulados}` : ''}) hasta el momento de guardar`
      : `Cierre No. ${nuevo.numero} · primer cierre: cubre todo lo registrado hasta el momento de guardar`;
  }
  if (guardado) {
    const anulados = textoAnulados(guardado.anuladosEntre);
    const tramo =
      guardado.desde === null
        ? `primer cierre, hasta el ${formatearFechaHora(guardado.hasta)}`
        : `tramo desde el cierre ${guardado.anteriorNumero ?? '—'} (${formatearFechaHora(guardado.desde)}${anulados ? `; ${anulados}` : ''}) al ${formatearFechaHora(guardado.hasta)}`;
    let estado = ' · no es el último';
    if (guardado.estado === 'anulado') estado = ' · ANULADO';
    else if (guardado.esUltimo) estado = ' · es el último: se puede anular';
    return `Cierre No. ${guardado.numero} · ${tramo}${estado}`;
  }
  return 'Calculando el cierre…';
}

/**
 * Propiedades de {@link AvisosCierre}.
 */
interface PropiedadesAvisosCierre {
  /** Documentos del cierre (para las anulaciones de días anteriores). */
  documentos: readonly DocumentoCierre[];
  /** Abonos pagados con saldo a favor. */
  saldoFavor: CierreGuardado['calculo']['saldoFavor'];
  /** Abonos con otra fecha. */
  otraFecha: CierreGuardado['calculo']['otraFecha'];
}

/**
 * Avisos del tramo: lo que no es dinero (saldo a favor), las anulaciones de
 * días anteriores y los abonos con una fecha distinta de la de registro.
 *
 * @param props - Propiedades del componente.
 * @returns Los avisos, o nada si no hay.
 */
function AvisosCierre(props: PropiedadesAvisosCierre): ReactNode {
  const anulaciones = documentosDeConcepto(props.documentos, 'anulacionesAnteriores');
  return (
    <>
      {(props.saldoFavor.length > 0 || anulaciones.length > 0) && (
        <Aviso tipo="info">
          {props.saldoFavor.length > 0 && (
            <>
              <strong>No es dinero:</strong>{' '}
              {props.saldoFavor
                .map(
                  (s) =>
                    `${formatearPesos(s.valor)} de saldo a favor aplicados en el ${s.documento.toLowerCase()} (${s.tercero})`,
                )
                .join('; ')}
              .{' '}
            </>
          )}
          {anulaciones.length > 0 && (
            <>
              <strong>Anulaciones de días anteriores:</strong>{' '}
              {anulaciones
                .map(
                  (d) =>
                    `${d.documento} de ${d.tercero} (${d.formaPago.toLowerCase()}, ${pesosConSigno(d.valor)}) · ${d.nota} · anulación del ${formatearFechaHora(d.momento)}`,
                )
                .join('; ')}
              .
            </>
          )}
        </Aviso>
      )}
      {props.otraFecha.length > 0 && (
        <Aviso tipo="alerta">
          <strong>Abono con otra fecha:</strong>{' '}
          {props.otraFecha
            .map(
              (a) =>
                `el ${a.documento.toLowerCase()} de ${a.tercero} (${formatearPesos(a.valor)}, ${a.formaPago.toLowerCase()}) tiene fecha ${formatearFecha(a.dia)} pero se registró el ${formatearFechaHora(a.registradoEn)}`,
            )
            .join('; ')}
          ; cuenta en este cierre.
        </Aviso>
      )}
    </>
  );
}

/**
 * Propiedades de {@link AvisoGuardado}.
 */
interface PropiedadesAvisoGuardado {
  /** Cierre guardado que se ve. */
  cierre: CierreGuardado;
  /** Número del último cierre vigente, o `null`. */
  ultimoVigente: number | null;
}

/**
 * Aviso de un cierre guardado: cuándo se guardó, con qué diferencia y si se
 * puede anular.
 *
 * @param props - Propiedades del componente.
 * @returns El aviso.
 */
function AvisoGuardado({ cierre, ultimoVigente }: PropiedadesAvisoGuardado): ReactNode {
  if (cierre.estado === 'anulado') {
    return (
      <Aviso tipo="error">
        Anulado ({cierre.anuladoEn ? formatearFechaHora(cierre.anuladoEn) : '—'}
        {cierre.motivoAnulacion ? `; motivo: ${cierre.motivoAnulacion}` : ''}). Su tramo lo cubre el
        cierre siguiente.
      </Aviso>
    );
  }
  const diferencias = cierre.calculo.formas
    .map((f, i) => ({ f, d: cierre.arqueo[i]?.diferencia ?? 0 }))
    .filter((x) => x.d !== 0)
    .map(
      (x) =>
        `un ${x.d < 0 ? 'faltante' : 'sobrante'} de ${formatearPesos(Math.abs(x.d))} en ${x.f.nombre.toLowerCase()}`,
    );
  const guardadoEl = `Guardado el ${formatearFechaHora(cierre.hasta)}`;
  return (
    <Aviso tipo="exito">
      {cierre.esUltimo
        ? `${guardadoEl} ${diferencias.length > 0 ? `con ${diferencias.join(' y ')}` : 'sin diferencias'}. No se edita; si hubo un error, se anula (solo el último) y se hace de nuevo: el cierre nuevo cubrirá su tramo.`
        : `${guardadoEl}; no se edita ni se anula: solo se puede anular el último cierre (el ${ultimoVigente ?? '—'}).`}
    </Aviso>
  );
}

/**
 * Propiedades de {@link FilaBillete}.
 */
interface PropiedadesFilaBillete {
  /** Título de sección antes de la fila («Billetes», «Monedas») o `null`. */
  seccion: string | null;
  /** Valor de la denominación. */
  valor: number;
  /** Cantidad escrita. */
  texto: string;
  /** Subtotal, o `null` si la cantidad no es válida. */
  subtotal: number | null;
  /** Si recibe el foco al abrir el contador. */
  enfocar: boolean;
  /** Cambia la cantidad escrita. */
  alCambiar: (texto: string) => void;
}

/**
 * Fila del contador de billetes y monedas.
 *
 * @param props - Propiedades del componente.
 * @returns La fila (con su título de sección si corresponde).
 */
function FilaBillete(props: PropiedadesFilaBillete): ReactNode {
  const campo = useRef<HTMLInputElement>(null);
  const { enfocar } = props;
  useEffect(() => {
    if (enfocar) campo.current?.focus();
  }, [enfocar]);
  return (
    <>
      {props.seccion && (
        <tr className="seccion">
          <td colSpan={3}>{props.seccion}</td>
        </tr>
      )}
      <tr>
        <td>{agruparMiles(props.valor)}</td>
        <td className="num">
          <input
            ref={campo}
            value={props.texto}
            inputMode="numeric"
            placeholder="0"
            aria-label={`Cantidad de ${agruparMiles(props.valor)}`}
            onChange={(e) => props.alCambiar(e.target.value)}
          />
        </td>
        <td className={props.subtotal ? 'num' : 'num texto-tenue'}>
          {props.subtotal === null ? '—' : agruparMiles(props.subtotal)}
        </td>
      </tr>
    </>
  );
}
