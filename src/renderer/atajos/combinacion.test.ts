import { describe, expect, it } from 'vitest';
import {
  combinacionDeEvento,
  normalizarCombinacion,
  textoCombinacion,
  type EventoTeclaMinimo,
} from './combinacion';

/**
 * Crea un evento de teclado mínimo para las pruebas.
 *
 * @param key - Valor de `key`.
 * @param code - Valor de `code`.
 * @param modificadores - Modificadores presionados.
 * @returns Evento de prueba.
 */
function evento(
  key: string,
  code: string,
  modificadores: Partial<Pick<EventoTeclaMinimo, 'ctrlKey' | 'altKey' | 'shiftKey'>> = {},
): EventoTeclaMinimo {
  return { key, code, ctrlKey: false, altKey: false, shiftKey: false, ...modificadores };
}

describe('normalizarCombinacion', () => {
  it('ordena los modificadores y pasa la letra a mayúscula', () => {
    expect(normalizarCombinacion('shift+ctrl+k')).toBe('Ctrl+Shift+K');
    expect(normalizarCombinacion('Alt+1')).toBe('Alt+1');
    expect(normalizarCombinacion('PageDown')).toBe('PageDown');
    expect(normalizarCombinacion('Ctrl+F6')).toBe('Ctrl+F6');
  });

  it('rechaza teclas o modificadores inválidos', () => {
    expect(() => normalizarCombinacion('Ctrl+Patata')).toThrow();
    expect(() => normalizarCombinacion('Super+K')).toThrow();
    expect(() => normalizarCombinacion('Ctrl+Ctrl+K')).toThrow();
    expect(() => normalizarCombinacion('F13')).toThrow();
  });
});

describe('combinacionDeEvento', () => {
  it('reconoce letras por la tecla física', () => {
    expect(combinacionDeEvento(evento('k', 'KeyK', { ctrlKey: true }))).toBe('Ctrl+K');
    expect(combinacionDeEvento(evento('X', 'KeyX', { ctrlKey: true, shiftKey: true }))).toBe(
      'Ctrl+Shift+X',
    );
  });

  it('reconoce dígitos de la fila superior y del teclado numérico', () => {
    expect(combinacionDeEvento(evento('1', 'Digit1', { altKey: true }))).toBe('Alt+1');
    expect(combinacionDeEvento(evento('0', 'Numpad0', { ctrlKey: true }))).toBe('Ctrl+0');
  });

  it('reconoce teclas con nombre', () => {
    expect(combinacionDeEvento(evento('Escape', 'Escape'))).toBe('Escape');
    expect(combinacionDeEvento(evento('PageDown', 'PageDown'))).toBe('PageDown');
    expect(combinacionDeEvento(evento('F7', 'F7'))).toBe('F7');
    expect(combinacionDeEvento(evento('F6', 'F6', { ctrlKey: true }))).toBe('Ctrl+F6');
  });

  it('ignora la pulsación de un modificador solo', () => {
    expect(combinacionDeEvento(evento('Control', 'ControlLeft', { ctrlKey: true }))).toBeNull();
    expect(combinacionDeEvento(evento('Shift', 'ShiftLeft', { shiftKey: true }))).toBeNull();
  });

  it('reconoce = y - para bloquear el zoom', () => {
    expect(combinacionDeEvento(evento('=', 'Equal', { ctrlKey: true }))).toBe('Ctrl+=');
    expect(combinacionDeEvento(evento('-', 'Minus', { ctrlKey: true }))).toBe('Ctrl+-');
  });
});

describe('textoCombinacion', () => {
  it('muestra nombres cortos en español', () => {
    expect(textoCombinacion('PageDown')).toBe('Av. Pág');
    expect(textoCombinacion('Escape')).toBe('Esc');
    expect(textoCombinacion('Ctrl+K')).toBe('Ctrl+K');
  });
});
