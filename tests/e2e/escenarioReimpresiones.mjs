/**
 * Escenario de punta a punta de la Fase 4b: la ventana de Reimpresiones sobre
 * los datos de ejemplo (`--datos-demo`) cargados en la carpeta temporal de la
 * corrida. Verifica la lista de los cuatro tipos, que Ctrl+D solo muestra la
 * tirilla con REIMPRESION y la leyenda de anulada o corregida, y que Ctrl+P
 * manda a imprimir (con una impresora inexistente, para no imprimir de verdad).
 */

import { spawnSync } from 'node:child_process';

/** Contraseña de los datos de ejemplo (`CONTRASENA_DEMO`). */
const CLAVE_DEMO = 'demo';

/** Impresora que no existe: Ctrl+P debe responder que no está instalada. */
const IMPRESORA_FALSA = 'IMPRESORA-E2E-INEXISTENTE';

/** Selector de la ventana. */
const VENTANA = 'section[aria-label="Reimpresiones"]';

/**
 * Campos de las respuestas que lee el escenario.
 *
 * @typedef {{ documentos: { id: number, numero: number, anulado: boolean, version: number }[], siguienteNumero: number }} RespuestaApi
 */

/**
 * Carga los datos de ejemplo en la carpeta de la corrida antes de abrir la app.
 *
 * @param {string} electron - Ruta del ejecutable de Electron.
 * @param {string} raiz - Carpeta del proyecto.
 * @param {string} datos - Carpeta de datos temporal.
 * @returns {string} Salida del comando.
 * @throws {Error} Si el comando falla.
 */
export function cargarDatosDemo(electron, raiz, datos) {
  const r = spawnSync(electron, ['.', `--carpeta-datos=${datos}`, '--datos-demo'], {
    cwd: raiz,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`No se cargaron los datos de ejemplo: ${r.stderr || r.stdout}`);
  }
  return r.stdout;
}

/**
 * Ingresa con la contraseña de los datos de ejemplo hasta ver el escritorio.
 *
 * @param {Record<string, (...args: never[]) => unknown>} a - Acciones de la prueba.
 * @returns {Promise<void>} Promesa que se cumple con el escritorio a la vista.
 */
export async function ingresarDemo(a) {
  await a.send('Runtime.enable');
  await a.send('Page.enable');
  await a.send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await a.esperar(`document.querySelectorAll('input[type=password]').length === 1`, 15000);
  await a.js(`document.querySelector('input[type=password]').focus()`);
  await a.send('Input.insertText', { text: CLAVE_DEMO });
  await a.js(`document.querySelector('button[type=submit]').click()`);
  await a.esperar(`!!document.querySelector('.escritorio')`);
}

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
 * Recorre la ventana de Reimpresiones sobre la app ya abierta y con sesión.
 *
 * @param {Record<string, (...args: never[]) => unknown> & { errores: string[] }} a - Acciones de la prueba.
 * @param {(texto: string) => void} registrar - Escribe una línea en el registro.
 * @param {((nombre: string) => Promise<void>) | null} captura - Guarda una captura, o `null`.
 * @param {(ms: number) => Promise<void>} dormir - Espera.
 * @returns {Promise<void>} Promesa que se cumple al terminar el recorrido.
 */
export async function recorrerReimpresiones(a, registrar, captura, dormir) {
  const foto = async (/** @type {string} */ nombre) => captura && (await captura(nombre));
  const filas = `${VENTANA} tbody tr:not(:has(.tabla__vacia))`;

  /**
   * Elige un tipo de documento y espera la lista que devuelve la app.
   *
   * @param {string} nombre - Texto del botón del tipo.
   * @param {string} tipo - Tipo de documento.
   * @returns {Promise<RespuestaApi['documentos']>} Documentos esperados.
   */
  const elegirTipo = async (nombre, tipo) => {
    await a.js(
      `[...document.querySelectorAll('${VENTANA} .segmentado button')].find(b => b.textContent === ${JSON.stringify(nombre)}).click()`,
    );
    const { documentos } = await api(a, 'reimpresiones:buscar', {
      tipo,
      texto: '',
      desde: null,
      hasta: null,
    });
    await a.esperar(`document.querySelectorAll('${filas}').length === ${documentos.length}`);
    await dormir(200);
    a.verificar(`${nombre}: filas en la lista`, documentos.length > 0, true);
    a.verificar(
      `${nombre}: una fila seleccionada y «Ver» habilitado`,
      await a.js(
        `document.querySelectorAll('${VENTANA} tr.fila--seleccionada').length === 1 && ![...document.querySelectorAll('${VENTANA} .barra-herramientas button')][0].disabled`,
      ),
      true,
    );
    return documentos;
  };

  /**
   * Selecciona la fila de un documento, abre la vista con Ctrl+D y devuelve
   * el HTML de la tirilla mostrada.
   *
   * @param {number} numero - Número del documento.
   * @param {string} nombreFoto - Nombre de la captura.
   * @returns {Promise<string>} HTML de la vista previa.
   */
  const ver = async (numero, nombreFoto) => {
    await a.js(
      `[...document.querySelectorAll('${filas}')].find(f => f.cells[0].textContent === '${numero}').click()`,
    );
    await dormir(150);
    await a.tecla('D', { ctrl: true });
    await a.esperar(`!!document.querySelector('.vista-previa--tirilla iframe')`);
    await dormir(400);
    await foto(nombreFoto);
    const html = /** @type {string} */ (
      await a.js(`document.querySelector('.vista-previa--tirilla iframe').srcdoc`)
    );
    a.verificar(
      `vista ${numero}: solo «Cerrar»`,
      await a.js(
        `[...document.querySelectorAll('.vista-previa .dialogo__botones button')].map(b => b.textContent)`,
      ),
      ['Cerrar'],
    );
    await a.tecla('Escape');
    await a.esperar(`!document.querySelector('.vista-previa')`);
    return html;
  };

  await dormir(500);
  await a.js(
    `[...document.querySelectorAll('.barra-iconos__boton')].find(b => b.textContent.includes('Reimpresiones')).click()`,
  );
  await a.esperar(`!!document.querySelector('${VENTANA}')`);
  await dormir(300);
  await a.tecla('O', { ctrl: true, shift: true });
  await a.tecla('M');
  await dormir(300);

  // Facturas de cliente: una anulada y una corregida.
  const ventas = await elegirTipo('Factura de cliente', 'factura-cliente');
  await foto('40-reimpresiones-ventas');
  const anulada = ventas.find((d) => d.anulado);
  const corregida = ventas.find((d) => !d.anulado && d.version > 1);
  if (!anulada || !corregida)
    throw new Error('Los datos de ejemplo no traen venta anulada y corregida.');
  const htmlAnulada = await ver(anulada.numero, '41-venta-anulada');
  a.verificar('venta anulada: REIMPRESION', htmlAnulada.includes('REIMPRESION'), true);
  a.verificar('venta anulada: ANULADA', htmlAnulada.includes('>ANULADA<'), true);
  const htmlCorregida = await ver(corregida.numero, '42-venta-corregida');
  a.verificar('venta corregida: CORREGIDA', htmlCorregida.includes('CORREGIDA'), true);
  a.verificar('venta corregida: recuadro', htmlCorregida.includes('Total anterior'), true);

  // Facturas de proveedor: la corregida y la anulada.
  const compras = await elegirTipo('Factura de proveedor', 'factura-proveedor');
  await foto('43-reimpresiones-compras');
  const compraCorregida = compras.find((d) => !d.anulado && d.version > 1);
  const compraAnulada = compras.find((d) => d.anulado);
  if (!compraCorregida || !compraAnulada) {
    throw new Error('Los datos de ejemplo no traen compra corregida y anulada.');
  }
  const htmlCompra = await ver(compraCorregida.numero, '44-compra-corregida');
  a.verificar('compra: FACTURA DE PROVEEDOR', htmlCompra.includes('FACTURA DE PROVEEDOR'), true);
  a.verificar('compra corregida: CORREGIDA', htmlCompra.includes('CORREGIDA'), true);
  const htmlCompraAnulada = await ver(compraAnulada.numero, '45-compra-anulada');
  a.verificar('compra anulada: ANULADA', htmlCompraAnulada.includes('>ANULADA<'), true);

  // Abonos de cliente (uno anulado) y a proveedor.
  const abonosCliente = await elegirTipo('Abono de cliente', 'abono-cliente');
  const abonoAnulado = abonosCliente.find((d) => d.anulado);
  if (!abonoAnulado) throw new Error('Los datos de ejemplo no traen un abono anulado.');
  const htmlAbono = await ver(abonoAnulado.numero, '46-abono-cliente-anulado');
  a.verificar('abono anulado: ANULADO', htmlAbono.includes('>ANULADO<'), true);
  a.verificar('abono de cliente: RECIBO DE ABONO', htmlAbono.includes('RECIBO DE ABONO'), true);
  const abonosProveedor = await elegirTipo('Abono a proveedor', 'abono-proveedor');
  const htmlAbonoProveedor = await ver(abonosProveedor[0].numero, '47-abono-proveedor');
  a.verificar(
    'abono a proveedor: título y REIMPRESION',
    htmlAbonoProveedor.includes('ABONO A PROVEEDOR') && htmlAbonoProveedor.includes('REIMPRESION'),
    true,
  );

  // Búsqueda por número.
  await elegirTipo('Factura de cliente', 'factura-cliente');
  await a.js(`document.querySelector('${VENTANA} input[aria-label="Buscar documento"]').focus()`);
  await a.send('Input.insertText', { text: String(corregida.numero) });
  await a.esperar(
    `[...document.querySelectorAll('${filas}')].every(f => f.cells[0].textContent === '${corregida.numero}')`,
  );
  await foto('48-busqueda');
  a.verificar('búsqueda por número', await a.js(`document.querySelectorAll('${filas}').length`), 1);

  // Ctrl+P: con una impresora que no existe, la app lo dice y no imprime nada.
  const config = await api(a, 'facturacion:configuracion', undefined);
  await api(a, 'facturacion:configurar', {
    siguienteNumero: config.siguienteNumero,
    impresora: IMPRESORA_FALSA,
  });
  await a.tecla('P', { ctrl: true });
  await a.esperar(`!!document.querySelector('${VENTANA} .aviso--error')`, 10000);
  await foto('49-imprimir-sin-impresora');
  a.verificar(
    'Ctrl+P manda a la impresora configurada',
    await a.js(
      `document.querySelector('${VENTANA} .aviso--error').textContent.includes('no está instalada')`,
    ),
    true,
  );
  registrar('Reimpresiones recorridas.');
}
