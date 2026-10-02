import { describe, expect, it } from 'vitest';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import {
  crearServicioAutenticacion,
  type ServicioAutenticacion,
} from '../../src/main/servicios/autenticacion';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Crea el servicio sobre una base nueva en memoria.
 *
 * @returns Servicio y conexión.
 */
function crear(): { servicio: ServicioAutenticacion; db: ReturnType<typeof baseDeDatosDePrueba> } {
  const db = baseDeDatosDePrueba();
  return { servicio: crearServicioAutenticacion(db, crearEjecutorTransacciones(db)), db };
}

describe('servicio de autenticación', () => {
  it('en el primer arranque no hay contraseña ni sesión (D-01)', () => {
    const { servicio } = crear();
    expect(servicio.tieneContrasena()).toBe(false);
    expect(servicio.haySesion()).toBe(false);
    expect(() => servicio.ingresar('1234')).toThrow(/no se ha creado/);
  });

  it('crear la contraseña inicia la sesión y no se puede volver a crear', () => {
    const { servicio } = crear();
    servicio.crear('clave1');
    expect(servicio.tieneContrasena()).toBe(true);
    expect(servicio.haySesion()).toBe(true);
    expect(() => servicio.crear('otra1')).toThrow(/ya fue creada/);
  });

  it('valida la contraseña nueva', () => {
    const { servicio } = crear();
    expect(() => servicio.crear('12')).toThrow(/al menos 4/);
    expect(servicio.tieneContrasena()).toBe(false);
  });

  it('ingresa con la contraseña correcta y rechaza la incorrecta', () => {
    const { db } = crear();
    crearServicioAutenticacion(db, crearEjecutorTransacciones(db)).crear('clave1');
    // Nueva «ejecución» de la app sobre la misma base.
    const servicio = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => servicio.ingresar('clave2')).toThrow('La contraseña es incorrecta.');
    expect(servicio.haySesion()).toBe(false);
    servicio.ingresar('clave1');
    expect(servicio.haySesion()).toBe(true);
  });

  it('cambia la contraseña exigiendo la actual y lo deja en el historial', () => {
    const { servicio, db } = crear();
    servicio.crear('clave1');
    expect(() => servicio.cambiar('equivocada', 'clave2')).toThrow(/actual es incorrecta/);
    expect(() => servicio.cambiar('clave1', 'clave1')).toThrow(/distinta/);
    servicio.cambiar('clave1', 'clave2');

    const otra = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => otra.ingresar('clave1')).toThrow();
    otra.ingresar('clave2');

    const historial = listarHistorial(db, { entidadId: 'auth.hash_contrasena' });
    expect(historial.map((h) => h.accion)).toEqual(['editar', 'crear']);
  });

  it('no permite cambiar la contraseña sin sesión', () => {
    const { db } = crear();
    crearServicioAutenticacion(db, crearEjecutorTransacciones(db)).crear('clave1');
    const sinSesion = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => sinSesion.cambiar('clave1', 'clave2')).toThrow(/Debe ingresar/);
  });
});
