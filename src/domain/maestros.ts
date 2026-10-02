import type { UnidadMedida } from '../shared/formato/cantidades';
import {
  TIPOS_IDENTIFICACION,
  TIPOS_PERSONA,
  type ClaseTercero,
  type DatosCatalogo,
  type DatosNegocio,
  type DatosProducto,
  type DatosTercero,
  type PreciosProducto,
  type TipoCatalogo,
  type TipoIdentificacion,
} from '../shared/maestros';
import { ErrorDeNegocio } from './errores';
import { limpiarTexto } from './texto';

/**
 * Largo máximo de nombres (productos, terceros, negocio).
 */
export const LARGO_MAXIMO_NOMBRE = 120;

/**
 * Largo máximo de los demás textos (dirección, barrio, motivo…).
 */
export const LARGO_MAXIMO_TEXTO = 150;

/**
 * Unidades de medida válidas.
 */
const UNIDADES: readonly UnidadMedida[] = ['UND', 'KG'];

/**
 * Lanza un error de validación.
 *
 * @param mensaje - Mensaje en español.
 * @throws {ErrorDeNegocio} Siempre.
 */
function invalido(mensaje: string): never {
  throw new ErrorDeNegocio('VALIDACION', mensaje);
}

/**
 * Limpia un texto obligatorio y verifica su largo.
 *
 * @param valor - Texto recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @param maximo - Largo máximo.
 * @returns Texto limpio.
 * @throws {ErrorDeNegocio} Si queda vacío o es muy largo.
 */
function textoObligatorio(valor: string, campo: string, maximo = LARGO_MAXIMO_TEXTO): string {
  const limpio = limpiarTexto(valor);
  if (limpio === '') {
    invalido(`El campo «${campo}» es obligatorio.`);
  }
  if (limpio.length > maximo) {
    invalido(`El campo «${campo}» admite máximo ${maximo} caracteres.`);
  }
  return limpio;
}

/**
 * Limpia un texto opcional y verifica su largo.
 *
 * @param valor - Texto recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @returns Texto limpio (puede ser vacío).
 * @throws {ErrorDeNegocio} Si es muy largo.
 */
function textoOpcional(valor: string, campo: string): string {
  const limpio = limpiarTexto(valor);
  if (limpio.length > LARGO_MAXIMO_TEXTO) {
    invalido(`El campo «${campo}» admite máximo ${LARGO_MAXIMO_TEXTO} caracteres.`);
  }
  return limpio;
}

/**
 * Verifica un valor en pesos enteros no negativo.
 *
 * @param valor - Valor recibido.
 * @param campo - Nombre del campo para el mensaje.
 * @returns El mismo valor.
 * @throws {ErrorDeNegocio} Si no es un entero mayor o igual a cero.
 */
export function validarPesos(valor: number, campo: string): number {
  if (!Number.isSafeInteger(valor) || valor < 0) {
    invalido(`«${campo}» debe ser un valor en pesos enteros, sin decimales ni signo negativo.`);
  }
  return valor;
}

/**
 * Verifica un código de maestro (producto, cliente o proveedor).
 *
 * @param codigo - Código recibido.
 * @returns El mismo código.
 * @throws {ErrorDeNegocio} Si no es un entero positivo.
 */
export function validarCodigo(codigo: number): number {
  if (!Number.isSafeInteger(codigo) || codigo <= 0) {
    invalido('El código debe ser un número entero mayor que cero.');
  }
  return codigo;
}

/**
 * Valida y limpia los datos editables de un producto (§5.1).
 *
 * Un precio por debajo del costo **no** es error: se permite guardar con
 * aviso (D-34); el bloqueo ocurre al facturar (Fase 3).
 *
 * @param datos - Datos recibidos.
 * @returns Datos limpios.
 * @throws {ErrorDeNegocio} Si falta el nombre o el proveedor, la unidad no es válida o un precio no es entero.
 */
export function validarDatosProducto(datos: DatosProducto): DatosProducto {
  const nombre = textoObligatorio(datos.nombre, 'Nombre', LARGO_MAXIMO_NOMBRE);
  if (!Number.isSafeInteger(datos.proveedorCodigo) || datos.proveedorCodigo <= 0) {
    invalido('Elija el proveedor del producto.');
  }
  if (!UNIDADES.includes(datos.unidad)) {
    invalido('La unidad de medida debe ser UND o KG.');
  }
  const precios: PreciosProducto = {
    mayor: validarPesos(datos.precios.mayor, 'Precio mayor'),
    menor: validarPesos(datos.precios.menor, 'Precio menor'),
    minimo: validarPesos(datos.precios.minimo, 'Precio mínimo'),
  };
  return { nombre, proveedorCodigo: datos.proveedorCodigo, unidad: datos.unidad, precios };
}

/**
 * Valida el motivo de una corrección (obligatorio, D-35).
 *
 * @param motivo - Motivo escrito.
 * @returns Motivo limpio.
 * @throws {ErrorDeNegocio} Si está vacío o es muy largo.
 */
export function validarMotivo(motivo: string): string {
  return textoObligatorio(motivo, 'Motivo');
}

/**
 * Deja el número de identificación como se guarda: sin espacios ni puntos y
 * en mayúsculas, y verifica sus caracteres según el tipo.
 *
 * - CC: solo dígitos.
 * - NIT: dígitos, opcionalmente con el dígito de verificación tras un guion (`900123456-7`).
 * - CE y Pasaporte: letras y dígitos.
 *
 * @param tipo - Tipo de identificación.
 * @param numero - Número escrito.
 * @returns Número normalizado.
 * @throws {ErrorDeNegocio} Si está vacío o tiene caracteres no válidos para el tipo.
 *
 * @example
 * normalizarIdentificacion('CC', '1.234.567');      // '1234567'
 * normalizarIdentificacion('NIT', '900.123.456-7'); // '900123456-7'
 */
export function normalizarIdentificacion(tipo: TipoIdentificacion, numero: string): string {
  const limpio = numero.replace(/[\s.]/g, '').toUpperCase();
  if (limpio === '') {
    invalido('El campo «Número de identificación» es obligatorio.');
  }
  if (limpio.length > 20) {
    invalido('El número de identificación admite máximo 20 caracteres.');
  }
  const patrones: Record<TipoIdentificacion, RegExp> = {
    CC: /^\d+$/,
    NIT: /^\d+(-\d)?$/,
    CE: /^[A-Z0-9]+$/,
    PASAPORTE: /^[A-Z0-9]+$/,
  };
  if (!patrones[tipo].test(limpio)) {
    const ayuda: Record<TipoIdentificacion, string> = {
      CC: 'solo dígitos',
      NIT: 'dígitos y, si aplica, el dígito de verificación tras un guion (900123456-7)',
      CE: 'solo letras y dígitos',
      PASAPORTE: 'solo letras y dígitos',
    };
    invalido(`El número de identificación no es válido: use ${ayuda[tipo]}.`);
  }
  return limpio;
}

/**
 * Clave única de una identificación (tipo + número), para detectar
 * duplicados (D-29).
 *
 * @param tipo - Tipo de identificación.
 * @param numero - Número ya normalizado.
 * @returns Clave como `CC|1234567`.
 */
export function claveIdentificacion(tipo: TipoIdentificacion, numero: string): string {
  return `${tipo}|${numero}`;
}

/**
 * Valida y limpia los datos de un cliente o proveedor (§5.2, §5.3).
 *
 * @param datos - Datos recibidos.
 * @param clase - Cliente o proveedor (el tope de crédito solo aplica a clientes).
 * @returns Datos limpios; a los proveedores se les quita el tope de crédito.
 * @throws {ErrorDeNegocio} Si falta un dato obligatorio o alguno no es válido.
 */
export function validarDatosTercero(datos: DatosTercero, clase: ClaseTercero): DatosTercero {
  if (!TIPOS_PERSONA.some((t) => t.valor === datos.tipoPersona)) {
    invalido('Elija el tipo de persona.');
  }
  if (!TIPOS_IDENTIFICACION.some((t) => t.valor === datos.tipoIdentificacion)) {
    invalido('Elija el tipo de identificación.');
  }
  const nombre = textoObligatorio(
    datos.nombre,
    datos.tipoPersona === 'juridica' ? 'Razón social' : 'Nombre completo',
    LARGO_MAXIMO_NOMBRE,
  );
  const numeroIdentificacion = normalizarIdentificacion(
    datos.tipoIdentificacion,
    datos.numeroIdentificacion,
  );
  const celular = textoObligatorio(datos.celular, 'Celular', 30);
  if (!/^[\d +()-]+$/.test(celular)) {
    invalido('El celular solo puede tener dígitos, espacios, paréntesis, «+» y «-».');
  }
  const direccion = textoObligatorio(datos.direccion, 'Dirección');
  let topeCredito: number | null = null;
  if (clase === 'cliente' && datos.topeCredito !== null) {
    if (!Number.isSafeInteger(datos.topeCredito) || datos.topeCredito <= 0) {
      invalido('El tope de crédito debe ser un valor en pesos mayor que cero, o quedar vacío.');
    }
    topeCredito = datos.topeCredito;
  }
  return {
    tipoPersona: datos.tipoPersona,
    nombre,
    tipoIdentificacion: datos.tipoIdentificacion,
    numeroIdentificacion,
    celular,
    direccion,
    barrio: textoOpcional(datos.barrio, 'Barrio'),
    ciudad: textoOpcional(datos.ciudad, 'Ciudad'),
    topeCredito,
  };
}

/**
 * Valida los datos de una bodega o forma de pago.
 *
 * @param datos - Datos recibidos.
 * @param tipo - Catálogo (las bodegas no calculan cambio).
 * @returns Datos limpios.
 * @throws {ErrorDeNegocio} Si falta el nombre o es muy largo.
 */
export function validarDatosCatalogo(datos: DatosCatalogo, tipo: TipoCatalogo): DatosCatalogo {
  return {
    nombre: textoObligatorio(datos.nombre, 'Nombre', 60),
    calculaCambio: tipo === 'forma-pago' && datos.calculaCambio,
  };
}

/**
 * Valida los datos del negocio (D-12). Nombre, NIT y régimen son
 * obligatorios porque encabezan la factura; dirección y teléfono pueden
 * quedar vacíos (la factura actual imprime «TEL:» sin número).
 *
 * @param datos - Datos recibidos.
 * @returns Datos limpios.
 * @throws {ErrorDeNegocio} Si falta un dato obligatorio o alguno es muy largo.
 */
export function validarDatosNegocio(datos: DatosNegocio): DatosNegocio {
  return {
    nombre: textoObligatorio(datos.nombre, 'Nombre del negocio', LARGO_MAXIMO_NOMBRE),
    nit: textoObligatorio(datos.nit, 'NIT', 20),
    regimen: textoObligatorio(datos.regimen, 'Régimen', 60),
    direccion: textoOpcional(datos.direccion, 'Dirección'),
    telefono: textoOpcional(datos.telefono, 'Teléfono'),
  };
}

/**
 * Calcula el siguiente valor de un consecutivo después de usar un código.
 * Mantiene la regla de que el consecutivo siempre es mayor que cualquier
 * código existente, aunque el usuario elija o importe códigos (D-25).
 *
 * @param siguienteActual - Valor actual del consecutivo.
 * @param codigoUsado - Código que se acaba de guardar.
 * @returns Nuevo valor del consecutivo.
 *
 * @example
 * siguienteConsecutivo(101, 105); // 106 (se eligió un código adelante)
 * siguienteConsecutivo(110, 105); // 110 (el código ya estaba por detrás)
 */
export function siguienteConsecutivo(siguienteActual: number, codigoUsado: number): number {
  return Math.max(siguienteActual, codigoUsado + 1);
}
