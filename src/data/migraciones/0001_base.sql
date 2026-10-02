-- =============================================================================
-- Migración 0001 — Infraestructura base (Fase 0)
-- Configuración, consecutivos e historial de cambios (auditoría).
-- La tabla schema_migraciones la crea el migrador.
-- =============================================================================

-- Configuración clave/valor: datos del negocio, hash de contraseña, rutas de
-- respaldo, etc. El valor siempre es JSON válido.
CREATE TABLE configuracion (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL CHECK (json_valid(valor)),
  actualizado_en TEXT NOT NULL
) STRICT;

-- Consecutivos atómicos (D-05). Se toman con UPDATE ... RETURNING dentro de la
-- misma transacción del documento, para no dejar huecos.
CREATE TABLE consecutivos (
  clave     TEXT    PRIMARY KEY,
  siguiente INTEGER NOT NULL CHECK (siguiente > 0)
) STRICT;

-- Historial de cambios: solo inserción (D-09).
CREATE TABLE historial_cambios (
  id         INTEGER PRIMARY KEY,
  fecha      TEXT NOT NULL,
  entidad    TEXT NOT NULL CHECK (length(entidad) > 0),
  entidad_id TEXT NOT NULL CHECK (length(entidad_id) > 0),
  accion     TEXT NOT NULL CHECK (accion IN ('crear', 'editar', 'anular', 'inactivar', 'reactivar', 'sistema')),
  antes      TEXT CHECK (antes IS NULL OR json_valid(antes)),
  despues    TEXT CHECK (despues IS NULL OR json_valid(despues)),
  motivo     TEXT
) STRICT;

CREATE INDEX ix_historial_entidad ON historial_cambios (entidad, entidad_id);
CREATE INDEX ix_historial_fecha   ON historial_cambios (fecha);
CREATE INDEX ix_historial_accion  ON historial_cambios (accion, fecha);

CREATE TRIGGER tr_historial_sin_update
BEFORE UPDATE ON historial_cambios
BEGIN
  SELECT RAISE(ABORT, 'El historial de cambios no se puede modificar.');
END;

CREATE TRIGGER tr_historial_sin_delete
BEFORE DELETE ON historial_cambios
BEGIN
  SELECT RAISE(ABORT, 'El historial de cambios no se puede borrar.');
END;

-- Consecutivos iniciales: productos desde 101 (§5.1), clientes y proveedores desde 10001 (S-01).
INSERT INTO consecutivos (clave, siguiente) VALUES
  ('producto', 101),
  ('cliente', 10001),
  ('proveedor', 10001);
