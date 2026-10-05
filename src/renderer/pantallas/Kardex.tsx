import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diaDeIso, sumarDias } from '../../domain/calendario';
import { claveComparacion } from '../../domain/texto';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { aIsoLocal, formatearFecha, formatearHora, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import type { PeticionKardex, ReporteKardex } from '../../shared/kardex';
import type { ProductoResumen, RegistroCatalogo } from '../../shared/maestros';
import type { PeticionReporte } from '../../shared/reportes';
import type { TipoAviso } from '../componentes/Aviso';
import { Buscador } from '../documentos/Buscador';
import { MarcoReporte } from '../reportes/MarcoReporte';
import {
  escucharSolicitudesKardex,
  tomarSolicitudKardex,
  type SolicitudKardex,
} from '../reportes/solicitudKardex';
import {
  filaEfectiva,
  TablaReporte,
  type ColumnaReporte,
  type FilaReporte,
} from '../reportes/TablaReporte';
import { invocar } from '../servicios/api';

/**
 * Primer día del mes anterior a un día dado (inicio del periodo por defecto).
 *
 * @param hoy - Día `AAAA-MM-DD`.
 * @returns `AAAA-MM-01` del mes anterior.
 *
 * @example
 * primerDiaMesAnterior('2026-10-04'); // '2026-09-01'
 */
function primerDiaMesAnterior(hoy: string): string {
  return `${sumarDias(`${hoy.slice(0, 8)}01`, -1).slice(0, 8)}01`;
}

/**
 * Convierte el kardex en filas: saldo anterior, un movimiento por fila y los
 * totales del periodo. La columna «Bodega» solo va cuando son todas.
 *
 * @param reporte - Kardex calculado.
 * @returns Filas.
 */
function filasDe(reporte: ReporteKardex): FilaReporte[] {
  const { unidad } = reporte.producto;
  const todas = reporte.bodega === null;
  /**
   * Celda de una cantidad; vacía si es cero.
   *
   * @param milesimas - Cantidad.
   * @returns Celda.
   */
  const cantidad = (milesimas: number): { contenido: string; clase: string } => ({
    contenido: milesimas === 0 ? '' : formatearCantidad(milesimas, unidad),
    clase: 'num',
  });
  /**
   * Celda del saldo, en rojo si es negativo.
   *
   * @param milesimas - Saldo.
   * @returns Celda.
   */
  const saldo = (milesimas: number): { contenido: string; clase: string } => ({
    contenido: formatearCantidad(milesimas, unidad),
    clase: milesimas < 0 ? 'num negativo' : 'num',
  });
  const vacias = todas ? 6 : 5;
  const anterior: FilaReporte = {
    clave: 'anterior',
    tipo: 'fija',
    clase: 'anterior',
    celdas: [
      { contenido: formatearFecha(sumarDias(reporte.desde, -1)) },
      { contenido: '' },
      { contenido: 'Saldo anterior', columnas: vacias - 2 },
      { contenido: '' },
      { contenido: '' },
      saldo(reporte.saldoAnterior),
      { contenido: '' },
    ],
  };
  const movimientos = reporte.filas.map((f): FilaReporte => ({
    clave: String(f.id),
    tipo: 'dato',
    celdas: [
      { contenido: formatearFecha(f.fecha) },
      { contenido: formatearHora(f.fecha) },
      { contenido: f.movimiento },
      {
        contenido: (
          <>
            {f.documento}
            {f.marca && <span className="estado-anulado"> {f.marca}</span>}
          </>
        ),
      },
      { contenido: f.tercero },
      ...(todas ? [{ contenido: f.bodega }] : []),
      cantidad(f.entrada),
      cantidad(f.salida),
      saldo(f.saldo),
      { contenido: agruparMiles(f.costoUnitario), clase: 'num' },
    ],
  }));
  const total: FilaReporte = {
    clave: 'total',
    tipo: 'total',
    celdas: [
      { contenido: 'Totales del periodo', columnas: vacias },
      cantidad(reporte.entradas),
      cantidad(reporte.salidas),
      saldo(reporte.saldoFinal),
      { contenido: '' },
    ],
  };
  return [anterior, ...movimientos, total];
}

/**
 * Ventana «Kardex» (Fase 5b, §5): entradas, salidas y saldo corrido de un
 * producto en una bodega (o en todas) durante un periodo, con el documento
 * de origen. Ctrl+D muestra la factura o compra de la fila.
 *
 * @returns La ventana.
 */
export function Kardex(): ReactNode {
  const hoy = useMemo(() => diaDeIso(aIsoLocal()), []);
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [bodegas, setBodegas] = useState<RegistroCatalogo[]>([]);
  const [codigo, setCodigo] = useState<number | null>(null);
  const [bodegaId, setBodegaId] = useState<number | null>(null);
  const solicitudInicial = useRef<SolicitudKardex | null | undefined>(undefined);
  const [desde, setDesde] = useState(() => formatearFecha(primerDiaMesAnterior(hoy)));
  const [hasta, setHasta] = useState(() => formatearFecha(hoy));
  const [calculado, setCalculado] = useState<ReporteKardex | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  useEffect(() => {
    // En el ref, para que el doble montaje de desarrollo no pierda la solicitud.
    if (solicitudInicial.current === undefined) solicitudInicial.current = tomarSolicitudKardex();
    const solicitud = solicitudInicial.current;
    void Promise.all([
      invocar('productos:listar', undefined),
      invocar('catalogos:listar', 'bodega'),
    ]).then(([p, b]) => {
      if (p.ok) setProductos(p.datos);
      if (b.ok) {
        setBodegas(b.datos);
        setBodegaId(
          solicitud ? solicitud.bodegaId : (b.datos.find((x) => x.esPrincipal)?.id ?? null),
        );
      }
      if (solicitud) setCodigo(solicitud.productoCodigo);
    });
    return escucharSolicitudesKardex((s) => {
      setCodigo(s.productoCodigo);
      setBodegaId(s.bodegaId);
    });
  }, []);

  const producto = productos.find((p) => p.codigo === codigo) ?? null;
  const fechaDesde = leerFecha(desde);
  const fechaHasta = leerFecha(hasta);
  const filtros = useMemo<PeticionKardex | null>(
    () =>
      codigo === null || fechaDesde === null || fechaHasta === null
        ? null
        : { productoCodigo: codigo, bodegaId, desde: fechaDesde, hasta: fechaHasta },
    [codigo, bodegaId, fechaDesde, fechaHasta],
  );
  const peticion = useMemo<PeticionReporte | null>(
    () => (filtros ? { reporte: 'kardex', filtros } : null),
    [filtros],
  );
  const errorFechas =
    fechaDesde === null || fechaHasta === null
      ? 'Escriba las fechas «Desde» y «Hasta» como dd/mm/aaaa.'
      : null;

  useEffect(() => {
    if (!filtros) return undefined;
    let vigente = true;
    void invocar('reportes:kardex', filtros).then((r) => {
      if (!vigente) return;
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
        setCalculado(null);
        return;
      }
      setAviso(null);
      setCalculado(r.datos);
    });
    return () => {
      vigente = false;
    };
  }, [filtros, vuelta]);

  // Con las fechas a medio escribir no se consulta y no se muestra el kardex anterior.
  const reporte = filtros ? calculado : null;

  const filas = useMemo(() => (reporte ? filasDe(reporte) : []), [reporte]);
  const elegida = filaEfectiva(filas, seleccionada);
  const documento = reporte?.filas.find((f) => String(f.id) === elegida)?.ver ?? null;
  const actualizar = useCallback(() => setVuelta((v) => v + 1), []);
  const todas = reporte ? reporte.bodega === null : bodegaId === null;
  const columnas: ColumnaReporte[] = [
    { titulo: 'Fecha' },
    { titulo: 'Hora' },
    { titulo: 'Movimiento' },
    { titulo: 'Documento' },
    { titulo: 'Tercero' },
    ...(todas ? [{ titulo: 'Bodega' }] : []),
    { titulo: 'Entrada', clase: 'num' },
    { titulo: 'Salida', clase: 'num' },
    { titulo: 'Saldo', clase: 'num' },
    { titulo: 'Costo unitario', clase: 'num' },
  ];
  const resumen = reporte
    ? `${agruparMiles(reporte.filas.length)} ${reporte.filas.length === 1 ? 'movimiento' : 'movimientos'} en el periodo`
    : 'Elija un producto';
  const unidad = reporte?.producto.unidad ?? 'UND';
  /**
   * Cantidad con su unidad para los indicadores.
   *
   * @param milesimas - Cantidad.
   * @returns Texto, p. ej. `34 UND`.
   */
  const conUnidad = (milesimas: number): string =>
    `${formatearCantidad(milesimas, unidad)} ${unidad}`;

  return (
    <MarcoReporte
      titulo="Kardex"
      peticion={peticion}
      resumen={resumen}
      alActualizar={actualizar}
      aviso={errorFechas ? { tipo: 'error', texto: errorFechas } : aviso}
      documento={documento}
    >
      <div className="reporte__filtros">
        <div className="campo producto-kardex">
          <span>Producto</span>
          <Buscador
            registros={productos}
            clave={(p) => p.codigo}
            texto={(p) => `${p.codigo} - ${p.nombre}${p.activo ? '' : ' (inactivo)'}`}
            coincide={(p, b) =>
              String(p.codigo).startsWith(b) || claveComparacion(p.nombre).includes(b)
            }
            exacto={(p, escrito) => String(p.codigo) === escrito}
            seleccionado={producto}
            alElegir={(p) => setCodigo(p.codigo)}
            ayuda="Código o parte del nombre"
            etiqueta="Producto"
          />
        </div>
        <label className="campo">
          <span>Bodega</span>
          <select
            value={bodegaId ?? ''}
            onChange={(e) => setBodegaId(e.target.value === '' ? null : Number(e.target.value))}
          >
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
                {b.activo ? '' : ' (inactiva)'}
              </option>
            ))}
            <option value="">Todas</option>
          </select>
        </label>
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
      </div>

      {reporte && (
        <div className="indicadores">
          <div className="indicador">
            <span>Saldo anterior (al {formatearFecha(sumarDias(reporte.desde, -1))})</span>
            <strong>{conUnidad(reporte.saldoAnterior)}</strong>
          </div>
          <div className="indicador">
            <span>Entradas</span>
            <strong>{conUnidad(reporte.entradas)}</strong>
          </div>
          <div className="indicador">
            <span>Salidas</span>
            <strong>{conUnidad(reporte.salidas)}</strong>
          </div>
          <div
            className={`indicador ${reporte.saldoFinal < 0 ? 'indicador--error' : 'indicador--total'}`}
          >
            <span>
              Saldo final{' '}
              {reporte.bodega === null ? 'en todas las bodegas' : `en ${reporte.bodega}`}
            </span>
            <strong>{conUnidad(reporte.saldoFinal)}</strong>
          </div>
          <div className="indicador">
            <span>Valor a costo actual ({agruparMiles(reporte.producto.costo)})</span>
            <strong>{formatearPesos(reporte.valorCostoActual)}</strong>
          </div>
        </div>
      )}

      <TablaReporte
        columnas={columnas}
        filas={filas}
        seleccionada={elegida}
        alSeleccionar={setSeleccionada}
        textoVacio={
          producto ? 'Sin movimientos en el periodo.' : 'Elija un producto para ver su kardex.'
        }
      />
    </MarcoReporte>
  );
}
