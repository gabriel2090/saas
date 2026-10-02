import { describe, expect, it } from 'vitest';
import { aIsoLocal, formatearFecha, formatearFechaHora, formatearHora } from './fechas';

describe('aIsoLocal', () => {
  it('genera ISO 8601 con desfase que representa el mismo instante', () => {
    const fecha = new Date(2026, 9, 1, 23, 30, 15, 42);
    const iso = aIsoLocal(fecha);
    expect(iso).toMatch(/^2026-10-01T23:30:15\.042[+-]\d{2}:\d{2}$/);
    expect(new Date(iso).getTime()).toBe(fecha.getTime());
  });
});

describe('formatearFecha', () => {
  it('muestra dd/mm/aaaa usando la fecha tal como se guardó', () => {
    expect(formatearFecha('2026-10-01T23:30:00.000-05:00')).toBe('01/10/2026');
    expect(formatearFecha('2026-01-09')).toBe('09/01/2026');
  });

  it('rechaza textos que no son fechas ISO', () => {
    expect(() => formatearFecha('01/10/2026')).toThrow(RangeError);
  });
});

describe('formatearHora', () => {
  it('usa formato de 12 horas', () => {
    expect(formatearHora('2026-10-01T23:30:00-05:00')).toBe('11:30 p. m.');
    expect(formatearHora('2026-10-01T00:05:00-05:00')).toBe('12:05 a. m.');
    expect(formatearHora('2026-10-01T12:00:00-05:00')).toBe('12:00 p. m.');
    expect(formatearHora('2026-10-01T09:07:00-05:00')).toBe('9:07 a. m.');
  });
});

describe('formatearFechaHora', () => {
  it('combina fecha y hora', () => {
    expect(formatearFechaHora('2026-10-01T23:30:00.000-05:00')).toBe('01/10/2026 11:30 p. m.');
  });
});
