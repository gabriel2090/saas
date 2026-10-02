import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abrirBaseDeDatos, verificarIntegridad } from '../../src/data/conexion';
import {
  guardarConfiguracion,
  obtenerConfiguracion,
} from '../../src/data/repositorios/configuracion.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import {
  crearServicioRespaldos,
  fechaDeArchivoRespaldo,
  nombreArchivoRespaldo,
} from '../../src/main/servicios/respaldos';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Carpeta temporal de cada prueba.
 */
let carpeta = '';

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), 'respaldos-prueba-'));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(carpeta, { recursive: true, force: true });
});

describe('nombres de archivo de respaldo', () => {
  it('codifican y decodifican la fecha local', () => {
    const fecha = new Date(2026, 9, 1, 23, 30, 5, 7);
    const nombre = nombreArchivoRespaldo(fecha);
    expect(nombre).toBe('respaldo-20261001-233005-007.db');
    expect(fechaDeArchivoRespaldo(nombre)?.getTime()).toBe(fecha.getTime());
  });

  it('ignoran archivos ajenos', () => {
    expect(fechaDeArchivoRespaldo('notas.txt')).toBeNull();
    expect(fechaDeArchivoRespaldo('respaldo-20261001-233005-007.db.tmp')).toBeNull();
  });
});

describe('servicio de respaldos', () => {
  it('crea una copia íntegra y legible de la base de datos', () => {
    const db = baseDeDatosDePrueba();
    crearEjecutorTransacciones(db)((ctx) => guardarConfiguracion(ctx, 'respaldos.carpeta', 'X'));
    const servicio = crearServicioRespaldos({ db, carpeta });

    const ruta = servicio.respaldarAhora();
    const copia = abrirBaseDeDatos(ruta);
    expect(verificarIntegridad(copia).ok).toBe(true);
    expect(obtenerConfiguracion(copia, 'respaldos.carpeta')).toBe('X');
    copia.close();
    expect(servicio.ultimoRespaldo()).not.toBeNull();
  });

  it('agrupa varias transacciones seguidas en una sola copia (debounce)', () => {
    vi.useFakeTimers();
    const db = baseDeDatosDePrueba();
    const servicio = crearServicioRespaldos({ db, carpeta, esperaMs: 3000 });
    servicio.programar();
    vi.advanceTimersByTime(2000);
    servicio.programar();
    vi.advanceTimersByTime(2000);
    expect(readdirSync(carpeta)).toHaveLength(0);
    vi.advanceTimersByTime(1000);
    expect(readdirSync(carpeta)).toHaveLength(1);
  });

  it('el ejecutor de transacciones programa la copia al confirmar', () => {
    vi.useFakeTimers();
    const db = baseDeDatosDePrueba();
    const servicio = crearServicioRespaldos({ db, carpeta, esperaMs: 3000 });
    const ejecutar = crearEjecutorTransacciones(db, { alConfirmar: () => servicio.programar() });
    ejecutar((ctx) => guardarConfiguracion(ctx, 'respaldos.carpeta', 'Y'));
    vi.advanceTimersByTime(3000);
    expect(readdirSync(carpeta)).toHaveLength(1);
  });

  it('vaciarPendiente hace de inmediato la copia programada (al cerrar la app)', () => {
    vi.useFakeTimers();
    const db = baseDeDatosDePrueba();
    const servicio = crearServicioRespaldos({ db, carpeta });
    servicio.vaciarPendiente();
    expect(readdirSync(carpeta)).toHaveLength(0);
    servicio.programar();
    servicio.vaciarPendiente();
    expect(readdirSync(carpeta)).toHaveLength(1);
  });

  it('aplica la rotación después de cada copia y no toca archivos ajenos', () => {
    const db = baseDeDatosDePrueba();
    const ahora = new Date(2026, 9, 1, 23, 30, 0);
    // 30 copias viejas del mismo minuto de hace 40 días + un archivo ajeno.
    for (let i = 0; i < 30; i++) {
      writeFileSync(join(carpeta, nombreArchivoRespaldo(new Date(2026, 7, 22, 10, 0, 0, i))), '');
    }
    writeFileSync(join(carpeta, 'leame.txt'), 'no borrar');
    const servicio = crearServicioRespaldos({ db, carpeta, ahora: () => ahora });

    servicio.respaldarAhora();

    const archivos = readdirSync(carpeta);
    expect(archivos).toContain('leame.txt');
    // Quedan las 20 más recientes (la nueva + 19 viejas); el resto supera los 30 días.
    expect(archivos.filter((a) => a.startsWith('respaldo-'))).toHaveLength(20);
  });

  it('crea la carpeta de destino si no existe', () => {
    const db = baseDeDatosDePrueba();
    const servicio = crearServicioRespaldos({ db, carpeta: join(carpeta, 'sub', 'carpeta') });
    expect(() => servicio.respaldarAhora()).not.toThrow();
  });

  it('informa el fallo de una copia automática sin lanzar la excepción', () => {
    vi.useFakeTimers();
    const db = baseDeDatosDePrueba();
    const alFallar = vi.fn();
    const servicio = crearServicioRespaldos({ db, carpeta, alFallar });
    db.close();
    servicio.programar();
    vi.advanceTimersByTime(3000);
    expect(alFallar).toHaveBeenCalledOnce();
  });
});
