import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import type { PeticionInventario, PeticionReporte, ReporteInventario } from '../../shared/reportes';
import type { TipoAviso } from '../componentes/Aviso';
import { MarcoReporte } from '../reportes/MarcoReporte';
import { pedirKardex } from '../reportes/solicitudKardex';
import {
  filaEfectiva,
  TablaReporte,
  type ColumnaReporte,
  type FilaReporte,
} from '../reportes/TablaReporte';
import { invocar } from '../servicios/api';
import { useVentanas } from '../ventanas/ProveedorVentanas';

/**
 * Espera tras la última tecla en el filtro de producto antes de consultar.
 */
const ESPERA_BUSQUEDA_MS = 250;

/**
 * Opción de una lista del filtro.
 */
interface OpcionFiltro {
  /** Id o código. */
  id: number;
  /** Texto mostrado. */
  nombre: string;
}

/**
 * Convierte el reporte en filas: una por producto y el total. Las cantidades
 * y el valor negativos van en rojo; un producto solo con existencias
 * negativas muestra su valor negativo, que no suma (D-147, D-156).
 *
 * @param reporte - Reporte calculado.
 * @returns Filas.
 */
function filasDe(reporte: ReporteInventario): FilaReporte[] {
  const cantidad = (
    milesimas: number,
    unidad: 'UND' | 'KG',
  ): { contenido: string; clase: string } => ({
    contenido: formatearCantidad(milesimas, unidad),
    clase: milesimas < 0 ? 'num negativo' : 'num',
  });
  const filas: FilaReporte[] = reporte.filas.map((f) => {
    const valor = f.valor === 0 && f.valorNegativo < 0 ? f.valorNegativo : f.valor;
    const soloNegativa = f.porBodega.some((c) => c < 0) && !f.porBodega.some((c) => c > 0);
    return {
      clave: String(f.codigo),
      tipo: 'dato',
      clase: [soloNegativa ? 'fila--error' : '', f.activo ? '' : 'fila--inactiva']
        .filter(Boolean)
        .join(' '),
      celdas: [
        { contenido: f.codigo, clase: 'num' },
        { contenido: f.activo ? f.nombre : `${f.nombre} (inactivo)` },
        { contenido: f.unidad },
        { contenido: f.proveedorNombre },
        ...f.porBodega.map((c) => {
          const celda = cantidad(c, f.unidad);
          return { ...celda, clase: `${celda.clase} col-bodega` };
        }),
        cantidad(f.existencia, f.unidad),
        { contenido: agruparMiles(f.costo), clase: 'num' },
        { contenido: agruparMiles(valor), clase: valor < 0 ? 'num negativo' : 'num' },
      ],
    };
  });
  if (reporte.filas.length > 0) {
    filas.push({
      clave: 'total',
      tipo: 'total',
      celdas: [
        { contenido: `Total · ${reporte.filas.length} productos`, columnas: 4 },
        ...reporte.resumen.valorPorBodega.map((v) => ({
          contenido: formatearPesos(v),
          clase: 'num',
        })),
        { contenido: '' },
        { contenido: '' },
        { contenido: formatearPesos(reporte.resumen.valorTotal), clase: 'num' },
      ],
    });
  }
  return filas;
}

/**
 * Ventana «Inventario valorizado» (Fase 5a, D-146, D-147): existencias por
 * bodega «a hoy» valorizadas al costo actual. El total suma solo las
 * existencias positivas; las negativas se muestran en rojo y en un indicador
 * aparte. Ctrl+D abre el kardex del producto elegido en la bodega del filtro.
 *
 * @returns La ventana.
 */
export function InventarioValorizado(): ReactNode {
  const [bodegas, setBodegas] = useState<OpcionFiltro[]>([]);
  const [proveedores, setProveedores] = useState<OpcionFiltro[]>([]);
  const [bodegaId, setBodegaId] = useState<number | null>(null);
  const [proveedorCodigo, setProveedorCodigo] = useState<number | null>(null);
  const [texto, setTexto] = useState('');
  const [textoConsulta, setTextoConsulta] = useState('');
  const [mostrarSinExistencia, setMostrarSinExistencia] = useState(false);
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [reporte, setReporte] = useState<ReporteInventario | null>(null);
  const [seleccionada, setSeleccionada] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const ventanas = useVentanas();

  const filtros = useMemo<PeticionInventario>(
    () => ({
      bodegaId,
      proveedorCodigo,
      texto: textoConsulta,
      mostrarSinExistencia,
      incluirInactivos,
    }),
    [bodegaId, proveedorCodigo, textoConsulta, mostrarSinExistencia, incluirInactivos],
  );
  const peticion = useMemo<PeticionReporte>(() => ({ reporte: 'inventario', filtros }), [filtros]);

  useEffect(() => {
    void Promise.all([
      invocar('catalogos:listar', 'bodega'),
      invocar('terceros:listar', 'proveedor'),
    ]).then(([b, p]) => {
      if (b.ok) setBodegas(b.datos.map((x) => ({ id: x.id, nombre: x.nombre })));
      if (p.ok)
        setProveedores(p.datos.map((x) => ({ id: x.codigo, nombre: `${x.codigo} - ${x.nombre}` })));
    });
  }, []);

  useEffect(() => {
    const espera = setTimeout(() => setTextoConsulta(texto), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(espera);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    void invocar('reportes:inventario', filtros).then((r) => {
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
  const elegida = filaEfectiva(filas, seleccionada);
  const actualizar = useCallback(() => setVuelta((v) => v + 1), []);
  const verKardex =
    elegida === null
      ? null
      : () => {
          pedirKardex({ productoCodigo: Number(elegida), bodegaId });
          ventanas.abrir('kardex');
        };
  const columnas: ColumnaReporte[] = [
    { titulo: 'Código', clase: 'num' },
    { titulo: 'Producto' },
    { titulo: 'Und' },
    { titulo: 'Proveedor' },
    ...(reporte?.bodegas ?? []).map((b) => ({ titulo: b.nombre, clase: 'num col-bodega' })),
    { titulo: 'Existencia total', clase: 'num' },
    { titulo: 'Costo unitario', clase: 'num' },
    { titulo: 'Valor a costo', clase: 'num' },
  ];
  const r = reporte?.resumen;
  const resumen = reporte
    ? `Corte: ${formatearFechaHora(reporte.corte)} · costo actual · el total suma solo existencias positivas`
    : 'Calculando…';

  return (
    <MarcoReporte
      titulo="Inventario valorizado"
      peticion={peticion}
      resumen={resumen}
      alActualizar={actualizar}
      aviso={aviso}
      accionFila={{
        texto: 'Ver kardex',
        ejecutar: verKardex,
        pedirFila: 'Elija en la tabla el producto.',
      }}
    >
      <div className="reporte__filtros">
        <label className="campo">
          <span>Bodega</span>
          <select
            value={bodegaId ?? ''}
            onChange={(e) => setBodegaId(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Todas (una columna por bodega)</option>
            {bodegas.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo">
          <span>Proveedor</span>
          <select
            value={proveedorCodigo ?? ''}
            onChange={(e) =>
              setProveedorCodigo(e.target.value === '' ? null : Number(e.target.value))
            }
          >
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="campo ancho">
          <span>Producto</span>
          <input
            value={texto}
            placeholder="Código o parte del nombre"
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={mostrarSinExistencia}
            onChange={(e) => setMostrarSinExistencia(e.target.checked)}
          />{' '}
          Mostrar productos sin existencia
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => setIncluirInactivos(e.target.checked)}
          />{' '}
          Incluir inactivos
        </label>
      </div>

      {r && reporte && (
        <div className="indicadores">
          <div className="indicador">
            <span>Productos con existencia</span>
            <strong>{agruparMiles(r.productosConExistencia)}</strong>
          </div>
          {reporte.bodegas.map((b, i) => (
            <div className="indicador" key={b.id}>
              <span>Valor en {b.nombre}</span>
              <strong>{formatearPesos(r.valorPorBodega[i] ?? 0)}</strong>
            </div>
          ))}
          <div className="indicador indicador--total">
            <span>Valor total del inventario</span>
            <strong>{formatearPesos(r.valorTotal)}</strong>
          </div>
          <div className={`indicador${r.productosNegativos > 0 ? ' indicador--error' : ''}`}>
            <span>
              Existencias negativas ({r.productosNegativos}{' '}
              {r.productosNegativos === 1 ? 'producto' : 'productos'}, no suman)
            </span>
            <strong>{formatearPesos(r.valorNegativo)}</strong>
          </div>
        </div>
      )}

      <TablaReporte
        columnas={columnas}
        filas={filas}
        seleccionada={elegida}
        alSeleccionar={setSeleccionada}
        textoVacio="No hay productos con estos filtros."
      />
    </MarcoReporte>
  );
}
