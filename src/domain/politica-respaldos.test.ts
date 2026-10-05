import { describe, expect, it } from 'vitest';
import {
  diasEntre,
  estadoCopiaExterna,
  resumirPerdida,
  seleccionarRespaldosAEliminar,
  textoPerdidaAlRestaurar,
  yaHayCopiaExternaHoy,
  type ArchivoRespaldo,
  type TipoRespaldo,
} from './politica-respaldos';

/**
 * Momento de referencia de las pruebas (hora local).
 */
const AHORA = new Date(2026, 9, 1, 23, 30, 0);

/**
 * Milisegundos en un minuto.
 */
const MINUTO = 60 * 1000;

/**
 * Crea un respaldo ficticio hecho cierta cantidad de minutos antes de {@link AHORA}.
 *
 * @param minutosAtras - Minutos antes de AHORA.
 * @param tipo - Tipo de copia (por defecto automática).
 * @returns Archivo de respaldo.
 */
function respaldo(minutosAtras: number, tipo: TipoRespaldo = 'automatica'): ArchivoRespaldo {
  return {
    nombre: `r-${tipo}-${minutosAtras}`,
    fecha: new Date(AHORA.getTime() - minutosAtras * MINUTO),
    tipo,
  };
}

describe('seleccionarRespaldosAEliminar', () => {
  it('no elimina nada si hay 20 copias o menos', () => {
    const archivos = Array.from({ length: 20 }, (_, i) => respaldo(i));
    expect(seleccionarRespaldosAEliminar(archivos, AHORA)).toEqual([]);
  });

  it('conserva las 20 más recientes y una por hora: elimina las demás de la misma hora', () => {
    const archivos = Array.from({ length: 25 }, (_, i) => respaldo(i + 1));
    const eliminados = seleccionarRespaldosAEliminar(archivos, AHORA);
    expect(eliminados.sort()).toEqual(
      ['r-automatica-21', 'r-automatica-22', 'r-automatica-23', 'r-automatica-24', 'r-automatica-25'].sort(),
    );
  });

  it('conserva una por hora en las últimas 48 horas (la más reciente de cada hora)', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const horaVieja = [respaldo(5 * 60), respaldo(5 * 60 + 10)];
    const eliminados = seleccionarRespaldosAEliminar([...recientes, ...horaVieja], AHORA);
    expect(eliminados).toEqual([`r-automatica-${5 * 60 + 10}`]);
  });

  it('pasadas 48 horas conserva solo una por día durante 30 días', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const dia = 24 * 60;
    const haceTresDias = [respaldo(3 * dia), respaldo(3 * dia + 60), respaldo(3 * dia + 120)];
    const eliminados = seleccionarRespaldosAEliminar([...recientes, ...haceTresDias], AHORA);
    expect(eliminados.sort()).toEqual(
      [`r-automatica-${3 * dia + 60}`, `r-automatica-${3 * dia + 120}`].sort(),
    );
  });

  it('elimina las automáticas de más de 30 días que no estén entre las 20 más recientes', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const antigua = respaldo(31 * 24 * 60);
    expect(seleccionarRespaldosAEliminar([...recientes, antigua], AHORA)).toEqual([antigua.nombre]);
  });

  it('no borra antes de 30 días una copia manual, de migración o de restauración (D-179)', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const manual = respaldo(10 * 24 * 60, 'manual');
    const migracion = respaldo(15 * 24 * 60, 'migracion');
    const restauracion = respaldo(20 * 24 * 60, 'restauracion');
    expect(
      seleccionarRespaldosAEliminar([...recientes, manual, migracion, restauracion], AHORA),
    ).toEqual([]);
  });

  it('sí elimina una manual de más de 30 días si no está entre las 20 más recientes', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const manualVieja = respaldo(31 * 24 * 60, 'manual');
    expect(seleccionarRespaldosAEliminar([...recientes, manualVieja], AHORA)).toEqual([
      manualVieja.nombre,
    ]);
  });

  it('conserva una copia antigua si está entre las 20 más recientes', () => {
    const antigua = respaldo(90 * 24 * 60);
    expect(seleccionarRespaldosAEliminar([respaldo(1), antigua], AHORA)).toEqual([]);
  });

  it('no depende del orden de entrada', () => {
    const archivos = Array.from({ length: 25 }, (_, i) => respaldo(i + 1)).reverse();
    expect(seleccionarRespaldosAEliminar(archivos, AHORA)).toHaveLength(5);
  });
});

describe('textoPerdidaAlRestaurar y resumirPerdida', () => {
  it('resume el total y el rango de facturas de cliente', () => {
    const p = resumirPerdida([
      {
        tipo: 'Factura de cliente',
        documento: '84796',
        momento: '2026-10-04T15:00:00-05:00',
        resumen: 'CONTADO',
      },
      {
        tipo: 'Factura de cliente',
        documento: '84807',
        momento: '2026-10-04T16:00:00-05:00',
        resumen: 'CONTADO',
      },
      {
        tipo: 'Abono de cliente',
        documento: '87',
        momento: '2026-10-04T16:30:00-05:00',
        resumen: 'JUAN',
      },
    ]);
    expect(p.total).toBe(3);
    expect(p.facturaDesde).toBe(84796);
    expect(p.facturaHasta).toBe(84807);
    expect(textoPerdidaAlRestaurar(p)).toBe('3 documentos (facturas de cliente 84796 a 84807)');
    expect(textoPerdidaAlRestaurar({ total: 0, facturaDesde: null, facturaHasta: null, documentos: [] })).toBe(
      'ningún documento posterior a esa copia',
    );
  });
});

describe('estadoCopiaExterna', () => {
  it('distingue sin configurar, al día, atrasada y no disponible', () => {
    expect(estadoCopiaExterna(null, null, false, '', AHORA)).toEqual({ estado: 'sin_configurar' });
    expect(
      estadoCopiaExterna('E:\\r', '2026-10-01T08:00:00-05:00', true, '', AHORA),
    ).toEqual({
      estado: 'ok',
      carpeta: 'E:\\r',
      ultimaCopia: '2026-10-01T08:00:00-05:00',
    });
    const atrasada = estadoCopiaExterna('E:\\r', '2026-09-28T08:00:00-05:00', true, '', AHORA);
    expect(atrasada.estado).toBe('atrasada');
    if (atrasada.estado === 'atrasada') expect(atrasada.diasSinEscribir).toBe(3);
    expect(estadoCopiaExterna('E:\\r', null, false, 'No está conectada', AHORA)).toEqual({
      estado: 'no_disponible',
      carpeta: 'E:\\r',
      ultimaCopia: null,
      motivo: 'No está conectada',
    });
  });

  it('yaHayCopiaExternaHoy y diasEntre', () => {
    expect(yaHayCopiaExternaHoy('2026-10-01T08:00:00-05:00', AHORA)).toBe(true);
    expect(yaHayCopiaExternaHoy('2026-09-30T23:00:00-05:00', AHORA)).toBe(false);
    expect(diasEntre(new Date(2026, 8, 28), AHORA)).toBe(3);
  });
});
