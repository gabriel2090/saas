import type { BaseDeDatos } from '../../data/conexion';
import {
  bodegasDeInventario,
  documentosPendientes,
  existenciasPorPar,
  productosDeInventario,
  saldosFavorPorTercero,
  tercerosDeCartera,
} from '../../data/repositorios/reportes.repo';
import { diaDeIso } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import { etiquetaAccion } from '../../domain/historial';
import { armarCartera, armarInventario } from '../../domain/reportes';
import { aIsoLocal, formatearFecha } from '../../shared/formato/fechas';
import { TIPOS_DOCUMENTO_HISTORIAL, type PeticionHistorial } from '../../shared/historial';
import type {
  PeticionCartera,
  PeticionInventario,
  PeticionReporte,
  ReporteCartera,
  ReporteInventario,
} from '../../shared/reportes';
import {
  reporteCarteraHtml,
  reporteHistorialHtml,
  reporteInventarioHtml,
  reporteKardexHtml,
  TITULOS_CARTERA,
} from '../impresion/reportes';
import { carteraXlsx, inventarioXlsx } from './excel-reportes';
import type { ServicioNegocio } from './negocio';
import { crearServicioVisores, type ServicioVisores } from './visores';

/**
 * Servicio de los reportes de la Fase 5: inventario valorizado y cuentas
 * por cobrar y por pagar, siempre «a hoy» (D-146), más el kardex y el
 * historial de cambios por periodo. Solo consulta.
 */
export interface ServicioReportes extends ServicioVisores {
  /**
   * Calcula el inventario valorizado.
   *
   * @param peticion - Filtros.
   * @returns Reporte con el corte de este momento.
   */
  inventario(peticion: PeticionInventario): ReporteInventario;
  /**
   * Calcula las cuentas por cobrar o por pagar.
   *
   * @param peticion - Tipo y filtros.
   * @returns Reporte con el corte de este momento.
   */
  cartera(peticion: PeticionCartera): ReporteCartera;
  /**
   * Arma el reporte en hoja carta para la vista previa, imprimir o el PDF.
   *
   * @param peticion - Reporte y filtros.
   * @returns Documento HTML.
   */
  html(peticion: PeticionReporte): string;
  /**
   * Exporta el reporte a Excel.
   *
   * @param peticion - Reporte y filtros.
   * @returns Contenido del archivo XLSX.
   */
  excel(peticion: PeticionReporte): Uint8Array;
  /**
   * Nombre de archivo propuesto, con el día del corte.
   *
   * @param peticion - Reporte y filtros.
   * @param extension - `pdf` o `xlsx`.
   * @returns Nombre, p. ej. `Cuentas por cobrar 2026-10-04.pdf`.
   */
  nombreArchivo(peticion: PeticionReporte, extension: 'pdf' | 'xlsx'): string;
}

/**
 * Dependencias del servicio de reportes.
 */
export interface DependenciasReportes {
  /** Datos del negocio (encabezado). */
  negocio: Pick<ServicioNegocio, 'obtener'>;
  /** Momento actual en ISO local con desfase (inyectable en las pruebas). */
  ahora?: () => string;
}

/**
 * Crea el servicio de reportes.
 *
 * @param db - Conexión abierta.
 * @param dependencias - Negocio y reloj.
 * @returns El servicio.
 */
export function crearServicioReportes(
  db: BaseDeDatos,
  dependencias: DependenciasReportes,
): ServicioReportes {
  const ahora = dependencias.ahora ?? (() => aIsoLocal());

  const inventario = (peticion: PeticionInventario): ReporteInventario => {
    const corte = ahora();
    const armado = armarInventario({
      productos: productosDeInventario(db),
      existencias: existenciasPorPar(db),
      bodegas: bodegasDeInventario(db),
      filtros: { ...peticion, texto: peticion.texto.trim() },
    });
    return { corte, ...armado };
  };

  const cartera = (peticion: PeticionCartera): ReporteCartera => {
    const corte = ahora();
    const { tipo, ...filtros } = peticion;
    const armado = armarCartera({
      documentos: documentosPendientes(db, tipo),
      terceros: tercerosDeCartera(db, tipo),
      saldosFavor: saldosFavorPorTercero(db, tipo),
      hoy: diaDeIso(corte),
      filtros,
    });
    return { tipo, corte, ...armado };
  };

  /**
   * Describe en palabras los filtros del inventario (va en el reporte impreso y en Excel).
   *
   * @param p - Filtros.
   * @returns Texto de los filtros.
   */
  const filtrosInventario = (p: PeticionInventario): string => {
    const bodega =
      p.bodegaId === null
        ? 'Todas las bodegas'
        : `Bodega ${bodegasDeInventario(db).find((b) => b.id === p.bodegaId)?.nombre ?? p.bodegaId}`;
    const proveedor =
      p.proveedorCodigo === null
        ? 'todos los proveedores'
        : `proveedor ${p.proveedorCodigo} - ${tercerosDeCartera(db, 'proveedor').find((t) => t.codigo === p.proveedorCodigo)?.nombre ?? ''}`;
    return [
      bodega,
      proveedor,
      p.texto.trim() ? `producto «${p.texto.trim()}»` : '',
      p.mostrarSinExistencia ? 'incluye productos sin existencia' : '',
      p.incluirInactivos ? 'incluye inactivos' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  /**
   * Describe en palabras los filtros de la cartera.
   *
   * @param p - Tipo y filtros.
   * @returns Texto de los filtros.
   */
  const filtrosCartera = (p: PeticionCartera): string => {
    const cliente = p.tipo === 'cliente';
    const tercero =
      p.terceroCodigo === null
        ? cliente
          ? 'Todos los clientes'
          : 'Todos los proveedores'
        : `${cliente ? 'Cliente' : 'Proveedor'} ${p.terceroCodigo} - ${tercerosDeCartera(db, p.tipo).find((t) => t.codigo === p.terceroCodigo)?.nombre ?? ''}`;
    return [
      tercero,
      p.soloVencidas ? 'solo vencidas' : 'vencidas y por vencer',
      p.incluirSoloFavor ? 'incluye los que solo tienen saldo a favor' : '',
    ]
      .filter(Boolean)
      .join(' · ');
  };

  /**
   * Describe en palabras los filtros del historial.
   *
   * @param p - Filtros.
   * @returns Texto de los filtros.
   */
  const filtrosHistorial = (p: PeticionHistorial): string =>
    [
      `Del ${formatearFecha(p.desde)} al ${formatearFecha(p.hasta)}`,
      p.tipo === null
        ? 'todos los tipos'
        : (TIPOS_DOCUMENTO_HISTORIAL.find((t) => t.valor === p.tipo)?.etiqueta ?? p.tipo),
      p.accion === null ? 'todas las acciones' : `acción ${etiquetaAccion(p.accion)}`,
      p.texto.trim() ? `buscar «${p.texto.trim()}»` : '',
    ]
      .filter(Boolean)
      .join(' · ');

  /**
   * Título del reporte (pie de página y nombre de archivo).
   *
   * @param peticion - Reporte y filtros.
   * @returns Título.
   */
  const titulo = (peticion: PeticionReporte): string => {
    switch (peticion.reporte) {
      case 'inventario':
        return 'Inventario valorizado';
      case 'cartera':
        return TITULOS_CARTERA[peticion.filtros.tipo];
      case 'kardex':
        return `Kardex ${peticion.filtros.productoCodigo}`;
      case 'historial':
        return 'Historial de cambios';
    }
  };

  const visores = crearServicioVisores(db, { ahora });

  return {
    ...visores,
    inventario,
    cartera,
    html(peticion) {
      const negocio = dependencias.negocio.obtener();
      switch (peticion.reporte) {
        case 'inventario':
          return reporteInventarioHtml({
            negocio,
            reporte: inventario(peticion.filtros),
            filtros: filtrosInventario(peticion.filtros),
          });
        case 'cartera':
          return reporteCarteraHtml({
            negocio,
            reporte: cartera(peticion.filtros),
            filtros: filtrosCartera(peticion.filtros),
          });
        case 'kardex':
          return reporteKardexHtml({ negocio, reporte: visores.kardex(peticion.filtros) });
        case 'historial':
          return reporteHistorialHtml({
            negocio,
            reporte: visores.historial(peticion.filtros),
            filtros: filtrosHistorial(peticion.filtros),
          });
      }
    },
    excel(peticion) {
      switch (peticion.reporte) {
        case 'inventario':
          return inventarioXlsx(inventario(peticion.filtros), filtrosInventario(peticion.filtros));
        case 'cartera':
          return carteraXlsx(
            cartera(peticion.filtros),
            titulo(peticion),
            filtrosCartera(peticion.filtros),
          );
        default:
          throw new ErrorDeNegocio(
            'VALIDACION',
            `El reporte «${titulo(peticion)}» no se exporta a Excel; use «Imprimir o guardar PDF».`,
          );
      }
    },
    nombreArchivo(peticion, extension) {
      return `${titulo(peticion)} ${diaDeIso(ahora())}.${extension}`;
    },
  };
}
