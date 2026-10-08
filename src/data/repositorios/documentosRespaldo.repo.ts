import type { DocumentoPerdido } from '../../domain/politica-respaldos';
import { formatearPesos } from '../../shared/formato/moneda';
import type { BaseDeDatos } from '../conexion';

/**
 * Fila cruda de un documento.
 */
interface FilaDocumento {
  /** Número o clave. */
  documento: string | number;
  /** Momento o fecha guardada. */
  momento: string;
  /** Valor en pesos, si la consulta lo trae. */
  valor: number | null;
}

/**
 * Consulta de un tipo de documento. Solo usa columnas de la migración que
 * creó la tabla, para que una copia antigua siga pudiendo leerse.
 */
interface ConsultaDocumentos {
  /** Nombre visible. */
  tipo: string;
  /** Tabla que debe existir. */
  tabla: string;
  /** SQL que devuelve documento, momento y valor. */
  sql: string;
}

/**
 * Documentos que se comparan al restaurar.
 */
const CONSULTAS: readonly ConsultaDocumentos[] = [
  {
    tipo: 'Factura de cliente',
    tabla: 'facturas_cliente',
    sql: 'SELECT numero AS documento, fecha AS momento, total AS valor FROM facturas_cliente',
  },
  {
    tipo: 'Compra',
    tabla: 'facturas_proveedor',
    sql: 'SELECT numero AS documento, fecha AS momento, total AS valor FROM facturas_proveedor',
  },
  {
    tipo: 'Abono de cliente',
    tabla: 'abonos',
    sql: `SELECT numero AS documento, fecha AS momento, valor AS valor FROM abonos WHERE tipo = 'cliente'`,
  },
  {
    tipo: 'Abono a proveedor',
    tabla: 'abonos',
    sql: `SELECT numero AS documento, fecha AS momento, valor AS valor FROM abonos WHERE tipo = 'proveedor'`,
  },
  {
    tipo: 'Ajuste de inventario',
    tabla: 'ajustes_inventario',
    sql: 'SELECT numero AS documento, fecha AS momento, NULL AS valor FROM ajustes_inventario',
  },
  {
    tipo: 'Devolución de venta',
    tabla: 'devoluciones',
    sql: `SELECT numero AS documento, fecha AS momento, total AS valor FROM devoluciones WHERE tipo = 'venta'`,
  },
  {
    tipo: 'Devolución de compra',
    tabla: 'devoluciones',
    sql: `SELECT numero AS documento, fecha AS momento, total AS valor FROM devoluciones WHERE tipo = 'compra'`,
  },
  {
    tipo: 'Reintegro',
    tabla: 'reintegros',
    sql: 'SELECT numero AS documento, fecha AS momento, valor AS valor FROM reintegros',
  },
  {
    tipo: 'Cierre de caja',
    tabla: 'cierres_caja',
    sql: 'SELECT numero AS documento, hasta AS momento, NULL AS valor FROM cierres_caja',
  },
];

/**
 * Indica si la base tiene una tabla.
 *
 * @param db - Conexión abierta.
 * @param nombre - Nombre de la tabla.
 * @returns `true` si existe.
 */
function existeTabla(db: BaseDeDatos, nombre: string): boolean {
  const fila = db
    .prepare("SELECT 1 AS ok FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(nombre) as { ok: number } | undefined;
  return fila !== undefined;
}

/**
 * Lista los documentos de una base para saber qué se perdería al restaurar.
 *
 * Si una tabla no existe (copia de una versión anterior), ese tipo no aporta
 * filas. Una consulta que falla en una copia antigua se omite: la base actual
 * sí debe poder leerse, y quien llama decide si el error es fatal.
 *
 * @param db - Conexión abierta.
 * @param tolerarErrores - Si se omiten las consultas que fallen.
 * @returns Documentos encontrados.
 */
export function listarDocumentosRespaldo(
  db: BaseDeDatos,
  tolerarErrores = false,
): DocumentoPerdido[] {
  const documentos: DocumentoPerdido[] = [];
  for (const consulta of CONSULTAS) {
    if (!existeTabla(db, consulta.tabla)) {
      continue;
    }
    let filas: FilaDocumento[];
    try {
      filas = db.prepare(consulta.sql).all() as FilaDocumento[];
    } catch (error) {
      if (tolerarErrores) {
        continue;
      }
      throw error;
    }
    for (const fila of filas) {
      documentos.push({
        tipo: consulta.tipo,
        documento: String(fila.documento),
        momento: fila.momento,
        resumen: fila.valor === null ? '' : formatearPesos(fila.valor),
      });
    }
  }
  return documentos;
}
