-- =============================================================================
-- Migración 0005 — Cartera (Fase 3b)
-- Abonos de cliente (la tabla `abonos` ya admite el tipo `cliente` desde la
-- 0003) y saldos iniciales de cartera importados del sistema anterior (D-86).
-- Un saldo inicial es una factura sin líneas ni movimientos de kardex: su
-- total es lo que quedó debiendo y los abonos se le aplican como a cualquier
-- otra factura.
-- =============================================================================

-- Origen de cada factura de cliente: una venta hecha en esta aplicación o un
-- saldo inicial importado. El saldo inicial conserva el número de la factura
-- del sistema anterior (que es la misma serie) y siempre es a crédito.
ALTER TABLE facturas_cliente
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'venta' CHECK (origen IN ('venta', 'saldo_inicial'));

-- Origen de cada factura de proveedor. En el saldo inicial,
-- `numero_proveedor` es el número de la factura en el sistema anterior.
ALTER TABLE facturas_proveedor
  ADD COLUMN origen TEXT NOT NULL DEFAULT 'compra' CHECK (origen IN ('compra', 'saldo_inicial'));

CREATE TRIGGER tr_ventas_saldo_inicial_credito
BEFORE INSERT ON facturas_cliente
WHEN NEW.origen = 'saldo_inicial' AND NEW.condicion <> 'credito'
BEGIN
  SELECT RAISE(ABORT, 'Un saldo inicial de cliente siempre es a crédito.');
END;

CREATE INDEX ix_abonos_cliente ON abonos (cliente_codigo, fecha) WHERE cliente_codigo IS NOT NULL;

-- Consecutivo del abono de cliente (§8), independiente del de proveedor.
INSERT INTO consecutivos (clave, siguiente) VALUES ('abono_cliente', 1);
