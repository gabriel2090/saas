/**
 * Escenario de punta a punta de la Fase 4a: corrección de factura de cliente
 * y de proveedor, devoluciones con su anulación, saldo a favor en el abono y
 * el botón «Correcciones». Los datos se crean por el puente de la app
 * (`window.api.invocar`) en la carpeta temporal de la corrida.
 *
 * Verifica, además, que una doble pulsación de Av. Pág guarde una sola vez.
 */

/**
 * Campos de las respuestas que lee el escenario (cada canal trae solo los suyos).
 *
 * @typedef {{ id: number, numero: number, codigo: number, versiones: unknown[], devoluciones: { estado: string }[], saldoFavor: number }} RespuestaApi
 */

/** Forma de pago «Efectivo» (sembrada por la migración inicial). */
const EFECTIVO = 1;

/**
 * Llama a un canal de la app y devuelve los datos, o lanza el error.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @param {string} canal - Canal IPC.
 * @param {unknown} peticion - Petición.
 * @returns {Promise<RespuestaApi>} Datos de la respuesta.
 * @throws {Error} Si la app responde con error.
 */
async function api(a, canal, peticion) {
  const r = await a.js(`window.api.invocar(${JSON.stringify(canal)}, ${JSON.stringify(peticion)})`);
  if (!r.ok) throw new Error(`${canal}: ${r.error.mensaje}`);
  return r.datos;
}

/**
 * Datos de un tercero de prueba.
 *
 * @param {string} numero - Identificación.
 * @param {string} nombre - Nombre.
 * @returns {object} Datos del tercero.
 */
function tercero(numero, nombre) {
  return {
    codigo: null,
    tipoPersona: 'juridica',
    nombre,
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: numero,
    celular: '3042620852',
    direccion: 'CARR 25 #122-04',
    barrio: 'LA PRADERA',
    ciudad: 'BARRANQUILLA',
    topeCredito: null,
  };
}

/**
 * Crea proveedor, cliente, dos productos, una compra a crédito, una venta a
 * crédito de la maqueta (84772: 4 papas, 5 cajas) y un abono de $ 70,000.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @returns {Promise<{ venta: number, compra: number, cliente: number }>} Números creados.
 */
async function sembrar(a) {
  const proveedor = (
    await api(a, 'terceros:crear', {
      clase: 'proveedor',
      datos: tercero('800123', 'AGRINA S.A.S.'),
    })
  ).codigo;
  const cliente = (
    await api(a, 'terceros:crear', {
      clase: 'cliente',
      datos: tercero('212121354', 'JUAN JJ FERTILIA'),
    })
  ).codigo;
  await api(a, 'productos:crear', {
    codigo: 231,
    nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
    proveedorCodigo: proveedor,
    unidad: 'UND',
    costo: 12_292,
    precios: { mayor: 16_000, menor: 17_500, minimo: 12_300 },
    stockInicial: null,
  });
  await api(a, 'productos:crear', {
    codigo: 102,
    nombre: 'CAJA PIZZA 40*40 FD',
    proveedorCodigo: proveedor,
    unidad: 'UND',
    costo: 2_050,
    precios: { mayor: 2_300, menor: 2_500, minimo: 2_200 },
    stockInicial: null,
  });
  const compra = await api(a, 'compras:guardar', {
    proveedorCodigo: proveedor,
    numeroProveedor: 'FE-5521',
    fecha: new Date().toISOString().slice(0, 10),
    plazoDias: 30,
    bodegaId: 1,
    ordenCompra: '',
    lineas: [
      { productoCodigo: 231, cantidad: 50_000, costoUnitario: 11_800 },
      { productoCodigo: 102, cantidad: 40_000, costoUnitario: 2_050 },
    ],
    flete: 0,
    fleteProveedor: false,
    descuento: { modo: 'pesos', valor: 0 },
    descuentoEnCosto: false,
    contado: null,
  });
  const venta = await api(a, 'ventas:guardar', {
    ranura: null,
    clienteCodigo: cliente,
    condicion: 'credito',
    plazoDias: 8,
    bodegaId: 1,
    lineas: [
      { productoCodigo: 231, escala: 'menor', cantidad: 4_000, precioAlterado: null },
      { productoCodigo: 102, escala: 'mayor', cantidad: 5_000, precioAlterado: null },
    ],
    contado: null,
    cajasEmpaque: null,
  });
  await api(a, 'abonos:guardar', {
    tipo: 'cliente',
    terceroCodigo: cliente,
    fecha: new Date().toISOString().slice(0, 10),
    formaPagoId: EFECTIVO,
    valor: 70_000,
    observacion: '',
    aplicaciones: [{ facturaId: venta.id, valor: 70_000 }],
  });
  return { venta: venta.numero, compra: compra.numero, cliente };
}

/**
 * Escribe en el campo con el foco (reemplazando lo que tenga) y espera un poco.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @param {string} selector - Selector del campo.
 * @param {string} texto - Texto a escribir.
 * @param {(ms: number) => Promise<void>} dormir - Espera.
 * @returns {Promise<void>} Promesa que se cumple al escribir.
 */
async function escribir(a, selector, texto, dormir) {
  await a.js(
    `(() => { const c = document.querySelector(${JSON.stringify(selector)}); c.focus(); c.select(); })()`,
  );
  await a.send('Input.insertText', { text: texto });
  await dormir(200);
}

/**
 * Pulsa Av. Pág dos veces seguidas, sin esperar entre una y otra.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @returns {Promise<void>} Promesa que se cumple tras las dos pulsaciones.
 */
async function doblePageDown(a) {
  const base = { key: 'PageDown', code: 'PageDown', windowsVirtualKeyCode: 34, modifiers: 0 };
  await Promise.all([
    a.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }),
    a.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }),
    a.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base }),
    a.send('Input.dispatchKeyEvent', { type: 'keyUp', ...base }),
  ]);
}

/**
 * Recorre las ventanas de la Fase 4a sobre la app ya abierta y con sesión.
 *
 * @param {Record<string, (...args: never[]) => unknown> & { errores: string[] }} a - Acciones de la prueba.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @param {((nombre: string) => Promise<void>) | null} captura - Guarda una captura, o `null`.
 * @param {(ms: number) => Promise<void>} dormir - Espera.
 * @returns {Promise<void>} Promesa que se cumple al terminar el recorrido.
 */
export async function recorrerCorrecciones(a, registrar, captura, dormir) {
  const foto = async (/** @type {string} */ nombre) => captura && (await captura(nombre));
  const { venta, compra, cliente } = await sembrar(a);
  registrar(`datos: venta ${venta}, compra ${compra}, cliente ${cliente}`);

  // Botón «Correcciones» con su menú de cuatro ventanas.
  await a.js(
    `[...document.querySelectorAll('.barra-iconos__boton')].find(b => b.textContent.includes('Correcciones')).click()`,
  );
  await a.esperar(`!!document.querySelector('.menu-correcciones')`);
  a.verificar(
    'menú Correcciones',
    await a.js(
      `[...document.querySelectorAll('.menu-correcciones .menu-organizar__opcion')].map(o => o.textContent)`,
    ),
    [
      'Corrección de factura de cliente',
      'Corrección de factura de proveedor',
      'Devolución de venta',
      'Devolución de compra',
    ],
  );
  await foto('20-menu-correcciones');
  await a.js(`document.activeElement.click()`);
  await a.esperar(
    `!!document.querySelector('section[aria-label="Corrección de factura de cliente"]')`,
  );
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  await dormir(300);

  // Resumen de la factura.
  const sel = 'section[aria-label="Corrección de factura de cliente"]';
  await escribir(a, `${sel} .correccion__numero input`, String(venta), dormir);
  await a.tecla('Enter');
  await a.esperar(`!!document.querySelector('${sel} .correccion__paneles')`);
  await foto('21-correccion-resumen');

  // Vista discriminada: 231 de 4 a 2 y la caja de 2,300 a 1,900 (bajo el costo).
  await a.tecla('D', { ctrl: true });
  await a.esperar(`document.querySelectorAll('${sel} tbody input').length === 4`);
  await escribir(a, `${sel} input[aria-label="Cantidad de la línea 1"]`, '2', dormir);
  await escribir(a, `${sel} input[aria-label="Precio de la línea 2"]`, '1,900', dormir);
  a.verificar(
    'total corregido en pantalla',
    await a.js(`document.querySelector('${sel} .totales__total td').textContent`),
    '$ 44,500',
  );
  await foto('22-correccion-discriminada');
  await doblePageDown(a);
  await a.esperar(
    `!!document.querySelector('.dialogo__titulo')?.textContent.includes('corregida')`,
  );
  await dormir(500);
  await foto('23-correccion-guardada');
  const corregida = await api(a, 'correcciones:buscarVenta', venta);
  a.verificar('doble Av. Pág: una sola versión nueva', corregida.versiones.length, 2);
  a.verificar('saldo a favor tras la corrección', corregida.saldoFavor, 25_500);
  await a.js(
    `[...document.querySelectorAll('.dialogo button')].find(b => b.textContent === 'Cerrar').click()`,
  );
  await a.esperar(`!!document.querySelector('${sel} .correccion__paneles')`);

  // Diálogo de anulación (se cancela).
  await a.js(`document.activeElement.blur()`);
  await a.tecla('X', { ctrl: true });
  await a.esperar(
    `!!document.querySelector('.dialogo__titulo')?.textContent.includes('¿Anular la factura')`,
  );
  await foto('24-correccion-anular');
  await a.tecla('Escape');
  await dormir(300);

  // «Devolución…» abre la devolución de venta con la factura cargada.
  await a.js(
    `[...document.querySelectorAll('${sel} button')].find(b => b.textContent.startsWith('Devolución')).click()`,
  );
  const dv = 'section[aria-label="Devolución de venta"]';
  await a.esperar(
    `document.querySelector('${dv} .correccion__numero input')?.value === '${venta}'`,
  );
  await a.esperar(`document.querySelectorAll('${dv} tbody input').length >= 2`);
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  await escribir(a, `${dv} input[aria-label="Devolver de la línea 1"]`, '1', dormir);
  await foto('25-devolucion-venta');
  await doblePageDown(a);
  await a.esperar(`!!document.querySelector('.dialogo__titulo')?.textContent.includes('guardada')`);
  await foto('26-devolucion-guardada');
  const conDevolucion = await api(a, 'correcciones:buscarVenta', venta);
  a.verificar('doble Av. Pág: una sola devolución', conDevolucion.devoluciones.length, 1);
  await a.js(
    `[...document.querySelectorAll('.dialogo button')].find(b => b.textContent === 'Cerrar').click()`,
  );
  await a.esperar(`!!document.querySelector('${dv} .correccion__devoluciones button')`);
  await a.js(`document.querySelector('${dv} .correccion__devoluciones button').click()`);
  await a.esperar(
    `!!document.querySelector('.dialogo__titulo')?.textContent.includes('¿Anular la devolución')`,
  );
  await foto('27-devolucion-anular');
  await a.js(`document.querySelector('.dialogo button[type=submit]').click()`);
  await a.esperar(`!document.querySelector('.dialogo')`);
  await dormir(300);
  const devolucionAnulada = await api(a, 'correcciones:buscarVenta', venta);
  a.verificar(
    'devolución anulada',
    devolucionAnulada.devoluciones.map((d) => d.estado),
    ['anulada'],
  );
  await foto('28-devolucion-anulada');

  // Corrección de factura de proveedor: costo de 231 de 11,800 a 12,000.
  await a.abrir('correccion de factura de proveedor', 'Corrección de factura de proveedor');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  const cp = 'section[aria-label="Corrección de factura de proveedor"]';
  await escribir(a, `${cp} .correccion__numero input`, 'FE-5521', dormir);
  await a.tecla('Enter');
  await a.esperar(
    `!!document.querySelector('${cp} input[aria-label="Costo unitario de la línea 1"]')`,
  );
  await escribir(a, `${cp} input[aria-label="Costo unitario de la línea 1"]`, '12,000', dormir);
  await foto('29-correccion-proveedor');
  await a.js(`document.activeElement.blur()`);
  await a.tecla('X', { ctrl: true });
  await a.esperar(
    `!!document.querySelector('.dialogo__titulo')?.textContent.includes('¿Anular la compra')`,
  );
  await foto('30-correccion-proveedor-anular');
  await a.tecla('Escape');
  await dormir(300);

  // Devolución de compra.
  await a.abrir('devolucion de compra', 'Devolución de compra');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  const dc = 'section[aria-label="Devolución de compra"]';
  await escribir(a, `${dc} .correccion__numero input`, String(compra), dormir);
  await a.tecla('Enter');
  await a.esperar(`document.querySelectorAll('${dc} tbody input').length >= 2`);
  await escribir(a, `${dc} input[aria-label="Devolver de la línea 2"]`, '5', dormir);
  await foto('31-devolucion-compra');

  // Abono de cliente con el saldo a favor de la corrección.
  await a.abrir('abono de cliente', 'Abono de cliente');
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  const ab = 'section[aria-label="Abono de cliente"]';
  await a.js(`document.querySelector('${ab} .documento__proveedor input').focus()`);
  await a.send('Input.insertText', { text: String(cliente) });
  await a.tecla('Enter');
  await a.esperar(`!!document.querySelector('${ab} .aviso--exito')`);
  await foto('32-abono-saldo-favor');
  a.verificar(
    'forma «Saldo a favor» en el abono',
    await a.js(
      `[...document.querySelectorAll('${ab} select option')].some(o => o.textContent.startsWith('Saldo a favor'))`,
    ),
    true,
  );
  await a.js(
    `[...document.querySelectorAll('${ab} button')].find(b => b.textContent.startsWith('Devolver en dinero')).click()`,
  );
  await a.esperar(`!!document.querySelector('#reintegro-titulo')`);
  await foto('33-reintegro');
  await a.tecla('Escape');
}
