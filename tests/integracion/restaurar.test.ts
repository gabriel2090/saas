import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorDeNegocio } from '../../src/domain/errores';
import { abrirBaseDeDatos, verificarIntegridad, type BaseDeDatos } from '../../src/data/conexion';
import { migracionesDelProyecto } from '../../src/data/migraciones';
import { aplicarMigraciones } from '../../src/data/migrador';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../src/data/repositorios/configuracion.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { calcularHashContrasena } from '../../src/main/servicios/hash-contrasena';
import { crearServicioRecuperacion } from '../../src/main/servicios/recuperacion';
import { crearServicioRespaldos, nombreArchivoRespaldo } from '../../src/main/servicios/respaldos';
import { FECHA_PRUEBA } from './ayudas';

/**
 * Contraseña de las pruebas. El hash se calcula una sola vez.
 */
const CLAVE = 'clave-prueba';

/**
 * Hash de {@link CLAVE}.
 */
const HASH = calcularHashContrasena(CLAVE);

/**
 * Carpeta temporal de cada prueba. Nunca es la carpeta de datos del negocio.
 */
let carpeta = '';

/**
 * Bases abiertas que hay que cerrar aunque la prueba falle.
 */
let abiertas: BaseDeDatos[] = [];

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'restaurar-prueba-'));
  abiertas = [];
});

afterEach(() => {
  for (const db of abiertas) {
    try {
      db.close();
    } catch {
      // El servicio ya la cerró al restaurar.
    }
  }
  rmSync(carpeta, { recursive: true, force: true });
});

/**
 * Abre una base de archivo con las migraciones y la contraseña de prueba.
 *
 * @param ruta - Archivo `.db`.
 * @returns Conexión abierta.
 */
function abrirConClave(ruta: string): BaseDeDatos {
  const db = abrirBaseDeDatos(ruta);
  abiertas.push(db);
  aplicarMigraciones(db, migracionesDelProyecto(), () => FECHA_PRUEBA);
  crearEjecutorTransacciones(db)((ctx) => guardarConfiguracion(ctx, 'auth.hash_contrasena', HASH));
  return db;
}

/**
 * Mensaje de un error de negocio.
 *
 * @param accion - Lo que debe fallar.
 * @returns Mensaje en español.
 */
function mensajeDe(accion: () => void): string {
  try {
    accion();
  } catch (error) {
    expect(error).toBeInstanceOf(ErrorDeNegocio);
    return error instanceof ErrorDeNegocio ? error.message : '';
  }
  throw new Error('La operación debía fallar.');
}

describe('restaurar una copia', () => {
  it('rechaza una copia dañada, de otra app, de esquema más nuevo o vacía sin tocar la base', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'intacta'),
    );
    const local = join(carpeta, 'copias');
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
    });
    const buena = servicio.respaldarAhora();

    writeFileSync(join(carpeta, 'corrupta.db'), 'esto no es sqlite');
    writeFileSync(join(carpeta, 'vacia.db'), '');
    const otra = join(carpeta, 'otra.db');
    const ajena = abrirBaseDeDatos(otra);
    abiertas.push(ajena);
    ajena.exec(`
      CREATE TABLE schema_migraciones (
        version INTEGER PRIMARY KEY, nombre TEXT NOT NULL,
        checksum TEXT NOT NULL, aplicada_en TEXT NOT NULL
      );
      INSERT INTO schema_migraciones VALUES (1, 'otro-programa', 'x', '2026-10-01');
    `);
    ajena.close();

    const nueva = join(carpeta, 'nueva.db');
    writeFileSync(nueva, readFileSync(buena));
    const futura = new Database(nueva);
    futura
      .prepare(
        'INSERT INTO schema_migraciones (version, nombre, checksum, aplicada_en) VALUES (99, ?, ?, ?)',
      )
      .run('futura', 'abc', FECHA_PRUEBA);
    futura.close();

    const casos = [
      { ruta: join(carpeta, 'corrupta.db'), texto: 'dañada' },
      { ruta: otra, texto: 'no es una base de Inventario y Facturación' },
      { ruta: nueva, texto: 'versión más nueva' },
      { ruta: join(carpeta, 'vacia.db'), texto: 'vacío' },
    ];
    for (const caso of casos) {
      const mensaje = mensajeDe(() =>
        servicio.restaurar(
          { tipo: 'archivo', ruta: caso.ruta },
          { tipo: 'contrasena', valor: CLAVE },
        ),
      );
      expect(mensaje).toContain(caso.texto);
    }
    expect(obtenerConfiguracion(db, 'respaldos.carpeta')).toBe('intacta');
    expect(readdirSync(local).some((nombre) => nombre.includes('restauracion'))).toBe(false);
  });

  it('con la contraseña equivocada no hace la copia previa ni cierra la base', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    const local = join(carpeta, 'copias');
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
    });
    const copia = basename(servicio.respaldarAhora());
    const mensaje = mensajeDe(() =>
      servicio.restaurar({ tipo: 'copia', nombre: copia }, { tipo: 'contrasena', valor: 'no-es' }),
    );
    expect(mensaje).toContain('incorrecta');
    expect(readdirSync(local).some((nombre) => nombre.includes('restauracion'))).toBe(false);
    expect(obtenerConfiguracion(db, 'auth.hash_contrasena')).toBe(HASH);
  });

  it('si se corta antes de cerrar, la base sigue abierta y queda la copia previa', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    const local = join(carpeta, 'copias');
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
      ganchos: {
        antesDeCerrar: () => {
          throw new Error('corte');
        },
      },
    });
    const copia = basename(servicio.respaldarAhora());
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'sigue'),
    );
    const mensaje = mensajeDe(() =>
      servicio.restaurar({ tipo: 'copia', nombre: copia }, { tipo: 'contrasena', valor: CLAVE }),
    );
    expect(mensaje).toContain('La base actual no se modificó');
    expect(obtenerConfiguracion(db, 'respaldos.carpeta')).toBe('sigue');
    expect(existsSync(ruta)).toBe(true);
    expect(readdirSync(local).some((nombre) => nombre.includes('restauracion'))).toBe(true);
  });

  it('si se corta a mitad del reemplazo, devuelve la base y dice dónde quedó la previa', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    const local = join(carpeta, 'copias');
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
      ganchos: {
        duranteReemplazo: () => {
          throw new Error('corte');
        },
      },
    });
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'en-la-copia'),
    );
    const copia = basename(servicio.respaldarAhora('manual'));
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'en-uso'),
    );
    const mensaje = mensajeDe(() =>
      servicio.restaurar({ tipo: 'copia', nombre: copia }, { tipo: 'contrasena', valor: CLAVE }),
    );
    expect(mensaje).toContain('La base actual no cambió');
    expect(mensaje).toContain('previa a restauración');
    expect(existsSync(`${ruta}.apartada`)).toBe(false);
    expect(existsSync(`${ruta}.nueva`)).toBe(false);
    const reabierta = abrirBaseDeDatos(ruta);
    abiertas.push(reabierta);
    expect(obtenerConfiguracion(reabierta, 'respaldos.carpeta')).toBe('en-uso');
  });

  it('restaura, anota el historial en la base restaurada y reinicia', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'vieja'),
    );
    const local = join(carpeta, 'copias');
    const reiniciar = vi.fn();
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
      reiniciar,
    });
    const copia = basename(servicio.respaldarAhora());
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'nueva'),
    );
    servicio.restaurar({ tipo: 'copia', nombre: copia }, { tipo: 'contrasena', valor: CLAVE });
    expect(reiniciar).toHaveBeenCalledOnce();
    const restaurada = abrirBaseDeDatos(ruta);
    abiertas.push(restaurada);
    expect(verificarIntegridad(restaurada).ok).toBe(true);
    expect(obtenerConfiguracion(restaurada, 'respaldos.carpeta')).toBe('vieja');
    const historial = restaurada
      .prepare("SELECT motivo FROM historial_cambios WHERE entidad = 'respaldo'")
      .all() as { motivo: string }[];
    expect(historial.some((fila) => fila.motivo.includes('Restauración'))).toBe(true);
  });
});

describe('copia externa y rotación', () => {
  it('si la carpeta externa no está, la copia local queda y solo se avisa', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    const usb = join(carpeta, 'usb-desconectado');
    crearEjecutorTransacciones(db)((ctx) => guardarConfiguracion(ctx, 'respaldos.externa', usb));
    const alFallar = vi.fn();
    const local = join(carpeta, 'local');
    const servicio = crearServicioRespaldos({
      db,
      carpeta: local,
      rutaBaseDatos: ruta,
      migraciones: migracionesDelProyecto(),
      obtenerEjecutor: () => crearEjecutorTransacciones(db),
      alFallar,
    });
    const archivo = servicio.respaldarAhora();
    expect(existsSync(archivo)).toBe(true);
    expect(existsSync(usb)).toBe(false);
    expect(alFallar).toHaveBeenCalled();
    expect(servicio.estado().externa.estado).toBe('no_disponible');
    expect(servicio.avisoExterna()).toContain('Los respaldos locales siguen guardándose');
  });

  it('la rotación borra una automática de más de 30 días y conserva la protegida', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    const ahora = new Date(2026, 9, 1, 23, 30, 0);
    const antigua = nombreArchivoRespaldo(new Date(2026, 7, 20, 10, 0, 0));
    const protegida = nombreArchivoRespaldo(new Date(2026, 8, 20, 10, 0, 0), 'manual');
    writeFileSync(join(carpeta, antigua), '');
    writeFileSync(join(carpeta, protegida), '');
    for (let i = 0; i < 20; i++) {
      writeFileSync(join(carpeta, nombreArchivoRespaldo(new Date(2026, 8, 30, 12, 0, 0, i))), '');
    }
    const servicio = crearServicioRespaldos({
      db,
      carpeta,
      rutaBaseDatos: ruta,
      ahora: () => ahora,
    });
    servicio.respaldarAhora();
    const archivos = readdirSync(carpeta);
    expect(archivos).toContain(protegida);
    expect(archivos).not.toContain(antigua);
  });
});

describe('recuperación al arrancar', () => {
  it('aparta la base dañada sin borrarla y pone la copia válida', () => {
    const ruta = join(carpeta, 'inventario.db');
    const db = abrirConClave(ruta);
    crearEjecutorTransacciones(db)((ctx) =>
      guardarConfiguracion(ctx, 'respaldos.carpeta', 'rescatada'),
    );
    const copias = join(carpeta, 'copias');
    const servicio = crearServicioRespaldos({ db, carpeta: copias, rutaBaseDatos: ruta });
    const copia = servicio.respaldarAhora();
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    writeFileSync(ruta, 'dañada');
    rmSync(`${ruta}-wal`, { force: true });
    rmSync(`${ruta}-shm`, { force: true });

    const reiniciar = vi.fn();
    const recuperacion = crearServicioRecuperacion({
      rutaBaseDatos: ruta,
      carpetaRespaldos: copias,
      carpetaDatos: carpeta,
      version: '0.1.0',
      detalleIntegridad: 'file is not a database',
      migraciones: migracionesDelProyecto(),
      reiniciar,
      alFallar: () => undefined,
      ahora: () => new Date(2026, 9, 4, 15, 15, 30),
    });
    const estado = recuperacion.estado();
    expect(estado.copias.some((item) => item.valida && item.recomendada)).toBe(true);
    recuperacion.restaurar({ tipo: 'copia', nombre: basename(copia) });
    expect(reiniciar).toHaveBeenCalledOnce();
    const danada = join(carpeta, 'inventario-20261004-151530-danada.db');
    expect(readFileSync(danada, 'utf8')).toBe('dañada');
    const restaurada = abrirBaseDeDatos(ruta);
    abiertas.push(restaurada);
    expect(obtenerConfiguracion(restaurada, 'respaldos.carpeta')).toBe('rescatada');
    expect(recuperacion.datosSoporte()).toContain('file is not a database');
    expect(recuperacion.datosSoporte()).not.toContain('rescatada');
  });

  it('una copia inválida no aparta la base dañada', () => {
    const ruta = join(carpeta, 'inventario.db');
    writeFileSync(ruta, 'dañada');
    const vacia = join(carpeta, 'vacia.db');
    writeFileSync(vacia, '');
    const recuperacion = crearServicioRecuperacion({
      rutaBaseDatos: ruta,
      carpetaRespaldos: carpeta,
      carpetaDatos: carpeta,
      version: '0.1.0',
      detalleIntegridad: 'daño',
      migraciones: migracionesDelProyecto(),
      reiniciar: () => undefined,
      alFallar: () => undefined,
    });
    const mensaje = mensajeDe(() => recuperacion.restaurar({ tipo: 'archivo', ruta: vacia }));
    expect(mensaje).toContain('vacío');
    expect(readFileSync(ruta, 'utf8')).toBe('dañada');
    expect(readdirSync(carpeta).some((nombre) => nombre.includes('danada'))).toBe(false);
  });
});
