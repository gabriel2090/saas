-- =============================================================================
-- Migración 0008 — Cierre de caja (Fase 5d)
-- Un cierre cubre un tramo: desde el cierre anterior vigente (exclusivo)
-- hasta el momento en que se guarda (D-150). Guarda los totales por forma
-- de pago y el arqueo; no se edita y solo se anula el último vigente.
-- =============================================================================

-- `desde` es el `hasta` del cierre anterior vigente (NULL en el primero);
-- `hasta` el momento de guardar, con desfase local (D-06), y `dia` su día.
-- `cantidades` (JSON) lleva cuántos documentos hubo en cada concepto y
-- `conteo` (JSON) el conteo opcional de billetes y monedas.
CREATE TABLE cierres_caja (
  id               INTEGER PRIMARY KEY,
  numero           INTEGER NOT NULL UNIQUE CHECK (numero > 0),
  desde            TEXT,
  hasta            TEXT    NOT NULL,
  dia              TEXT    NOT NULL CHECK (dia GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  anterior_numero  INTEGER,
  base_inicial     INTEGER NOT NULL CHECK (base_inicial >= 0),
  base_queda       INTEGER NOT NULL CHECK (base_queda >= 0),
  observacion      TEXT    NOT NULL DEFAULT '',
  cantidades       TEXT    NOT NULL CHECK (json_valid(cantidades)),
  conteo           TEXT    CHECK (conteo IS NULL OR json_valid(conteo)),
  estado           TEXT    NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo', 'anulado')),
  anulado_en       TEXT,
  motivo_anulacion TEXT,
  CHECK ((desde IS NULL) = (anterior_numero IS NULL)),
  CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL))
) STRICT;

CREATE TRIGGER tr_cierres_caja_sin_delete
BEFORE DELETE ON cierres_caja
BEGIN
  SELECT RAISE(ABORT, 'Los cierres de caja no se pueden borrar: se anulan.');
END;

-- Lo único que cambia de un cierre es su anulación, y solo la del último vigente.
CREATE TRIGGER tr_cierres_caja_solo_anular
BEFORE UPDATE ON cierres_caja
WHEN OLD.estado = 'anulado'
  OR NEW.numero IS NOT OLD.numero
  OR NEW.desde IS NOT OLD.desde
  OR NEW.hasta IS NOT OLD.hasta
  OR NEW.dia IS NOT OLD.dia
  OR NEW.anterior_numero IS NOT OLD.anterior_numero
  OR NEW.base_inicial IS NOT OLD.base_inicial
  OR NEW.base_queda IS NOT OLD.base_queda
  OR NEW.observacion IS NOT OLD.observacion
  OR NEW.cantidades IS NOT OLD.cantidades
  OR NEW.conteo IS NOT OLD.conteo
BEGIN
  SELECT RAISE(ABORT, 'Un cierre de caja no se puede modificar: solo se puede anular.');
END;

CREATE TRIGGER tr_cierres_caja_anular_ultimo
BEFORE UPDATE OF estado ON cierres_caja
WHEN NEW.estado = 'anulado'
  AND EXISTS (SELECT 1 FROM cierres_caja WHERE numero > OLD.numero AND estado = 'activo')
BEGIN
  SELECT RAISE(ABORT, 'Solo se puede anular el último cierre de caja vigente.');
END;

-- Totales y arqueo de cada forma de pago del cierre, en el orden de las
-- columnas. Los conceptos van como se muestran (positivos) y las
-- anulaciones de días anteriores con su signo (D-152, D-153).
CREATE TABLE cierres_caja_formas (
  id                     INTEGER PRIMARY KEY,
  cierre_id              INTEGER NOT NULL REFERENCES cierres_caja (id),
  orden                  INTEGER NOT NULL CHECK (orden > 0),
  forma_pago_id          INTEGER NOT NULL REFERENCES formas_pago (id),
  forma_nombre           TEXT    NOT NULL,
  se_cuenta              INTEGER NOT NULL CHECK (se_cuenta IN (0, 1)),
  recibe_base            INTEGER NOT NULL CHECK (recibe_base IN (0, 1)),
  ventas                 INTEGER NOT NULL CHECK (ventas >= 0),
  abonos_clientes        INTEGER NOT NULL CHECK (abonos_clientes >= 0),
  reintegros_recibe      INTEGER NOT NULL CHECK (reintegros_recibe >= 0),
  abonos_proveedores     INTEGER NOT NULL CHECK (abonos_proveedores >= 0),
  reintegros_entrega     INTEGER NOT NULL CHECK (reintegros_entrega >= 0),
  anulaciones_anteriores INTEGER NOT NULL,
  base_inicial           INTEGER NOT NULL CHECK (base_inicial >= 0),
  esperado               INTEGER NOT NULL,
  contado                INTEGER NOT NULL,
  diferencia             INTEGER NOT NULL,
  UNIQUE (cierre_id, orden),
  UNIQUE (cierre_id, forma_pago_id),
  CHECK (recibe_base = 1 OR base_inicial = 0),
  CHECK (esperado = ventas + abonos_clientes + reintegros_recibe - abonos_proveedores
                    - reintegros_entrega + anulaciones_anteriores + base_inicial),
  CHECK (diferencia = contado - esperado)
) STRICT;

CREATE TRIGGER tr_cierres_caja_formas_sin_update
BEFORE UPDATE ON cierres_caja_formas
BEGIN
  SELECT RAISE(ABORT, 'Los totales de un cierre de caja no se pueden modificar.');
END;

CREATE TRIGGER tr_cierres_caja_formas_sin_delete
BEFORE DELETE ON cierres_caja_formas
BEGIN
  SELECT RAISE(ABORT, 'Los totales de un cierre de caja no se pueden borrar.');
END;

-- Índices para traer los candidatos de un tramo sin recorrer todo.
CREATE INDEX ix_abonos_registrado_en ON abonos (registrado_en);
CREATE INDEX ix_abonos_anulado_en ON abonos (anulado_en) WHERE anulado_en IS NOT NULL;
CREATE INDEX ix_reintegros_fecha ON reintegros (fecha);
CREATE INDEX ix_reintegros_anulado_en ON reintegros (anulado_en) WHERE anulado_en IS NOT NULL;
CREATE INDEX ix_facturas_cliente_contado ON facturas_cliente (fecha) WHERE condicion = 'contado';

INSERT INTO consecutivos (clave, siguiente) VALUES ('cierre_caja', 1);
