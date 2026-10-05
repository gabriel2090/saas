import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { diaDeIso, primerDiaMesAnterior } from '../../domain/calendario';
import { claveComparacion } from '../../domain/texto';
import { nombreArchivoEstadoCuenta, type PeticionEstadoCuenta } from '../../shared/estadoCuenta';
import { aIsoLocal, formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { ATAJOS } from '../../shared/keymap';
import type { PeticionReporte, TipoCartera } from '../../shared/reportes';
import { CODIGO_CONSUMIDOR_FINAL } from '../../shared/ventas';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { Buscador } from '../documentos/Buscador';
import { useCandado } from '../documentos/useCandado';
import {
  escucharSolicitudesEstadoCuenta,
  tomarSolicitudEstadoCuenta,
  type SolicitudEstadoCuenta,
} from '../reportes/solicitudEstadoCuenta';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Tercero de la lista del filtro.
 */
interface TerceroFiltro {
  /** Código. */
  codigo: number;
  /** Nombre. */
  nombre: string;
  /** Si está activo. */
  activo: boolean;
}

/**
 * Hoja carta armada por el proceso principal para una petición.
 */
interface HojaArmada {
  /** Petición con que se armó (para no mostrarla con otros filtros). */
  peticion: PeticionReporte;
  /** Documento HTML. */
  html: string;
  /** Número de hoja armada en la ventana: cambia el marco en cada una. */
  version: number;
}

/**
 * Nombre del tercero según el tipo de estado de cuenta.
 */
const NOMBRE_TERCERO: Record<TipoCartera, string> = {
  cliente: 'Cliente',
  proveedor: 'Proveedor',
};

/**
 * Ventana «Estados de cuenta» (Fase 5c, D-149, D-166): movimientos de un cliente o
 * de un proveedor en un periodo con saldo anterior y saldo corrido, los
 * documentos pendientes al «Hasta», el saldo a favor y el neto. Se ve tal
 * como sale en hoja carta; Ctrl+P lo imprime y Ctrl+G lo guarda en PDF con
 * el nombre del tercero y la fecha. Las cuentas por cobrar y por pagar lo
 * abren con Ctrl+D para el tercero de la fila.
 *
 * @returns La ventana.
 */
export function EstadosCuenta(): ReactNode {
  const { activa } = useVentana();
  const hoy = useMemo(() => diaDeIso(aIsoLocal()), []);
  const solicitudInicial = useRef<SolicitudEstadoCuenta | null | undefined>(undefined);
  const [tipo, setTipo] = useState<TipoCartera>('cliente');
  const [terceroCodigo, setTerceroCodigo] = useState<number | null>(null);
  const [terceros, setTerceros] = useState<TerceroFiltro[]>([]);
  const [desde, setDesde] = useState(() => formatearFecha(primerDiaMesAnterior(hoy)));
  const [hasta, setHasta] = useState(() => formatearFecha(hoy));
  const [hoja, setHoja] = useState<HojaArmada | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const conCandado = useCandado();
  const nombreTercero = NOMBRE_TERCERO[tipo];

  useEffect(() => {
    /**
     * Muestra el tercero que pidió otra ventana.
     *
     * @param s - Tipo y tercero.
     */
    const atender = (s: SolicitudEstadoCuenta): void => {
      setTipo(s.tipo);
      setTerceroCodigo(s.terceroCodigo);
    };
    // En el ref, para que el doble montaje de desarrollo no pierda la solicitud.
    if (solicitudInicial.current === undefined) {
      solicitudInicial.current = tomarSolicitudEstadoCuenta();
    }
    if (solicitudInicial.current) atender(solicitudInicial.current);
    return escucharSolicitudesEstadoCuenta(atender);
  }, []);

  useEffect(() => {
    let vigente = true;
    void invocar('terceros:listar', tipo).then((r) => {
      if (!vigente || !r.ok) return;
      setTerceros(
        r.datos
          .filter((t) => tipo === 'proveedor' || t.codigo !== CODIGO_CONSUMIDOR_FINAL)
          .map((t) => ({ codigo: t.codigo, nombre: t.nombre, activo: t.activo })),
      );
    });
    return () => {
      vigente = false;
    };
  }, [tipo]);

  const fechaDesde = leerFecha(desde);
  const fechaHasta = leerFecha(hasta);
  const filtros = useMemo<PeticionEstadoCuenta | null>(
    () =>
      terceroCodigo === null || fechaDesde === null || fechaHasta === null
        ? null
        : { tipo, terceroCodigo, desde: fechaDesde, hasta: fechaHasta },
    [tipo, terceroCodigo, fechaDesde, fechaHasta],
  );
  const peticion = useMemo<PeticionReporte | null>(
    () => (filtros ? { reporte: 'estado-cuenta', filtros } : null),
    [filtros],
  );
  const errorFechas =
    fechaDesde === null || fechaHasta === null
      ? 'Escriba las fechas «Desde» y «Hasta» como dd/mm/aaaa.'
      : null;

  useEffect(() => {
    if (!peticion) return undefined;
    let vigente = true;
    void invocar('reportes:html', peticion).then((r) => {
      if (!vigente) return;
      if (r.ok) {
        setErrorConsulta(null);
        setHoja((h) => ({ peticion, html: r.datos, version: (h?.version ?? 0) + 1 }));
      } else {
        setErrorConsulta(r.error.mensaje);
        setHoja(null);
      }
    });
    return () => {
      vigente = false;
    };
  }, [peticion, vuelta]);

  // Con un filtro incompleto o recién cambiado no se muestra la hoja anterior.
  const vista = hoja && hoja.peticion === peticion && !errorConsulta ? hoja : null;
  const elegido = terceros.find((t) => t.codigo === terceroCodigo) ?? null;
  const archivo =
    elegido && fechaHasta !== null ? nombreArchivoEstadoCuenta(elegido.nombre, fechaHasta) : null;

  const cambiarTipo = (nuevo: TipoCartera): void => {
    if (nuevo === tipo) return;
    setTipo(nuevo);
    setTerceroCodigo(null);
    setAviso(null);
  };

  const ejecutar = async (accion: 'imprimir' | 'pdf'): Promise<void> => {
    if (!peticion || vista === null) {
      setAviso({ tipo: 'alerta', texto: `Elija el ${nombreTercero.toLowerCase()} y el periodo.` });
      return;
    }
    setAviso(null);
    const r = await invocar(accion === 'imprimir' ? 'reportes:imprimir' : 'reportes:pdf', peticion);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
    } else if (r.datos) {
      setAviso({
        tipo: 'exito',
        texto: accion === 'imprimir' ? 'Estado de cuenta enviado a la impresora.' : 'PDF guardado.',
      });
    }
  };

  const actualizar = (): void => {
    setAviso(null);
    setVuelta((v) => v + 1);
  };

  useAtajos(
    {
      imprimirReporte: () => void conCandado(() => ejecutar('imprimir')),
      guardarPdfReporte: () => void conCandado(() => ejecutar('pdf')),
      actualizarReporte: actualizar,
    },
    { activo: activa },
  );

  const errorVisible = errorFechas ?? errorConsulta;

  return (
    <div className="reporte">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={vista === null}
          onClick={() => void conCandado(() => ejecutar('imprimir'))}
        >
          Imprimir
          <span className="atajo">{textoCombinacion(ATAJOS.imprimirReporte.combinacion)}</span>
        </button>
        <button
          type="button"
          className="boton"
          tabIndex={-1}
          disabled={vista === null}
          onClick={() => void conCandado(() => ejecutar('pdf'))}
        >
          Guardar PDF
          <span className="atajo">{textoCombinacion(ATAJOS.guardarPdfReporte.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={actualizar}>
          Actualizar
          <span className="atajo">{textoCombinacion(ATAJOS.actualizarReporte.combinacion)}</span>
        </button>
        <span className="barra-herramientas__separador" />
        <span className="barra-herramientas__resumen">
          {archivo ? `Hoja carta · ${archivo}` : `Elija un ${nombreTercero.toLowerCase()}`}
        </span>
      </div>
      {errorVisible && <Aviso tipo="error">{errorVisible}</Aviso>}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <div className="reporte__filtros">
        <div className="campo">
          <span>Tercero</span>
          <div className="segmentado">
            <button
              type="button"
              aria-pressed={tipo === 'cliente'}
              onClick={() => cambiarTipo('cliente')}
            >
              Cliente
            </button>
            <button
              type="button"
              aria-pressed={tipo === 'proveedor'}
              onClick={() => cambiarTipo('proveedor')}
            >
              Proveedor
            </button>
          </div>
        </div>
        <label className="campo ancho">
          <span>{nombreTercero}</span>
          <Buscador
            registros={terceros}
            clave={(t) => t.codigo}
            texto={(t) => `${t.codigo} - ${t.nombre}${t.activo ? '' : ' (inactivo)'}`}
            coincide={(t, b) =>
              String(t.codigo).startsWith(b) || claveComparacion(t.nombre).includes(b)
            }
            exacto={(t, escrito) => String(t.codigo) === escrito}
            seleccionado={elegido}
            alElegir={(t) => setTerceroCodigo(t.codigo)}
            ayuda="Código o parte del nombre"
            etiqueta={nombreTercero}
          />
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

      <div className="previa-carta">
        {vista === null ? (
          <p className="previa-carta__vacia">
            {terceroCodigo === null
              ? `Elija un ${nombreTercero.toLowerCase()} para ver su estado de cuenta.`
              : errorVisible
                ? ''
                : 'Preparando el estado de cuenta…'}
          </p>
        ) : (
          // Un marco nuevo por hoja: Chromium deja en blanco el marco aislado si cambia su srcdoc.
          <iframe key={vista.version} title="Estado de cuenta" sandbox="" srcDoc={vista.html} />
        )}
      </div>
    </div>
  );
}
