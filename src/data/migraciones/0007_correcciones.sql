-- =============================================================================
-- Migración 0007 — Correcciones, anulaciones y devoluciones (Fase 4a)
-- Devoluciones de venta y de compra, libro de saldo a favor por tercero,
-- reintegros de dinero y la forma de pago de sistema «Saldo a favor».
-- Las correcciones reutilizan las versiones de factura de las migraciones
-- 0003 y 0004. Nada se borra: se anula (§3).
--
-- Saldo de una factura (D-127) = total − abonos activos aplicados
--   − devoluciones activas + lo que la factura trasladó al saldo a favor.
-- =============================================================================

-- Formas de pago de sistema (D-130): no se editan, no se inactivan y no se
-- ofrecen al facturar. «Saldo a favor» paga un abono con el saldo a favor
-- del tercero; no es dinero para el cierre de caja.
ALTER TABLE formas_pago
  ADD COLUMN es_sistema INTEGER NOT NULL DEFAULT 0 CHECK (es_sistema IN (0, 1));

-- Si el usuario ya había creado una forma con ese nombre, pasa a ser la de sistema.
UPDATE formas_pago SET es_sistema = 1, activo = 1, calcula_cambio = 0
  WHERE nombre_clave = 'saldo a favor';
INSERT OR IGNORE INTO formas_pago (nombre, nombre_clave, calcula_cambio, es_sistema)
  VALUES ('Saldo a favor', 'saldo a favor', 0, 1);

CREATE TRIGGER tr_formas_pago_sistema
BEFORE UPDATE ON formas_pago
WHEN OLD.es_sistema = 1
BEGIN
  SELECT RAISE(ABORT, 'La forma de pago «Saldo a favor» es del sistema: no se puede modificar.');
END;

-- Devoluciones de venta y de compra (§9.2, D-131). Se hacen sobre la versión
-- vigente de la factura (`factura_version`); `fecha` es el momento de
-- guardarla, con desfase local (D-06), y `dia` su día local.
CREATE TABLE devoluciones (
  id                   INTEGER PRIMARY KEY,
  tipo                 TEXT    NOT NULL CHECK (tipo IN ('venta', 'compra')),
  numero               INTEGER NOT NULL CHECK (numero > 0),
  factura_cliente_id   INTEGER REFERENCES facturas_cliente (id),
  factura_proveedor_id INTEGER REFERENCES facturas_proveedor (id),
  factura_version      INTEGER NOT NULL CHECK (factura_version > 0),
  fecha                TEXT    NOT NULL,
  dia                  TEXT    NOT NULL CHECK (dia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  bodega_id            INTEGER NOT NULL REFERENCES bodegas (id),
  total                INTEGER NOT NULL CHECK (total > 0),
  motivo               TEXT    NOT NULL DEFAULT '',
  estado               TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
  anulada_en           TEXT,
  motivo_anulacion     TEXT,
  UNIQUE (tipo, numero),
  CHECK ((tipo = 'venta') = (factura_cliente_id IS NOT NULL)),
  CHECK ((tipo = 'compra') = (factura_proveedor_id IS NOT NULL)),
  CHECK ((estado = 'anulada') = (anulada_en IS NOT NULL))
) STRICT;

CREATE INDEX ix_devoluciones_venta
  ON devoluciones (factura_cliente_id) WHERE factura_cliente_id IS NOT NULL;
CREATE INDEX ix_devoluciones_compra
  ON devoluciones (factura_proveedor_id) WHERE factura_proveedor_id IS NOT NULL;

CREATE TRIGGER tr_devoluciones_sin_delete
BEFORE DELETE ON devoluciones
BEGIN
  SELECT RAISE(ABORT, 'Las devoluciones no se pueden borrar: se anulan.');
END;

-- Lo único que cambia de una devolución es su anulación.
CREATE TRIGGER tr_devoluciones_solo_anular
BEFORE UPDATE ON devoluciones
WHEN OLD.estado = 'anulada'
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.numero IS NOT OLD.numero
  OR NEW.factura_cliente_id IS NOT OLD.factura_cliente_id
  OR NEW.factura_proveedor_id IS NOT OLD.factura_proveedor_id
  OR NEW.factura_version IS NOT OLD.factura_version
  OR NEW.fecha IS NOT OLD.fecha
  OR NEW.dia IS NOT OLD.dia
  OR NEW.bodega_id IS NOT OLD.bodega_id
  OR NEW.total IS NOT OLD.total
  OR NEW.motivo IS NOT OLD.motivo
BEGIN
  SELECT RAISE(ABORT, 'Una devolución no se puede modificar: solo se puede anular.');
END;

-- Líneas devueltas. `factura_renglon` es el renglón de la línea en la versión
-- de la factura; `valor_unitario` el precio vendido (venta) o el costo
-- unitario facturado (compra); `costo_unitario` el costo con que se mueve el kardex.
CREATE TABLE devoluciones_lineas (
  id              INTEGER PRIMARY KEY,
  devolucion_id   INTEGER NOT NULL REFERENCES devoluciones (id),
  renglon         INTEGER NOT NULL CHECK (renglon > 0),
  factura_renglon INTEGER NOT NULL CHECK (factura_renglon > 0),
  producto_codigo INTEGER NOT NULL REFERENCES productos (codigo),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  valor_unitario  INTEGER NOT NULL CHECK (valor_unitario >= 0),
  total           INTEGER NOT NULL CHECK (total >= 0),
  costo_unitario  INTEGER NOT NULL CHECK (costo_unitario >= 0),
  UNIQUE (devolucion_id, renglon),
  UNIQUE (devolucion_id, factura_renglon)
) STRICT;

CREATE TRIGGER tr_devoluciones_lineas_sin_update
BEFORE UPDATE ON devoluciones_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una devolución no se pueden modificar.');
END;

CREATE TRIGGER tr_devoluciones_lineas_sin_delete
BEFORE DELETE ON devoluciones_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una devolución no se pueden borrar.');
END;

-- D-131: una factura con devoluciones activas no se corrige (cambia su
-- versión) ni se anula; primero se anulan las devoluciones.
CREATE TRIGGER tr_ventas_con_devoluciones
BEFORE UPDATE OF version, estado ON facturas_cliente
WHEN EXISTS (SELECT 1 FROM devoluciones WHERE factura_cliente_id = OLD.id AND estado = 'activa')
BEGIN
  SELECT RAISE(ABORT, 'La factura tiene devoluciones activas: anúlelas antes de corregirla o anularla.');
END;

CREATE TRIGGER tr_compras_con_devoluciones
BEFORE UPDATE OF version, estado ON facturas_proveedor
WHEN EXISTS (SELECT 1 FROM devoluciones WHERE factura_proveedor_id = OLD.id AND estado = 'activa')
BEGIN
  SELECT RAISE(ABORT, 'La compra tiene devoluciones activas: anúlelas antes de corregirla o anularla.');
END;

-- Libro de saldo a favor por tercero (D-120, D-127): cada fila suma (lo
-- genera) o resta (lo usa o lo recupera). El disponible es la suma. Si la
-- fila nace del excedente de una factura (corrección, anulación o
-- devolución), lleva esa factura para calcular su saldo. `origen` no lleva
-- CHECK de lista para agregar orígenes sin reconstruir la tabla (lo valida
-- el dominio), como el `tipo` del kardex.
CREATE TABLE saldos_favor (
  id                   INTEGER PRIMARY KEY,
  tipo                 TEXT    NOT NULL CHECK (tipo IN ('cliente', 'proveedor')),
  cliente_codigo       INTEGER REFERENCES clientes (codigo),
  proveedor_codigo     INTEGER REFERENCES proveedores (codigo),
  fecha                TEXT    NOT NULL,
  valor                INTEGER NOT NULL CHECK (valor <> 0),
  origen               TEXT    NOT NULL CHECK (length(origen) > 0),
  documento_tipo       TEXT    NOT NULL CHECK (length(documento_tipo) > 0),
  documento_id         INTEGER NOT NULL,
  factura_cliente_id   INTEGER REFERENCES facturas_cliente (id),
  factura_proveedor_id INTEGER REFERENCES facturas_proveedor (id),
  CHECK ((tipo = 'cliente') = (cliente_codigo IS NOT NULL)),
  CHECK ((tipo = 'proveedor') = (proveedor_codigo IS NOT NULL)),
  CHECK (factura_cliente_id IS NULL OR tipo = 'cliente'),
  CHECK (factura_proveedor_id IS NULL OR tipo = 'proveedor')
) STRICT;

CREATE INDEX ix_saldos_favor_cliente
  ON saldos_favor (cliente_codigo) WHERE cliente_codigo IS NOT NULL;
CREATE INDEX ix_saldos_favor_proveedor
  ON saldos_favor (proveedor_codigo) WHERE proveedor_codigo IS NOT NULL;
CREATE INDEX ix_saldos_favor_factura_cliente
  ON saldos_favor (factura_cliente_id) WHERE factura_cliente_id IS NOT NULL;
CREATE INDEX ix_saldos_favor_factura_proveedor
  ON saldos_favor (factura_proveedor_id) WHERE factura_proveedor_id IS NOT NULL;

CREATE TRIGGER tr_saldos_favor_sin_update
BEFORE UPDATE ON saldos_favor
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de saldo a favor no se pueden modificar.');
END;

CREATE TRIGGER tr_saldos_favor_sin_delete
BEFORE DELETE ON saldos_favor
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de saldo a favor no se pueden borrar.');
END;

-- Reintegros de dinero (D-128), para el cierre de caja de la Fase 5.
-- `sentido`: el negocio entrega el dinero o lo recibe. `origen`:
-- `saldo_favor` paga en dinero un saldo a favor (se puede anular);
-- `documento` es la diferencia de una venta de contado corregida, devuelta
-- o anulada (va atada a ese documento).
CREATE TABLE reintegros (
  id               INTEGER PRIMARY KEY,
  numero           INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('cliente', 'proveedor')),
  cliente_codigo   INTEGER REFERENCES clientes (codigo),
  proveedor_codigo INTEGER REFERENCES proveedores (codigo),
  sentido          TEXT    NOT NULL CHECK (sentido IN ('entrega', 'recibe')),
  origen           TEXT    NOT NULL CHECK (origen IN ('saldo_favor', 'documento')),
  documento_tipo   TEXT,
  documento_id     INTEGER,
  fecha            TEXT    NOT NULL,
  dia              TEXT    NOT NULL CHECK (dia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  forma_pago_id    INTEGER NOT NULL REFERENCES formas_pago (id),
  valor            INTEGER NOT NULL CHECK (valor > 0),
  observacion      TEXT    NOT NULL DEFAULT '',
  estado           TEXT    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  anulado_en       TEXT,
  motivo_anulacion TEXT,
  CHECK ((tipo = 'cliente') = (cliente_codigo IS NOT NULL)),
  CHECK ((tipo = 'proveedor') = (proveedor_codigo IS NOT NULL)),
  CHECK ((origen = 'documento') = (documento_tipo IS NOT NULL)),
  CHECK ((documento_tipo IS NULL) = (documento_id IS NULL)),
  CHECK (origen = 'saldo_favor' OR estado = 'activo'),
  CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL))
) STRICT;

CREATE INDEX ix_reintegros_dia ON reintegros (dia);

CREATE TRIGGER tr_reintegros_sin_delete
BEFORE DELETE ON reintegros
BEGIN
  SELECT RAISE(ABORT, 'Los reintegros no se pueden borrar: se anulan.');
END;

CREATE TRIGGER tr_reintegros_solo_anular
BEFORE UPDATE ON reintegros
WHEN OLD.estado = 'anulado'
  OR NEW.numero IS NOT OLD.numero
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.cliente_codigo IS NOT OLD.cliente_codigo
  OR NEW.proveedor_codigo IS NOT OLD.proveedor_codigo
  OR NEW.sentido IS NOT OLD.sentido
  OR NEW.origen IS NOT OLD.origen
  OR NEW.documento_tipo IS NOT OLD.documento_tipo
  OR NEW.documento_id IS NOT OLD.documento_id
  OR NEW.fecha IS NOT OLD.fecha
  OR NEW.dia IS NOT OLD.dia
  OR NEW.forma_pago_id IS NOT OLD.forma_pago_id
  OR NEW.valor IS NOT OLD.valor
  OR NEW.observacion IS NOT OLD.observacion
BEGIN
  SELECT RAISE(ABORT, 'Un reintegro no se puede modificar: solo se puede anular.');
END;

-- Consecutivos de los documentos nuevos.
INSERT INTO consecutivos (clave, siguiente) VALUES
  ('devolucion_venta', 1),
  ('devolucion_compra', 1),
  ('reintegro', 1);
