import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { diaDeIso, sumarDias } from '../../domain/calendario';
import { etiquetaAccion } from '../../domain/historial';
import { aIsoLocal, formatearFecha, formatearHora, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles } from '../../shared/formato/moneda';
import {
  ACCIONES_VISOR,
  MAXIMO_REGISTROS_HISTORIAL,
  TIPOS_DOCUMENTO_HISTORIAL,
  type AccionVisor,
  type DetalleCambio,
  type PeticionHistorial,
  type ReporteHistorial,
  type TipoDocumentoHistorial,
} from '../../shared/historial';
import type { PeticionReporte } from '../../shared/reportes';
import type { TipoAviso } from '../componentes/Aviso';
import { MarcoReporte } from '../reportes/MarcoReporte';
import {
  filaEfectiva,
  TablaReporte,
  type ColumnaReporte,
  type FilaReporte,
} from '../reportes/TablaReporte';
import { invocar } from '../servicios/api';

/**
 * Espera tras la última tecla en «Número o texto» antes de consultar.
 */
const ESPERA_BUSQUEDA_MS = 250;

/**
 * Días hacia atrás del periodo por defecto (la última semana, hoy incluido).
 */
const DIAS_POR_DEFECTO = 6;

/** Columnas de la lista. */
const COLUMNAS: readonly ColumnaReporte[] = [
  { titulo: 'Fecha' },
  { titulo: 'Hora' },
  { titulo: 'Tipo' },
  { titulo: 'Documento' },
  { titulo: 'Acción' },
  { titulo: 'Motivo o resumen' },
];

/**
 * Convierte los registros en filas de la tabla.
 *
 * @param reporte - Consulta hecha.
 * @returns Filas.
 */
function filasDe(reporte: ReporteHistorial): FilaReporte[] {
  return reporte.registros.map((r) => ({
    clave: String(r.id),
    tipo: 'dato',
    celdas: [
      { contenido: formatearFecha(r.fecha) },
      { contenido: formatearHora(r.fecha) },
      { contenido: r.tipo },
      { contenido: r.documento },
      {
        contenido: <span className={`accion accion--${r.accion}`}>{etiquetaAccion(r.accion)}</span>,
      },
      { contenido: <span title={r.resumen}>{r.resumen}</span> },
    ],
  }));
}

/**
 * Panel derecho con el detalle del registro elegido: datos generales y solo
 * los campos que cambiaron.
 *
 * @param props - Detalle, o `null` mientras carga o si no hay registro.
 * @param props.detalle - Detalle del registro.
 * @returns El panel.
 */
function PanelDetalle({ detalle }: { detalle: DetalleCambio | null }): ReactNode {
  if (!detalle) {
    return (
      <aside className="detalle-cambio">
        <p className="texto-tenue detalle-cambio__nota">Elija un registro para ver el detalle.</p>
      </aside>
    );
  }
  return (
    <aside className="detalle-cambio">
      <h3>{detalle.titulo}</h3>
      <dl>
        {detalle.datos.map((d) => (
          <Fragment key={d.etiqueta}>
            <dt>{d.etiqueta}</dt>
            <dd>{d.valor}</dd>
          </Fragment>
        ))}
      </dl>
      {detalle.campos.length > 0 ? (
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th>Campo</th>
                <th className="num">Antes</th>
                <th className="num">Después</th>
              </tr>
            </thead>
            <tbody>
              {detalle.campos.map((c, i) => (
                <tr key={`${c.campo}-${i}`}>
                  <td>{c.campo}</td>
                  <td className="num antes">{c.antes}</td>
                  <td className="num despues">{c.despues}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="texto-tenue detalle-cambio__nota">
          Este registro no tiene campos que comparar.
        </p>
      )}
      <p className="texto-tenue detalle-cambio__nota">
        Solo se muestran los campos que cambiaron. Los nombres técnicos se traducen; si aparece uno
        nuevo sin traducción, se muestra tal cual.
      </p>
    </aside>
  );
}

/**
 * Ventana «Historial de cambios» (Fase 5b, §5): lista de solo lectura con
 * filtros por periodo, tipo de documento, acción y texto, y el detalle del
 * registro elegido. Ctrl+D muestra la factura o el abono del registro.
 *
 * @returns La ventana.
 */
export function HistorialCambios(): ReactNode {
  const hoy = useMemo(() => diaDeIso(aIsoLocal()), []);
  const [desde, setDesde] = useState(() => formatearFecha(sumarDias(hoy, -DIAS_POR_DEFECTO)));
  const [hasta, setHasta] = useState(() => formatearFecha(hoy));
  const [tipo, setTipo] = useState<TipoDocumentoHistorial | null>(null);
  const [accion, setAccion] = useState<AccionVisor | null>(null);
  const [texto, setTexto] = useState('');
  const [textoConsulta, setTextoConsulta] = useState('');
  const [reporte, setReporte] = useState<ReporteHistorial | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleCambio | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    const espera = setTimeout(() => setTextoConsulta(texto), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  const fechaDesde = leerFecha(desde);
  const fechaHasta = leerFecha(hasta);
  const filtros = useMemo<PeticionHistorial | null>(
    () =>
      fechaDesde === null || fechaHasta === null
        ? null
        : { desde: fechaDesde, hasta: fechaHasta, tipo, accion, texto: textoConsulta },
    [fechaDesde, fechaHasta, tipo, accion, textoConsulta],
  );
  const peticion = useMemo<PeticionReporte | null>(
    () => (filtros ? { reporte: 'historial', filtros } : null),
    [filtros],
  );

  useEffect(() => {
    if (!filtros) return undefined;
    let vigente = true;
    void invocar('reportes:historial', filtros).then((r) => {
      if (!vigente) return;
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
        setReporte(null);
        return;
      }
      setAviso(null);
      setReporte(r.datos);
    });
    return () => {
      vigente = false;
    };
  }, [filtros, vuelta]);

  const filas = useMemo(() => (reporte ? filasDe(reporte) : []), [reporte]);
  const elegida = filaEfectiva(filas, seleccionada);

  useEffect(() => {
    if (elegida === null) return undefined;
    let vigente = true;
    void invocar('reportes:detalleHistorial', Number(elegida)).then((r) => {
      if (!vigente) return;
      setDetalle(r.ok ? r.datos : null);
      if (!r.ok) setAviso({ tipo: 'error', texto: r.error.mensaje });
    });
    return () => {
      vigente = false;
    };
  }, [elegida, vuelta]);

  // Mientras llega el detalle de otra fila no se muestra el de la anterior.
  const detalleVisible = elegida !== null && detalle?.id === Number(elegida) ? detalle : null;
  const actualizar = useCallback(() => setVuelta((v) => v + 1), []);
  const errorFechas =
    fechaDesde === null || fechaHasta === null
      ? 'Escriba las fechas «Desde» y «Hasta» como dd/mm/aaaa.'
      : null;
  const cantidad = reporte?.registros.length ?? 0;
  const resumen = reporte
    ? `${agruparMiles(cantidad)} ${cantidad === 1 ? 'registro' : 'registros'}${
        reporte.truncado ? ` (los ${agruparMiles(MAXIMO_REGISTROS_HISTORIAL)} más recientes)` : ''
      } · solo lectura: el historial no se puede editar ni borrar`
    : 'Consultando…';
  const avisoTruncado =
    reporte?.truncado === true
      ? {
          tipo: 'alerta' as const,
          texto: `Hay más de ${agruparMiles(MAXIMO_REGISTROS_HISTORIAL)} cambios con estos filtros; se muestran los más recientes. Acote el periodo o los filtros.`,
        }
      : null;

  return (
    <MarcoReporte
      titulo="Historial de cambios"
      peticion={peticion}
      resumen={resumen}
      alActualizar={actualizar}
      aviso={errorFechas ? { tipo: 'error', texto: errorFechas } : (aviso ?? avisoTruncado)}
      documento={detalleVisible?.ver ?? null}
    >
      <div className="reporte__filtros">
        <label className="campo fecha">
          <span>Desde</span>
          <input
            value={desde}
            placeholder="dd/mm/aaaa"
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="campo fecha">
          <span>Hasta</span>
          <input
            value={hasta}
            placeholder="dd/mm/aaaa"
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
        <label className="campo">
          <span>Tipo de documento</span>
          <select
            value={tipo ?? ''}
            onChange={(e) =>
              setTipo(
                TIPOS_DOCUMENTO_HISTORIAL.find((t) => t.valor === e.target.value)?.valor ?? null,
              )
            }
          >
            <option value="">Todos</option>
            {TIPOS_DOCUMENTO_HISTORIAL.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Acción</span>
          <select
            value={accion ?? ''}
            onChange={(e) =>
              setAccion(ACCIONES_VISOR.find((a) => a.valor === e.target.value)?.valor ?? null)
            }
          >
            <option value="">Todas</option>
            {ACCIONES_VISOR.map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <label className="campo ancho">
          <span>Número o texto</span>
          <input
            value={texto}
            placeholder="Ej.: 84783, FERTILIA, motivo…"
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
      </div>

      <div className="historial">
        <TablaReporte
          columnas={COLUMNAS}
          filas={filas}
          seleccionada={elegida}
          alSeleccionar={setSeleccionada}
          textoVacio="No hay cambios con estos filtros."
        />
        <PanelDetalle detalle={detalleVisible} />
      </div>
    </MarcoReporte>
  );
}
