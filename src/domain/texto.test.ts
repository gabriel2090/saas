import { describe, expect, it } from 'vitest';
import { claveComparacion, limpiarTexto } from './texto';

describe('textos', () => {
  it('limpia espacios de los extremos y repetidos', () => {
    expect(limpiarTexto('  Caja   pizza \t 35 ')).toBe('Caja pizza 35');
  });

  it('la clave de comparación ignora mayúsculas, tildes y espacios', () => {
    expect(claveComparacion(' Bodega  NORTE ')).toBe('bodega norte');
    expect(claveComparacion('Jurídica')).toBe(claveComparacion('JURIDICA'));
  });
});
