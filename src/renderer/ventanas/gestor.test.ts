import { describe, expect, it } from 'vitest';
import type { IdProceso } from '../../shared/procesos';
import {
  calcularOrganizacion,
  ESTADO_INICIAL_VENTANAS,
  geometriaParaGuardar,
  rectDeVentana,
  reducirVentanas,
  ventanaActiva,
  ventanasConCambios,
  zonasEncajadas,
  type AccionVentanas,
  type EstadoVentanas,
} from './gestor';
import { tamanoInicialDeProceso } from './tamanos';

/** Escritorio de una pantalla de 1366 × 768 (`DISENO.md` §11.1). */
const E1366 = { ancho: 1366, alto: 634 };
/** Escritorio de una pantalla de 1920 × 1080 al 100 %. */
const E1920 = { ancho: 1920, alto: 946 };

/**
 * Aplica varias acciones seguidas desde el estado inicial.
 *
 * @param acciones - Acciones a aplicar.
 * @returns Estado final.
 */
function aplicar(...acciones: AccionVentanas[]): EstadoVentanas {
  return acciones.reduce(reducirVentanas, ESTADO_INICIAL_VENTANAS);
}

/**
 * Acción de abrir un proceso con su tamaño inicial real.
 *
 * @param id - Proceso.
 * @returns Acción.
 */
function abrir(id: IdProceso): AccionVentanas {
  return { tipo: 'abrir', id, tamano: tamanoInicialDeProceso(id) };
}

/**
 * Ids de las ventanas en orden de apilado.
 *
 * @param estado - Estado del gestor.
 * @returns Ids de atrás hacia adelante.
 */
function orden(estado: EstadoVentanas): IdProceso[] {
  return estado.ventanas.map((v) => v.id);
}

/**
 * Rectángulo en pantalla de una ventana como [x, y, ancho, alto].
 *
 * @param estado - Estado del gestor.
 * @param id - Ventana.
 * @returns Rectángulo.
 */
function rect(estado: EstadoVentanas, id: IdProceso): (number | null)[] {
  const v = estado.ventanas.find((w) => w.id === id);
  if (!v) {
    throw new Error(`No está abierta: ${id}`);
  }
  const r = rectDeVentana(v, estado.escritorio);
  return [r.x, r.y, r.ancho, r.alto];
}

describe('reducirVentanas: abrir, enfocar y cerrar', () => {
  it('abre ventanas en cascada y la última queda activa', () => {
    const estado = aplicar({ tipo: 'abrir', id: 'productos' }, { tipo: 'abrir', id: 'clientes' });
    expect(orden(estado)).toEqual(['productos', 'clientes']);
    expect(ventanaActiva(estado)?.id).toBe('clientes');
    const [primera, segunda] = estado.ventanas;
    expect(segunda?.x).toBeGreaterThan(primera?.x ?? Infinity);
  });

  it('no duplica un proceso abierto: lo trae al frente (D-04)', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'abrir', id: 'productos' },
    );
    expect(orden(estado)).toEqual(['clientes', 'productos']);
  });

  it('enfoca una ventana sin cambiar las demás', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'abrir', id: 'bodegas' },
      { tipo: 'enfocar', id: 'productos' },
    );
    expect(orden(estado)).toEqual(['clientes', 'bodegas', 'productos']);
  });

  it('enfocar la activa devuelve el mismo estado (no redibuja)', () => {
    const antes = aplicar({ tipo: 'abrir', id: 'productos' });
    expect(reducirVentanas(antes, { tipo: 'enfocar', id: 'productos' })).toBe(antes);
  });

  it('cierra una ventana y la anterior queda activa', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'cerrar', id: 'clientes' },
    );
    expect(ventanaActiva(estado)?.id).toBe('productos');
  });

  it('cierra todas sin olvidar el tamaño del escritorio', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'cerrarTodas' },
    );
    expect(estado.ventanas).toHaveLength(0);
    expect(estado.escritorio).toEqual(E1366);
    expect(ventanaActiva(estado)).toBeNull();
  });

  it('abre con el tamaño inicial indicado o ajustada al contenido', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos', tamano: { ancho: 1040, alto: 640 } },
      { tipo: 'abrir', id: 'cambiar-contrasena' },
    );
    expect(estado.ventanas[0]?.tamano).toEqual({ ancho: 1040, alto: 640 });
    expect(estado.ventanas[1]?.tamano).toBeNull();
  });

  it('abre con la geometría recordada y la ajusta si el escritorio es más chico (D-113)', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      {
        tipo: 'abrir',
        id: 'productos',
        guardada: { x: 1500, y: 900, ancho: 1040, alto: 640, maximizada: false, encaje: null },
      },
    );
    expect(rect(estado, 'productos')).toEqual([326, 0, 1040, 634]);
  });

  it('marca y desmarca cambios sin guardar', () => {
    let estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'marcarCambios', id: 'productos', conCambios: true },
    );
    expect(ventanasConCambios(estado).map((v) => v.id)).toEqual(['productos']);
    estado = reducirVentanas(estado, { tipo: 'marcarCambios', id: 'productos', conCambios: false });
    expect(ventanasConCambios(estado)).toHaveLength(0);
  });

  it('marca el trabajo que se conserva al cerrar sin contarlo como cambios', () => {
    const aviso = { resumen: '2 borradores pendientes', mensaje: 'Se conservan.' };
    let estado = aplicar(
      { tipo: 'abrir', id: 'facturar' },
      { tipo: 'marcarConservados', id: 'facturar', aviso },
    );
    expect(estado.ventanas[0]?.conservados).toEqual(aviso);
    expect(ventanasConCambios(estado)).toHaveLength(0);
    const igual = reducirVentanas(estado, {
      tipo: 'marcarConservados',
      id: 'facturar',
      aviso: { ...aviso },
    });
    expect(igual).toBe(estado);
    estado = reducirVentanas(estado, { tipo: 'marcarConservados', id: 'facturar', aviso: null });
    expect(estado.ventanas[0]?.conservados).toBeNull();
  });
});

describe('reducirVentanas: mover y redimensionar', () => {
  it('mueve sin permitir posiciones negativas', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'mover', id: 'productos', x: -50, y: 120 },
    );
    expect(estado.ventanas[0]).toMatchObject({ x: 0, y: 120 });
  });

  it('una ventana suelta no se pierde fuera del escritorio', () => {
    const estado = aplicar({ tipo: 'escritorio', tamano: E1366 }, abrir('productos'), {
      tipo: 'mover',
      id: 'productos',
      x: 2000,
      y: 2000,
    });
    expect(rect(estado, 'productos')).toEqual([326, 0, 1040, 634]);
  });

  it('no se achica por debajo del mínimo de su proceso (D-111)', () => {
    const estado = aplicar(abrir('facturar'), {
      tipo: 'redimensionar',
      id: 'facturar',
      rect: { x: 16, y: 16, ancho: 100, alto: 900.6 },
    });
    expect(rect(estado, 'facturar')).toEqual([16, 16, 760, 901]);
  });

  it('al achicar desde el borde izquierdo, el derecho queda fijo', () => {
    const estado = aplicar({ tipo: 'escritorio', tamano: E1920 }, abrir('productos'), {
      tipo: 'redimensionar',
      id: 'productos',
      rect: { x: 900, y: 16, ancho: 156, alto: 640 },
    });
    expect(rect(estado, 'productos')).toEqual([616, 16, 440, 640]);
  });

  it('el mínimo nunca supera el escritorio: el contenido se desplaza', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: { ancho: 700, alto: 400 } },
      abrir('facturar'),
    );
    expect(rect(estado, 'facturar')).toEqual([0, 0, 700, 400]);
  });
});

describe('reducirVentanas: maximizar y encajar', () => {
  it('maximiza y restaura a su tamaño anterior', () => {
    let estado = aplicar({ tipo: 'escritorio', tamano: E1366 }, abrir('productos'), {
      tipo: 'maximizar',
      id: 'productos',
    });
    expect(rect(estado, 'productos')).toEqual([0, 0, 1366, 634]);
    estado = reducirVentanas(estado, { tipo: 'maximizar', id: 'productos' });
    expect(rect(estado, 'productos')).toEqual([16, 0, 1040, 634]);
  });

  it('una maximizada no se redimensiona por los bordes', () => {
    const antes = aplicar({ tipo: 'escritorio', tamano: E1366 }, abrir('productos'), {
      tipo: 'maximizar',
      id: 'productos',
    });
    const despues = reducirVentanas(antes, {
      tipo: 'redimensionar',
      id: 'productos',
      rect: { x: 0, y: 0, ancho: 500, alto: 500 },
    });
    expect(despues).toBe(antes);
  });

  it('encaja en una zona y arrastrarla por el título la suelta con su tamaño normal', () => {
    let estado = aplicar({ tipo: 'escritorio', tamano: E1366 }, abrir('facturar'), {
      tipo: 'encajar',
      id: 'facturar',
      rect: { x: 0, y: 0, ancho: 760, alto: 634 },
    });
    expect(rect(estado, 'facturar')).toEqual([0, 0, 760, 634]);
    estado = reducirVentanas(estado, { tipo: 'mover', id: 'facturar', x: 40, y: 0 });
    expect(rect(estado, 'facturar')).toEqual([40, 0, 1236, 634]);
    expect(estado.ventanas[0]?.encaje).toBeNull();
  });

  it('maximizar una encajada y restaurarla la devuelve a su zona', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      abrir('abono-cliente'),
      { tipo: 'encajar', id: 'abono-cliente', rect: { x: 683, y: 0, ancho: 683, alto: 634 } },
      { tipo: 'maximizar', id: 'abono-cliente' },
      { tipo: 'maximizar', id: 'abono-cliente' },
    );
    expect(rect(estado, 'abono-cliente')).toEqual([683, 0, 683, 634]);
  });
});

describe('reducirVentanas: organizar', () => {
  it('2 columnas en 1366: la activa a la izquierda, ajustada a 760 + 606 (D-112)', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      abrir('abono-cliente'),
      abrir('facturar'),
      { tipo: 'organizar', diseno: 'dos-columnas' },
    );
    expect(rect(estado, 'facturar')).toEqual([0, 0, 760, 634]);
    expect(rect(estado, 'abono-cliente')).toEqual([760, 0, 606, 634]);
    expect(ventanaActiva(estado)?.id).toBe('facturar');
  });

  it('las ventanas que sobran quedan detrás, sueltas', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('bodegas'),
      abrir('productos'),
      abrir('clientes'),
      { tipo: 'organizar', diseno: 'dos-columnas' },
    );
    expect(orden(estado)).toEqual(['bodegas', 'productos', 'clientes']);
    expect(estado.ventanas[0]?.encaje).toBeNull();
    expect(zonasEncajadas(estado).map((a) => a.id)).toEqual(['productos', 'clientes']);
  });

  it('si el diseño no cabe no cambia nada y explica la razón', () => {
    const antes = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      abrir('factura-proveedor'),
      abrir('facturar'),
    );
    expect(reducirVentanas(antes, { tipo: 'organizar', diseno: 'dos-columnas' })).toBe(antes);
    expect(calcularOrganizacion(antes, 'dos-columnas')).toEqual({
      ok: false,
      razon: 'No caben: cada columna mediría 683 px y Facturar necesita 760.',
    });
  });

  it('sin el escritorio medido no se puede organizar', () => {
    const antes = aplicar(abrir('productos'), abrir('clientes'));
    expect(calcularOrganizacion(antes, 'dos-columnas')).toMatchObject({ ok: false });
  });

  it('cascada: suelta las encajadas y deja la activa al frente', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('productos'),
      abrir('clientes'),
      { tipo: 'organizar', diseno: 'dos-columnas' },
      { tipo: 'organizar', diseno: 'cascada' },
    );
    expect(zonasEncajadas(estado)).toHaveLength(0);
    expect(rect(estado, 'productos')).toEqual([16, 16, 1040, 640]);
    expect(rect(estado, 'clientes')).toEqual([44, 44, 1040, 640]);
    expect(ventanaActiva(estado)?.id).toBe('clientes');
  });

  it('Ctrl+F6 con el escritorio organizado va en orden de lectura (D-115)', () => {
    let estado = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('clientes'),
      abrir('productos'),
      abrir('abono-cliente'),
      abrir('facturar'),
      { tipo: 'organizar', diseno: 'dos-por-dos' },
    );
    expect(rect(estado, 'facturar')).toEqual([0, 0, 960, 480]);
    const visitadas: (IdProceso | undefined)[] = [];
    for (let i = 0; i < 4; i++) {
      estado = reducirVentanas(estado, { tipo: 'siguiente' });
      visitadas.push(ventanaActiva(estado)?.id);
    }
    expect(visitadas).toEqual(['abono-cliente', 'productos', 'clientes', 'facturar']);
  });

  it('Ctrl+F6 sin organizar rota por todas las ventanas', () => {
    let estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'abrir', id: 'bodegas' },
    );
    const visitadas: (IdProceso | undefined)[] = [];
    for (let i = 0; i < 3; i++) {
      estado = reducirVentanas(estado, { tipo: 'siguiente' });
      visitadas.push(ventanaActiva(estado)?.id);
    }
    expect(visitadas).toEqual(['productos', 'clientes', 'bodegas']);
  });

  it('siguiente con una sola ventana no cambia nada', () => {
    const antes = aplicar({ tipo: 'abrir', id: 'productos' });
    expect(reducirVentanas(antes, { tipo: 'siguiente' })).toBe(antes);
  });
});

describe('reducirVentanas: borde compartido', () => {
  const organizadas = aplicar(
    { tipo: 'escritorio', tamano: E1920 },
    abrir('productos'),
    abrir('clientes'),
    { tipo: 'organizar', diseno: 'dos-columnas' },
  );

  it('arrastrar el borde entre dos encajadas cambia el tamaño de ambas', () => {
    const estado = reducirVentanas(organizadas, {
      tipo: 'redimensionar',
      id: 'clientes',
      rect: { x: 0, y: 0, ancho: 1100, alto: 946 },
    });
    expect(rect(estado, 'clientes')).toEqual([0, 0, 1100, 946]);
    expect(rect(estado, 'productos')).toEqual([1100, 0, 820, 946]);
  });

  it('el borde no deja a la vecina por debajo de su mínimo', () => {
    const estado = reducirVentanas(organizadas, {
      tipo: 'redimensionar',
      id: 'clientes',
      rect: { x: 0, y: 0, ancho: 1700, alto: 946 },
    });
    expect(rect(estado, 'clientes')).toEqual([0, 0, 1480, 946]);
    expect(rect(estado, 'productos')).toEqual([1480, 0, 440, 946]);
  });

  it('en 2 × 2 el borde horizontal mueve a la fila de abajo', () => {
    const base = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('clientes'),
      abrir('productos'),
      abrir('abono-cliente'),
      abrir('facturar'),
      { tipo: 'organizar', diseno: 'dos-por-dos' },
    );
    const estado = reducirVentanas(base, {
      tipo: 'redimensionar',
      id: 'facturar',
      rect: { x: 0, y: 0, ancho: 960, alto: 500 },
    });
    expect(rect(estado, 'facturar')).toEqual([0, 0, 960, 500]);
    expect(rect(estado, 'productos')).toEqual([0, 500, 960, 446]);
    expect(rect(estado, 'abono-cliente')).toEqual([960, 0, 960, 480]);
  });
});

describe('reducirVentanas: cambio de escritorio y restablecer', () => {
  it('las encajadas siguen su zona en proporción y las sueltas se ajustan', () => {
    let estado = aplicar(
      { tipo: 'escritorio', tamano: E1366 },
      abrir('productos'),
      abrir('abono-cliente'),
      abrir('facturar'),
      { tipo: 'organizar', diseno: 'dos-columnas' },
    );
    estado = reducirVentanas(estado, { tipo: 'escritorio', tamano: E1920 });
    expect(rect(estado, 'facturar')).toEqual([0, 0, 1068, 946]);
    expect(rect(estado, 'abono-cliente')).toEqual([1068, 0, 852, 946]);
    estado = reducirVentanas(estado, { tipo: 'escritorio', tamano: { ancho: 800, alto: 500 } });
    expect(rect(estado, 'productos')).toEqual([0, 0, 800, 500]);
  });

  it('el mismo tamaño de escritorio no redibuja', () => {
    const antes = aplicar({ tipo: 'escritorio', tamano: E1366 });
    expect(reducirVentanas(antes, { tipo: 'escritorio', tamano: { ...E1366 } })).toBe(antes);
  });

  it('restablecer vuelve al tamaño inicial, suelta y sin maximizar', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('bodegas'),
      abrir('productos'),
      { tipo: 'redimensionar', id: 'productos', rect: { x: 300, y: 200, ancho: 500, alto: 500 } },
      { tipo: 'maximizar', id: 'productos' },
      { tipo: 'restablecer', id: 'productos' },
    );
    expect(rect(estado, 'productos')).toEqual([44, 44, 1040, 640]);
  });

  it('restablecer todas devuelve cada ventana a su cascada inicial', () => {
    const estado = aplicar(
      { tipo: 'escritorio', tamano: E1920 },
      abrir('productos'),
      abrir('clientes'),
      { tipo: 'organizar', diseno: 'dos-columnas' },
      { tipo: 'restablecerTodas' },
    );
    expect(zonasEncajadas(estado)).toHaveLength(0);
    expect(rect(estado, 'productos')).toEqual([16, 16, 1040, 640]);
    expect(rect(estado, 'clientes')).toEqual([44, 44, 1040, 640]);
  });

  it('la geometría a guardar es la normal, con el estado maximizado o encajado', () => {
    const estado = aplicar({ tipo: 'escritorio', tamano: E1366 }, abrir('facturar'), {
      tipo: 'encajar',
      id: 'facturar',
      rect: { x: 0, y: 0, ancho: 683, alto: 634 },
    });
    const [facturar] = estado.ventanas;
    expect(facturar && geometriaParaGuardar(facturar)).toEqual({
      x: 16,
      y: 0,
      ancho: 1236,
      alto: 634,
      maximizada: false,
      encaje: { x: 0, y: 0, ancho: 5000, alto: 10000 },
    });
  });
});
