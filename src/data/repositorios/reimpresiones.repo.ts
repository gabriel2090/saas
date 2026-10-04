import type {
  DocumentoReimprimible,
  PeticionBuscarReimpresion,
  TipoReimpresion,
} from '../../shared/reimpresiones';
import type { BaseDeDatos } from '../conexion';

/**
 * Consulta de cada tipo de documento con las mismas columnas de salida
 * (`id`, `numero`, `referencia`, `fecha`, `terceroCodigo`, `terceroNombre`,
 * `total`, `anulado`, `version`) y el texto que se compara con la búsqueda.
 */
interface ConsultaReimpresion {
  /** SELECT … FROM … JOIN … sin WHERE. */
  desde: string;
  /** Condición fija (excluye saldos iniciales, filtra el tipo de abono). */
  condicion: string;
  /** Expresión del día `AAAA-MM-DD`. */
  dia: string;
  /** Expresiones que se comparan exactas con un texto de solo dígitos. */
  exactas: readonly string[];
  /** Expresiones que se comparan con LIKE. */
  parecidas: readonly string[];
}

/**
 * Consultas por tipo. Los saldos iniciales importados no se reimprimen: no
 * tienen líneas ni se emitieron en la app (D-144).
 */
const CONSULTAS: Record<TipoReimpresion, ConsultaReimpresion> = {
  'factura-cliente': {
    desde: `SELECT f.id, f.numero, '' AS referencia, f.dia AS fecha, c.codigo AS terceroCodigo,
                   c.nombre AS terceroNombre, f.total, f.estado = 'anulada' AS anulado, f.version
            FROM facturas_cliente f JOIN clientes c ON c.codigo = f.cliente_codigo`,
    condicion: `f.origen = 'venta'`,
    dia: 'f.dia',
    exactas: ['f.numero', 'c.codigo'],
    parecidas: ['c.nombre'],
  },
  'factura-proveedor': {
    desde: `SELECT f.id, f.numero, f.numero_proveedor AS referencia, f.fecha, p.codigo AS terceroCodigo,
                   p.nombre AS terceroNombre, f.total, f.estado = 'anulada' AS anulado, f.version
            FROM facturas_proveedor f JOIN proveedores p ON p.codigo = f.proveedor_codigo`,
    condicion: `f.origen = 'compra'`,
    dia: 'f.fecha',
    exactas: ['f.numero', 'p.codigo'],
    parecidas: ['p.nombre', 'f.numero_proveedor'],
  },
  'abono-cliente': {
    desde: `SELECT a.id, a.numero, '' AS referencia, a.fecha, c.codigo AS terceroCodigo,
                   c.nombre AS terceroNombre, a.valor AS total, a.estado = 'anulado' AS anulado,
                   1 AS version
            FROM abonos a JOIN clientes c ON c.codigo = a.cliente_codigo`,
    condicion: `a.tipo = 'cliente'`,
    dia: 'a.fecha',
    exactas: ['a.numero', 'c.codigo'],
    parecidas: ['c.nombre'],
  },
  'abono-proveedor': {
    desde: `SELECT a.id, a.numero, '' AS referencia, a.fecha, p.codigo AS terceroCodigo,
                   p.nombre AS terceroNombre, a.valor AS total, a.estado = 'anulado' AS anulado,
                   1 AS version
            FROM abonos a JOIN proveedores p ON p.codigo = a.proveedor_codigo`,
    condicion: `a.tipo = 'proveedor'`,
    dia: 'a.fecha',
    exactas: ['a.numero', 'p.codigo'],
    parecidas: ['p.nombre'],
  },
};

/**
 * Escapa los comodines de LIKE para buscar el texto tal cual.
 *
 * @param texto - Texto escrito.
 * @returns Patrón `%texto%` con `%`, `_` y `\` escapados.
 */
function patronParecido(texto: string): string {
  return `%${texto.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * Busca documentos para reimprimir, del más reciente al más antiguo. Un texto
 * de solo dígitos se compara exacto con el número del documento y el código
 * del tercero, y además como parte del nombre (o del número del proveedor);
 * otro texto, solo como parte. El rango de días es inclusivo.
 *
 * @param db - Conexión abierta.
 * @param filtros - Tipo, texto (ya recortado) y rango.
 * @param limite - Máximo de filas.
 * @returns Documentos encontrados.
 */
export function buscarDocumentosReimpresion(
  db: BaseDeDatos,
  filtros: PeticionBuscarReimpresion,
  limite: number,
): DocumentoReimprimible[] {
  const consulta = CONSULTAS[filtros.tipo];
  const condiciones = [consulta.condicion];
  const parametros: (string | number)[] = [];
  if (filtros.texto !== '') {
    const opciones = consulta.parecidas.map((e) => `${e} LIKE ? ESCAPE '\\'`);
    const patron = patronParecido(filtros.texto);
    parametros.push(...consulta.parecidas.map(() => patron));
    if (/^\d+$/.test(filtros.texto)) {
      opciones.push(...consulta.exactas.map((e) => `${e} = ?`));
      parametros.push(...consulta.exactas.map(() => Number(filtros.texto)));
    }
    condiciones.push(`(${opciones.join(' OR ')})`);
  }
  if (filtros.desde !== null) {
    condiciones.push(`${consulta.dia} >= ?`);
    parametros.push(filtros.desde);
  }
  if (filtros.hasta !== null) {
    condiciones.push(`${consulta.dia} <= ?`);
    parametros.push(filtros.hasta);
  }
  const filas = db
    .prepare(
      `${consulta.desde} WHERE ${condiciones.join(' AND ')}
       ORDER BY ${consulta.dia} DESC, numero DESC LIMIT ?`,
    )
    .all(...parametros, limite) as (Omit<DocumentoReimprimible, 'anulado'> & {
    anulado: number;
  })[];
  return filas.map((f) => ({ ...f, anulado: f.anulado === 1 }));
}
