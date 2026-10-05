/**
 * Escenario de punta a punta de la Fase 5a: inventario valorizado, cuentas
 * por cobrar y cuentas por pagar sobre los datos de ejemplo. Verifica que la
 * pantalla muestre lo que calcula el proceso principal, los filtros, el orden
 * de los grupos, las flechas, la vista previa carta (Ctrl+P) y el PDF con el
 * número de página. Excel (Ctrl+E) abre el diálogo de guardar de Windows y
 * se prueba en la integración.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
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
  registrar('Reportes recorridos.');
}
