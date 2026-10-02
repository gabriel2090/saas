-- =============================================================================
-- Migración 0002 — Maestros (Fase 1)
-- Bodegas, formas de pago, proveedores, clientes, productos y kardex.
-- Los maestros no tienen fechas propias: cada creación y edición queda en
-- historial_cambios con su fecha. Nunca se borran: se inactivan (D-27).
-- =============================================================================

-- Bodegas (§5.4). `nombre_clave` es el nombre normalizado (minúsculas, sin
-- tildes ni espacios repetidos) para impedir duplicados como «Principal» y «principal».
CREATE TABLE bodegas (
  id           INTEGER PRIMARY KEY,
  nombre       TEXT    NOT NULL CHECK (length(nombre) > 0),
  nombre_clave TEXT    NOT NULL UNIQUE,
  activo       INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  es_principal INTEGER NOT NULL DEFAULT 0 CHECK (es_principal IN (0, 1)),
  -- La Principal siempre existe y no se puede inactivar.
  CHECK (es_principal = 0 OR activo = 1)
) STRICT;

CREATE UNIQUE INDEX ux_bodegas_principal ON bodegas (es_principal) WHERE es_principal = 1;

-- Formas de pago (§5.4). `calcula_cambio` marca la(s) que calculan el cambio al facturar.
CREATE TABLE formas_pago (
  id             INTEGER PRIMARY KEY,
  nombre         TEXT    NOT NULL CHECK (length(nombre) > 0),
  nombre_clave   TEXT    NOT NULL UNIQUE,
  activo         INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  calcula_cambio INTEGER NOT NULL DEFAULT 0 CHECK (calcula_cambio IN (0, 1))
) STRICT;

-- Proveedores (§5.3): mismos datos obligatorios que el cliente.
CREATE TABLE proveedores (
  codigo                INTEGER PRIMARY KEY CHECK (codigo > 0),
  tipo_persona          TEXT    NOT NULL CHECK (tipo_persona IN ('natural', 'juridica')),
  nombre                TEXT    NOT NULL CHECK (length(nombre) > 0),
  tipo_identificacion   TEXT    NOT NULL CHECK (tipo_identificacion IN ('CC', 'NIT', 'CE', 'PASAPORTE')),
  numero_identificacion TEXT    NOT NULL CHECK (length(numero_identificacion) > 0),
  celular               TEXT    NOT NULL CHECK (length(celular) > 0),
  direccion             TEXT    NOT NULL CHECK (length(direccion) > 0),
  barrio                TEXT    NOT NULL DEFAULT '',
  ciudad                TEXT    NOT NULL DEFAULT '',
  activo                INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
) STRICT;

-- D-29: no puede haber dos proveedores con el mismo tipo y número de identificación.
CREATE UNIQUE INDEX ux_proveedores_identificacion
  ON proveedores (tipo_identificacion, numero_identificacion);

-- Clientes (§5.2). El «Consumidor final» (es_sistema = 1) no exige celular ni dirección.
CREATE TABLE clientes (
  codigo                INTEGER PRIMARY KEY CHECK (codigo >= 0),
  tipo_persona          TEXT    NOT NULL CHECK (tipo_persona IN ('natural', 'juridica')),
  nombre                TEXT    NOT NULL CHECK (length(nombre) > 0),
  tipo_identificacion   TEXT    NOT NULL CHECK (tipo_identificacion IN ('CC', 'NIT', 'CE', 'PASAPORTE')),
  numero_identificacion TEXT    NOT NULL CHECK (length(numero_identificacion) > 0),
  celular               TEXT    NOT NULL,
  direccion             TEXT    NOT NULL,
  barrio                TEXT    NOT NULL DEFAULT '',
  ciudad                TEXT    NOT NULL DEFAULT '',
  tope_credito          INTEGER CHECK (tope_credito IS NULL OR tope_credito > 0),
  activo                INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  es_sistema            INTEGER NOT NULL DEFAULT 0 CHECK (es_sistema IN (0, 1)),
  CHECK (es_sistema = 1 OR (length(celular) > 0 AND length(direccion) > 0)),
  CHECK (es_sistema = 0 OR activo = 1)
) STRICT;

CREATE UNIQUE INDEX ux_clientes_identificacion
  ON clientes (tipo_identificacion, numero_identificacion);

-- Productos (§5.1). El código es la clave: se elige al crear y no cambia.
CREATE TABLE productos (
  codigo           INTEGER PRIMARY KEY CHECK (codigo > 0),
  nombre           TEXT    NOT NULL CHECK (length(nombre) > 0),
  proveedor_codigo INTEGER NOT NULL REFERENCES proveedores (codigo),
  unidad           TEXT    NOT NULL CHECK (unidad IN ('UND', 'KG')),
  costo            INTEGER NOT NULL CHECK (costo >= 0),
  precio_mayor     INTEGER NOT NULL CHECK (precio_mayor >= 0),
  precio_menor     INTEGER NOT NULL CHECK (precio_menor >= 0),
  precio_minimo    INTEGER NOT NULL CHECK (precio_minimo >= 0),
  activo           INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
) STRICT;

CREATE INDEX ix_productos_proveedor ON productos (proveedor_codigo);

-- Kardex: el stock es la suma de `cantidad` (milésimas, con signo). Las
-- correcciones se hacen con movimientos nuevos: nunca se editan ni borran.
-- `tipo` no lleva CHECK de lista para que las fases siguientes agreguen
-- tipos (compra, venta, ajuste…) sin reconstruir la tabla; lo valida el dominio.
CREATE TABLE movimientos_inventario (
  id              INTEGER PRIMARY KEY,
  fecha           TEXT    NOT NULL,
  producto_codigo INTEGER NOT NULL REFERENCES productos (codigo),
  bodega_id       INTEGER NOT NULL REFERENCES bodegas (id),
  tipo            TEXT    NOT NULL CHECK (length(tipo) > 0),
  cantidad        INTEGER NOT NULL CHECK (cantidad <> 0),
  costo_unitario  INTEGER NOT NULL CHECK (costo_unitario >= 0),
  documento_tipo  TEXT,
  documento_id    TEXT,
  CHECK ((documento_tipo IS NULL) = (documento_id IS NULL))
) STRICT;

CREATE INDEX ix_kardex_producto_bodega ON movimientos_inventario (producto_codigo, bodega_id, id);

CREATE TRIGGER tr_kardex_sin_update
BEFORE UPDATE ON movimientos_inventario
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de inventario no se pueden modificar.');
END;

CREATE TRIGGER tr_kardex_sin_delete
BEFORE DELETE ON movimientos_inventario
BEGIN
  SELECT RAISE(ABORT, 'Los movimientos de inventario no se pueden borrar.');
END;

-- Datos iniciales (§5.2, §5.4).
INSERT INTO bodegas (nombre, nombre_clave, es_principal) VALUES ('Principal', 'principal', 1);

INSERT INTO formas_pago (nombre, nombre_clave, calcula_cambio) VALUES
  ('Efectivo', 'efectivo', 1),
  ('Transferencia', 'transferencia', 0),
  ('Tarjeta', 'tarjeta', 0);

-- D-37: el Consumidor final usa el código 0 para no chocar con los códigos
-- importados del sistema actual, y la identificación genérica de la DIAN.
INSERT INTO clientes (codigo, tipo_persona, nombre, tipo_identificacion, numero_identificacion,
                      celular, direccion, es_sistema)
VALUES (0, 'natural', 'CONSUMIDOR FINAL', 'CC', '222222222222', '', '', 1);
