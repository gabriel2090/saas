import { describe, expect, it } from 'vitest';
import {
  aIsoLocal,
  formatearFecha,
  formatearFechaHora,
  formatearFechaHoraTirilla,
  formatearHora,
  leerFecha,
} from './fechas';

describe('leerFecha', () => {
  it('convierte dd/mm/aaaa al formato de la base de datos', () => {
    expect(leerFecha('02/10/2026')).toBe('2026-10-02');
    expect(leerFecha(' 2/1/2026 ')).toBe('2026-01-02');
    expect(leerFecha('29/02/2028')).toBe('2028-02-29');
  });

  it('rechaza fechas que no existen o mal escritas', () => {
    expect(leerFecha('31/02/2026')).toBeNull();
    expect(leerFecha('29/02/2026')).toBeNull();
    expect(leerFecha('00/10/2026')).toBeNull();
    expect(leerFecha('2026-10-02')).toBeNull();
    expect(leerFecha('2/10/26')).toBeNull();
    expect(leerFecha('')).toBeNull();
  });
});

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

describe('formatearFechaHoraTirilla', () => {
  it('imprime segundos y AM/PM como la tirilla actual', () => {
    expect(formatearFechaHoraTirilla('2026-09-30T17:26:36.120-05:00')).toBe(
      '30/09/2026 05:26:36 PM',
    );
    expect(formatearFechaHoraTirilla('2026-09-30T00:05:09-05:00')).toBe('30/09/2026 12:05:09 AM');
    expect(formatearFechaHoraTirilla('2026-09-30T12:00:00-05:00')).toBe('30/09/2026 12:00:00 PM');
  });
});
