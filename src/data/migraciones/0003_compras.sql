-- =============================================================================
-- Migración 0003 — Compras y cuentas por pagar (Fase 2)
-- Facturas de proveedor (con líneas y versiones), abonos y sus aplicaciones
-- (compartidos con los abonos de cliente de la Fase 3) y ajustes de inventario.
-- Los documentos nunca se borran: se anulan (§3). El saldo de una factura no
-- se guarda: es su total menos lo aplicado por abonos activos.
-- =============================================================================

-- Factura de proveedor (§6). `numero` es el consecutivo interno (D-54);
-- `numero_proveedor_clave` es el número del proveedor normalizado (mayúsculas,
-- sin espacios) para bloquear duplicados del mismo proveedor (D-49).
-- `fecha` y `vence` son fechas sin hora (AAAA-MM-DD); `registrada_en` es el
-- momento en que se guardó, con desfase local (D-06).
CREATE TABLE facturas_proveedor (
  id                     INTEGER PRIMARY KEY,
  numero                 INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  proveedor_codigo       INTEGER NOT NULL REFERENCES proveedores (codigo),
  numero_proveedor       TEXT    NOT NULL CHECK (length(numero_proveedor) > 0),
  numero_proveedor_clave TEXT    NOT NULL CHECK (length(numero_proveedor_clave) > 0),
  fecha                  TEXT    NOT NULL CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  plazo_dias             INTEGER NOT NULL CHECK (plazo_dias >= 0),
  vence                  TEXT    NOT NULL CHECK (vence GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  bodega_id              INTEGER NOT NULL REFERENCES bodegas (id),
  orden_compra           TEXT    NOT NULL DEFAULT '',
  subtotal               INTEGER NOT NULL CHECK (subtotal >= 0),
  flete                  INTEGER NOT NULL DEFAULT 0 CHECK (flete >= 0),
  -- D-59: si el flete lo cobra el proveedor, suma al total a pagar.
  flete_proveedor        INTEGER NOT NULL DEFAULT 0 CHECK (flete_proveedor IN (0, 1)),
  descuento              INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0 AND descuento <= subtotal),
  -- Porcentaje escrito en centésimas (250 = 2.50 %), o NULL si se escribió en pesos (D-47, D-69).
  descuento_porcentaje   INTEGER CHECK (descuento_porcentaje IS NULL OR descuento_porcentaje BETWEEN 0 AND 10000),
  descuento_en_costo     INTEGER NOT NULL DEFAULT 0 CHECK (descuento_en_costo IN (0, 1)),
  total                  INTEGER NOT NULL CHECK (total >= 0),
  pagada_contado         INTEGER NOT NULL DEFAULT 0 CHECK (pagada_contado IN (0, 1)),
  -- Versión vigente; las correcciones de la Fase 4 crean versiones nuevas.
  version                INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  estado                 TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
  registrada_en          TEXT    NOT NULL,
  anulada_en             TEXT,
  motivo_anulacion       TEXT,
  CHECK ((estado = 'anulada') = (anulada_en IS NOT NULL))
) STRICT;

-- D-49: el mismo número del proveedor no se repite, sin contar las anuladas.
CREATE UNIQUE INDEX ux_compras_numero_proveedor
  ON facturas_proveedor (proveedor_codigo, numero_proveedor_clave) WHERE estado = 'activa';
CREATE INDEX ix_compras_proveedor ON facturas_proveedor (proveedor_codigo, fecha, numero);

CREATE TRIGGER tr_compras_sin_delete
BEFORE DELETE ON facturas_proveedor
BEGIN
  SELECT RAISE(ABORT, 'Las facturas de proveedor no se pueden borrar: se anulan.');
END;

CREATE TRIGGER tr_compras_anulada_final
BEFORE UPDATE ON facturas_proveedor
WHEN OLD.estado = 'anulada'
BEGIN
  SELECT RAISE(ABORT, 'Una factura de proveedor anulada no se puede modificar.');
END;

-- Líneas de cada versión de la factura. `flete` y `descuento` son la parte
-- que le tocó a la línea; `costo_nuevo` es el costo unitario resultante (D-70).
CREATE TABLE facturas_proveedor_lineas (
  id              INTEGER PRIMARY KEY,
  factura_id      INTEGER NOT NULL REFERENCES facturas_proveedor (id),
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  renglon         INTEGER NOT NULL CHECK (renglon > 0),
  producto_codigo INTEGER NOT NULL REFERENCES productos (codigo),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario  INTEGER NOT NULL CHECK (costo_unitario >= 0),
  total           INTEGER NOT NULL CHECK (total >= 0),
  flete           INTEGER NOT NULL DEFAULT 0 CHECK (flete >= 0),
  descuento       INTEGER NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  costo_nuevo     INTEGER NOT NULL CHECK (costo_nuevo >= 0),
  costo_anterior  INTEGER NOT NULL CHECK (costo_anterior >= 0),
  UNIQUE (factura_id, version, renglon)
) STRICT;

CREATE INDEX ix_compras_lineas_producto ON facturas_proveedor_lineas (producto_codigo);

CREATE TRIGGER tr_compras_lineas_sin_update
BEFORE UPDATE ON facturas_proveedor_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una factura de proveedor no se pueden modificar.');
END;

CREATE TRIGGER tr_compras_lineas_sin_delete
BEFORE DELETE ON facturas_proveedor_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una factura de proveedor no se pueden borrar.');
END;

-- Contenido completo (JSON) de cada versión de la factura, para el historial
-- de ediciones de la Fase 4. La versión 1 se guarda al crearla.
CREATE TABLE facturas_proveedor_versiones (
  id         INTEGER PRIMARY KEY,
  factura_id INTEGER NOT NULL REFERENCES facturas_proveedor (id),
  version    INTEGER NOT NULL CHECK (version > 0),
  fecha      TEXT    NOT NULL,
  contenido  TEXT    NOT NULL CHECK (json_valid(contenido)),
  motivo     TEXT,
  UNIQUE (factura_id, version)
) STRICT;

CREATE TRIGGER tr_compras_versiones_sin_update
BEFORE UPDATE ON facturas_proveedor_versiones
BEGIN
  SELECT RAISE(ABORT, 'Las versiones de una factura no se pueden modificar.');
END;

CREATE TRIGGER tr_compras_versiones_sin_delete
BEFORE DELETE ON facturas_proveedor_versiones
BEGIN
  SELECT RAISE(ABORT, 'Las versiones de una factura no se pueden borrar.');
END;

-- Abonos de proveedor (y de cliente desde la Fase 3), §8. El tercero va en la
-- columna de su tipo para conservar la clave foránea. `origen = 'contado'`
-- es el abono automático de una compra «Pagada de contado» (D-48).
CREATE TABLE abonos (
  id               INTEGER PRIMARY KEY,
  tipo             TEXT    NOT NULL CHECK (tipo IN ('proveedor', 'cliente')),
  numero           INTEGER NOT NULL CHECK (numero > 0),
  proveedor_codigo INTEGER REFERENCES proveedores (codigo),
  cliente_codigo   INTEGER REFERENCES clientes (codigo),
  fecha            TEXT    NOT NULL CHECK (fecha GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  forma_pago_id    INTEGER NOT NULL REFERENCES formas_pago (id),
  valor            INTEGER NOT NULL CHECK (valor > 0),
  observacion      TEXT    NOT NULL DEFAULT '',
  origen           TEXT    NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'contado')),
  estado           TEXT    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  registrado_en    TEXT    NOT NULL,
  anulado_en       TEXT,
  motivo_anulacion TEXT,
  UNIQUE (tipo, numero),
  CHECK ((tipo = 'proveedor') = (proveedor_codigo IS NOT NULL)),
  CHECK ((tipo = 'cliente') = (cliente_codigo IS NOT NULL)),
  CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL))
) STRICT;

CREATE INDEX ix_abonos_proveedor ON abonos (proveedor_codigo, fecha) WHERE proveedor_codigo IS NOT NULL;

CREATE TRIGGER tr_abonos_sin_delete
BEFORE DELETE ON abonos
BEGIN
  SELECT RAISE(ABORT, 'Los abonos no se pueden borrar: se anulan.');
END;

-- Lo único que cambia de un abono es su anulación (estado, fecha y motivo).
CREATE TRIGGER tr_abonos_solo_anular
BEFORE UPDATE ON abonos
WHEN OLD.estado = 'anulado'
  OR NEW.tipo IS NOT OLD.tipo
  OR NEW.numero IS NOT OLD.numero
  OR NEW.proveedor_codigo IS NOT OLD.proveedor_codigo
  OR NEW.cliente_codigo IS NOT OLD.cliente_codigo
  OR NEW.fecha IS NOT OLD.fecha
  OR NEW.forma_pago_id IS NOT OLD.forma_pago_id
  OR NEW.valor IS NOT OLD.valor
  OR NEW.observacion IS NOT OLD.observacion
  OR NEW.origen IS NOT OLD.origen
  OR NEW.registrado_en IS NOT OLD.registrado_en
BEGIN
  SELECT RAISE(ABORT, 'Un abono no se puede modificar: solo se puede anular.');
END;

-- Reparto del abono entre facturas (muchos a muchos, §8). La Fase 3 agrega
-- la columna de la factura de cliente.
CREATE TABLE abonos_aplicaciones (
  id                   INTEGER PRIMARY KEY,
  abono_id             INTEGER NOT NULL REFERENCES abonos (id),
  factura_proveedor_id INTEGER REFERENCES facturas_proveedor (id),
  valor                INTEGER NOT NULL CHECK (valor > 0),
  UNIQUE (abono_id, factura_proveedor_id)
) STRICT;

CREATE INDEX ix_aplicaciones_factura_proveedor
  ON abonos_aplicaciones (factura_proveedor_id) WHERE factura_proveedor_id IS NOT NULL;

CREATE TRIGGER tr_aplicaciones_sin_update
BEFORE UPDATE ON abonos_aplicaciones
BEGIN
  SELECT RAISE(ABORT, 'Las aplicaciones de un abono no se pueden modificar.');
END;

CREATE TRIGGER tr_aplicaciones_sin_delete
BEFORE DELETE ON abonos_aplicaciones
BEGIN
  SELECT RAISE(ABORT, 'Las aplicaciones de un abono no se pueden borrar.');
END;

-- Ajustes de inventario (§9.2, D-46, D-73): merma, daño o conteo físico de un
-- producto en una bodega. `cantidad` es lo que mueve el kardex (con signo);
-- en el conteo, `cantidad_contada` es lo que se contó.
CREATE TABLE ajustes_inventario (
  id               INTEGER PRIMARY KEY,
  numero           INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  fecha            TEXT    NOT NULL,
  producto_codigo  INTEGER NOT NULL REFERENCES productos (codigo),
  bodega_id        INTEGER NOT NULL REFERENCES bodegas (id),
  tipo             TEXT    NOT NULL CHECK (tipo IN ('merma', 'dano', 'conteo')),
  cantidad         INTEGER NOT NULL CHECK (cantidad <> 0),
  stock_anterior   INTEGER NOT NULL,
  cantidad_contada INTEGER,
  costo_unitario   INTEGER NOT NULL CHECK (costo_unitario >= 0),
  motivo           TEXT    NOT NULL CHECK (length(motivo) > 0),
  estado           TEXT    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  anulado_en       TEXT,
  motivo_anulacion TEXT,
  CHECK ((tipo = 'conteo') = (cantidad_contada IS NOT NULL)),
  CHECK (tipo = 'conteo' OR cantidad < 0),
  CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL))
) STRICT;

CREATE INDEX ix_ajustes_producto ON ajustes_inventario (producto_codigo, bodega_id);

CREATE TRIGGER tr_ajustes_sin_delete
BEFORE DELETE ON ajustes_inventario
BEGIN
  SELECT RAISE(ABORT, 'Los ajustes de inventario no se pueden borrar: se anulan.');
END;

-- Consecutivos de los documentos nuevos (D-54, D-74).
INSERT INTO consecutivos (clave, siguiente) VALUES
  ('compra', 1),
  ('abono_proveedor', 1),
  ('ajuste', 1);
