-- =============================================================================
-- Migración 0006 — Preferencias de interfaz (Fase 3c)
-- Modo de la barra superior y tamaño y posición recordados de cada ventana
-- (D-113). No son documentos ni datos del negocio: se guardan fuera del
-- historial de cambios y sin disparar respaldos, igual que los borradores
-- de factura (D-89).
-- =============================================================================

-- Claves: 'barra' (texto JSON con el modo) y 'ventana:<id del proceso>'
-- (JSON con la geometría). El valor se valida en el servicio antes de guardarlo.
CREATE TABLE preferencias_interfaz (
  clave          TEXT PRIMARY KEY,
  valor          TEXT NOT NULL CHECK (json_valid(valor)),
  actualizado_en TEXT NOT NULL
) STRICT;
