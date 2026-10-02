import { describe, expect, it } from 'vitest';
import { VALOR_OCULTO } from '../../src/domain/auditoria';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../src/data/repositorios/configuracion.repo';
import {
  consultarConsecutivo,
  tomarConsecutivo,
} from '../../src/data/repositorios/consecutivos.repo';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { baseDeDatosDePrueba } from './ayudas';

describe('repositorio de configuración', () => {
  it('devuelve null para claves no guardadas', () => {
    const db = baseDeDatosDePrueba();
    expect(obtenerConfiguracion(db, 'respaldos.carpeta')).toBeNull();
  });

  it('crea y actualiza valores, registrando cada cambio con antes y después', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    ejecutar((ctx) => guardarConfiguracion(ctx, 'respaldos.carpeta', 'C:\\respaldos'));
    ejecutar((ctx) => guardarConfiguracion(ctx, 'respaldos.carpeta', 'D:\\copias'));

    expect(obtenerConfiguracion(db, 'respaldos.carpeta')).toBe('D:\\copias');
    const [edicion, creacion] = listarHistorial(db, { entidad: 'configuracion' });
    expect(creacion).toMatchObject({
      accion: 'crear',
      antes: null,
      despues: '{"valor":"C:\\\\respaldos"}',
    });
    expect(edicion).toMatchObject({
      accion: 'editar',
      antes: '{"valor":"C:\\\\respaldos"}',
      despues: '{"valor":"D:\\\\copias"}',
    });
  });

  it('nunca guarda el hash de la contraseña en el historial', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    ejecutar((ctx) => guardarConfiguracion(ctx, 'auth.hash_contrasena', 'scrypt$secreto'));
    const [entrada] = listarHistorial(db, { entidadId: 'auth.hash_contrasena' });
    expect(entrada?.despues).toBe(`{"valor":"${VALOR_OCULTO}"}`);
    expect(JSON.stringify(listarHistorial(db))).not.toContain('scrypt$secreto');
  });
});

describe('repositorio de consecutivos', () => {
  it('asigna números seguidos desde el inicio configurado', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    expect(ejecutar((ctx) => tomarConsecutivo(ctx, 'producto'))).toBe(101);
    expect(ejecutar((ctx) => tomarConsecutivo(ctx, 'producto'))).toBe(102);
    expect(ejecutar((ctx) => tomarConsecutivo(ctx, 'cliente'))).toBe(10001);
    expect(consultarConsecutivo(db, 'producto')).toBe(103);
  });

  it('no deja huecos si la transacción se revierte', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    expect(() =>
      ejecutar((ctx) => {
        tomarConsecutivo(ctx, 'producto');
        throw new Error('falla al guardar el documento');
      }),
    ).toThrow();
    expect(ejecutar((ctx) => tomarConsecutivo(ctx, 'producto'))).toBe(101);
  });
});
