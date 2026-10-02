-- =============================================================================
-- Migración 0004 — Ventas (Fase 3a)
-- Facturas de cliente (con líneas y versiones), borradores de la ventana de
-- facturar y la columna de factura de cliente en el reparto de abonos (los
-- abonos de cliente llegan en la Fase 3b). Los documentos nunca se borran:
-- se anulan (§3). El saldo de una factura a crédito no se guarda: es su total
-- menos lo aplicado por abonos activos.
-- =============================================================================

-- Factura de cliente (§7). `numero` es el consecutivo asignado al guardar.
-- `fecha` es el momento de guardarla, con desfase local (D-06, D-91); `dia`
-- es su día local (AAAA-MM-DD) para vencimientos y cierres de caja. En las
-- de contado el plazo es 0, vence el mismo día y no generan cartera.
CREATE TABLE facturas_cliente (
  id               INTEGER PRIMARY KEY,
  numero           INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  cliente_codigo   INTEGER NOT NULL REFERENCES clientes (codigo),
  fecha            TEXT    NOT NULL,
  dia              TEXT    NOT NULL CHECK (dia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  condicion        TEXT    NOT NULL CHECK (condicion IN ('contado', 'credito')),
  plazo_dias       INTEGER NOT NULL CHECK (plazo_dias >= 0),
  vence            TEXT    NOT NULL CHECK (vence GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  bodega_id        INTEGER NOT NULL REFERENCES bodegas (id),
  total            INTEGER NOT NULL CHECK (total >= 0),
  -- «Su ahorro fue de» (§7): diferencia con el precio de la escala en las líneas rebajadas.
  ahorro           INTEGER NOT NULL DEFAULT 0 CHECK (ahorro >= 0),
  -- Contado (D-90): forma de pago, lo recibido y el cambio. NULL a crédito.
  forma_pago_id    INTEGER REFERENCES formas_pago (id),
  recibido         INTEGER CHECK (recibido IS NULL OR recibido >= total),
  cambio           INTEGER CHECK (cambio IS NULL OR cambio >= 0),
  cajas_empaque    INTEGER CHECK (cajas_empaque IS NULL OR cajas_empaque > 0),
  -- Versión vigente; las correcciones de la Fase 4 crean versiones nuevas.
  version          INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  estado           TEXT    NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'anulada')),
  anulada_en       TEXT,
  motivo_anulacion TEXT,
  CHECK ((condicion = 'contado') = (forma_pago_id IS NOT NULL)),
  CHECK (condicion = 'credito' OR plazo_dias = 0),
  CHECK ((recibido IS NULL) = (cambio IS NULL)),
  CHECK (recibido IS NULL OR cambio = recibido - total),
  CHECK ((estado = 'anulada') = (anulada_en IS NOT NULL))
) STRICT;

CREATE INDEX ix_ventas_cliente ON facturas_cliente (cliente_codigo, dia, numero);
CREATE INDEX ix_ventas_dia ON facturas_cliente (dia);

CREATE TRIGGER tr_ventas_sin_delete
BEFORE DELETE ON facturas_cliente
BEGIN
  SELECT RAISE(ABORT, 'Las facturas de cliente no se pueden borrar: se anulan.');
END;

CREATE TRIGGER tr_ventas_anulada_final
BEFORE UPDATE ON facturas_cliente
WHEN OLD.estado = 'anulada'
BEGIN
  SELECT RAISE(ABORT, 'Una factura de cliente anulada no se puede modificar.');
END;

-- Líneas de cada versión. `precio_escala` es el de la escala elegida al
-- vender; `precio` el vendido (distinto si se alteró con F7). `costo` es el
-- costo del producto en ese momento: el precio no puede quedar por debajo (§7).
CREATE TABLE facturas_cliente_lineas (
  id              INTEGER PRIMARY KEY,
  factura_id      INTEGER NOT NULL REFERENCES facturas_cliente (id),
  version         INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  renglon         INTEGER NOT NULL CHECK (renglon > 0),
  producto_codigo INTEGER NOT NULL REFERENCES productos (codigo),
  escala          TEXT    NOT NULL CHECK (escala IN ('mayor', 'menor', 'minimo')),
  cantidad        INTEGER NOT NULL CHECK (cantidad > 0),
  precio_escala   INTEGER NOT NULL CHECK (precio_escala >= 0),
  precio          INTEGER NOT NULL CHECK (precio >= 0),
  alterado        INTEGER NOT NULL DEFAULT 0 CHECK (alterado IN (0, 1)),
  total           INTEGER NOT NULL CHECK (total >= 0),
  costo           INTEGER NOT NULL CHECK (costo >= 0),
  UNIQUE (factura_id, version, renglon)
) STRICT;

CREATE INDEX ix_ventas_lineas_producto ON facturas_cliente_lineas (producto_codigo);

CREATE TRIGGER tr_ventas_lineas_sin_update
BEFORE UPDATE ON facturas_cliente_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una factura de cliente no se pueden modificar.');
END;

CREATE TRIGGER tr_ventas_lineas_sin_delete
BEFORE DELETE ON facturas_cliente_lineas
BEGIN
  SELECT RAISE(ABORT, 'Las líneas de una factura de cliente no se pueden borrar.');
END;

-- Contenido completo (JSON) de cada versión, para el historial de ediciones
-- de la Fase 4. La versión 1 se guarda al crearla.
CREATE TABLE facturas_cliente_versiones (
  id         INTEGER PRIMARY KEY,
  factura_id INTEGER NOT NULL REFERENCES facturas_cliente (id),
  version    INTEGER NOT NULL CHECK (version > 0),
  fecha      TEXT    NOT NULL,
  contenido  TEXT    NOT NULL CHECK (json_valid(contenido)),
  motivo     TEXT,
  UNIQUE (factura_id, version)
) STRICT;

CREATE TRIGGER tr_ventas_versiones_sin_update
BEFORE UPDATE ON facturas_cliente_versiones
BEGIN
  SELECT RAISE(ABORT, 'Las versiones de una factura no se pueden modificar.');
END;

CREATE TRIGGER tr_ventas_versiones_sin_delete
BEFORE DELETE ON facturas_cliente_versiones
BEGIN
  SELECT RAISE(ABORT, 'Las versiones de una factura no se pueden borrar.');
END;

-- Reparto de abonos a facturas de cliente (Fase 3b). Cada aplicación va a
-- una factura de proveedor o a una de cliente, nunca a las dos.
ALTER TABLE abonos_aplicaciones
  ADD COLUMN factura_cliente_id INTEGER REFERENCES facturas_cliente (id);

CREATE UNIQUE INDEX ux_aplicaciones_factura_cliente
  ON abonos_aplicaciones (abono_id, factura_cliente_id) WHERE factura_cliente_id IS NOT NULL;
CREATE INDEX ix_aplicaciones_factura_cliente
  ON abonos_aplicaciones (factura_cliente_id) WHERE factura_cliente_id IS NOT NULL;

CREATE TRIGGER tr_aplicaciones_una_factura
BEFORE INSERT ON abonos_aplicaciones
WHEN (NEW.factura_proveedor_id IS NULL) = (NEW.factura_cliente_id IS NULL)
BEGIN
  SELECT RAISE(ABORT, 'Cada aplicación de un abono va a una sola factura (de proveedor o de cliente).');
END;

-- Borradores de la ventana de facturar (§7, D-89): seis ranuras que se
-- autoguardan para sobrevivir a un apagón. No son documentos: se
-- sobrescriben y se borran libremente y no pasan por el historial.
CREATE TABLE borradores_factura (
  ranura         INTEGER PRIMARY KEY CHECK (ranura BETWEEN 1 AND 6),
  contenido      TEXT    NOT NULL CHECK (json_valid(contenido)),
  actualizado_en TEXT    NOT NULL
) STRICT;

-- Consecutivo de la factura de cliente (§7). El inicio se configura en
-- «Datos del negocio» antes de la primera factura (D-84).
INSERT INTO consecutivos (clave, siguiente) VALUES ('factura_cliente', 1);
