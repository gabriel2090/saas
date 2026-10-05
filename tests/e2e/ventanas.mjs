/**
 * Prueba de punta a punta de las ventanas internas (Fase 3c, `DISENO.md` §11)
 * sobre la app real por el protocolo de depuración de Chromium (CDP).
 *
 * Arranca la app compilada con una carpeta de datos temporal (nunca la real,
 * D-15) y la repite las veces pedidas para detectar fallas intermitentes.
 * Cada falla deja su diagnóstico en el registro (D-119: tamaño del escritorio
 * frente al de la página; eventos de captura del puntero).
 *
 * Uso: `npm run test:e2e -- [--veces=N] [--salida=carpeta] [--capturas] [--sin-compilar]
 * [--escenario=correcciones|reimpresiones|reportes]`. El escenario `correcciones` recorre
 * las ventanas de la Fase 4a (ver `escenarioCorrecciones.mjs`); `reimpresiones`,
 * la de la Fase 4b sobre los datos de ejemplo (ver `escenarioReimpresiones.mjs`);
 * `reportes`, las de la Fase 5a (ver `escenarioReportes.mjs`).
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { recorrerCorrecciones } from './escenarioCorrecciones.mjs';
import { cargarDatosDemo, ingresarDemo, recorrerReimpresiones } from './escenarioReimpresiones.mjs';
import { recorrerReportes } from './escenarioReportes.mjs';

/**
 * Acciones de prueba sobre la página (ver {@link crearAcciones}).
 *
 * @typedef {Record<string, (...args: never[]) => unknown> & { errores: string[] }} Acciones
 */

/** Raíz del proyecto. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** Contraseña de la carpeta temporal (primer arranque). */
const CLAVE = 'Prueba-3c-2026';

/** Alto de la barra superior más la barra de estado, en px. */
const BARRAS = 36 + 19;

/**
 * Espera unos milisegundos.
 *
 * @param {number} ms - Milisegundos.
 * @returns {Promise<void>} Promesa que se cumple al terminar la espera.
 */
function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Lee los parámetros de la línea de comandos.
 *
 * @returns {{ veces: number, salida: string, capturas: boolean, compilar: boolean, escenario: string }} Parámetros.
 */
function leerParametros() {
  const args = process.argv.slice(2);
  const valor = (/** @type {string} */ nombre) =>
    args.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
  return {
    veces: Math.max(1, Number(valor('veces') ?? 1)),
    salida: resolve(valor('salida') ?? join(tmpdir(), 'saas-e2e')),
    capturas: args.includes('--capturas'),
    compilar: !args.includes('--sin-compilar'),
    escenario: valor('escenario') ?? 'ventanas',
  };
}

/**
 * Conecta por CDP con la página de la app y devuelve las acciones de prueba.
 *
 * @param {number} puerto - Puerto de depuración remota.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @returns {Promise<Acciones>} Acciones sobre la página.
 * @throws {Error} Si la página no aparece en 30 s.
 */
async function conectar(puerto, registrar) {
  /** @type {{ type: string, url: string, webSocketDebuggerUrl: string }[]} */
  let objetivos = [];
  for (let i = 0; i < 60; i++) {
    try {
      objetivos = await (await fetch(`http://127.0.0.1:${puerto}/json`)).json();
      if (objetivos.some((o) => o.type === 'page' && !o.url.startsWith('devtools'))) break;
    } catch {
      // La app todavía está arrancando.
    }
    await dormir(500);
  }
  const pagina = objetivos.find((o) => o.type === 'page' && !o.url.startsWith('devtools'));
  if (!pagina) throw new Error('No se encontró la página de la app.');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r, { once: true }));
  return crearAcciones(ws, registrar);
}

/**
 * Construye las acciones de prueba sobre una conexión CDP abierta.
 *
 * @param {WebSocket} ws - Conexión con la página.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @returns {Acciones} Acciones (`js`, `tecla`, `arrastrar`, `pantalla`, `verificar`…).
 */
function crearAcciones(ws, registrar) {
  let siguienteId = 1;
  /** @type {Map<number, { ok: (v: unknown) => void, mal: (e: Error) => void }>} */
  const pendientes = new Map();
  /** @type {string[]} */
  const errores = [];
  let fallos = 0;
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(String(e.data));
    const p = m.id ? pendientes.get(m.id) : undefined;
    if (p) {
      pendientes.delete(m.id);
      if (m.error) p.mal(new Error(JSON.stringify(m.error)));
      else p.ok(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errores.push(d.exception?.description ?? d.text);
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errores.push(
        m.params.args
          .map(
            (/** @type {{ value?: unknown, description?: string }} */ a) =>
              a.value ?? a.description,
          )
          .join(' '),
      );
    }
  });
  /** @type {(method: string, params?: object) => Promise<Record<string, unknown>>} */
  const send = (method, params = {}) =>
    new Promise((ok, mal) => {
      const id = siguienteId++;
      pendientes.set(id, { ok, mal });
      ws.send(JSON.stringify({ id, method, params }));
    });
  /** @type {(expr: string) => Promise<unknown>} */
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(`${expr}\n${r.exceptionDetails.exception?.description}`);
    return r.result.value;
  };
  /** @type {(expr: string, ms?: number) => Promise<void>} */
  const esperar = async (expr, ms = 6000) => {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      if (await js(expr)) return;
      await dormir(100);
    }
    throw new Error(`Tiempo agotado esperando: ${expr}`);
  };
  /** @type {Record<string, number>} */
  const codigos = {
    Escape: 27,
    Enter: 13,
    ArrowDown: 40,
    ArrowUp: 38,
    F6: 117,
    Tab: 9,
    PageDown: 34,
    F5: 116,
  };
  /** @type {(key: string, mod?: { ctrl?: boolean, shift?: boolean }) => Promise<void>} */
  const tecla = async (key, { ctrl = false, shift = false } = {}) => {
    const code =
      key.length === 1 ? (/\d/.test(key) ? `Digit${key}` : `Key${key.toUpperCase()}`) : key;
    const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : codigos[key];
    const modifiers = (ctrl ? 2 : 0) | (shift ? 8 : 0);
    const base = { key, code, windowsVirtualKeyCode: vk, modifiers };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await dormir(120);
  };
  /** @type {(type: string, x: number, y: number, extra?: object) => Promise<unknown>} */
  const raton = (type, x, y, extra = {}) =>
    send('Input.dispatchMouseEvent', {
      type,
      x,
      y,
      button: 'left',
      buttons: type === 'mouseReleased' ? 0 : 1,
      clickCount: 1,
      ...extra,
    });
  /** @type {(x: number, y: number) => Promise<void>} */
  const clicDerecho = async (x, y) => {
    const base = { x, y, button: 'right', clickCount: 1 };
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', buttons: 2, ...base });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', buttons: 0, ...base });
  };
  /** @type {(x1: number, y1: number, x2: number, y2: number, op?: { pasos?: number, soltar?: boolean }) => Promise<void>} */
  const arrastrar = async (x1, y1, x2, y2, { pasos = 12, soltar = true } = {}) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x1, y: y1 });
    await raton('mousePressed', x1, y1);
    for (let i = 1; i <= pasos; i++) {
      await raton('mouseMoved', x1 + ((x2 - x1) * i) / pasos, y1 + ((y2 - y1) * i) / pasos);
      await dormir(16);
    }
    if (soltar) await raton('mouseReleased', x2, y2);
    await dormir(200);
  };
  /** @type {(ancho: number, altoEscritorio: number) => Promise<void>} */
  const pantalla = async (ancho, altoEscritorio) => {
    const fijar = (/** @type {number} */ alto) =>
      send('Emulation.setDeviceMetricsOverride', {
        width: ancho,
        height: alto,
        deviceScaleFactor: 1,
        mobile: false,
      });
    const pedido = altoEscritorio + BARRAS;
    // El primer cambio de tamaño de la emulación a veces queda 1 px corrido; el segundo es exacto.
    await fijar(pedido + 1);
    await dormir(400);
    await fijar(pedido);
    await dormir(700);
    // El ResizeObserver avisa al dibujar un cuadro; con la ventana tapada, Chromium puede demorarlo.
    const cuadros = await js(
      `new Promise((ok) => { const t = performance.now(); const fin = setTimeout(() => ok(-1), 5000); requestAnimationFrame(() => requestAnimationFrame(() => { clearTimeout(fin); ok(Math.round(performance.now() - t)); })); })`,
    );
    registrar(
      `pantalla ${ancho}: alto de la página ${await js('innerHeight')} (pedido ${pedido}) · dos cuadros en ${cuadros < 0 ? 'más de 5000' : cuadros} ms`,
    );
  };
  /** @type {() => Promise<Record<string, number[]>>} */
  const rects = () =>
    js(
      `Object.fromEntries([...document.querySelectorAll('.ventana')].map(v => [v.getAttribute('aria-label'), [v.offsetLeft, v.offsetTop, v.offsetWidth, v.offsetHeight]]))`,
    );
  /** @type {(titulo: string) => Promise<number[]>} */
  const centroTitulo = (titulo) =>
    js(
      `(() => { const r = document.querySelector('section[aria-label="${titulo}"] .ventana__titulo').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`,
    );
  /** @type {(texto: string, titulo: string) => Promise<void>} */
  const abrir = async (texto, titulo) => {
    await tecla('K', { ctrl: true });
    await esperar(`!!document.querySelector('.buscador__campo')`);
    await send('Input.insertText', { text: texto });
    await tecla('Enter');
    await esperar(`!!document.querySelector('section[aria-label="${titulo}"]')`);
    await dormir(300);
  };
  /** @type {(nombre: string, obtenido: unknown, esperado: unknown) => boolean} */
  const verificar = (nombre, obtenido, esperado) => {
    const ok = JSON.stringify(obtenido) === JSON.stringify(esperado);
    if (!ok) fallos++;
    registrar(
      `${ok ? 'OK ' : 'MAL'} ${nombre}: ${JSON.stringify(obtenido)}${ok ? '' : ` (esperado ${JSON.stringify(esperado)})`}`,
    );
    return ok;
  };
  return {
    send,
    js,
    esperar,
    tecla,
    raton,
    clicDerecho,
    arrastrar,
    pantalla,
    rects,
    centroTitulo,
    abrir,
    verificar,
    errores,
    fallos: () => fallos,
    cerrar: () => ws.close(),
  };
}

/**
 * Primer arranque con la carpeta temporal: activa los eventos de CDP, crea la
 * contraseña y acepta la clave de recuperación hasta llegar al escritorio.
 *
 * @param {Acciones} a - Acciones de {@link crearAcciones}.
 * @returns {Promise<void>} Promesa que se cumple con el escritorio a la vista.
 */
async function primerArranque(a) {
  await a.send('Runtime.enable');
  await a.send('Page.enable');
  await a.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await a.esperar(`document.querySelectorAll('input[type=password]').length >= 2`, 15000);
  for (const i of [0, 1]) {
    await a.js(`document.querySelectorAll('input[type=password]')[${i}].focus()`);
    await a.send('Input.insertText', { text: CLAVE });
  }
  await a.js(`document.querySelector('button[type=submit]').click()`);
  await a.esperar(`!!document.querySelector('input[type=checkbox]')`);
  await a.js(`document.querySelector('input[type=checkbox]').click()`);
  await dormir(100);
  await a.js(
    `[...document.querySelectorAll('button')].find(b => b.textContent.includes('Continuar')).click()`,
  );
  await a.esperar(`!!document.querySelector('.escritorio')`);
  await dormir(500);
}

/**
 * Recorre los casos de la Fase 3c sobre la app ya abierta.
 *
 * @param {Acciones} a - Acciones de {@link crearAcciones}.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @param {((nombre: string) => Promise<void>) | null} captura - Guarda una captura, o `null`.
 * @returns {Promise<void>} Promesa que se cumple al terminar el recorrido.
 */
async function recorrer(a, registrar, captura) {
  const foto = async (/** @type {string} */ nombre) => captura && (await captura(nombre));
  const alto = async () => (await a.js('innerHeight')) - BARRAS;
  await a.pantalla(1366, 634);
  await primerArranque(a);
  // 1366: medidas de las barras y del escritorio.
  a.verificar(
    'barra, escritorio y estado en 1366',
    await a.js(
      `[document.querySelector('.barra-iconos').offsetHeight, document.querySelector('.escritorio').clientWidth, document.querySelector('.escritorio').clientHeight, document.querySelector('.barra-estado').offsetHeight]`,
    ),
    [36, 1366, await alto(), 19],
  );
  await foto('01-escritorio-1366');

  // Arrastre de Facturar al borde izquierdo: vista previa ámbar y asistente.
  await a.abrir('datos del negocio', 'Datos del negocio');
  await a.abrir('facturar', 'Facturar');
  const [fx, fy] = await a.centroTitulo('Facturar');
  await a.arrastrar(fx, fy, 3, 300);
  await dormir(300);
  a.verificar('Facturar encajada a la izquierda (al soltar)', (await a.rects())['Facturar'], [
    0,
    0,
    760,
    await alto(),
  ]);
  await foto('03-asistente-1366');
  await a.tecla('Enter');
  await dormir(300);
  a.verificar('Datos del negocio en la mitad derecha', (await a.rects())['Datos del negocio'], [
    760,
    0,
    606,
    await alto(),
  ]);

  // La captura de pantalla a mitad del arrastre quita la captura del puntero (D-116): la
  // ventana debe soltarse donde iba. Se anotan los eventos del puntero por si falla.
  await a.js(
    `(() => { window.__ev = []; const t0 = performance.now(); for (const t of ['pointerdown','gotpointercapture','lostpointercapture','pointerup','pointercancel']) document.addEventListener(t, (e) => window.__ev.push(Math.round(performance.now() - t0) + 'ms ' + t + '@' + Math.round(e.clientX) + ':' + String(e.target.className).slice(0, 24) + (document.querySelector('.zona-encaje') ? ' [vista previa]' : '') + ' ' + document.visibilityState + (document.hasFocus() ? '' : ' sin foco')), true); })()`,
  );
  const [gx, gy] = await a.centroTitulo('Facturar');
  await a.arrastrar(gx, gy, 3, 300, { soltar: false });
  await a.js(`window.__ev.push('— antes de la captura de pantalla —')`);
  await a.send('Page.captureScreenshot', { format: 'png' });
  await a.raton('mouseReleased', 3, 300);
  await dormir(300);
  const colgado = [
    await a.js(`!!document.querySelector('.zona-encaje, .disenos-encaje')`),
    (await a.rects())['Facturar'],
  ];
  if (
    !a.verificar('sin arrastre colgado y Facturar de nuevo a la izquierda', colgado, [
      false,
      [0, 0, 760, await alto()],
    ])
  ) {
    registrar('DIAGNÓSTICO captura del puntero:\n  ' + (await a.js(`window.__ev.join('\\n  ')`)));
  }
  if (await a.js(`!!document.querySelector('.asistente-encaje')`)) await a.tecla('Escape');
  await dormir(200);

  // Menú Organizar en 1366: 3 columnas desactivada con la razón.
  await a.abrir('clientes', 'Clientes');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.esperar(`!!document.querySelector('.menu-organizar')`);
  registrar(
    'razones: ' +
      JSON.stringify(
        await a.js(
          `[...document.querySelectorAll('.menu-organizar__razon')].map(r => r.textContent)`,
        ),
      ),
  );
  await foto('04-menu-1366');
  await a.tecla('Escape');
  await a.esperar(`!document.querySelector('.menu-organizar')`);

  // 1536: tres columnas con maestros angostos y un abono (aquí se vio la falla de D-119).
  await a.pantalla(1536, 739);
  await a.abrir('abono de cliente', 'Abono de cliente');
  await a.abrir('productos', 'Productos');
  await a.abrir('clientes', 'Clientes');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.esperar(`!!document.querySelector('.menu-organizar')`);
  const diagnostico = `(() => {
    const e = document.querySelector('.escritorio');
    const op = [...document.querySelectorAll('.menu-organizar__opcion')].find((o) => o.textContent.includes('3 columnas'));
    return {
      menuAbierto: !!document.querySelector('.menu-organizar'),
      pagina: [innerWidth, innerHeight],
      escritorio: [e.clientWidth, e.clientHeight],
      activa: document.querySelector('.ventana--activa')?.getAttribute('aria-label'),
      foco: document.activeElement?.className,
      tresColumnas: op ? (op.querySelector('.menu-organizar__razon')?.textContent ?? 'habilitada') : '(sin opción)',
      ventanas: [...document.querySelectorAll('.ventana')].map((v) => v.getAttribute('aria-label')),
    };
  })()`;
  const antes = await a.js(diagnostico);
  await a.tecla('2');
  await dormir(400);
  const r1536 = await a.rects();
  if (
    !a.verificar(
      '3 columnas en 1536',
      [r1536['Clientes'], r1536['Productos'], r1536['Abono de cliente']],
      [
        [0, 0, 488, 739],
        [488, 0, 488, 739],
        [976, 0, 560, 739],
      ],
    )
  ) {
    registrar(`DIAGNÓSTICO 1536 antes de «2»: ${JSON.stringify(antes)}`);
    registrar(`DIAGNÓSTICO 1536 después: ${JSON.stringify(await a.js(diagnostico))}`);
    if (await a.js(`!!document.querySelector('.menu-organizar')`)) await a.tecla('Escape');
  }
  a.verificar(
    'modo angosto (una sola columna en el maestro)',
    await a.js(
      `getComputedStyle(document.querySelector('section[aria-label="Productos"] .maestro')).gridTemplateColumns.split(' ').length`,
    ),
    1,
  );
  await foto('05-tres-columnas-1536');

  // Ctrl+F6: con Datos del negocio y Facturar en cascada detrás no cuenta como organizado
  // (D-115) y rota la pila; solo se anota.
  const visitadas = [];
  for (let i = 0; i < 3; i++) {
    await a.tecla('F6', { ctrl: true });
    visitadas.push(
      await a.js(`document.querySelector('.ventana--activa').getAttribute('aria-label')`),
    );
  }
  registrar(`Ctrl+F6: ${visitadas.join(' → ')}`);

  // 1920: el escritorio crece y las encajadas siguen su zona; luego 2 × 2.
  await a.pantalla(1920, 946);
  a.verificar(
    'escritorio en 1920',
    await a.js(
      `[document.querySelector('.escritorio').clientWidth, document.querySelector('.escritorio').clientHeight]`,
    ),
    [1920, await alto()],
  );
  await a.abrir('facturar', 'Facturar');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.esperar(`!!document.querySelector('.menu-organizar')`);
  await a.tecla('3');
  await dormir(400);
  const r1920 = await a.rects();
  a.verificar(
    '2 × 2 en 1920 (Facturar arriba, filas de 480 y 466)',
    r1920['Facturar'],
    [0, 0, 960, 480],
  );
  await foto('06-dos-por-dos-1920');

  // Borde compartido entre Facturar y su vecina de la derecha.
  const [bx, , bancho] = r1920['Facturar'];
  const borde = bx + bancho - 2;
  await a.arrastrar(borde, 240, borde + (1100 - (bx + bancho)), 240);
  const rBorde = await a.rects();
  const derecha = Object.entries(rBorde).find(([, r]) => r[0] >= 1000 && r[1] === 0)?.[0] ?? '';
  a.verificar('borde compartido: Facturar crece', rBorde['Facturar'].slice(2, 3), [1100]);
  a.verificar(
    `borde compartido: ${derecha} se achica`,
    rBorde[derecha]?.slice(0, 3),
    [1100, 0, 820],
  );

  // Maximizar con doble clic en el título y restaurar.
  const dobleClic = async () => {
    const [x, y] = await a.centroTitulo('Facturar');
    await a.raton('mousePressed', x, y);
    await a.raton('mouseReleased', x, y);
    await a.raton('mousePressed', x, y, { clickCount: 2 });
    await a.raton('mouseReleased', x, y, { clickCount: 2 });
    await dormir(300);
  };
  await dobleClic();
  a.verificar('maximizada', (await a.rects())['Facturar'], [0, 0, 1920, await alto()]);
  await foto('07-maximizada-1920');
  await dobleClic();
  a.verificar('restaurada a su zona', (await a.rects())['Facturar'], [0, 0, 1100, 480]);

  // Clic derecho en el título de una ventana de abajo: menú completo y «Restablecer» (R).
  const [cx, cy] = await a.centroTitulo('Clientes');
  await a.clicDerecho(cx, cy);
  await a.esperar(`!!document.querySelector('.menu-organizar')`);
  await dormir(200);
  a.verificar(
    'menú del título completo en pantalla y para Clientes',
    await a.js(
      `(() => { const r = document.querySelector('.menu-organizar').getBoundingClientRect(); return [r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth, document.querySelector('.menu-organizar').textContent.includes('Ventana activa: Clientes')]; })()`,
    ),
    [true, true],
  );
  await foto('10-menu-titulo-1920');
  await a.tecla('R');
  await dormir(400);
  a.verificar(
    'Clientes restablecida (suelta)',
    await a.js(
      `document.querySelector('section[aria-label="Clientes"]').classList.contains('ventana--encajada')`,
    ),
    false,
  );

  // Barra «solo íconos» por clic derecho.
  await a.clicDerecho(400, 18);
  await a.esperar(`!!document.querySelector('.menu-organizar--chico')`);
  await a.js(
    `[...document.querySelectorAll('.menu-organizar--chico .menu-organizar__opcion')].find(o => o.textContent.includes('Solo íconos')).click()`,
  );
  await dormir(300);
  a.verificar(
    'barra solo íconos',
    await a.js(`document.querySelector('.barra-iconos').offsetHeight`),
    34,
  );
  await foto('08-barra-iconos-1920');

  // Preferencias guardadas en la base temporal.
  await dormir(800);
  const prefs = await a.js(`window.api.invocar('interfaz:preferencias', undefined)`);
  a.verificar('barra guardada', prefs.datos.barra, 'iconos');

  // Menú Organizar con la barra solo íconos (vuelve a ícono y nombre con B).
  await a.tecla('O', { ctrl: true, shift: true });
  await a.esperar(`!!document.querySelector('.menu-organizar')`);
  await foto('09-menu-1920');
  await a.tecla('B');
  await dormir(300);
  a.verificar(
    'barra de vuelta a ícono y nombre',
    await a.js(`document.querySelector('.barra-iconos').offsetHeight`),
    36,
  );
}

/**
 * Corre una vez la prueba: abre la app con una carpeta temporal, recorre los
 * casos y la cierra.
 *
 * @param {number} vez - Número de corrida (1, 2…).
 * @param {{ salida: string, capturas: boolean, escenario: string }} op - Carpeta de salida, si se guardan capturas y el escenario.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @returns {Promise<number>} Cantidad de verificaciones fallidas (1 si la corrida se cayó).
 */
async function correrUnaVez(vez, op, registrar) {
  const puerto = 9400 + vez;
  const datos = mkdtempSync(join(tmpdir(), 'saas-e2e-datos-'));
  const electron = /** @type {string} */ (createRequire(import.meta.url)('electron'));
  if (op.escenario === 'reimpresiones' || op.escenario === 'reportes') {
    registrar(cargarDatosDemo(electron, RAIZ, datos).trim());
  }
  const app = spawn(
    electron,
    [
      '.',
      `--carpeta-datos=${datos}`,
      `--remote-debugging-port=${puerto}`,
      // Con la ventana tapada, Chromium frena el renderer varios segundos y la captura del
      // puntero se pierde a mitad del arrastre (falla intermitente de la corrida 4).
      '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows',
      '--disable-background-timer-throttling',
    ],
    { cwd: RAIZ, stdio: 'ignore' },
  );
  let fallos = 0;
  /** @type {Acciones | null} */
  let a = null;
  try {
    a = await conectar(puerto, registrar);
    const carpeta = join(op.salida, `corrida-${vez}`);
    const captura = op.capturas
      ? async (/** @type {string} */ nombre) => {
          mkdirSync(carpeta, { recursive: true });
          await dormir(250);
          const { data } = await a.send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(join(carpeta, `${nombre}.png`), Buffer.from(data, 'base64'));
        }
      : null;
    if (op.escenario === 'correcciones') {
      await a.pantalla(1366, 690);
      await primerArranque(a);
      await recorrerCorrecciones(a, registrar, captura, dormir);
    } else if (op.escenario === 'reimpresiones') {
      await a.pantalla(1366, 690);
      await ingresarDemo(a);
      await recorrerReimpresiones(a, registrar, captura, dormir);
    } else if (op.escenario === 'reportes') {
      await a.pantalla(1366, 730);
      await ingresarDemo(a);
      await recorrerReportes(a, registrar, captura, dormir, { electron, raiz: RAIZ, carpeta });
    } else {
      await recorrer(a, registrar, captura);
    }
    fallos = a.fallos();
    registrar(
      a.errores.length
        ? `ERRORES EN LA PÁGINA:\n${a.errores.join('\n')}`
        : 'Sin errores en la página.',
    );
    fallos += a.errores.length;
  } catch (error) {
    registrar(`CORRIDA CAÍDA: ${error instanceof Error ? error.message : String(error)}`);
    if (a && op.capturas) {
      const { data } = await a.send('Page.captureScreenshot', { format: 'png' });
      mkdirSync(join(op.salida, `corrida-${vez}`), { recursive: true });
      writeFileSync(join(op.salida, `corrida-${vez}`, 'caida.png'), Buffer.from(data, 'base64'));
    }
    if (a?.errores.length) registrar(`ERRORES EN LA PÁGINA:\n${a.errores.join('\n')}`);
    fallos = Math.max(1, a?.fallos() ?? 0);
  } finally {
    a?.cerrar();
    app.kill();
    await dormir(800);
    rmSync(datos, { recursive: true, force: true });
  }
  return fallos;
}

/**
 * Punto de entrada: compila, corre la prueba N veces y resume.
 *
 * @returns {Promise<void>} Promesa que se cumple al terminar (fija el código de salida).
 */
async function principal() {
  const op = leerParametros();
  mkdirSync(op.salida, { recursive: true });
  const archivo = join(op.salida, 'registro.log');
  writeFileSync(archivo, `Prueba de ventanas · ${new Date().toISOString()}\n`);
  const registrar = (/** @type {string} */ texto) => {
    console.log(texto);
    appendFileSync(archivo, `${texto}\n`);
  };
  if (op.compilar) {
    const r = spawnSync('npx', ['electron-vite', 'build'], {
      cwd: RAIZ,
      shell: true,
      stdio: 'ignore',
    });
    if (r.status !== 0) {
      registrar('No se pudo compilar la app (npx electron-vite build).');
      process.exitCode = 1;
      return;
    }
  }
  const resumen = [];
  for (let vez = 1; vez <= op.veces; vez++) {
    registrar(`--- Corrida ${vez} de ${op.veces} ---`);
    resumen.push(await correrUnaVez(vez, op, registrar));
  }
  const malas = resumen.filter((f) => f > 0).length;
  registrar(
    `Resumen: ${op.veces - malas} de ${op.veces} corridas sin fallas. Registro: ${archivo}`,
  );
  process.exitCode = malas > 0 ? 1 : 0;
}

await principal();
