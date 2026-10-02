import { describe, expect, it } from 'vitest';
import type { IdProceso } from '../../shared/procesos';
import {
  ESTADO_INICIAL_VENTANAS,
  reducirVentanas,
  TAMANO_MINIMO,
  ventanaActiva,
  ventanasConCambios,
  type AccionVentanas,
  type EstadoVentanas,
} from './gestor';

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
 * Ids de las ventanas en orden de apilado.
 *
 * @param estado - Estado del gestor.
 * @returns Ids de atrás hacia adelante.
 */
function orden(estado: EstadoVentanas): IdProceso[] {
  return estado.ventanas.map((v) => v.id);
}

describe('reducirVentanas', () => {
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

  it('cierra todas', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'abrir', id: 'clientes' },
      { tipo: 'cerrarTodas' },
    );
    expect(estado.ventanas).toHaveLength(0);
    expect(ventanaActiva(estado)).toBeNull();
  });

  it('Ctrl+F6 rota por todas las ventanas', () => {
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

  it('mueve sin permitir posiciones negativas', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'mover', id: 'productos', x: -50, y: 120 },
    );
    expect(estado.ventanas[0]).toMatchObject({ x: 0, y: 120 });
  });

  it('abre con el tamaño inicial indicado o ajustada al contenido', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos', tamano: { ancho: 1040, alto: 640 } },
      { tipo: 'abrir', id: 'cambiar-contrasena' },
    );
    expect(estado.ventanas[0]?.tamano).toEqual({ ancho: 1040, alto: 640 });
    expect(estado.ventanas[1]?.tamano).toBeNull();
  });

  it('redimensiona respetando el tamaño mínimo', () => {
    const estado = aplicar(
      { tipo: 'abrir', id: 'productos' },
      { tipo: 'redimensionar', id: 'productos', tamano: { ancho: 100, alto: 900.6 } },
    );
    expect(estado.ventanas[0]?.tamano).toEqual({ ancho: TAMANO_MINIMO.ancho, alto: 901 });
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
});
