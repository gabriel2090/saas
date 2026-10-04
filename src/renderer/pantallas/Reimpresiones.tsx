import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles } from '../../shared/formato/moneda';
import type { DocumentoImprimible } from '../../shared/impresion';
import { ATAJOS } from '../../shared/keymap';
import {
  MAXIMO_RESULTADOS_REIMPRESION,
  TIPOS_REIMPRESION,
  type DocumentoReimprimible,
  type TipoReimpresion,
} from '../../shared/reimpresiones';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useCandado } from '../documentos/useCandado';
import { VistaPrevia } from '../documentos/VistaPrevia';
import { TablaMaestro, type ColumnaMaestro } from '../maestros/TablaMaestro';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Nombre de cada tipo de documento en el selector y en los títulos.
 */
const NOMBRE_TIPO: Record<TipoReimpresion, string> = {
  'factura-cliente': 'Factura de cliente',
  'factura-proveedor': 'Factura de proveedor',
  'abono-cliente': 'Abono de cliente',
  'abono-proveedor': 'Abono a proveedor',
};

/**
 * Espera tras la última tecla antes de buscar, para no consultar con cada letra.
 */
const ESPERA_BUSQUEDA_MS = 250;

/**
 * Estado del documento en la lista: anulado, corregido (con su versión) o vigente.
 *
 * @param d - Documento.
 * @returns Texto del estado.
 */
function textoEstado(d: DocumentoReimprimible): string {
  if (d.anulado) return 'ANULADO';
  return d.version > 1 ? `Corregido (v${d.version})` : 'Vigente';
}

/**
 * Columnas de la lista según el tipo: las compras muestran la factura del
 * proveedor; los abonos dicen «Valor» en lugar de «Total».
 *
 * @param tipo - Tipo de documento.
 * @returns Columnas.
 */
function columnasDe(tipo: TipoReimpresion): ColumnaMaestro<DocumentoReimprimible>[] {
  const cliente = tipo === 'factura-cliente' || tipo === 'abono-cliente';
  const abono = tipo === 'abono-cliente' || tipo === 'abono-proveedor';
  return [
    {
      titulo: tipo === 'factura-proveedor' ? 'Compra No.' : 'No.',
      valor: (d) => d.numero,
      clase: 'num',
    },
    ...(tipo === 'factura-proveedor'
      ? [{ titulo: 'Factura proveedor', valor: (d: DocumentoReimprimible) => d.referencia }]
      : []),
    { titulo: 'Fecha', valor: (d) => formatearFecha(d.fecha) },
    {
      titulo: cliente ? 'Cliente' : 'Proveedor',
      valor: (d) => `${d.terceroCodigo} - ${d.terceroNombre}`,
      clase: 'col-nombre',
    },
    { titulo: abono ? 'Valor' : 'Total', valor: (d) => agruparMiles(d.total), clase: 'num' },
    {
      titulo: 'Estado',
      valor: textoEstado,
      claseCelda: (d) => (d.anulado ? 'estado-anulado' : ''),
    },
  ];
}

/**
 * Lee una fecha del filtro.
 *
 * @param texto - Lo escrito (`dd/mm/aaaa`) o vacío.
 * @returns `AAAA-MM-DD`, `null` si está vacío, o `undefined` si no es válida.
 */
function fechaFiltro(texto: string): string | null | undefined {
  if (texto.trim() === '') return null;
  return leerFecha(texto.trim()) ?? undefined;
}

/**
 * Ventana «Reimpresiones» (§9.3): busca facturas de cliente, de proveedor y
 * abonos de ambos. Ctrl+D (o Intro en la lista) solo muestra el documento;
 * Ctrl+P lo imprime en la tirilla. Siempre sale con la leyenda REIMPRESION y,
 * si corresponde, con ANULADA/ANULADO o CORREGIDA (D-143, D-144).
 *
 * @returns La ventana.
 */
export function Reimpresiones(): ReactNode {
  const { activa } = useVentana();
  const [tipo, setTipo] = useState<TipoReimpresion>('factura-cliente');
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [documentos, setDocumentos] = useState<DocumentoReimprimible[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [seleccionado, setSeleccionado] = useState<number | null>(null);
  const [viendo, setViendo] = useState<DocumentoImprimible | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const campoBuscar = useRef<HTMLInputElement>(null);
  const conCandado = useCandado();

  const fechaDesde = fechaFiltro(desde);
  const fechaHasta = fechaFiltro(hasta);
  const errorFechas =
    fechaDesde === undefined || fechaHasta === undefined
      ? 'Escriba las fechas como dd/mm/aaaa, o déjelas vacías para no limitar el rango.'
      : null;

  useEffect(() => {
    if (fechaDesde === undefined || fechaHasta === undefined) return undefined;
    let vigente = true;
    const espera = setTimeout(() => {
      void invocar('reimpresiones:buscar', {
        tipo,
        texto,
        desde: fechaDesde,
        hasta: fechaHasta,
      }).then((r) => {
        if (!vigente) return;
        if (!r.ok) {
          setAviso({ tipo: 'error', texto: r.error.mensaje });
          return;
        }
        setAviso(null);
        setDocumentos(r.datos.documentos);
        setTruncado(r.datos.truncado);
        setSeleccionado((actual) =>
          r.datos.documentos.some((d) => d.id === actual)
            ? actual
            : (r.datos.documentos[0]?.id ?? null),
        );
      });
    }, ESPERA_BUSQUEDA_MS);
    return () => {
      vigente = false;
      clearTimeout(espera);
    };
  }, [tipo, texto, fechaDesde, fechaHasta]);

  const elegido = documentos.find((d) => d.id === seleccionado) ?? null;

  /**
   * Documento a imprimir o ver: siempre reimpresión y en tirilla.
   *
   * @param d - Documento de la lista.
   * @returns Petición de impresión.
   */
  const imprimible = (d: DocumentoReimprimible): DocumentoImprimible => ({
    tipo,
    id: d.id,
    reimpresion: true,
    tirilla: true,
  });

  const ver = (): void => {
    if (!elegido) {
      setAviso({ tipo: 'error', texto: 'Elija en la lista el documento que quiere ver.' });
      return;
    }
    setViendo(imprimible(elegido));
  };

  const imprimir = async (): Promise<void> => {
    if (!elegido) {
      setAviso({ tipo: 'error', texto: 'Elija en la lista el documento que quiere imprimir.' });
      return;
    }
    setAviso(null);
    const r = await invocar('impresion:imprimir', imprimible(elegido));
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
    } else if (r.datos) {
      setAviso({
        tipo: 'exito',
        texto: `Se envió a la impresora: ${NOMBRE_TIPO[tipo].toLowerCase()} ${elegido.numero}, con la leyenda REIMPRESION.`,
      });
    }
  };

  useAtajos(
    {
      verDocumento: ver,
      imprimirDocumento: () => void conCandado(imprimir),
    },
    { activo: activa && viendo === null },
  );

  /**
   * Mueve la selección de la lista.
   *
   * @param direccion - `1` abajo, `-1` arriba.
   */
  const mover = (direccion: 1 | -1): void => {
    const indice = documentos.findIndex((d) => d.id === seleccionado);
    const destino = documentos[Math.min(Math.max(indice + direccion, 0), documentos.length - 1)];
    if (destino) setSeleccionado(destino.id);
  };

  return (
    <div className="documento reimpresiones">
      <div className="barra-herramientas">
        <button type="button" className="boton" tabIndex={-1} disabled={!elegido} onClick={ver}>
          Ver
          <span className="atajo">{textoCombinacion(ATAJOS.verDocumento.combinacion)}</span>
        </button>
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={!elegido}
          onClick={() => void conCandado(imprimir)}
        >
          Imprimir
          <span className="atajo">{textoCombinacion(ATAJOS.imprimirDocumento.combinacion)}</span>
        </button>
        <span className="barra-herramientas__separador" />
        <span className="texto-tenue">
          Todo sale en la tirilla con la leyenda REIMPRESION; las anuladas y las corregidas, con la
          suya.
        </span>
      </div>

      <div className="campo">
        <span>Documento</span>
        <div className="segmentado">
          {TIPOS_REIMPRESION.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tipo === t}
              onClick={() => {
                if (t !== tipo) {
                  // Los ids son de otra tabla: la lista anterior no debe poder imprimirse con este tipo.
                  setDocumentos([]);
                  setTruncado(false);
                  setTipo(t);
                }
                campoBuscar.current?.focus();
              }}
            >
              {NOMBRE_TIPO[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="reimpresiones__filtros">
        <label className="campo reimpresiones__buscar">
          <span>Buscar</span>
          <input
            ref={campoBuscar}
            value={texto}
            aria-label="Buscar documento"
            placeholder={
              tipo === 'factura-proveedor'
                ? 'Compra No., factura del proveedor, código o nombre del proveedor'
                : `Número, código o nombre del ${tipo.endsWith('cliente') ? 'cliente' : 'proveedor'}`
            }
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
        <label className="campo reimpresiones__fecha">
          <span>Desde</span>
          <input
            value={desde}
            placeholder="dd/mm/aaaa"
            aria-label="Desde"
            onChange={(e) => setDesde(e.target.value)}
          />
        </label>
        <label className="campo reimpresiones__fecha">
          <span>Hasta</span>
          <input
            value={hasta}
            placeholder="dd/mm/aaaa"
            aria-label="Hasta"
            onChange={(e) => setHasta(e.target.value)}
          />
        </label>
      </div>

      {errorFechas && <Aviso tipo="error">{errorFechas}</Aviso>}
      {truncado && (
        <Aviso tipo="alerta">
          Se muestran los {MAXIMO_RESULTADOS_REIMPRESION} más recientes. Escriba un número o un
          nombre, o acote las fechas, para encontrar documentos más antiguos.
        </Aviso>
      )}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <TablaMaestro
        columnas={columnasDe(tipo)}
        registros={documentos}
        clave={(d) => d.id}
        estaActivo={(d) => !d.anulado}
        seleccionada={seleccionado}
        alSeleccionar={setSeleccionado}
        alMover={mover}
        alAceptar={ver}
        textoVacio="No hay documentos con esa búsqueda."
      />

      {viendo && elegido && (
        <VistaPrevia
          documento={viendo}
          titulo={`${NOMBRE_TIPO[tipo]} ${elegido.numero} (reimpresión)`}
          soloVer
          tirilla
          alCerrar={() => setViendo(null)}
        />
      )}
    </div>
  );
}
