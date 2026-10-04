/**
 * Fragmentos SQL de la cartera de una factura (D-127), compartidos por las
 * consultas de ventas, compras, abonos y correcciones para que todas
 * calculen el saldo igual.
 */

/**
 * Tipo de factura: de cliente o de proveedor.
 */
export type TipoFacturaCartera = 'cliente' | 'proveedor';

/**
 * Columna de la factura en las tablas de aplicaciones, devoluciones y saldo a favor.
 *
 * @param tipo - Cliente o proveedor.
 * @returns Nombre de la columna.
 */
function columnaFactura(tipo: TipoFacturaCartera): string {
  return tipo === 'cliente' ? 'factura_cliente_id' : 'factura_proveedor_id';
}

/**
 * Suma de lo aplicado por abonos activos a la factura.
 *
 * @param tipo - Cliente o proveedor.
 * @param alias - Alias de la tabla de facturas en la consulta.
 * @returns Expresión SQL.
 */
export function sqlAplicado(tipo: TipoFacturaCartera, alias: string): string {
  return `COALESCE((SELECT SUM(ap.valor) FROM abonos_aplicaciones ap
    JOIN abonos a ON a.id = ap.abono_id
    WHERE ap.${columnaFactura(tipo)} = ${alias}.id AND a.estado = 'activo'), 0)`;
}

/**
 * Suma de las devoluciones activas de la factura.
 *
 * @param tipo - Cliente o proveedor.
 * @param alias - Alias de la tabla de facturas en la consulta.
 * @returns Expresión SQL.
 */
export function sqlDevuelto(tipo: TipoFacturaCartera, alias: string): string {
  return `COALESCE((SELECT SUM(d.total) FROM devoluciones d
    WHERE d.${columnaFactura(tipo)} = ${alias}.id AND d.estado = 'activa'), 0)`;
}

/**
 * Lo que la factura trasladó al saldo a favor del tercero (neto).
 *
 * @param tipo - Cliente o proveedor.
 * @param alias - Alias de la tabla de facturas en la consulta.
 * @returns Expresión SQL.
 */
export function sqlTrasladado(tipo: TipoFacturaCartera, alias: string): string {
  return `COALESCE((SELECT SUM(s.valor) FROM saldos_favor s
    WHERE s.${columnaFactura(tipo)} = ${alias}.id), 0)`;
}

/**
 * Saldo de la factura (D-127): total − aplicado − devuelto + trasladado.
 *
 * @param tipo - Cliente o proveedor.
 * @param alias - Alias de la tabla de facturas en la consulta.
 * @returns Expresión SQL.
 *
 * @example
 * `SELECT f.numero, ${sqlSaldo('cliente', 'f')} AS saldo FROM facturas_cliente f`
 */
export function sqlSaldo(tipo: TipoFacturaCartera, alias: string): string {
  return `(${alias}.total - ${sqlAplicado(tipo, alias)} - ${sqlDevuelto(tipo, alias)} + ${sqlTrasladado(tipo, alias)})`;
}
