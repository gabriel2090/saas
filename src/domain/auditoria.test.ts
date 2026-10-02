import { describe, expect, it } from 'vitest';
import {
  crearEntradaHistorial,
  ocultarSecretos,
  VALOR_OCULTO,
  type AccionHistorial,
} from './auditoria';
import { ErrorDeNegocio } from './errores';

/**
 * Fecha fija para las pruebas.
 */
const FECHA = '2026-10-01T23:30:00.000-05:00';

describe('ocultarSecretos', () => {
  it('oculta los campos secretos a cualquier profundidad sin modificar el original', () => {
    const original = {
      clave: 'x',
      hash: 'abc',
      anidado: { hash: 'def', otro: 1 },
      lista: [{ hash: 'g' }],
    };
    const resultado = ocultarSecretos(original, ['hash']);
    expect(resultado).toEqual({
      clave: 'x',
      hash: VALOR_OCULTO,
      anidado: { hash: VALOR_OCULTO, otro: 1 },
      lista: [{ hash: VALOR_OCULTO }],
    });
    expect(original.hash).toBe('abc');
  });

  it('deja intactos los valores simples', () => {
    expect(ocultarSecretos('texto', ['hash'])).toBe('texto');
    expect(ocultarSecretos(null, ['hash'])).toBeNull();
  });
});

describe('crearEntradaHistorial', () => {
  it('serializa antes y después como JSON y ocupa la fecha de la transacción', () => {
    const entrada = crearEntradaHistorial(
      {
        entidad: 'producto',
        entidadId: 101,
        accion: 'editar',
        antes: { precio: 1000 },
        despues: { precio: 1200 },
      },
      FECHA,
    );
    expect(entrada).toEqual({
      fecha: FECHA,
      entidad: 'producto',
      entidadId: '101',
      accion: 'editar',
      antes: '{"precio":1000}',
      despues: '{"precio":1200}',
      motivo: null,
    });
  });

  it('oculta los campos secretos', () => {
    const entrada = crearEntradaHistorial(
      {
        entidad: 'configuracion',
        entidadId: 'auth.hash_contrasena',
        accion: 'editar',
        antes: { valor: 'viejo' },
        despues: { valor: 'nuevo' },
        camposSecretos: ['valor'],
      },
      FECHA,
    );
    expect(entrada.antes).toBe(`{"valor":"${VALOR_OCULTO}"}`);
    expect(entrada.despues).toBe(`{"valor":"${VALOR_OCULTO}"}`);
  });

  it('guarda el motivo recortado y convierte el vacío en null', () => {
    const base = {
      entidad: 'factura',
      entidadId: 1,
      accion: 'anular' as const,
      antes: null,
      despues: null,
    };
    expect(crearEntradaHistorial({ ...base, motivo: '  error de digitación ' }, FECHA).motivo).toBe(
      'error de digitación',
    );
    expect(crearEntradaHistorial({ ...base, motivo: '   ' }, FECHA).motivo).toBeNull();
  });

  it('exige entidad e identificador', () => {
    expect(() =>
      crearEntradaHistorial(
        { entidad: ' ', entidadId: 1, accion: 'crear', antes: null, despues: null },
        FECHA,
      ),
    ).toThrow(ErrorDeNegocio);
    expect(() =>
      crearEntradaHistorial(
        { entidad: 'x', entidadId: '', accion: 'crear', antes: null, despues: null },
        FECHA,
      ),
    ).toThrow(ErrorDeNegocio);
  });

  it('rechaza acciones desconocidas', () => {
    const accion = 'borrar' as AccionHistorial;
    expect(() =>
      crearEntradaHistorial(
        { entidad: 'x', entidadId: 1, accion, antes: null, despues: null },
        FECHA,
      ),
    ).toThrow(ErrorDeNegocio);
  });
});
