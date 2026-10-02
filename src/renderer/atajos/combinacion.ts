/**
 * Datos mínimos de un evento de teclado (permite probar sin DOM).
 */
export interface EventoTeclaMinimo {
  /** Valor de `KeyboardEvent.key`. */
  key: string;
  /** Valor de `KeyboardEvent.code` (tecla física). */
  code: string;
  /** Si Ctrl está presionado. */
  ctrlKey: boolean;
  /** Si Alt está presionado. */
  altKey: boolean;
  /** Si Shift está presionado. */
  shiftKey: boolean;
}

/**
 * Modificadores en el orden canónico del keymap.
 */
const MODIFICADORES = ['Ctrl', 'Alt', 'Shift'] as const;

/**
 * Teclas con nombre que acepta el keymap (además de letras, dígitos y F1–F12).
 */
const TECLAS_CON_NOMBRE = new Set([
  'Escape',
  'Enter',
  'Tab',
  'PageDown',
  'PageUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Delete',
  'Home',
  'End',
  '=',
  '-',
]);

/**
 * Indica si una tecla (sin modificadores) es válida en el keymap.
 *
 * @param tecla - Nombre de la tecla.
 * @returns `true` si es válida.
 */
export function esTeclaValida(tecla: string): boolean {
  return (
    /^[A-Z0-9]$/.test(tecla) || /^F([1-9]|1[0-2])$/.test(tecla) || TECLAS_CON_NOMBRE.has(tecla)
  );
}

/**
 * Normaliza una combinación escrita en el keymap: modificadores en orden
 * `Ctrl+Alt+Shift` y letras en mayúscula.
 *
 * @param texto - Combinación, p. ej. `shift+ctrl+k`.
 * @returns Combinación normalizada, p. ej. `Ctrl+Shift+K`.
 * @throws {Error} Si la combinación está mal escrita.
 *
 * @example
 * normalizarCombinacion('alt+1'); // 'Alt+1'
 */
export function normalizarCombinacion(texto: string): string {
  const partes = texto.split('+').map((p) => p.trim());
  const teclaCruda = partes.pop() ?? '';
  const tecla = teclaCruda.length === 1 ? teclaCruda.toUpperCase() : teclaCruda;
  if (!esTeclaValida(tecla)) {
    throw new Error(`Tecla no válida en el atajo «${texto}».`);
  }
  const modificadores = new Set<string>();
  for (const parte of partes) {
    const mod = MODIFICADORES.find((m) => m.toLowerCase() === parte.toLowerCase());
    if (!mod || modificadores.has(mod)) {
      throw new Error(`Modificador no válido o repetido en el atajo «${texto}».`);
    }
    modificadores.add(mod);
  }
  return [...MODIFICADORES.filter((m) => modificadores.has(m)), tecla].join('+');
}

/**
 * Obtiene el nombre de la tecla de un evento según el formato del keymap.
 *
 * Para letras y dígitos se usa la tecla física (`code`), así Alt+1 o
 * Ctrl+Shift+K se reconocen igual sin importar el idioma del teclado ni Shift.
 *
 * @param evento - Evento de teclado.
 * @returns Nombre de la tecla, o `null` si es solo un modificador.
 */
function teclaDeEvento(evento: EventoTeclaMinimo): string | null {
  const letra = /^Key([A-Z])$/.exec(evento.code);
  if (letra?.[1]) {
    return letra[1];
  }
  const digito = /^(?:Digit|Numpad)(\d)$/.exec(evento.code);
  if (digito?.[1]) {
    return digito[1];
  }
  if (evento.code === 'Equal') {
    return '=';
  }
  if (evento.code === 'Minus' || evento.code === 'NumpadSubtract') {
    return '-';
  }
  if (['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'].includes(evento.key)) {
    return null;
  }
  return evento.key.length === 1 ? evento.key.toUpperCase() : evento.key;
}

/**
 * Convierte un evento de teclado en una combinación normalizada.
 *
 * @param evento - Evento de teclado.
 * @returns Combinación como `Ctrl+K`, o `null` si solo se presionó un modificador.
 *
 * @example
 * combinacionDeEvento({ key: 'k', code: 'KeyK', ctrlKey: true, altKey: false, shiftKey: false }); // 'Ctrl+K'
 */
export function combinacionDeEvento(evento: EventoTeclaMinimo): string | null {
  const tecla = teclaDeEvento(evento);
  if (tecla === null) {
    return null;
  }
  const partes: string[] = [];
  if (evento.ctrlKey) partes.push('Ctrl');
  if (evento.altKey) partes.push('Alt');
  if (evento.shiftKey) partes.push('Shift');
  partes.push(tecla);
  return partes.join('+');
}

/**
 * Nombres cortos en español para mostrar teclas en pantalla.
 */
const NOMBRES_VISIBLES: Readonly<Record<string, string>> = {
  Escape: 'Esc',
  PageDown: 'Av. Pág',
  PageUp: 'Re. Pág',
  Enter: 'Enter',
  Delete: 'Supr',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

/**
 * Convierte una combinación del keymap en el texto que ve el usuario.
 *
 * @param combinacion - Combinación del keymap.
 * @returns Texto legible, p. ej. `Av. Pág` o `Ctrl+K`.
 */
export function textoCombinacion(combinacion: string): string {
  return combinacion
    .split('+')
    .map((parte) => NOMBRES_VISIBLES[parte] ?? parte)
    .join('+');
}

/**
 * Tipos de `<input>` en los que se escribe texto.
 */
const TIPOS_INPUT_TEXTO = new Set([
  '',
  'text',
  'password',
  'search',
  'number',
  'email',
  'tel',
  'url',
]);

/**
 * Indica si el elemento con el foco es un campo donde se escribe texto
 * (allí, por ejemplo, Ctrl+X debe cortar y no anular).
 *
 * @param elemento - Elemento con el foco.
 * @returns `true` si es un campo de texto.
 */
export function esCampoDeTexto(elemento: Element | null): boolean {
  if (!elemento) {
    return false;
  }
  const etiqueta = elemento.tagName;
  if (etiqueta === 'TEXTAREA') {
    return true;
  }
  if (etiqueta === 'INPUT') {
    return TIPOS_INPUT_TEXTO.has((elemento.getAttribute('type') ?? '').toLowerCase());
  }
  return elemento instanceof HTMLElement && elemento.isContentEditable;
}
