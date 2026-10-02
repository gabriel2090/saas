import { describe, expect, it } from 'vitest';
import { seleccionarRespaldosAEliminar, type ArchivoRespaldo } from './politica-respaldos';

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
 * @returns Archivo de respaldo.
 */
function respaldo(minutosAtras: number): ArchivoRespaldo {
  return { nombre: `r-${minutosAtras}`, fecha: new Date(AHORA.getTime() - minutosAtras * MINUTO) };
}

describe('seleccionarRespaldosAEliminar', () => {
  it('no elimina nada si hay 20 copias o menos', () => {
    const archivos = Array.from({ length: 20 }, (_, i) => respaldo(i));
    expect(seleccionarRespaldosAEliminar(archivos, AHORA)).toEqual([]);
  });

  it('conserva las 20 más recientes y una por hora: elimina las demás de la misma hora', () => {
    // 25 copias, una por minuto, todas dentro de la hora actual (23:05–23:29).
    const archivos = Array.from({ length: 25 }, (_, i) => respaldo(i + 1));
    const eliminados = seleccionarRespaldosAEliminar(archivos, AHORA);
    // Las 20 más recientes se conservan; de las 5 más viejas, ninguna es la más reciente de su hora.
    expect(eliminados.sort()).toEqual(['r-21', 'r-22', 'r-23', 'r-24', 'r-25'].sort());
  });

  it('conserva una por hora en las últimas 48 horas (la más reciente de cada hora)', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i)); // 20 en la hora actual
    // Hace 5 horas: dos copias en la misma hora; solo se conserva la más reciente.
    const horaVieja = [respaldo(5 * 60), respaldo(5 * 60 + 10)];
    const eliminados = seleccionarRespaldosAEliminar([...recientes, ...horaVieja], AHORA);
    expect(eliminados).toEqual([`r-${5 * 60 + 10}`]);
  });

  it('pasadas 48 horas conserva solo una por día durante 30 días', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const dia = 24 * 60;
    // Hace 3 días: tres copias del mismo día (a distintas horas).
    const haceTresDias = [respaldo(3 * dia), respaldo(3 * dia + 60), respaldo(3 * dia + 120)];
    const eliminados = seleccionarRespaldosAEliminar([...recientes, ...haceTresDias], AHORA);
    expect(eliminados.sort()).toEqual([`r-${3 * dia + 60}`, `r-${3 * dia + 120}`].sort());
  });

  it('elimina las copias de más de 30 días que no estén entre las 20 más recientes', () => {
    const recientes = Array.from({ length: 20 }, (_, i) => respaldo(i));
    const antigua = respaldo(31 * 24 * 60);
    expect(seleccionarRespaldosAEliminar([...recientes, antigua], AHORA)).toEqual([antigua.nombre]);
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
