import { describe, expect, it } from 'vitest';
import {
  ALFABETO_CLAVE,
  formatearClaveRecuperacion,
  generarClaveRecuperacion,
  LARGO_CLAVE,
  normalizarClaveRecuperacion,
} from './clave-recuperacion';

describe('clave de recuperación', () => {
  it('el alfabeto tiene 32 símbolos sin repetir y sin los que se confunden', () => {
    expect(ALFABETO_CLAVE).toHaveLength(32);
    expect(new Set(ALFABETO_CLAVE).size).toBe(32);
    for (const confuso of ['I', 'O', '0', '1']) {
      expect(ALFABETO_CLAVE).not.toContain(confuso);
    }
  });

  it('genera 24 símbolos en 6 grupos de 4', () => {
    const bytes = Uint8Array.from({ length: LARGO_CLAVE }, (_, i) => i * 11);
    const clave = generarClaveRecuperacion(bytes);
    expect(clave).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
  });

  it('usa los 5 bits bajos de cada byte', () => {
    const bytes = new Uint8Array(LARGO_CLAVE).fill(32 + 31);
    expect(generarClaveRecuperacion(bytes)).toBe('9999-9999-9999-9999-9999-9999');
  });

  it('rechaza azar insuficiente', () => {
    expect(() => generarClaveRecuperacion(new Uint8Array(10))).toThrow(RangeError);
  });

  it('normaliza lo escrito ignorando espacios, guiones y minúsculas', () => {
    const clave = generarClaveRecuperacion(
      Uint8Array.from({ length: LARGO_CLAVE }, (_, i) => i * 7),
    );
    const compacta = clave.replace(/-/g, '');
    expect(normalizarClaveRecuperacion(clave)).toBe(compacta);
    expect(normalizarClaveRecuperacion(` ${clave.toLowerCase().replace(/-/g, ' ')} `)).toBe(
      compacta,
    );
  });

  it('rechaza claves con largo o símbolos inválidos', () => {
    expect(normalizarClaveRecuperacion('')).toBeNull();
    expect(normalizarClaveRecuperacion('ABCD-EFGH')).toBeNull();
    expect(normalizarClaveRecuperacion('OOOO-AAAA-AAAA-AAAA-AAAA-AAAA')).toBeNull();
  });

  it('agrupa de a 4', () => {
    expect(formatearClaveRecuperacion('ABCDEFGHJK')).toBe('ABCD-EFGH-JK');
  });
});
