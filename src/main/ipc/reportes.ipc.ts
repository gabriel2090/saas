import {
  ACCIONES_VISOR,
  TIPOS_DOCUMENTO_HISTORIAL,
  type PeticionHistorial,
} from '../../shared/historial';
import type { PeticionEstadoCuenta } from '../../shared/estadoCuenta';
import type { PeticionKardex } from '../../shared/kardex';
import {
  REPORTES,
  TIPOS_CARTERA,
  type PeticionCartera,
  type PeticionInventario,
  type PeticionReporte,
} from '../../shared/reportes';
import type { ServicioReportes } from '../servicios/reportes';
import type { RegistrarManejador } from './registrar';
import {
  exigirBooleano,
  exigirEntero,
  exigirEnteroONulo,
  exigirObjeto,
  exigirOpcion,
  exigirTexto,
} from './validacion';

/**
 * Dependencias de los canales de reportes.
 */
export interface DependenciasIpcReportes {
  /** Servicio de reportes. */
  servicio: ServicioReportes;
  /**
   * Imprime un documento carta con el diálogo de Windows.
   *
   * @param html - Documento.
   * @returns `true` si se imprimió; `false` si se canceló.
   */
  imprimir: (html: string) => Promise<boolean>;
  /**
   * Genera el PDF y pide dónde guardarlo.
   *
   * @param html - Documento.
   * @param nombreSugerido - Nombre de archivo propuesto.
   * @returns `true` si se guardó; `false` si se canceló.
   */
  guardarPdf: (html: string, nombreSugerido: string) => Promise<boolean>;
  /**
   * Pide dónde guardar el libro de Excel y lo escribe.
   *
   * @param nombreSugerido - Nombre de archivo propuesto.
   * @param contenido - Bytes del archivo.
   * @returns `true` si se guardó; `false` si se canceló.
   */
  guardarExcel: (nombreSugerido: string, contenido: Uint8Array) => boolean;
}

/**
 * Lee y verifica los filtros del inventario valorizado.
 *
 * @param valor - Dato recibido.
 * @returns Filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionInventario(valor: unknown): PeticionInventario {
  const d = exigirObjeto(valor);
  return {
    bodegaId: exigirEnteroONulo(d.bodegaId, 'bodega'),
    proveedorCodigo: exigirEnteroONulo(d.proveedorCodigo, 'proveedor'),
    texto: exigirTexto(d.texto, 'producto'),
    mostrarSinExistencia: exigirBooleano(d.mostrarSinExistencia, 'mostrar sin existencia'),
    incluirInactivos: exigirBooleano(d.incluirInactivos, 'incluir inactivos'),
  };
}

/**
 * Lee y verifica los filtros de las cuentas por cobrar o por pagar.
 *
 * @param valor - Dato recibido.
 * @returns Filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionCartera(valor: unknown): PeticionCartera {
  const d = exigirObjeto(valor);
  return {
    tipo: exigirOpcion(d.tipo, TIPOS_CARTERA, 'tipo de cartera'),
    terceroCodigo: exigirEnteroONulo(d.terceroCodigo, 'tercero'),
    soloVencidas: exigirBooleano(d.soloVencidas, 'solo vencidas'),
    incluirSoloFavor: exigirBooleano(d.incluirSoloFavor, 'incluir saldo a favor'),
  };
}

/**
 * Lee y verifica los filtros del kardex.
 *
 * @param valor - Dato recibido.
 * @returns Filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionKardex(valor: unknown): PeticionKardex {
  const d = exigirObjeto(valor);
  return {
    productoCodigo: exigirEntero(d.productoCodigo, 'producto'),
    bodegaId: exigirEnteroONulo(d.bodegaId, 'bodega'),
    desde: exigirTexto(d.desde, 'desde'),
    hasta: exigirTexto(d.hasta, 'hasta'),
  };
}

/**
 * Lee y verifica los filtros del visor del historial.
 *
 * @param valor - Dato recibido.
 * @returns Filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionHistorial(valor: unknown): PeticionHistorial {
  const d = exigirObjeto(valor);
  return {
    desde: exigirTexto(d.desde, 'desde'),
    hasta: exigirTexto(d.hasta, 'hasta'),
    tipo:
      d.tipo === null
        ? null
        : exigirOpcion(
            d.tipo,
            TIPOS_DOCUMENTO_HISTORIAL.map((t) => t.valor),
            'tipo de documento',
          ),
    accion:
      d.accion === null
        ? null
        : exigirOpcion(
            d.accion,
            ACCIONES_VISOR.map((a) => a.valor),
            'acción',
          ),
    texto: exigirTexto(d.texto, 'buscar'),
  };
}

/**
 * Lee y verifica los filtros del estado de cuenta.
 *
 * @param valor - Dato recibido.
 * @returns Filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionEstadoCuenta(valor: unknown): PeticionEstadoCuenta {
  const d = exigirObjeto(valor);
  return {
    tipo: exigirOpcion(d.tipo, TIPOS_CARTERA, 'tipo de tercero'),
    terceroCodigo: exigirEntero(d.terceroCodigo, 'tercero'),
    desde: exigirTexto(d.desde, 'desde'),
    hasta: exigirTexto(d.hasta, 'hasta'),
  };
}

/**
 * Lee y verifica la petición de un reporte para imprimir o exportar.
 *
 * @param valor - Dato recibido.
 * @returns Reporte y filtros.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionReporte(valor: unknown): PeticionReporte {
  const d = exigirObjeto(valor);
  const reporte = exigirOpcion(d.reporte, REPORTES, 'reporte');
  switch (reporte) {
    case 'inventario':
      return { reporte, filtros: leerPeticionInventario(d.filtros) };
    case 'cartera':
      return { reporte, filtros: leerPeticionCartera(d.filtros) };
    case 'kardex':
      return { reporte, filtros: leerPeticionKardex(d.filtros) };
    case 'historial':
      return { reporte, filtros: leerPeticionHistorial(d.filtros) };
    case 'estado-cuenta':
      return { reporte, filtros: leerPeticionEstadoCuenta(d.filtros) };
    case 'cierre-caja':
      return {
        reporte,
        filtros: { numero: exigirEntero(exigirObjeto(d.filtros).numero, 'cierre') },
      };
  }
}

/**
 * Registra los canales de los reportes de la Fase 5a (consulta, vista previa,
 * imprimir, PDF y Excel). Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param dependencias - Servicio, impresora y diálogos de guardar.
 */
export function registrarIpcReportes(
  registrar: RegistrarManejador,
  dependencias: DependenciasIpcReportes,
): void {
  const { servicio } = dependencias;
  registrar('reportes:inventario', (peticion) =>
    servicio.inventario(leerPeticionInventario(peticion)),
  );
  registrar('reportes:cartera', (peticion) => servicio.cartera(leerPeticionCartera(peticion)));
  registrar('reportes:kardex', (peticion) => servicio.kardex(leerPeticionKardex(peticion)));
  registrar('reportes:historial', (peticion) =>
    servicio.historial(leerPeticionHistorial(peticion)),
  );
  registrar('reportes:estadoCuenta', (peticion) =>
    servicio.estadoCuenta(leerPeticionEstadoCuenta(peticion)),
  );
  registrar('reportes:detalleHistorial', (id) =>
    servicio.detalleHistorial(exigirEntero(id, 'registro')),
  );
  registrar('reportes:html', (peticion) => servicio.html(leerPeticionReporte(peticion)));
  registrar('reportes:imprimir', (peticion) =>
    dependencias.imprimir(servicio.html(leerPeticionReporte(peticion))),
  );
  registrar('reportes:pdf', (peticion) => {
    const reporte = leerPeticionReporte(peticion);
    return dependencias.guardarPdf(servicio.html(reporte), servicio.nombreArchivo(reporte, 'pdf'));
  });
  registrar('reportes:excel', (peticion) => {
    const reporte = leerPeticionReporte(peticion);
    return dependencias.guardarExcel(
      servicio.nombreArchivo(reporte, 'xlsx'),
      servicio.excel(reporte),
    );
  });
}
