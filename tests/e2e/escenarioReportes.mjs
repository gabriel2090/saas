/**
 * Escenario de punta a punta de la Fase 5: inventario valorizado, cuentas
 * por cobrar y por pagar, kardex, historial de cambios y estados de cuenta
 * sobre los datos de ejemplo. Verifica que la
 * pantalla muestre lo que calcula el proceso principal, los filtros, el orden
 * de los grupos, las flechas, la vista previa carta (Ctrl+P) y el PDF con el
 * número de página. Excel (Ctrl+E) abre el diálogo de guardar de Windows y
 * se prueba en la integración.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Llama a un canal de la app y devuelve los datos, o lanza el error.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @param {string} canal - Canal IPC.
 * @param {unknown} peticion - Petición.
 * @returns {Promise<unknown>} Datos de la respuesta (inventario, cartera o HTML).
 * @throws {Error} Si la app responde con error.
 */
async function api(a, canal, peticion) {
  const r = await a.js(`window.api.invocar(${JSON.stringify(canal)}, ${JSON.stringify(peticion)})`);
  if (!r.ok) throw new Error(`${canal}: ${r.error.mensaje}`);
  return r.datos;
}

/**
 * Agrupa miles con coma, como la app.
 *
 * @param {number} valor - Entero.
 * @returns {string} Texto.
 */
function miles(valor) {
  const signo = valor < 0 ? '-' : '';
  return `${signo}$ ${String(Math.abs(valor)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
}

/**
 * Recorre los reportes de la Fase 5a sobre la app ya abierta y con sesión.
 *
 * @param {Record<string, (...args: never[]) => unknown> & { errores: string[] }} a - Acciones de la prueba.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @param {((nombre: string) => Promise<void>) | null} captura - Guarda una captura, o `null`.
 * @param {(ms: number) => Promise<void>} dormir - Espera.
 * @param {{ electron: string, raiz: string, carpeta: string }} entorno - Electron, proyecto y carpeta de salida.
 * @returns {Promise<void>} Promesa que se cumple al terminar el recorrido.
 */
export async function recorrerReportes(a, registrar, captura, dormir, entorno) {
  const foto = async (/** @type {string} */ nombre) => captura && (await captura(nombre));

  /**
   * Texto de los indicadores de una ventana.
   *
   * @param {string} ventana - Selector de la ventana.
   * @returns {Promise<string[]>} Etiqueta y valor de cada indicador.
   */
  const indicadores = (ventana) =>
    a.js(
      `[...document.querySelectorAll('${ventana} .indicador')].map(i => i.querySelector('span').textContent + ' = ' + i.querySelector('strong').textContent)`,
    );

  /**
   * Abre la vista previa con Ctrl+P, verifica el título y los botones, y la cierra.
   *
   * @param {string} titulo - Texto que debe traer el documento.
   * @param {string} nombreFoto - Nombre de la captura.
   * @returns {Promise<void>}
   */
  const vistaPrevia = async (titulo, nombreFoto) => {
    await a.tecla('P', { ctrl: true });
    await a.esperar(`!!document.querySelector('.vista-previa iframe')`, 10000);
    await dormir(500);
    await foto(nombreFoto);
    a.verificar(
      `vista previa: ${titulo}`,
      await a.js(
        `document.querySelector('.vista-previa iframe').srcdoc.includes(${JSON.stringify(titulo)})`,
      ),
      true,
    );
    a.verificar(
      'vista previa: botones',
      await a.js(
        `[...document.querySelectorAll('.vista-previa .dialogo__botones button')].map(b => b.textContent)`,
      ),
      ['Imprimir', 'Guardar PDF', 'Cerrar'],
    );
    await a.tecla('Escape');
    await a.esperar(`!document.querySelector('.vista-previa')`);
  };

  // ---------- Inventario valorizado ----------
  const INV = 'section[aria-label="Inventario valorizado"]';
  const filtrosInv = {
    bodegaId: null,
    proveedorCodigo: null,
    texto: '',
    mostrarSinExistencia: false,
    incluirInactivos: false,
  };
  await a.abrir('inventario valorizado', 'Inventario valorizado');
  const inv = await api(a, 'reportes:inventario', filtrosInv);
  await a.esperar(
    `document.querySelectorAll('${INV} tbody tr').length === ${inv.filas.length + 1}`,
  );
  await foto('50-inventario');
  a.verificar(
    'inventario: valor total en pantalla',
    (await indicadores(INV)).includes(
      `Valor total del inventario = ${miles(inv.resumen.valorTotal)}`,
    ),
    true,
  );
  a.verificar(
    'inventario: una columna por bodega',
    await a.js(`document.querySelectorAll('${INV} thead th').length`),
    7 + inv.bodegas.length,
  );
  a.verificar(
    'inventario: los datos de ejemplo traen negativos',
    inv.resumen.productosNegativos,
    2,
  );
  a.verificar(
    'inventario: existencias negativas en rojo',
    await a.js(
      `[...document.querySelectorAll('${INV} tbody tr')].filter(f => [...f.cells].some(c => c.classList.contains('negativo'))).map(f => f.cells[0].textContent).sort()`,
    ),
    ['104', '304'],
  );
  registrar(
    `Inventario: ${inv.filas.length} productos, ${inv.resumen.productosNegativos} con negativos.`,
  );

  const conSin = await api(a, 'reportes:inventario', { ...filtrosInv, mostrarSinExistencia: true });
  await a.js(
    `[...document.querySelectorAll('${INV} .casilla')].find(c => c.textContent.includes('sin existencia')).querySelector('input').click()`,
  );
  await a.esperar(
    `document.querySelectorAll('${INV} tbody tr').length === ${conSin.filas.length + 1}`,
  );
  a.verificar(
    'inventario: «Mostrar productos sin existencia»',
    conSin.filas.length >= inv.filas.length,
    true,
  );

  await a.js(`document.querySelector('${INV} .tabla-contenedor').focus()`);
  const primera = await a.js(
    `document.querySelector('${INV} tr.fila--seleccionada td').textContent`,
  );
  await a.tecla('ArrowDown');
  const segunda = await a.js(
    `document.querySelector('${INV} tr.fila--seleccionada td').textContent`,
  );
  a.verificar('inventario: flecha abajo cambia de fila', primera !== segunda, true);

  await vistaPrevia('INVENTARIO VALORIZADO', '51-inventario-vista-previa');

  // PDF con las mismas opciones de la app: el pie lleva «Página N de M».
  mkdirSync(entorno.carpeta, { recursive: true });
  const htmlInventario = await api(a, 'reportes:html', {
    reporte: 'inventario',
    filtros: { ...filtrosInv, mostrarSinExistencia: true },
  });
  const rutaHtml = join(entorno.carpeta, 'inventario.html');
  const rutaPdf = join(entorno.carpeta, 'inventario.pdf');
  writeFileSync(rutaHtml, htmlInventario);
  const pdf = spawnSync(entorno.electron, ['tests/e2e/pdf-reporte.mjs', rutaHtml, rutaPdf], {
    cwd: entorno.raiz,
    encoding: 'utf8',
  });
  a.verificar('inventario: PDF generado', pdf.status, 0);
  registrar(`PDF del inventario: ${rutaPdf}`);

  // ---------- Cuentas por cobrar ----------
  const CXC = 'section[aria-label="Cuentas por cobrar"]';
  const filtrosCxc = {
    tipo: 'cliente',
    terceroCodigo: null,
    soloVencidas: false,
    incluirSoloFavor: true,
  };
  await a.abrir('cuentas por cobrar', 'Cuentas por cobrar');
  const cxc = await api(a, 'reportes:cartera', filtrosCxc);
  const documentosCxc = cxc.resumen.documentosVencidos + cxc.resumen.documentosPorVencer;
  await a.esperar(
    `document.querySelectorAll('${CXC} tbody tr:not(.fila-grupo):not(.subtotal):not(.total)').length === ${documentosCxc}`,
  );
  await foto('52-cuentas-por-cobrar');
  a.verificar(
    'CxC: columna «Devuelto / corregido»',
    await a.js(
      `[...document.querySelectorAll('${CXC} thead th')].map(t => t.textContent).includes('Devuelto / corregido')`,
    ),
    true,
  );
  a.verificar(
    'CxC: saldos iniciales con su etiqueta',
    await a.js(
      `[...document.querySelectorAll('${CXC} tbody td')].filter(c => c.textContent.startsWith('Saldo inicial')).length`,
    ),
    2,
  );
  a.verificar(
    'CxC: conteo de facturas en la barra',
    await a.js(
      `document.querySelector('${CXC} .barra-herramientas__resumen').textContent.includes('${documentosCxc} facturas')`,
    ),
    true,
  );
  a.verificar(
    'CxC: grupos en el orden del proceso principal',
    await a.js(
      `[...document.querySelectorAll('${CXC} tr.fila-grupo')].map(f => Number(f.textContent.split(' - ')[0]))`,
    ),
    cxc.grupos.map((/** @type {{ tercero: { codigo: number } }} */ g) => g.tercero.codigo),
  );
  const vencimientos = cxc.grupos
    .filter((/** @type {{ documentos: unknown[] }} */ g) => g.documentos.length > 0)
    .map((/** @type {{ documentos: { vence: string }[] }} */ g) => g.documentos[0].vence);
  a.verificar('CxC: primero el vencimiento más antiguo', vencimientos, [...vencimientos].sort());
  a.verificar(
    'CxC: indicador de vencidas',
    (await indicadores(CXC)).includes(
      `Vencido (${cxc.resumen.documentosVencidos} facturas) = ${miles(cxc.resumen.vencido)}`,
    ),
    true,
  );

  const vencidas = await api(a, 'reportes:cartera', { ...filtrosCxc, soloVencidas: true });
  await a.js(
    `[...document.querySelectorAll('${CXC} .segmentado button')].find(b => b.textContent === 'Solo vencidas').click()`,
  );
  await a.esperar(
    `document.querySelectorAll('${CXC} tbody tr:not(.fila-grupo):not(.subtotal):not(.total):not(:has(.tabla__vacia))').length === ${vencidas.resumen.documentosVencidos}`,
  );
  await foto('53-cuentas-por-cobrar-vencidas');
  a.verificar(
    'CxC: «Solo vencidas» no deja por vencer',
    await a.js(
      `document.querySelectorAll('${CXC} tbody tr:not(.fila-grupo):not(.subtotal):not(.total):not(.vencida):not(:has(.tabla__vacia))').length`,
    ),
    0,
  );

  await a.tecla('F5');
  await dormir(300);
  a.verificar(
    'CxC: F5 recalcula sin errores',
    await a.js(`!document.querySelector('${CXC} .aviso--error')`),
    true,
  );
  await vistaPrevia('CUENTAS POR COBRAR', '54-cuentas-por-cobrar-vista-previa');

  // ---------- Cuentas por pagar ----------
  const CXP = 'section[aria-label="Cuentas por pagar"]';
  await a.abrir('cuentas por pagar', 'Cuentas por pagar');
  const cxp = await api(a, 'reportes:cartera', { ...filtrosCxc, tipo: 'proveedor' });
  await a.esperar(
    `document.querySelectorAll('${CXP} tr.fila-grupo').length === ${cxp.grupos.length}`,
  );
  await foto('55-cuentas-por-pagar');
  a.verificar(
    'CxP: saldos iniciales con su etiqueta',
    await a.js(
      `[...document.querySelectorAll('${CXP} tbody td')].filter(c => c.textContent.startsWith('Saldo inicial')).length`,
    ),
    2,
  );
  a.verificar(
    'CxP: total por pagar en pantalla',
    (await indicadores(CXP)).includes(`Total por pagar = ${miles(cxp.resumen.total)}`),
    true,
  );
  a.verificar(
    'CxP: columna «Factura del proveedor»',
    await a.js(
      `[...document.querySelectorAll('${CXP} thead th')].map(t => t.textContent).includes('Factura del proveedor')`,
    ),
    true,
  );
  await vistaPrevia('CUENTAS POR PAGAR', '56-cuentas-por-pagar-vista-previa');

  /**
   * Cambia el valor de un campo o lista como lo haría el usuario (React
   * escucha `input` en los campos y `change` en las listas).
   *
   * @param {string} selector - Selector del elemento.
   * @param {string} valor - Valor nuevo.
   * @returns {Promise<void>}
   */
  const fijarValor = async (selector, valor) => {
    await a.js(`(() => {
      const e = document.querySelector(${JSON.stringify(selector)});
      const proto = e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${JSON.stringify(valor)});
      e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
    })()`);
    await dormir(400);
  };

  /**
   * Abre con Ctrl+D el documento de la fila y verifica que sea el esperado y solo para ver.
   *
   * @param {string} esperado - Texto que debe traer el documento.
   * @param {string} nombre - Nombre de la verificación y de la captura.
   * @returns {Promise<void>}
   */
  const verDocumento = async (esperado, nombre) => {
    await a.tecla('D', { ctrl: true });
    await a.esperar(`!!document.querySelector('.vista-previa iframe')`, 10000);
    await dormir(500);
    await foto(nombre);
    a.verificar(
      `${nombre}: Ctrl+D abre el documento`,
      await a.js(
        `document.querySelector('.vista-previa iframe').srcdoc.includes(${JSON.stringify(esperado)})`,
      ),
      true,
    );
    a.verificar(
      `${nombre}: solo para ver`,
      await a.js(
        `[...document.querySelectorAll('.vista-previa .dialogo__botones button')].map(b => b.textContent)`,
      ),
      ['Cerrar'],
    );
    await a.tecla('Escape');
    await a.esperar(`!document.querySelector('.vista-previa')`);
  };

  /**
   * Convierte `dd/mm/aaaa` en `AAAA-MM-DD`.
   *
   * @param {string} texto - Fecha en pantalla.
   * @returns {string} Fecha ISO.
   */
  const iso = (texto) => texto.split('/').reverse().join('-');

  // ---------- Kardex ----------
  const KAR = 'section[aria-label="Kardex"]';
  await a.abrir('kardex', 'Kardex');
  await a.js(`document.querySelector('${KAR} .producto-kardex input').focus()`);
  await a.send('Input.insertText', { text: '231' });
  await a.tecla('Enter');
  const [desdeKar, hastaKar] = await a.js(
    `[...document.querySelectorAll('${KAR} .fecha input')].map(i => i.value)`,
  );
  const filtrosKar = {
    productoCodigo: 231,
    bodegaId: 1,
    desde: iso(desdeKar),
    hasta: iso(hastaKar),
  };
  const kar = await api(a, 'reportes:kardex', filtrosKar);
  await a.esperar(
    `document.querySelectorAll('${KAR} tbody tr').length === ${kar.filas.length + 2}`,
  );
  await foto('57-kardex');
  a.verificar(
    'kardex: con «Exportar a Excel»',
    await a.js(
      `[...document.querySelectorAll('${KAR} .barra-herramientas button')].map(b => b.textContent.replace(/Ctrl\\+\\w|F5/, ''))`,
    ),
    ['Imprimir o guardar PDF', 'Ver documento', 'Exportar a Excel', 'Actualizar'],
  );
  a.verificar(
    'kardex: periodo por defecto desde el 1.º del mes anterior',
    desdeKar.startsWith('01/'),
    true,
  );
  a.verificar(
    'kardex: Principal no lleva columna «Bodega»',
    await a.js(`document.querySelectorAll('${KAR} thead th').length`),
    9,
  );
  a.verificar(
    'kardex: fila de saldo anterior',
    await a.js(
      `document.querySelector('${KAR} tbody tr.anterior').textContent.includes('Saldo anterior')`,
    ),
    true,
  );
  a.verificar(
    'kardex: saldo final en pantalla',
    (await indicadores(KAR)).some((i) => i.startsWith('Saldo final en Principal = ')),
    true,
  );
  a.verificar(
    'kardex: corrección con su versión',
    await a.js(
      `[...document.querySelectorAll('${KAR} tbody td')].some(c => c.textContent === 'Compra 6 · FE-5698 · versión 2')`,
    ),
    true,
  );
  await a.js(
    `[...document.querySelectorAll('${KAR} tbody tr')].find(f => f.textContent.includes('Corrección de compra')).click()`,
  );
  await verDocumento('AGRINA S.A.S.', '58-kardex-ver-documento');

  await fijarValor(`${KAR} .reporte__filtros select`, '');
  const karTodas = await api(a, 'reportes:kardex', { ...filtrosKar, bodegaId: null });
  await a.esperar(
    `document.querySelectorAll('${KAR} thead th').length === 10 && document.querySelectorAll('${KAR} tbody tr').length === ${karTodas.filas.length + 2}`,
  );
  a.verificar(
    'kardex: «Todas» agrega la columna «Bodega»',
    await a.js(`[...document.querySelectorAll('${KAR} thead th')].map(t => t.textContent)[5]`),
    'Bodega',
  );
  await foto('59-kardex-todas');
  await vistaPrevia('KARDEX', '60-kardex-vista-previa');
  registrar(
    `Kardex 231: ${kar.filas.length} movimientos en Principal, ${karTodas.filas.length} en todas.`,
  );

  // ---------- Historial de cambios ----------
  const HIS = 'section[aria-label="Historial de cambios"]';
  await a.abrir('historial de cambios', 'Historial de cambios');
  const [desdeHis, hastaHis] = await a.js(
    `[...document.querySelectorAll('${HIS} .fecha input')].map(i => i.value)`,
  );
  a.verificar(
    'historial: periodo por defecto de 7 días',
    (Date.parse(iso(hastaHis)) - Date.parse(iso(desdeHis))) / 86_400_000,
    6,
  );
  await fijarValor(`${HIS} .fecha input`, '01/01/2000');
  const filtrosHis = {
    desde: '2000-01-01',
    hasta: iso(hastaHis),
    tipo: null,
    accion: null,
    texto: '',
  };
  const his = await api(a, 'reportes:historial', filtrosHis);
  await a.esperar(
    `document.querySelectorAll('${HIS} .reporte__tabla tbody tr').length === ${his.registros.length}`,
  );
  await a.js(
    `[...document.querySelectorAll('${HIS} .reporte__tabla tbody tr')].find(f => f.cells[3].textContent === '84762' && f.textContent.includes('Editar')).click()`,
  );
  await a.esperar(
    `document.querySelector('${HIS} .detalle-cambio h3')?.textContent === 'Factura de venta 84762 · Editar'`,
  );
  await foto('61-historial');
  a.verificar(
    'historial: el detalle muestra antes y después',
    await a.js(
      `document.querySelectorAll('${HIS} .detalle-cambio td.antes').length > 0 && document.querySelectorAll('${HIS} .detalle-cambio td.despues').length > 0`,
    ),
    true,
  );
  a.verificar(
    'historial: versión en el detalle',
    await a.js(`document.querySelector('${HIS} .detalle-cambio dl').textContent.includes('1 → 2')`),
    true,
  );
  await verDocumento('84762', '62-historial-ver-documento');

  const selectores = `${HIS} .reporte__filtros select`;
  await a.js(`document.querySelectorAll('${selectores}')[1].setAttribute('data-prueba', 'accion')`);
  await fijarValor(`${selectores}[data-prueba="accion"]`, 'anular');
  const anuladas = await api(a, 'reportes:historial', { ...filtrosHis, accion: 'anular' });
  await a.esperar(
    `document.querySelectorAll('${HIS} .reporte__tabla tbody tr').length === ${anuladas.registros.length}`,
  );
  a.verificar(
    'historial: filtro «Anular»',
    await a.js(
      `[...document.querySelectorAll('${HIS} .reporte__tabla tbody tr')].every(f => f.querySelector('.accion--anular'))`,
    ),
    true,
  );
  await foto('63-historial-anuladas');
  await vistaPrevia('HISTORIAL DE CAMBIOS', '64-historial-vista-previa');
  registrar(
    `Historial: ${his.registros.length} registros, ${anuladas.registros.length} anulaciones.`,
  );

  // ---------- «Ver kardex» desde el inventario valorizado ----------
  await a.abrir('inventario valorizado', 'Inventario valorizado');
  await a.js(
    `[...document.querySelectorAll('${INV} tbody tr')].find(f => f.cells[0].textContent === '104').click()`,
  );
  await a.tecla('D', { ctrl: true });
  await a.esperar(
    `document.querySelector('${KAR} .producto-kardex input')?.value.startsWith('104 - ') && document.querySelector('${KAR} tbody tr.anterior') !== null`,
  );
  await dormir(400);
  await foto('65-inventario-ver-kardex');
  a.verificar(
    'inventario: Ctrl+D abre el kardex del producto en la bodega del filtro (Todas)',
    await a.js(
      `[document.querySelector('${KAR} .reporte__filtros select').value, document.querySelector('.ventana--activa').getAttribute('aria-label')]`,
    ),
    ['', 'Kardex'],
  );
  a.verificar(
    'inventario → kardex: saldo final negativo de la 104',
    (await indicadores(KAR)).some((i) => i.startsWith('Saldo final en todas las bodegas = -3')),
    true,
  );

  await recorrerEstadosCuenta(a, registrar, foto, dormir, entorno, { CXC, iso, fijarValor });
  registrar('Reportes recorridos.');
}

/**
 * Recorre la Fase 5c: «Estado de cuenta» (Ctrl+D) desde las cuentas por
 * cobrar, la vista carta de cliente y de proveedor, y un PDF de varias
 * páginas (encabezado en cada una y «Página N de M»).
 *
 * @param {Record<string, (...args: never[]) => unknown> & { errores: string[] }} a - Acciones de la prueba.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @param {(nombre: string) => Promise<unknown>} foto - Guarda una captura (si se pidieron).
 * @param {(ms: number) => Promise<void>} dormir - Espera.
 * @param {{ electron: string, raiz: string, carpeta: string }} entorno - Electron, proyecto y carpeta de salida.
 * @param {{ CXC: string, iso: (texto: string) => string, fijarValor: (selector: string, valor: string) => Promise<void> }} ayudas - Selector de las cuentas por cobrar y ayudas del recorrido.
 * @returns {Promise<void>} Promesa que se cumple al terminar.
 */
async function recorrerEstadosCuenta(a, registrar, foto, dormir, entorno, ayudas) {
  const { CXC, iso, fijarValor } = ayudas;
  const EC = 'section[aria-label="Estados de cuenta"]';

  /**
   * HTML de la vista carta embebida.
   *
   * @returns {Promise<string>} `srcdoc` del marco, o vacío.
   */
  const vista = () => a.js(`document.querySelector('${EC} .previa-carta iframe')?.srcdoc ?? ''`);

  // «Estado de cuenta» con Ctrl+D desde las cuentas por cobrar.
  await a.abrir('cuentas por cobrar', 'Cuentas por cobrar');
  await a.js(
    `[...document.querySelectorAll('${CXC} .segmentado button')].find(b => b.textContent === 'Todas').click()`,
  );
  await a.esperar(
    `[...document.querySelectorAll('${CXC} tr.fila-grupo')].some(f => f.textContent.includes('JUAN JJ FERTILIA'))`,
  );
  await a.js(
    `[...document.querySelectorAll('${CXC} tr.fila-grupo')].find(f => f.textContent.includes('JUAN JJ FERTILIA')).nextElementSibling.click()`,
  );
  a.verificar(
    'CxC: botón «Estado de cuenta»',
    await a.js(
      `[...document.querySelectorAll('${CXC} .barra-herramientas button')].some(b => b.textContent.startsWith('Estado de cuenta'))`,
    ),
    true,
  );
  await a.tecla('D', { ctrl: true });
  await a.esperar(
    `document.querySelector('.ventana--activa')?.getAttribute('aria-label') === 'Estados de cuenta' && (document.querySelector('${EC} .previa-carta iframe')?.srcdoc ?? '').includes('JUAN JJ FERTILIA')`,
    10000,
  );
  await dormir(500);
  await foto('66-estado-cuenta-cliente');
  const [desde, hasta] = await a.js(
    `[...document.querySelectorAll('${EC} .fecha input')].map(i => i.value)`,
  );
  const tercero = await a.js(
    `document.querySelector('${EC} .reporte__filtros .ancho input').value`,
  );
  a.verificar(
    'estado de cuenta: Ctrl+D trae el cliente de la fila',
    tercero,
    '10001 - JUAN JJ FERTILIA',
  );
  a.verificar(
    'estado de cuenta: periodo por defecto desde el 1.º del mes anterior',
    desde.startsWith('01/'),
    true,
  );
  a.verificar(
    'estado de cuenta: botones',
    await a.js(
      `[...document.querySelectorAll('${EC} .barra-herramientas button')].map(b => b.textContent.replace(/Ctrl\\+\\w|F5/, ''))`,
    ),
    ['Imprimir', 'Guardar PDF', 'Actualizar'],
  );
  a.verificar(
    'estado de cuenta: nombre del archivo con el tercero y la fecha',
    await a.js(`document.querySelector('${EC} .barra-herramientas__resumen').textContent`),
    `Hoja carta · Estado de cuenta JUAN JJ FERTILIA ${hasta.replaceAll('/', '-')}.pdf`,
  );
  const filtrosJuan = {
    tipo: 'cliente',
    terceroCodigo: 10001,
    desde: iso(desde),
    hasta: iso(hasta),
  };
  const juan = await api(a, 'reportes:estadoCuenta', filtrosJuan);
  const html = await vista();
  a.verificar(
    'estado de cuenta: encabezado con el periodo',
    html.includes('ESTADO DE CUENTA') && html.includes(`Periodo ${desde} a ${hasta}`),
    true,
  );
  a.verificar(
    'estado de cuenta: saldo a favor y neto de la maqueta',
    [juan.resumen.pendiente, juan.resumen.saldoFavor, juan.resumen.neto],
    [32_500, 5_500, 27_000],
  );
  a.verificar(
    'estado de cuenta: recuadro final en la hoja',
    html.includes('Neto a pagar') && html.includes(miles(27_000).replace('$ ', '')),
    true,
  );

  // Proveedor: cambiar el tipo limpia el tercero.
  await a.js(
    `[...document.querySelectorAll('${EC} .segmentado button')].find(b => b.textContent === 'Proveedor').click()`,
  );
  await a.esperar(`!document.querySelector('${EC} .previa-carta iframe')`);
  await a.js(`document.querySelector('${EC} .reporte__filtros .ancho input').focus()`);
  await a.send('Input.insertText', { text: '10001' });
  await a.tecla('Enter');
  await a.esperar(
    `(document.querySelector('${EC} .previa-carta iframe')?.srcdoc ?? '').includes('AGRINA S.A.S.')`,
    10000,
  );
  await dormir(500);
  await foto('67-estado-cuenta-proveedor');
  a.verificar(
    'estado de cuenta: proveedor',
    (await vista()).includes('PROVEEDOR') && (await vista()).includes('Compras pendientes al'),
    true,
  );

  // Varias páginas: 80 abonos pequeños a la factura pendiente de Juan.
  const cxc = await api(a, 'reportes:cartera', {
    tipo: 'cliente',
    terceroCodigo: 10001,
    soloVencidas: false,
    incluirSoloFavor: true,
  });
  const factura = cxc.grupos[0].documentos[0];
  for (let i = 0; i < 80; i += 1) {
    await api(a, 'abonos:guardar', {
      tipo: 'cliente',
      terceroCodigo: 10001,
      fecha: iso(hasta),
      formaPagoId: 1,
      valor: 100,
      observacion: '',
      aplicaciones: [{ facturaId: factura.id, valor: 100 }],
    });
  }
  await a.js(
    `[...document.querySelectorAll('${EC} .segmentado button')].find(b => b.textContent === 'Cliente').click()`,
  );
  await a.js(`document.querySelector('${EC} .reporte__filtros .ancho input').focus()`);
  await a.send('Input.insertText', { text: '10001' });
  await a.tecla('Enter');
  await fijarValor(`${EC} .fecha input`, '01/01/2000');
  await a.esperar(
    `((document.querySelector('${EC} .previa-carta iframe')?.srcdoc ?? '').match(/Efectivo · aplicado a/g) ?? []).length >= 80`,
    10000,
  );
  await dormir(500);
  await foto('68-estado-cuenta-largo');
  const largo = await api(a, 'reportes:estadoCuenta', { ...filtrosJuan, desde: '2000-01-01' });
  a.verificar(
    'estado de cuenta largo: el neto baja con los 80 abonos',
    largo.resumen.neto,
    27_000 - 8_000,
  );

  mkdirSync(entorno.carpeta, { recursive: true });
  const rutaHtml = join(entorno.carpeta, 'estado-cuenta.html');
  const rutaPdf = join(entorno.carpeta, 'estado-cuenta.pdf');
  writeFileSync(
    rutaHtml,
    await api(a, 'reportes:html', {
      reporte: 'estado-cuenta',
      filtros: { ...filtrosJuan, desde: '2000-01-01' },
    }),
  );
  const pdf = spawnSync(entorno.electron, ['tests/e2e/pdf-reporte.mjs', rutaHtml, rutaPdf], {
    cwd: entorno.raiz,
    encoding: 'utf8',
  });
  a.verificar('estado de cuenta: PDF generado', pdf.status, 0);
  const paginas = (readFileSync(rutaPdf, 'latin1').match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
  a.verificar('estado de cuenta: el PDF largo tiene varias páginas', paginas >= 2, true);
  registrar(
    `Estado de cuenta de Juan: ${juan.movimientos.length} movimientos; largo ${largo.movimientos.length} en ${paginas} páginas (${rutaPdf}).`,
  );
}
