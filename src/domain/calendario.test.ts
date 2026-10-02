import { describe, expect, it } from 'vitest';
import {
  calcularVencimiento,
  diaDeIso,
  diasEntre,
  esFechaValida,
  sumarDias,
  textoVencimiento,
  validarFechaDocumento,
  validarPlazo,
} from './calendario';

describe('calendario de documentos', () => {
  it('reconoce fechas que existen', () => {
    expect(esFechaValida('2026-02-28')).toBe(true);
    expect(esFechaValida('2028-02-29')).toBe(true);
    expect(esFechaValida('2026-02-29')).toBe(false);
    expect(esFechaValida('2026-13-01')).toBe(false);
    expect(esFechaValida('02/10/2026')).toBe(false);
  });

  it('toma el día local de una fecha ISO con desfase', () => {
    expect(diaDeIso('2026-10-01T23:30:00.000-05:00')).toBe('2026-10-01');
    expect(() => diaDeIso('ayer')).toThrow(RangeError);
  });

  it('suma días y calcula el vencimiento cruzando meses y años', () => {
    expect(sumarDias('2026-10-02', 30)).toBe('2026-11-01');
    expect(calcularVencimiento('2026-12-15', 30)).toBe('2027-01-14');
    expect(calcularVencimiento('2026-10-02', 0)).toBe('2026-10-02');
    expect(sumarDias('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('cuenta los días entre dos fechas', () => {
    expect(diasEntre('2026-10-02', '2026-10-05')).toBe(3);
    expect(diasEntre('2026-10-02', '2026-09-19')).toBe(-13);
  });

  it('rechaza fechas futuras o inválidas en un documento', () => {
    expect(validarFechaDocumento('2026-10-02', '2026-10-02')).toBe('2026-10-02');
    expect(validarFechaDocumento('2026-09-01', '2026-10-02')).toBe('2026-09-01');
    expect(() => validarFechaDocumento('2026-10-03', '2026-10-02')).toThrow(/posterior a hoy/);
    expect(() => validarFechaDocumento('2026-02-30', '2026-10-02')).toThrow(/no es válida/);
  });

  it('valida el plazo', () => {
    expect(validarPlazo(0)).toBe(0);
    expect(validarPlazo(999)).toBe(999);
    expect(() => validarPlazo(-1)).toThrow(/plazo/);
    expect(() => validarPlazo(1000)).toThrow(/plazo/);
    expect(() => validarPlazo(1.5)).toThrow(/plazo/);
  });

  it('describe el vencimiento', () => {
    expect(textoVencimiento('2026-09-19', '2026-10-02')).toEqual({
      texto: 'Vencida hace 13 días',
      vencida: true,
    });
    expect(textoVencimiento('2026-10-01', '2026-10-02').texto).toBe('Vencida hace 1 día');
    expect(textoVencimiento('2026-10-02', '2026-10-02')).toEqual({
      texto: 'Vence hoy',
      vencida: false,
    });
    expect(textoVencimiento('2026-10-03', '2026-10-02').texto).toBe('Vence mañana');
    expect(textoVencimiento('2026-10-05', '2026-10-02').texto).toBe('Vence en 3 días');
  });
});
