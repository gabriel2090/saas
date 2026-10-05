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
import { armarCartera, armarInventario } from '../../domain/reportes';
import { aIsoLocal } from '../../shared/formato/fechas';
import type {
  PeticionCartera,
  PeticionInventario,
  PeticionReporte,
  ReporteCartera,
  ReporteInventario,
} from '../../shared/reportes';
import { reporteCarteraHtml, reporteInventarioHtml, TITULOS_CARTERA } from '../impresion/reportes';
import { carteraXlsx, inventarioXlsx } from './excel-reportes';
import type { ServicioNegocio } from './negocio';

/**
 * Servicio de los reportes de la Fase 5a: inventario valorizado y cuentas
 * por cobrar y por pagar, siempre «a hoy» (D-146). Solo consulta.
 */
export interface ServicioReportes {
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

  const titulo = (peticion: PeticionReporte): string =>
    peticion.reporte === 'inventario'
      ? 'Inventario valorizado'
      : TITULOS_CARTERA[peticion.filtros.tipo];

  return {
    inventario,
    cartera,
    html(peticion) {
      const negocio = dependencias.negocio.obtener();
      if (peticion.reporte === 'inventario') {
        return reporteInventarioHtml({
          negocio,
          reporte: inventario(peticion.filtros),
          filtros: filtrosInventario(peticion.filtros),
        });
      }
      return reporteCarteraHtml({
        negocio,
        reporte: cartera(peticion.filtros),
        filtros: filtrosCartera(peticion.filtros),
      });
    },
    excel(peticion) {
      if (peticion.reporte === 'inventario') {
        return inventarioXlsx(inventario(peticion.filtros), filtrosInventario(peticion.filtros));
      }
      return carteraXlsx(
        cartera(peticion.filtros),
        titulo(peticion),
        filtrosCartera(peticion.filtros),
      );
    },
    nombreArchivo(peticion, extension) {
      return `${titulo(peticion)} ${diaDeIso(ahora())}.${extension}`;
    },
  };
}
