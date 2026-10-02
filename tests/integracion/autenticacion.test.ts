import { describe, expect, it } from 'vitest';
import { guardarConfiguracion } from '../../src/data/repositorios/configuracion.repo';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { calcularHashContrasena } from '../../src/main/servicios/hash-contrasena';
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
    expect(otra.tieneClaveRecuperacion()).toBe(true);
  });

  it('al crear la contraseña devuelve una clave de recuperación y guarda solo su hash', () => {
    const { servicio, db } = crear();
    const clave = servicio.crear('clave1');
    expect(clave).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    expect(servicio.tieneClaveRecuperacion()).toBe(true);
    const guardado = db
      .prepare("SELECT valor FROM configuracion WHERE clave = 'auth.hash_clave_recuperacion'")
      .pluck()
      .get() as string;
    expect(guardado).not.toContain(clave.replace(/-/g, ''));
    const historial = listarHistorial(db, { entidadId: 'auth.hash_clave_recuperacion' });
    expect(historial[0]?.despues).toBe('{"valor":"[OCULTO]"}');
  });

  it('restablece la contraseña con la clave, que es de un solo uso (D-23)', () => {
    const { db } = crear();
    const clave = crearServicioAutenticacion(db, crearEjecutorTransacciones(db)).crear('clave1');
    const servicio = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));

    const escrita = ` ${clave.toLowerCase().replace(/-/g, ' ')} `;
    const claveNueva = servicio.restablecer(escrita, 'nueva1');
    expect(servicio.haySesion()).toBe(true);
    expect(claveNueva).not.toBe(clave);

    const otra = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => otra.ingresar('clave1')).toThrow();
    otra.ingresar('nueva1');
    expect(() => otra.restablecer(clave, 'otra12')).toThrow(/no es correcta/);
    otra.restablecer(claveNueva, 'otra12');

    const motivos = listarHistorial(db, { entidad: 'autenticacion' }).map((h) => h.motivo);
    expect(motivos).toHaveLength(2);
    expect(motivos[0]).toMatch(/restablecida/);
  });

  it('rechaza restablecer con clave mal escrita o contraseña inválida sin cambiar nada', () => {
    const { db } = crear();
    const clave = crearServicioAutenticacion(db, crearEjecutorTransacciones(db)).crear('clave1');
    const servicio = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => servicio.restablecer('ABCD', 'nueva1')).toThrow(/no es correcta/);
    expect(() => servicio.restablecer(clave, '12')).toThrow(/al menos 4/);
    expect(servicio.haySesion()).toBe(false);
    servicio.ingresar('clave1');
  });

  it('sin clave vigente no se puede restablecer; con sesión se puede generar una', () => {
    const { db } = crear();
    const ejecutar = crearEjecutorTransacciones(db);
    // Instalación de la Fase 0: contraseña sin clave de recuperación.
    ejecutar((ctx) =>
      guardarConfiguracion(ctx, 'auth.hash_contrasena', calcularHashContrasena('vieja1')),
    );
    const servicio = crearServicioAutenticacion(db, ejecutar);
    expect(servicio.tieneClaveRecuperacion()).toBe(false);
    expect(() => servicio.restablecer('AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', 'nueva1')).toThrow(
      /no tiene una clave/,
    );
    expect(() => servicio.generarClaveRecuperacion()).toThrow(/Debe ingresar/);
    servicio.ingresar('vieja1');
    const clave = servicio.generarClaveRecuperacion();
    expect(servicio.tieneClaveRecuperacion()).toBe(true);
    servicio.restablecer(clave, 'nueva1');
  });

  it('no permite cambiar la contraseña sin sesión', () => {
    const { db } = crear();
    crearServicioAutenticacion(db, crearEjecutorTransacciones(db)).crear('clave1');
    const sinSesion = crearServicioAutenticacion(db, crearEjecutorTransacciones(db));
    expect(() => sinSesion.cambiar('clave1', 'clave2')).toThrow(/Debe ingresar/);
  });
});
