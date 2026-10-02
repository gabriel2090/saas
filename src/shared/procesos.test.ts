import { describe, expect, it } from 'vitest';
import { buscarProcesos, normalizarBusqueda, obtenerProceso, PROCESOS } from './procesos';

describe('catálogo de procesos', () => {
  it('no repite identificadores', () => {
    const ids = PROCESOS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('incluye «Datos del negocio» en la Fase 1 (D-12)', () => {
    expect(obtenerProceso('datos-negocio').fase).toBe(1);
  });
});

describe('normalizarBusqueda', () => {
  it('quita tildes y pasa a minúsculas', () => {
    expect(normalizarBusqueda('  Corrección ÁBONO ')).toBe('correccion abono');
  });
});

describe('buscarProcesos', () => {
  it('encuentra por título sin importar tildes ni mayúsculas', () => {
    const ids = buscarProcesos('ABONO').map((p) => p.id);
    expect(ids).toEqual(['abono-cliente', 'abono-proveedor']);
  });

  it('encuentra por palabras clave', () => {
    expect(buscarProcesos('cartera').map((p) => p.id)).toContain('cuentas-cobrar');
    expect(buscarProcesos('contrasena').map((p) => p.id)).toEqual(['cambiar-contrasena']);
  });

  it('exige que todas las palabras coincidan', () => {
    expect(buscarProcesos('correccion proveedor').map((p) => p.id)).toEqual([
      'correccion-proveedor',
    ]);
  });

  it('pone primero los títulos que empiezan por la consulta', () => {
    const ids = buscarProcesos('factura').map((p) => p.id);
    expect(ids.slice(0, 2)).toEqual(['facturar', 'factura-proveedor']);
    expect(ids).toContain('correccion-cliente');
    expect(ids.indexOf('correccion-cliente')).toBeGreaterThan(1);
  });

  it('devuelve todos los procesos con la consulta vacía', () => {
    expect(buscarProcesos('   ')).toHaveLength(PROCESOS.length);
  });
});
