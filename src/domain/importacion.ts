import { comasDeMilesValidas, leerCantidad, type UnidadMedida } from '../shared/formato/cantidades';
import type {
  CampoImportacion,
  ErrorFila,
  FilaImportacion,
  TipoImportacion,
} from '../shared/importacion';
import type {
  DatosProductoNuevo,
  DatosTerceroNuevo,
  TipoIdentificacion,
  TipoPersona,
} from '../shared/maestros';
import { esErrorDeNegocio } from './errores';
import { claveIdentificacion, validarDatosProducto, validarDatosTercero } from './maestros';
import { claveComparacion } from './texto';

/**
 * Lo que ya existe en la base y se necesita para validar un archivo.
 */
export interface ContextoImportacion {
  /** Códigos ya usados del tipo que se importa (productos, clientes o proveedores). */
  codigosExistentes: ReadonlySet<number>;
  /** Identificaciones ya registradas del tipo que se importa (`CC|123`). */
  identificacionesExistentes: ReadonlySet<string>;
  /** Códigos de proveedores existentes (para los productos). */
  proveedores: ReadonlySet<number>;
  /** Productos existentes con su unidad y costo (para el stock inicial). */
  productos: ReadonlyMap<number, { unidad: UnidadMedida; costo: number }>;
  /** Bodegas activas: nombre normalizado → id. */
  bodegas: ReadonlyMap<string, number>;
  /** Id de la bodega Principal (se usa si la fila no indica bodega). */
  bodegaPrincipalId: number;
  /** Productos que ya tienen stock inicial en una bodega (`codigo|bodegaId`, D-39). */
  stockInicialExistente: ReadonlySet<string>;
}

/**
 * Registro válido listo para guardar.
 */
export type RegistroImportable =
  | { tipo: 'productos'; fila: number; datos: DatosProductoNuevo }
  | { tipo: 'clientes' | 'proveedores'; fila: number; datos: DatosTerceroNuevo }
  | {
      tipo: 'stock';
      fila: number;
      productoCodigo: number;
      bodegaId: number;
      /** Cantidad en milésimas (puede ser negativa; cero no genera movimiento). */
      cantidad: number;
      /** Costo actual del producto, que acompaña al movimiento en el kardex. */
      costoUnitario: number;
    };

/**
 * Resultado de validar las filas de un archivo.
 */
export interface ResultadoValidacionFilas {
  /** Filas leídas. */
  total: number;
  /** Registros sin errores. */
  registros: RegistroImportable[];
  /** Errores (puede haber varios por fila). */
  errores: ErrorFila[];
}

/**
 * Propone qué columna del archivo corresponde a cada campo, comparando el
 * encabezado (sin tildes ni mayúsculas) con los sinónimos del campo. Cada
 * columna se propone una sola vez; el usuario puede cambiar la asignación.
 *
 * @param encabezados - Encabezados del archivo (primera fila).
 * @param campos - Campos del tipo de importación.
 * @returns Campo → índice de columna, o `null` si no hubo coincidencia.
 *
 * @example
 * sugerirMapeo(['Cód.', 'Descripción', 'Costo'], CAMPOS_IMPORTACION.productos);
 * // { codigo: null, nombre: 1, costo: 2, … }  («Cód.» no coincide exactamente)
 */
export function sugerirMapeo(
  encabezados: readonly string[],
  campos: readonly CampoImportacion[],
): Record<string, number | null> {
  const normalizados = encabezados.map((e) =>
    claveComparacion(e)
      .replace(/[._:#]/g, '')
      .trim(),
  );
  const usadas = new Set<number>();
  const mapeo: Record<string, number | null> = {};
  for (const campo of campos) {
    const indice = normalizados.findIndex(
      (encabezado, i) => !usadas.has(i) && campo.sinonimos.includes(encabezado),
    );
    mapeo[campo.clave] = indice >= 0 ? indice : null;
    if (indice >= 0) {
      usadas.add(indice);
    }
  }
  return mapeo;
}

/**
 * Lee un valor en pesos escrito en un archivo. Acepta `13200`, `13,200`,
 * `$ 13,200` y `13200.00`; rechaza centavos distintos de cero porque el
 * dinero se guarda en pesos enteros (§3). La coma es separador de miles (D-02).
 *
 * @param texto - Texto de la celda.
 * @returns Pesos enteros, o `null` si no es un valor válido.
 *
 * @example
 * leerPesos('$ 13,200');  // 13200
 * leerPesos('13200.00');  // 13200
 * leerPesos('13200.50');  // null
 * leerPesos('15.000');    // null (ambiguo: ¿quince mil o quince?)
 */
export function leerPesos(texto: string): number | null {
  const sinSimbolos = texto.replace(/[$\s]/g, '');
  if (!comasDeMilesValidas(sinSimbolos)) {
    return null;
  }
  const coincidencia = /^(\d+)(?:\.(\d+))?$/.exec(sinSimbolos.replace(/,/g, ''));
  if (!coincidencia) {
    return null;
  }
  const [, enteros = '', decimales = ''] = coincidencia;
  // «15.000» puede ser quince mil (punto de miles) o quince pesos: se rechaza
  // en lugar de adivinar y guardar un valor mil veces menor (D-40).
  if (decimales.length === 3 && !texto.includes(',')) {
    return null;
  }
  if (decimales !== '' && Number(decimales) !== 0) {
    return null;
  }
  const valor = Number(enteros);
  return Number.isSafeInteger(valor) ? valor : null;
}

/**
 * Lee un código entero escrito en un archivo (`101` o `101.0`, como lo
 * exportan algunas hojas de cálculo).
 *
 * @param texto - Texto de la celda.
 * @returns El código, o `null` si no es un entero positivo.
 */
export function leerCodigo(texto: string): number | null {
  const coincidencia = /^(\d+)(?:\.0+)?$/.exec(texto.trim());
  if (!coincidencia) {
    return null;
  }
  const valor = Number(coincidencia[1]);
  return Number.isSafeInteger(valor) && valor > 0 ? valor : null;
}

/**
 * Formas aceptadas de escribir cada unidad de medida.
 */
const UNIDADES_ESCRITAS: Readonly<Record<string, UnidadMedida>> = {
  und: 'UND',
  un: 'UND',
  u: 'UND',
  unid: 'UND',
  unidad: 'UND',
  unidades: 'UND',
  kg: 'KG',
  kgs: 'KG',
  kilo: 'KG',
  kilos: 'KG',
  kilogramo: 'KG',
  kilogramos: 'KG',
};

/**
 * Lee la unidad de medida (UND/KG y sus variantes comunes).
 *
 * @param texto - Texto de la celda.
 * @returns La unidad, o `null` si no se reconoce.
 */
export function leerUnidad(texto: string): UnidadMedida | null {
  return UNIDADES_ESCRITAS[claveComparacion(texto).replace(/\./g, '')] ?? null;
}

/**
 * Formas aceptadas de escribir cada tipo de identificación.
 */
const IDENTIFICACIONES_ESCRITAS: Readonly<Record<string, TipoIdentificacion>> = {
  cc: 'CC',
  cedula: 'CC',
  'cedula de ciudadania': 'CC',
  nit: 'NIT',
  ce: 'CE',
  'cedula de extranjeria': 'CE',
  pasaporte: 'PASAPORTE',
  pa: 'PASAPORTE',
  pp: 'PASAPORTE',
};

/**
 * Lee el tipo de identificación (CC, NIT, CE, Pasaporte y variantes).
 *
 * @param texto - Texto de la celda.
 * @returns El tipo, o `null` si no se reconoce.
 */
export function leerTipoIdentificacion(texto: string): TipoIdentificacion | null {
  return IDENTIFICACIONES_ESCRITAS[claveComparacion(texto).replace(/\./g, '')] ?? null;
}

/**
 * Formas aceptadas de escribir cada tipo de persona.
 */
const PERSONAS_ESCRITAS: Readonly<Record<string, TipoPersona>> = {
  natural: 'natural',
  n: 'natural',
  'persona natural': 'natural',
  juridica: 'juridica',
  j: 'juridica',
  'persona juridica': 'juridica',
  empresa: 'juridica',
};

/**
 * Lee el tipo de persona. Si la celda está vacía se deduce del documento:
 * NIT → jurídica; cualquier otro → natural.
 *
 * @param texto - Texto de la celda (puede ser vacío).
 * @param tipoIdentificacion - Tipo de identificación ya leído.
 * @returns El tipo, o `null` si el texto no se reconoce.
 */
export function leerTipoPersona(
  texto: string,
  tipoIdentificacion: TipoIdentificacion | null,
): TipoPersona | null {
  if (texto.trim() === '') {
    return tipoIdentificacion === 'NIT' ? 'juridica' : 'natural';
  }
  return PERSONAS_ESCRITAS[claveComparacion(texto)] ?? null;
}

/**
 * Acumula los errores de una fila mientras se lee.
 */
class ErroresDeFila {
  /** Errores encontrados. */
  readonly lista: ErrorFila[] = [];

  /**
   * Crea el acumulador.
   *
   * @param fila - Número de fila en el archivo.
   */
  constructor(private readonly fila: number) {}

  /**
   * Agrega un error.
   *
   * @param campo - Campo con el problema, o `null` si es de la fila.
   * @param mensaje - Mensaje en español.
   */
  agregar(campo: string | null, mensaje: string): void {
    this.lista.push({ fila: this.fila, campo, mensaje });
  }

  /**
   * Ejecuta una validación del dominio y convierte su error en error de la fila.
   *
   * @param validar - Validación que puede lanzar `ErrorDeNegocio`.
   * @returns El resultado, o `null` si falló.
   * @throws {Error} Si el error no es de negocio (error técnico).
   */
  intentar<T>(validar: () => T): T | null {
    try {
      return validar();
    } catch (error) {
      if (esErrorDeNegocio(error)) {
        this.agregar(null, error.message);
        return null;
      }
      throw error;
    }
  }

  /** Si la fila no tiene errores. */
  get vacia(): boolean {
    return this.lista.length === 0;
  }
}

/**
 * Valor de un campo de la fila (vacío si no se asignó columna).
 *
 * @param fila - Fila del archivo.
 * @param campo - Clave del campo.
 * @returns Texto sin espacios en los extremos.
 */
function valor(fila: FilaImportacion, campo: string): string {
  return (fila.valores[campo] ?? '').trim();
}

/**
 * Lee un código opcional de la fila y verifica que no exista ni esté repetido.
 *
 * @param fila - Fila del archivo.
 * @param errores - Acumulador de la fila.
 * @param contexto - Datos existentes.
 * @param vistos - Códigos ya vistos en el archivo → fila donde aparecieron.
 * @returns El código, `null` si la celda está vacía (se usará el consecutivo) o `undefined` si es inválido.
 */
function leerCodigoOpcional(
  fila: FilaImportacion,
  errores: ErroresDeFila,
  contexto: ContextoImportacion,
  vistos: Map<number, number>,
): number | null | undefined {
  const texto = valor(fila, 'codigo');
  if (texto === '') {
    return null;
  }
  const codigo = leerCodigo(texto);
  if (codigo === null) {
    errores.agregar('codigo', `El código «${texto}» no es un número entero positivo.`);
    return undefined;
  }
  if (contexto.codigosExistentes.has(codigo)) {
    errores.agregar('codigo', `El código ${codigo} ya existe en el sistema.`);
    return undefined;
  }
  const repetido = vistos.get(codigo);
  if (repetido !== undefined) {
    errores.agregar(
      'codigo',
      `El código ${codigo} está repetido (ya aparece en la fila ${repetido}).`,
    );
    return undefined;
  }
  vistos.set(codigo, fila.numero);
  return codigo;
}

/**
 * Lee un valor en pesos obligatorio.
 *
 * @param fila - Fila del archivo.
 * @param campo - Clave del campo.
 * @param etiqueta - Nombre del campo para el mensaje.
 * @param errores - Acumulador de la fila.
 * @returns Pesos, o `null` si falta o es inválido.
 */
function leerPesosObligatorio(
  fila: FilaImportacion,
  campo: string,
  etiqueta: string,
  errores: ErroresDeFila,
): number | null {
  const texto = valor(fila, campo);
  if (texto === '') {
    errores.agregar(campo, `Falta el ${etiqueta.toLowerCase()}.`);
    return null;
  }
  const pesos = leerPesos(texto);
  if (pesos === null) {
    errores.agregar(campo, `${etiqueta} «${texto}» no es un valor en pesos enteros.`);
  }
  return pesos;
}

/**
 * Valida una fila de productos.
 *
 * @param fila - Fila del archivo.
 * @param contexto - Datos existentes.
 * @param codigosVistos - Códigos ya vistos en el archivo.
 * @returns Registro válido y errores de la fila.
 */
function validarFilaProducto(
  fila: FilaImportacion,
  contexto: ContextoImportacion,
  codigosVistos: Map<number, number>,
): { registro: RegistroImportable | null; errores: ErrorFila[] } {
  const errores = new ErroresDeFila(fila.numero);
  const codigo = leerCodigoOpcional(fila, errores, contexto, codigosVistos);

  const textoProveedor = valor(fila, 'proveedor');
  const proveedorCodigo = leerCodigo(textoProveedor);
  if (proveedorCodigo === null) {
    errores.agregar('proveedor', 'Falta el código del proveedor o no es un número.');
  } else if (!contexto.proveedores.has(proveedorCodigo)) {
    errores.agregar('proveedor', `El proveedor ${proveedorCodigo} no existe.`);
  }

  const textoUnidad = valor(fila, 'unidad');
  const unidad = leerUnidad(textoUnidad);
  if (unidad === null) {
    errores.agregar('unidad', `La unidad «${textoUnidad}» no es UND ni KG.`);
  }

  const costo = leerPesosObligatorio(fila, 'costo', 'Costo', errores);
  const mayor = leerPesosObligatorio(fila, 'precioMayor', 'Precio mayor', errores);
  const menor = leerPesosObligatorio(fila, 'precioMenor', 'Precio menor', errores);
  const minimo = leerPesosObligatorio(fila, 'precioMinimo', 'Precio mínimo', errores);

  if (
    !errores.vacia ||
    codigo === undefined ||
    proveedorCodigo === null ||
    unidad === null ||
    costo === null ||
    mayor === null ||
    menor === null ||
    minimo === null
  ) {
    return { registro: null, errores: errores.lista };
  }
  const datos = errores.intentar(() =>
    validarDatosProducto({
      nombre: valor(fila, 'nombre'),
      proveedorCodigo,
      unidad,
      precios: { mayor, menor, minimo },
    }),
  );
  if (!datos) {
    return { registro: null, errores: errores.lista };
  }
  return {
    registro: { tipo: 'productos', fila: fila.numero, datos: { ...datos, codigo, costo } },
    errores: [],
  };
}

/**
 * Valida una fila de clientes o proveedores.
 *
 * @param tipo - Clientes o proveedores.
 * @param fila - Fila del archivo.
 * @param contexto - Datos existentes.
 * @param codigosVistos - Códigos ya vistos en el archivo.
 * @param identificacionesVistas - Identificaciones ya vistas → fila.
 * @returns Registro válido y errores de la fila.
 */
function validarFilaTercero(
  tipo: 'clientes' | 'proveedores',
  fila: FilaImportacion,
  contexto: ContextoImportacion,
  codigosVistos: Map<number, number>,
  identificacionesVistas: Map<string, number>,
): { registro: RegistroImportable | null; errores: ErrorFila[] } {
  const errores = new ErroresDeFila(fila.numero);
  const codigo = leerCodigoOpcional(fila, errores, contexto, codigosVistos);

  const textoTipoId = valor(fila, 'tipoIdentificacion');
  const tipoIdentificacion = leerTipoIdentificacion(textoTipoId);
  if (tipoIdentificacion === null) {
    errores.agregar(
      'tipoIdentificacion',
      `El tipo de identificación «${textoTipoId}» no es CC, NIT, CE ni Pasaporte.`,
    );
  }
  const textoPersona = valor(fila, 'tipoPersona');
  const tipoPersona = leerTipoPersona(textoPersona, tipoIdentificacion);
  if (tipoPersona === null) {
    errores.agregar(
      'tipoPersona',
      `El tipo de persona «${textoPersona}» no es Natural ni Jurídica.`,
    );
  }
  if (
    !errores.vacia ||
    codigo === undefined ||
    tipoIdentificacion === null ||
    tipoPersona === null
  ) {
    return { registro: null, errores: errores.lista };
  }

  const datos = errores.intentar(() =>
    validarDatosTercero(
      {
        tipoPersona,
        nombre: valor(fila, 'nombre'),
        tipoIdentificacion,
        numeroIdentificacion: valor(fila, 'numeroIdentificacion'),
        celular: valor(fila, 'celular'),
        direccion: valor(fila, 'direccion'),
        barrio: valor(fila, 'barrio'),
        ciudad: valor(fila, 'ciudad'),
        topeCredito: null,
      },
      tipo === 'clientes' ? 'cliente' : 'proveedor',
    ),
  );
  if (!datos) {
    return { registro: null, errores: errores.lista };
  }
  const clave = claveIdentificacion(datos.tipoIdentificacion, datos.numeroIdentificacion);
  if (contexto.identificacionesExistentes.has(clave)) {
    errores.agregar(
      'numeroIdentificacion',
      `Ya existe un registro con ${datos.tipoIdentificacion} ${datos.numeroIdentificacion}.`,
    );
    return { registro: null, errores: errores.lista };
  }
  const repetida = identificacionesVistas.get(clave);
  if (repetida !== undefined) {
    errores.agregar(
      'numeroIdentificacion',
      `La identificación ${datos.tipoIdentificacion} ${datos.numeroIdentificacion} está repetida (ya aparece en la fila ${repetida}).`,
    );
    return { registro: null, errores: errores.lista };
  }
  identificacionesVistas.set(clave, fila.numero);
  return { registro: { tipo, fila: fila.numero, datos: { ...datos, codigo } }, errores: [] };
}

/**
 * Valida una fila de stock inicial.
 *
 * @param fila - Fila del archivo.
 * @param contexto - Datos existentes.
 * @param vistos - Pares producto|bodega ya vistos → fila.
 * @returns Registro válido y errores de la fila.
 */
function validarFilaStock(
  fila: FilaImportacion,
  contexto: ContextoImportacion,
  vistos: Map<string, number>,
): { registro: RegistroImportable | null; errores: ErrorFila[] } {
  const errores = new ErroresDeFila(fila.numero);
  const textoProducto = valor(fila, 'producto');
  const productoCodigo = leerCodigo(textoProducto);
  const producto = productoCodigo === null ? undefined : contexto.productos.get(productoCodigo);
  if (productoCodigo === null) {
    errores.agregar('producto', 'Falta el código del producto o no es un número.');
  } else if (!producto) {
    errores.agregar('producto', `El producto ${productoCodigo} no existe.`);
  }

  const textoBodega = valor(fila, 'bodega');
  const bodegaId =
    textoBodega === ''
      ? contexto.bodegaPrincipalId
      : contexto.bodegas.get(claveComparacion(textoBodega));
  if (bodegaId === undefined) {
    errores.agregar('bodega', `La bodega «${textoBodega}» no existe o está inactiva.`);
  }

  const textoCantidad = valor(fila, 'cantidad');
  let cantidad: number | null = null;
  if (producto) {
    cantidad = leerCantidad(textoCantidad, producto.unidad);
    if (cantidad === null) {
      errores.agregar(
        'cantidad',
        producto.unidad === 'UND'
          ? `La cantidad «${textoCantidad}» no es válida: el producto se vende por unidades (sin decimales).`
          : `La cantidad «${textoCantidad}» no es válida: use hasta tres decimales separados por punto.`,
      );
    }
  }

  if (
    !errores.vacia ||
    productoCodigo === null ||
    !producto ||
    bodegaId === undefined ||
    cantidad === null
  ) {
    return { registro: null, errores: errores.lista };
  }
  const par = `${productoCodigo}|${bodegaId}`;
  if (contexto.stockInicialExistente.has(par)) {
    errores.agregar(null, `El producto ${productoCodigo} ya tiene stock inicial en esa bodega.`);
    return { registro: null, errores: errores.lista };
  }
  const repetido = vistos.get(par);
  if (repetido !== undefined) {
    errores.agregar(
      null,
      `El producto ${productoCodigo} está repetido en la misma bodega (ya aparece en la fila ${repetido}).`,
    );
    return { registro: null, errores: errores.lista };
  }
  vistos.set(par, fila.numero);
  return {
    registro: {
      tipo: 'stock',
      fila: fila.numero,
      productoCodigo,
      bodegaId,
      cantidad,
      costoUnitario: producto.costo,
    },
    errores: [],
  };
}

/**
 * Valida todas las filas de un archivo de importación. Cada fila se valida
 * por separado: las válidas se pueden importar aunque otras tengan errores
 * («Importar solo las filas válidas», D-26). Un código o identificación que
 * ya existe, o que se repite dentro del archivo, es error de esa fila: nunca
 * se actualiza el registro existente.
 *
 * @param tipo - Qué se importa.
 * @param filas - Filas con los campos asignados.
 * @param contexto - Datos existentes en la base.
 * @returns Registros válidos y errores por fila.
 * @throws {Error} Si ocurre un error técnico (no de validación).
 *
 * @example
 * const r = validarFilasImportacion('productos', filas, contexto);
 * r.registros.length; // filas que se pueden importar
 * r.errores;          // [{ fila: 7, campo: 'costo', mensaje: 'Costo «abc» no es…' }]
 */
export function validarFilasImportacion(
  tipo: TipoImportacion,
  filas: readonly FilaImportacion[],
  contexto: ContextoImportacion,
): ResultadoValidacionFilas {
  const registros: RegistroImportable[] = [];
  const errores: ErrorFila[] = [];
  const codigosVistos = new Map<number, number>();
  const identificacionesVistas = new Map<string, number>();
  const paresVistos = new Map<string, number>();

  for (const fila of filas) {
    let resultado: { registro: RegistroImportable | null; errores: ErrorFila[] };
    switch (tipo) {
      case 'productos':
        resultado = validarFilaProducto(fila, contexto, codigosVistos);
        break;
      case 'clientes':
      case 'proveedores':
        resultado = validarFilaTercero(tipo, fila, contexto, codigosVistos, identificacionesVistas);
        break;
      case 'stock':
        resultado = validarFilaStock(fila, contexto, paresVistos);
        break;
    }
    if (resultado.registro) {
      registros.push(resultado.registro);
    }
    errores.push(...resultado.errores);
  }
  return { total: filas.length, registros, errores };
}
