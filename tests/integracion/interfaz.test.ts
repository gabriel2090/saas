import { describe, expect, it } from 'vitest';
import { crearServicioInterfaz } from '../../src/main/servicios/interfaz';
import type { GeometriaGuardada } from '../../src/shared/interfaz';
import { baseDeDatosDePrueba, FECHA_PRUEBA } from './ayudas';

/** Facturar encajada en la mitad izquierda, con su tamaño normal recordado. */
const FACTURAR: GeometriaGuardada = {
  x: 16,
  y: 0,
  ancho: 1236,
  alto: 634,
  maximizada: false,
  encaje: { x: 0, y: 0, ancho: 5564, alto: 10000 },
};

/**
 * Servicio sobre una base nueva en memoria.
 *
 * @returns Base y servicio.
 */
function preparar(): {
  db: ReturnType<typeof baseDeDatosDePrueba>;
  servicio: ReturnType<typeof crearServicioInterfaz>;
} {
  const db = baseDeDatosDePrueba();
  return { db, servicio: crearServicioInterfaz(db, { reloj: () => FECHA_PRUEBA }) };
}

describe('preferencias de interfaz (D-108, D-113)', () => {
  it('sin nada guardado: barra en una línea y sin geometrías', () => {
    expect(preparar().servicio.preferencias()).toEqual({ barra: 'linea', ventanas: {} });
  });

  it('recuerda el modo de la barra y la geometría de cada ventana', () => {
    const { servicio } = preparar();
    servicio.guardarBarra('iconos');
    servicio.guardarVentana({ id: 'facturar', geometria: FACTURAR });
    servicio.guardarVentana({
      id: 'productos',
      geometria: { x: 40, y: 30, ancho: null, alto: null, maximizada: true, encaje: null },
    });
    servicio.guardarVentana({ id: 'facturar', geometria: { ...FACTURAR, x: 20 } });
    expect(servicio.preferencias()).toEqual({
      barra: 'iconos',
      ventanas: {
        facturar: { ...FACTURAR, x: 20 },
        productos: { x: 40, y: 30, ancho: null, alto: null, maximizada: true, encaje: null },
      },
    });
  });

  it('no pasa por el historial de cambios', () => {
    const { db, servicio } = preparar();
    servicio.guardarBarra('iconos');
    servicio.guardarVentana({ id: 'facturar', geometria: FACTURAR });
    expect(db.prepare('SELECT COUNT(*) AS n FROM historial_cambios').get()).toEqual({ n: 0 });
  });

  it('restablece una ventana o todas', () => {
    const { servicio } = preparar();
    servicio.guardarBarra('iconos');
    servicio.guardarVentana({ id: 'facturar', geometria: FACTURAR });
    servicio.guardarVentana({ id: 'factura-proveedor', geometria: FACTURAR });
    servicio.guardarVentana({ id: 'productos', geometria: FACTURAR });
    servicio.restablecerVentanas('facturar');
    expect(Object.keys(servicio.preferencias().ventanas).sort()).toEqual([
      'factura-proveedor',
      'productos',
    ]);
    servicio.restablecerVentanas(null);
    expect(servicio.preferencias()).toEqual({ barra: 'iconos', ventanas: {} });
  });

  it('rechaza geometrías, procesos y modos inválidos con un mensaje claro', () => {
    const { servicio } = preparar();
    const invalida = (cambio: Partial<Record<keyof GeometriaGuardada, unknown>>): void =>
      servicio.guardarVentana({
        id: 'facturar',
        geometria: { ...FACTURAR, ...cambio } as GeometriaGuardada,
      });
    expect(() => invalida({ ancho: null })).toThrow(/tamaño o la posición/);
    expect(() => invalida({ x: -1 })).toThrow(/tamaño o la posición/);
    expect(() => invalida({ alto: 1.5 })).toThrow(/tamaño o la posición/);
    expect(() => invalida({ encaje: { x: 6000, y: 0, ancho: 5000, alto: 10000 } })).toThrow(
      /tamaño o la posición/,
    );
    expect(() => invalida({ maximizada: 'si' })).toThrow(/tamaño o la posición/);
    expect(() =>
      servicio.guardarVentana({ id: 'no-existe' as 'facturar', geometria: FACTURAR }),
    ).toThrow('La ventana indicada no existe.');
    expect(() => servicio.guardarBarra('grande' as 'linea')).toThrow(
      'El modo de la barra es inválido.',
    );
  });

  it('ignora las preferencias guardadas que quedaron inválidas', () => {
    const { db, servicio } = preparar();
    const insertar = db.prepare(
      'INSERT INTO preferencias_interfaz (clave, valor, actualizado_en) VALUES (?, ?, ?)',
    );
    insertar.run('barra', '"grande"', FECHA_PRUEBA);
    insertar.run('ventana:facturar', '{"x":1}', FECHA_PRUEBA);
    insertar.run('ventana:otro', JSON.stringify(FACTURAR), FECHA_PRUEBA);
    insertar.run('ventana:productos', JSON.stringify(FACTURAR), FECHA_PRUEBA);
    expect(servicio.preferencias()).toEqual({ barra: 'linea', ventanas: { productos: FACTURAR } });
  });

  it('la tabla solo acepta JSON válido', () => {
    const { db } = preparar();
    expect(() =>
      db
        .prepare(
          'INSERT INTO preferencias_interfaz (clave, valor, actualizado_en) VALUES (?, ?, ?)',
        )
        .run('barra', 'no es json', FECHA_PRUEBA),
    ).toThrow(/CHECK/);
  });
});
