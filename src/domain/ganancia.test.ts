import { describe, expect, it } from 'vitest';
import { escalasBajoCosto, porcentajeGanancia } from './ganancia';

describe('porcentajeGanancia', () => {
  it('calcula en décimas de punto porcentual', () => {
    expect(porcentajeGanancia(13200, 14500)).toBe(98);
    expect(porcentajeGanancia(13200, 15500)).toBe(174);
    expect(porcentajeGanancia(1000, 1250)).toBe(250);
  });

  it('da negativo si el precio está bajo el costo', () => {
    expect(porcentajeGanancia(13200, 13000)).toBe(-15);
  });

  it('precio igual al costo es 0 %', () => {
    expect(porcentajeGanancia(5000, 5000)).toBe(0);
  });

  it('redondea las mitades alejándose de cero, en ambos signos', () => {
    // 1/2000 = 0.05 % → 0.5 décimas → 1
    expect(porcentajeGanancia(2000, 2001)).toBe(1);
    expect(porcentajeGanancia(2000, 1999)).toBe(-1);
    // 1/3 = 33.333… % → 333
    expect(porcentajeGanancia(3, 4)).toBe(333);
  });

  it('sin costo no hay porcentaje', () => {
    expect(porcentajeGanancia(0, 5000)).toBeNull();
  });
});

describe('escalasBajoCosto', () => {
  it('lista las escalas por debajo del costo en orden', () => {
    expect(escalasBajoCosto(13200, { mayor: 14500, menor: 15500, minimo: 13000 })).toEqual([
      'minimo',
    ]);
    expect(escalasBajoCosto(20000, { mayor: 14500, menor: 15500, minimo: 13000 })).toEqual([
      'mayor',
      'menor',
      'minimo',
    ]);
  });

  it('igual al costo no es «por debajo»', () => {
    expect(escalasBajoCosto(1000, { mayor: 1000, menor: 1000, minimo: 1000 })).toEqual([]);
  });
});
