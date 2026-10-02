import { describe, expect, it, vi } from 'vitest';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { baseDeDatosDePrueba, FECHA_PRUEBA } from './ayudas';

describe('ejecutor de transacciones', () => {
  it('guarda el cambio y su historial juntos y avisa después de confirmar', () => {
    const db = baseDeDatosDePrueba();
    const alConfirmar = vi.fn();
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => FECHA_PRUEBA, alConfirmar });

    const resultado = ejecutar((ctx) => {
      ctx.db.prepare("INSERT INTO consecutivos (clave, siguiente) VALUES ('prueba', 1)").run();
      ctx.registrarCambio({
        entidad: 'consecutivo',
        entidadId: 'prueba',
        accion: 'crear',
        antes: null,
        despues: { siguiente: 1 },
      });
      return 'listo';
    });

    expect(resultado).toBe('listo');
    expect(alConfirmar).toHaveBeenCalledOnce();
    const [entrada] = listarHistorial(db);
    expect(entrada).toMatchObject({
      fecha: FECHA_PRUEBA,
      entidad: 'consecutivo',
      entidadId: 'prueba',
      accion: 'crear',
      antes: null,
      despues: '{"siguiente":1}',
    });
  });

  it('si algo falla, no queda ni el cambio ni su historial, y no se programa respaldo', () => {
    const db = baseDeDatosDePrueba();
    const alConfirmar = vi.fn();
    const ejecutar = crearEjecutorTransacciones(db, { alConfirmar });

    expect(() =>
      ejecutar((ctx) => {
        ctx.db.prepare("INSERT INTO consecutivos (clave, siguiente) VALUES ('prueba', 1)").run();
        ctx.registrarCambio({
          entidad: 'consecutivo',
          entidadId: 'prueba',
          accion: 'crear',
          antes: null,
          despues: null,
        });
        throw new Error('falla a mitad de la operación');
      }),
    ).toThrow('falla a mitad');

    expect(
      db.prepare("SELECT COUNT(*) AS n FROM consecutivos WHERE clave = 'prueba'").get(),
    ).toEqual({ n: 0 });
    expect(listarHistorial(db)).toHaveLength(0);
    expect(alConfirmar).not.toHaveBeenCalled();
  });

  it('impide transacciones anidadas', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    expect(() => ejecutar(() => ejecutar(() => 1))).toThrow(/anidadas/);
    // El ejecutor sigue funcionando después del error.
    expect(ejecutar(() => 2)).toBe(2);
  });

  it('rechaza trabajos asíncronos', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    expect(() => ejecutar(() => Promise.resolve(1))).toThrow(/síncrono/);
  });
});

describe('historial de cambios', () => {
  it('no se puede modificar ni borrar (solo inserción)', () => {
    const db = baseDeDatosDePrueba();
    const ejecutar = crearEjecutorTransacciones(db);
    ejecutar((ctx) =>
      ctx.registrarCambio({
        entidad: 'x',
        entidadId: 1,
        accion: 'sistema',
        antes: null,
        despues: null,
      }),
    );
    expect(() => db.prepare("UPDATE historial_cambios SET accion = 'editar'").run()).toThrow(
      'El historial de cambios no se puede modificar.',
    );
    expect(() => db.prepare('DELETE FROM historial_cambios').run()).toThrow(
      'El historial de cambios no se puede borrar.',
    );
  });

  it('la base rechaza JSON inválido y acciones desconocidas', () => {
    const db = baseDeDatosDePrueba();
    const insertar = db.prepare(
      'INSERT INTO historial_cambios (fecha, entidad, entidad_id, accion, antes) VALUES (?, ?, ?, ?, ?)',
    );
    expect(() => insertar.run(FECHA_PRUEBA, 'x', '1', 'crear', '{no es json')).toThrow();
    expect(() => insertar.run(FECHA_PRUEBA, 'x', '1', 'borrar', null)).toThrow();
  });

  it('filtra por entidad, acción y fechas', () => {
    const db = baseDeDatosDePrueba();
    let fecha = '2026-10-01T10:00:00.000-05:00';
    const ejecutar = crearEjecutorTransacciones(db, { reloj: () => fecha });
    ejecutar((ctx) =>
      ctx.registrarCambio({
        entidad: 'producto',
        entidadId: 101,
        accion: 'crear',
        antes: null,
        despues: null,
      }),
    );
    fecha = '2026-10-02T10:00:00.000-05:00';
    ejecutar((ctx) =>
      ctx.registrarCambio({
        entidad: 'producto',
        entidadId: 101,
        accion: 'editar',
        antes: null,
        despues: null,
      }),
    );
    ejecutar((ctx) =>
      ctx.registrarCambio({
        entidad: 'cliente',
        entidadId: 10001,
        accion: 'crear',
        antes: null,
        despues: null,
      }),
    );

    expect(listarHistorial(db, { entidad: 'producto' })).toHaveLength(2);
    expect(listarHistorial(db, { accion: 'crear' })).toHaveLength(2);
    expect(listarHistorial(db, { desde: '2026-10-02T00:00:00.000-05:00' })).toHaveLength(2);
    expect(
      listarHistorial(db, { entidad: 'producto', entidadId: '101', accion: 'editar' }),
    ).toHaveLength(1);
    expect(listarHistorial(db, { limite: 1 })[0]?.entidad).toBe('cliente');
  });
});
