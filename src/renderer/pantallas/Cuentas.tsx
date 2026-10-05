import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { textoDias } from '../../domain/reportes';
import { claveComparacion } from '../../domain/texto';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import type {
  PeticionCartera,
  PeticionReporte,
  ReporteCartera,
  TipoCartera,
} from '../../shared/reportes';
import type { TipoAviso } from '../componentes/Aviso';
import { Buscador } from '../documentos/Buscador';
import { MarcoReporte } from '../reportes/MarcoReporte';
import { TablaReporte, type ColumnaReporte, type FilaReporte } from '../reportes/TablaReporte';
import { invocar } from '../servicios/api';

/**
 * Tercero de la lista del filtro.
 */
interface TerceroFiltro {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
}

/**
 * Textos que cambian entre clientes y proveedores.
 */
const TEXTOS: Record<
  TipoCartera,
  {
    titulo: string;
    tercero: string;
    terceros: string;
    documentos: string;
    total: string;
    favor: string;
  }
> = {
  cliente: {
    titulo: 'Cuentas por cobrar',
    tercero: 'Cliente',
    terceros: 'clientes',
    documentos: 'facturas',
    total: 'Total por cobrar',
    favor: 'Saldos a favor de clientes',
  },
  proveedor: {
    titulo: 'Cuentas por pagar',
    tercero: 'Proveedor',
    terceros: 'proveedores',
    documentos: 'compras',
    total: 'Total por pagar',
    favor: 'Saldos a favor con proveedores',
  },
};

/**
 * Columnas de la tabla según la cartera.
 *
 * @param cliente - Si es la de clientes.
 * @returns Encabezados.
 */
function columnasDe(cliente: boolean): ColumnaReporte[] {
  return [
    ...(cliente
      ? [{ titulo: 'Factura' }]
      : [{ titulo: 'Compra' }, { titulo: 'Factura del proveedor' }]),
    { titulo: 'Fecha' },
    { titulo: 'Vence' },
    { titulo: 'Días', clase: 'num' },
    { titulo: 'Total', clase: 'num' },
    { titulo: cliente ? 'Abonado' : 'Pagado', clase: 'num' },
    { titulo: 'Devuelto / corregido', clase: 'num' },
    { titulo: 'Saldo', clase: 'num' },
  ];
}

/**
 * Convierte el reporte en filas de la tabla: encabezado de cada tercero, sus
 * documentos, su subtotal y el total general.
 *
 * @param reporte - Reporte calculado.
 * @returns Filas.
 */
function filasDe(reporte: ReporteCartera): FilaReporte[] {
  const cliente = reporte.tipo === 'cliente';
  const columnas = cliente ? 8 : 9;
  const antesDeCifras = cliente ? 4 : 5;
  const filas: FilaReporte[] = [];
  for (const g of reporte.grupos) {
    const t = g.tercero;
    const detalle = [
      t.identificacion,
      t.celular,
      t.tope !== null ? `tope ${formatearPesos(t.tope)}` : '',
      g.documentos.length === 0 ? `sin ${TEXTOS[reporte.tipo].documentos} pendientes` : '',
    ]
      .filter(Boolean)
      .join(' · ');
    filas.push({
      clave: `g${t.codigo}`,
      tipo: 'grupo',
      celdas: [
        {
          columnas,
          contenido: (
            <>
              {t.codigo} - {t.nombre} <span className="texto-tenue">· {detalle}</span>
            </>
          ),
        },
      ],
    });
    for (const d of g.documentos) {
      const numero = d.saldoInicial ? (
        <>
          Saldo inicial{' '}
          <span className="etiqueta etiqueta--saldo-inicial">
            {cliente ? d.numero : d.referencia}
          </span>
        </>
      ) : (
        d.numero
      );
      filas.push({
        clave: `d${d.id}`,
        tipo: 'dato',
        clase: d.vencida ? 'vencida' : undefined,
        celdas: [
          { contenido: numero },
          ...(cliente ? [] : [{ contenido: d.referencia }]),
          { contenido: formatearFecha(d.fecha) },
          { contenido: formatearFecha(d.vence) },
          { contenido: textoDias(d), clase: 'num dias' },
          { contenido: agruparMiles(d.total), clase: 'num' },
          { contenido: agruparMiles(d.abonado), clase: 'num' },
          { contenido: agruparMiles(d.devuelto), clase: 'num' },
          { contenido: agruparMiles(d.saldo), clase: 'num' },
        ],
      });
    }
    filas.push({
      clave: `s${t.codigo}`,
      tipo: 'subtotal',
      celdas: [
        {
          columnas: antesDeCifras,
          contenido: (
            <>
              Saldo {agruparMiles(g.saldo)}
              {g.documentos.length > 0 && (
                <>
                  {' · vencido '}
                  <span className={g.vencido > 0 ? 'texto-vencida' : undefined}>
                    {agruparMiles(g.vencido)}
                  </span>
                </>
              )}
              {' · a favor '}
              <span className={g.saldoFavor > 0 ? 'texto-favor' : undefined}>
                {agruparMiles(g.saldoFavor)}
              </span>
              {g.saldoFavor > 0 && g.saldo > 0 && ` · neto ${agruparMiles(g.neto)}`}
            </>
          ),
        },
        { contenido: '' },
        { contenido: '' },
        { contenido: '' },
        { contenido: agruparMiles(g.saldo), clase: 'num' },
      ],
    });
  }
  if (reporte.grupos.length > 0) {
    filas.push({
      clave: 'total',
      tipo: 'total',
      celdas: [
        {
          columnas: antesDeCifras,
          contenido: `Total · ${reporte.resumen.terceros} ${TEXTOS[reporte.tipo].terceros}`,
        },
        { contenido: '' },
        { contenido: '' },
        { contenido: '' },
        { contenido: agruparMiles(reporte.resumen.total), clase: 'num' },
      ],
    });
  }
  return filas;
}

/**
 * Propiedades de {@link Cuentas}.
 */
interface PropiedadesCuentas {
  /** Clientes (por cobrar) o proveedores (por pagar). */
  tipo: TipoCartera;
}

/**
 * Reporte de cuentas por cobrar o por pagar «a hoy» (Fase 5a, D-146, D-148):
 * documentos pendientes agrupados por tercero, primero el del vencimiento
 * más antiguo, con subtotales, saldo a favor y neto.
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
export function Cuentas({ tipo }: PropiedadesCuentas): ReactNode {
  const textos = TEXTOS[tipo];
  const [terceros, setTerceros] = useState<TerceroFiltro[]>([]);
  const [terceroCodigo, setTerceroCodigo] = useState<number | null>(null);
  const [soloVencidas, setSoloVencidas] = useState(false);
  const [incluirSoloFavor, setIncluirSoloFavor] = useState(true);
  const [reporte, setReporte] = useState<ReporteCartera | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);

  const filtros = useMemo<PeticionCartera>(
    () => ({ tipo, terceroCodigo, soloVencidas, incluirSoloFavor }),
    [tipo, terceroCodigo, soloVencidas, incluirSoloFavor],
  );
  const peticion = useMemo<PeticionReporte>(() => ({ reporte: 'cartera', filtros }), [filtros]);

  useEffect(() => {
    void invocar('terceros:listar', tipo).then((r) => {
      if (r.ok) setTerceros(r.datos.map((t) => ({ codigo: t.codigo, nombre: t.nombre })));
    });
  }, [tipo]);

  useEffect(() => {
    let vigente = true;
    void invocar('reportes:cartera', filtros).then((r) => {
      if (!vigente) return;
      if (!r.ok) {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
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
  const actualizar = useCallback(() => setVuelta((v) => v + 1), []);
  const r = reporte?.resumen;
  const documentos = r ? r.documentosVencidos + r.documentosPorVencer : 0;
  const resumen = reporte
    ? `Corte: ${formatearFechaHora(reporte.corte)} · ${r?.terceros ?? 0} ${textos.terceros} · ${documentos} ${textos.documentos}`
    : 'Calculando…';
  const elegido = terceros.find((t) => t.codigo === terceroCodigo) ?? null;

  return (
    <MarcoReporte
      titulo={textos.titulo}
      peticion={peticion}
      resumen={resumen}
      alActualizar={actualizar}
      aviso={aviso}
    >
      <div className="reporte__filtros">
        <label className="campo ancho">
          <span>{textos.tercero}</span>
          <Buscador
            registros={terceros}
            clave={(t) => t.codigo}
            texto={(t) => `${t.codigo} - ${t.nombre}`}
            coincide={(t, b) =>
              String(t.codigo).startsWith(b) || claveComparacion(t.nombre).includes(b)
            }
            exacto={(t, escrito) => String(t.codigo) === escrito}
            seleccionado={elegido}
            alElegir={(t) => setTerceroCodigo(t.codigo)}
            alVaciar={() => setTerceroCodigo(null)}
            ayuda={`Todos los ${textos.terceros} (escriba código o nombre)`}
            etiqueta={textos.tercero}
          />
        </label>
        <div className="campo">
          <span>Mostrar</span>
          <div className="segmentado">
            <button
              type="button"
              aria-pressed={!soloVencidas}
              onClick={() => setSoloVencidas(false)}
            >
              Todas
            </button>
            <button type="button" aria-pressed={soloVencidas} onClick={() => setSoloVencidas(true)}>
              Solo vencidas
            </button>
          </div>
        </div>
        <label className="casilla">
          <input
            type="checkbox"
            checked={incluirSoloFavor}
            onChange={(e) => setIncluirSoloFavor(e.target.checked)}
          />{' '}
          Incluir los que solo tienen saldo a favor
        </label>
      </div>

      {r && (
        <div className="indicadores">
          <div className="indicador indicador--total">
            <span>{textos.total}</span>
            <strong>{formatearPesos(r.total)}</strong>
          </div>
          <div className="indicador indicador--error">
            <span>
              Vencido ({r.documentosVencidos} {textos.documentos})
            </span>
            <strong>{formatearPesos(r.vencido)}</strong>
          </div>
          <div className="indicador">
            <span>
              Por vencer ({r.documentosPorVencer} {textos.documentos})
            </span>
            <strong>{formatearPesos(r.porVencer)}</strong>
          </div>
          <div className="indicador indicador--exito">
            <span>{textos.favor}</span>
            <strong>{formatearPesos(r.saldoFavor)}</strong>
          </div>
          <div className="indicador">
            <span>Neto ({tipo === 'cliente' ? 'por cobrar' : 'por pagar'} − a favor)</span>
            <strong>{formatearPesos(r.neto)}</strong>
          </div>
        </div>
      )}

      <TablaReporte
        columnas={columnasDe(tipo === 'cliente')}
        filas={filas}
        seleccionada={seleccionada}
        alSeleccionar={setSeleccionada}
        textoVacio={
          soloVencidas || terceroCodigo !== null
            ? 'No hay documentos pendientes con estos filtros.'
            : `No hay ${textos.documentos} pendientes.`
        }
      />
    </MarcoReporte>
  );
}

/**
 * Ventana «Cuentas por cobrar».
 *
 * @returns La ventana.
 */
export function CuentasPorCobrar(): ReactNode {
  return <Cuentas tipo="cliente" />;
}

/**
 * Ventana «Cuentas por pagar».
 *
 * @returns La ventana.
 */
export function CuentasPorPagar(): ReactNode {
  return <Cuentas tipo="proveedor" />;
}
