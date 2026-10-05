import type { UnidadMedida } from '../shared/formato/cantidades';
import { formatearCantidad } from '../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../shared/formato/moneda';
import type { AccionVisor, CampoCambiado, RegistroVisor } from '../shared/historial';
import { VALOR_OCULTO, type ValorJson } from './auditoria';
import { claveComparacion } from './texto';

/**
 * Registro del historial con el «antes» y el «después» ya leídos del JSON.
 */
export interface RegistroHistorialLeido {
  /** Id del registro. */
  id: number;
  /** Fecha ISO con zona. */
  fecha: string;
  /** Entidad, p. ej. `factura_cliente`. */
  entidad: string;
  /** Número o clave de la entidad. */
  entidadId: string;
  /** Acción. */
  accion: AccionVisor;
  /** Contenido anterior, o `null`. */
  antes: ValorJson | null;
  /** Contenido posterior, o `null`. */
  despues: ValorJson | null;
  /** Motivo, o `null`. */
  motivo: string | null;
}

/**
 * Nombres que el visor necesita para traducir códigos (clientes, productos…).
 * Devuelven `undefined` si el código no existe (se muestra el código).
 */
export interface NombresHistorial {
  /** Nombre de un cliente. */
  cliente(codigo: number): string | undefined;
  /** Nombre de un proveedor. */
  proveedor(codigo: number): string | undefined;
  /** Nombre y unidad de un producto. */
  producto(codigo: number): { nombre: string; unidad: UnidadMedida } | undefined;
  /** Nombre de una forma de pago. */
  formaPago(id: number): string | undefined;
  /** Nombre de una bodega. */
  bodega(id: number): string | undefined;
}

/**
 * Nombre en pantalla de cada entidad del historial (columna «Tipo»).
 */
const TIPOS_ENTIDAD: Readonly<Record<string, string>> = {
  factura_cliente: 'Factura de venta',
  factura_proveedor: 'Factura de proveedor',
  abono_cliente: 'Abono de cliente',
  abono_proveedor: 'Abono a proveedor',
  devolucion_venta: 'Devolución de venta',
  devolucion_compra: 'Devolución de compra',
  reintegro: 'Reintegro',
  ajuste_inventario: 'Ajuste de inventario',
  cierre_caja: 'Cierre de caja',
  producto: 'Producto',
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  bodega: 'Bodega',
  forma_pago: 'Forma de pago',
  configuracion: 'Configuración',
  consecutivo: 'Consecutivo',
  importacion: 'Importación',
  autenticacion: 'Contraseña',
  respaldo: 'Respaldo',
  sistema: 'Sistema',
};

/** Prefijo del documento en la columna «Documento» según la entidad. */
const PREFIJOS_DOCUMENTO: Readonly<Record<string, string>> = {
  factura_proveedor: 'Compra',
  abono_cliente: 'Abono',
  abono_proveedor: 'Abono',
  devolucion_venta: 'Devolución',
  devolucion_compra: 'Devolución',
  reintegro: 'Reintegro',
  ajuste_inventario: 'Ajuste',
};

/** Nombre de las claves de configuración, consecutivos y otros ids de texto. */
const CLAVES: Readonly<Record<string, string>> = {
  'negocio.datos': 'Datos del negocio',
  'facturacion.impresora': 'Impresora de facturas',
  'auth.hash_contrasena': 'Contraseña',
  'auth.hash_clave_recuperacion': 'Clave de recuperación',
  'demo.cargada': 'Datos de ejemplo',
  factura_cliente: 'Numeración de facturas de venta',
  contrasena: 'Contraseña',
  productos: 'Productos',
  clientes: 'Clientes',
  proveedores: 'Proveedores',
  stock: 'Stock inicial',
  'saldos-clientes': 'Saldos iniciales de clientes',
  'saldos-proveedores': 'Saldos iniciales de proveedores',
};

/** Nombre de las acciones. */
const ACCIONES: Readonly<Record<AccionVisor, string>> = {
  crear: 'Crear',
  editar: 'Editar',
  anular: 'Anular',
  inactivar: 'Inactivar',
  reactivar: 'Reactivar',
  sistema: 'Sistema',
};

/**
 * Cómo se muestra el valor de un campo.
 */
type FormatoCampo =
  | 'texto'
  | 'pesos'
  | 'cantidad'
  | 'fecha'
  | 'sino'
  | 'cliente'
  | 'proveedor'
  | 'tercero'
  | 'producto'
  | 'forma-pago'
  | 'bodega'
  | 'enumerado';

/**
 * Diccionario de campos técnicos del historial: nombre en pantalla y formato.
 * Se busca primero la ruta completa sin índices (`precios.mayor`) y después
 * el último nombre (`cantidad`). Un campo que no está aquí se muestra con
 * su nombre técnico, tal cual.
 */
const CAMPOS: Readonly<Record<string, { etiqueta: string; formato: FormatoCampo }>> = {
  numero: { etiqueta: 'Número', formato: 'texto' },
  clienteCodigo: { etiqueta: 'Cliente', formato: 'cliente' },
  proveedorCodigo: { etiqueta: 'Proveedor', formato: 'proveedor' },
  terceroCodigo: { etiqueta: 'Tercero', formato: 'tercero' },
  dia: { etiqueta: 'Día', formato: 'fecha' },
  fecha: { etiqueta: 'Fecha', formato: 'fecha' },
  vence: { etiqueta: 'Vence', formato: 'fecha' },
  condicion: { etiqueta: 'Condición', formato: 'enumerado' },
  plazoDias: { etiqueta: 'Plazo (días)', formato: 'texto' },
  bodegaId: { etiqueta: 'Bodega', formato: 'bodega' },
  total: { etiqueta: 'Total', formato: 'pesos' },
  ahorro: { etiqueta: 'Ahorro', formato: 'pesos' },
  formaPagoId: { etiqueta: 'Forma de pago', formato: 'forma-pago' },
  recibido: { etiqueta: 'Recibido', formato: 'pesos' },
  cambio: { etiqueta: 'Cambio', formato: 'pesos' },
  cajasEmpaque: { etiqueta: 'Cajas de empaque', formato: 'texto' },
  productoCodigo: { etiqueta: 'Producto', formato: 'producto' },
  escala: { etiqueta: 'Escala', formato: 'enumerado' },
  cantidad: { etiqueta: 'Cantidad', formato: 'cantidad' },
  precioEscala: { etiqueta: 'Precio de la escala', formato: 'pesos' },
  precio: { etiqueta: 'Precio', formato: 'pesos' },
  alterado: { etiqueta: 'Precio alterado', formato: 'sino' },
  costo: { etiqueta: 'Costo', formato: 'pesos' },
  version: { etiqueta: 'Versión', formato: 'texto' },
  numeroProveedor: { etiqueta: 'Factura del proveedor', formato: 'texto' },
  ordenCompra: { etiqueta: 'Orden de compra', formato: 'texto' },
  subtotal: { etiqueta: 'Subtotal', formato: 'pesos' },
  flete: { etiqueta: 'Flete', formato: 'pesos' },
  fleteProveedor: { etiqueta: 'Flete cobrado por el proveedor', formato: 'sino' },
  descuento: { etiqueta: 'Descuento', formato: 'pesos' },
  descuentoPorcentaje: { etiqueta: 'Descuento (porcentaje)', formato: 'texto' },
  descuentoEnCosto: { etiqueta: 'Descuento al costo', formato: 'sino' },
  pagadaContado: { etiqueta: 'Pagada de contado', formato: 'sino' },
  costoUnitario: { etiqueta: 'Costo unitario', formato: 'pesos' },
  costoNuevo: { etiqueta: 'Costo nuevo', formato: 'pesos' },
  costoAnterior: { etiqueta: 'Costo anterior', formato: 'pesos' },
  valor: { etiqueta: 'Valor', formato: 'pesos' },
  observacion: { etiqueta: 'Observación', formato: 'texto' },
  origen: { etiqueta: 'Origen', formato: 'enumerado' },
  facturaId: { etiqueta: 'Factura (id interno)', formato: 'texto' },
  facturaNumero: { etiqueta: 'Factura', formato: 'texto' },
  compraNumero: { etiqueta: 'Compra', formato: 'texto' },
  facturaVersion: { etiqueta: 'Versión de la factura', formato: 'texto' },
  facturaRenglon: { etiqueta: 'Renglón de la factura', formato: 'texto' },
  valorUnitario: { etiqueta: 'Valor unitario', formato: 'pesos' },
  saldoAntes: { etiqueta: 'Saldo antes', formato: 'pesos' },
  saldoDespues: { etiqueta: 'Saldo después', formato: 'pesos' },
  estado: { etiqueta: 'Estado', formato: 'enumerado' },
  saldoFavor: { etiqueta: 'Saldo a favor', formato: 'pesos' },
  abonoContado: { etiqueta: 'Abono de contado', formato: 'texto' },
  anterior: { etiqueta: 'Anterior', formato: 'pesos' },
  nuevo: { etiqueta: 'Nuevo', formato: 'pesos' },
  tipo: { etiqueta: 'Tipo', formato: 'enumerado' },
  stockAnterior: { etiqueta: 'Existencia anterior', formato: 'cantidad' },
  cantidadContada: { etiqueta: 'Cantidad contada', formato: 'cantidad' },
  nombre: { etiqueta: 'Nombre', formato: 'texto' },
  tipoPersona: { etiqueta: 'Tipo de persona', formato: 'enumerado' },
  tipoIdentificacion: { etiqueta: 'Tipo de identificación', formato: 'texto' },
  numeroIdentificacion: { etiqueta: 'Identificación', formato: 'texto' },
  celular: { etiqueta: 'Celular', formato: 'texto' },
  direccion: { etiqueta: 'Dirección', formato: 'texto' },
  barrio: { etiqueta: 'Barrio', formato: 'texto' },
  ciudad: { etiqueta: 'Ciudad', formato: 'texto' },
  topeCredito: { etiqueta: 'Tope de crédito', formato: 'pesos' },
  activo: { etiqueta: 'Activo', formato: 'sino' },
  unidad: { etiqueta: 'Unidad', formato: 'texto' },
  'precios.mayor': { etiqueta: 'Precio al por mayor', formato: 'pesos' },
  'precios.menor': { etiqueta: 'Precio al por menor', formato: 'pesos' },
  'precios.minimo': { etiqueta: 'Precio mínimo', formato: 'pesos' },
  esPrincipal: { etiqueta: 'Bodega principal', formato: 'sino' },
  calculaCambio: { etiqueta: 'Calcula el cambio', formato: 'sino' },
  siguiente: { etiqueta: 'Siguiente número', formato: 'texto' },
  sentido: { etiqueta: 'Sentido', formato: 'enumerado' },
  documento: { etiqueta: 'Documento', formato: 'texto' },
  nit: { etiqueta: 'NIT', formato: 'texto' },
  regimen: { etiqueta: 'Régimen', formato: 'texto' },
  telefono: { etiqueta: 'Teléfono', formato: 'texto' },
  formato: { etiqueta: 'Formato de números', formato: 'enumerado' },
  filas: { etiqueta: 'Filas', formato: 'texto' },
  importadas: { etiqueta: 'Importadas', formato: 'texto' },
  omitidas: { etiqueta: 'Omitidas', formato: 'texto' },
  filasConAviso: { etiqueta: 'Filas con aviso', formato: 'texto' },
};

/** Nombre de las listas: cada elemento sale como «Línea 2», «Aplicación 1»… */
const LISTAS: Readonly<Record<string, string>> = {
  lineas: 'Línea',
  aplicaciones: 'Aplicación',
  costos: 'Costo',
};

/** Valores de los campos enumerados. Uno sin traducción se muestra tal cual. */
const ENUMERADOS: Readonly<Record<string, string>> = {
  credito: 'Crédito',
  contado: 'Contado',
  activa: 'Activa',
  anulada: 'Anulada',
  activo: 'Activo',
  anulado: 'Anulado',
  menor: 'Menor',
  mayor: 'Mayor',
  minimo: 'Mínimo',
  natural: 'Natural',
  juridica: 'Jurídica',
  merma: 'Merma',
  dano: 'Daño',
  conteo: 'Conteo físico',
  manual: 'Manual',
  entrega: 'El negocio entrega',
  recibe: 'El negocio recibe',
  saldo_favor: 'Saldo a favor',
  documento: 'Documento',
  cliente: 'Cliente',
  proveedor: 'Proveedor',
  venta: 'Venta',
  compra: 'Compra',
  'punto-decimal': 'Punto decimal',
  'coma-decimal': 'Coma decimal',
  ...CLAVES,
};

/** Campos que van en los datos generales del detalle y no en la tabla. */
const FUERA_DE_LA_TABLA = new Set(['version']);

/**
 * Tipo de una entidad del historial en palabras.
 *
 * @param entidad - Entidad.
 * @returns Nombre, o la entidad tal cual si no tiene traducción.
 */
export function tipoEntidad(entidad: string): string {
  return TIPOS_ENTIDAD[entidad] ?? entidad;
}

/**
 * Nombre de una acción.
 *
 * @param accion - Acción.
 * @returns Nombre en pantalla.
 */
export function etiquetaAccion(accion: AccionVisor): string {
  return ACCIONES[accion];
}

/**
 * Objeto JSON (no lista), o `null`.
 *
 * @param valor - Valor.
 * @returns El objeto o `null`.
 */
function comoObjeto(valor: ValorJson | null | undefined): { [clave: string]: ValorJson } | null {
  return valor !== null && valor !== undefined && typeof valor === 'object' && !Array.isArray(valor)
    ? valor
    : null;
}

/**
 * Número de un campo del objeto, si lo es.
 *
 * @param objeto - Objeto.
 * @param clave - Campo.
 * @returns Número o `undefined`.
 */
function numero(objeto: { [clave: string]: ValorJson } | null, clave: string): number | undefined {
  const v = objeto?.[clave];
  return typeof v === 'number' ? v : undefined;
}

/**
 * Texto de un campo del objeto, si lo es.
 *
 * @param objeto - Objeto.
 * @param clave - Campo.
 * @returns Texto o `undefined`.
 */
function texto(objeto: { [clave: string]: ValorJson } | null, clave: string): string | undefined {
  const v = objeto?.[clave];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Documento de un registro en palabras (columna «Documento»).
 *
 * @param registro - Entidad, id y contenido.
 * @returns Texto, p. ej. `84795`, `Abono 58` o `Datos del negocio`.
 *
 * @example
 * textoDocumentoHistorial({ entidad: 'abono_cliente', entidadId: '58', antes: null, despues: null }); // 'Abono 58'
 */
export function textoDocumentoHistorial(
  registro: Pick<RegistroHistorialLeido, 'entidad' | 'entidadId' | 'antes' | 'despues'>,
): string {
  const prefijo = PREFIJOS_DOCUMENTO[registro.entidad];
  if (prefijo) return `${prefijo} ${registro.entidadId}`;
  if (registro.entidad === 'bodega' || registro.entidad === 'forma_pago') {
    return (
      texto(comoObjeto(registro.despues), 'nombre') ??
      texto(comoObjeto(registro.antes), 'nombre') ??
      registro.entidadId
    );
  }
  return CLAVES[registro.entidadId] ?? registro.entidadId;
}

/**
 * Contexto para formatear los campos de un elemento (la unidad del producto
 * para las cantidades y si el tercero es cliente o proveedor).
 */
interface ContextoFormato {
  /** Unidad de las cantidades. */
  unidad: UnidadMedida;
  /** Clase del tercero de `terceroCodigo`. */
  clase: 'cliente' | 'proveedor';
}

/**
 * Formatea un valor según el formato de su campo.
 *
 * @param valor - Valor del JSON.
 * @param formato - Formato del campo.
 * @param nombres - Nombres para traducir códigos.
 * @param contexto - Unidad y clase de tercero.
 * @returns Texto (vacío para `null`).
 */
function formatearValor(
  valor: ValorJson,
  formato: FormatoCampo,
  nombres: NombresHistorial,
  contexto: ContextoFormato,
): string {
  if (valor === null) return '';
  if (valor === VALOR_OCULTO) return '(oculto)';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'object') return JSON.stringify(valor);
  const conNombre = (n: string | undefined): string => (n ? `${valor} - ${n}` : String(valor));
  if (typeof valor === 'number' && Number.isSafeInteger(valor)) {
    switch (formato) {
      case 'pesos':
        return agruparMiles(valor);
      case 'cantidad':
        return formatearCantidad(valor, contexto.unidad);
      case 'cliente':
        return conNombre(nombres.cliente(valor));
      case 'proveedor':
        return conNombre(nombres.proveedor(valor));
      case 'tercero':
        return conNombre(
          contexto.clase === 'cliente' ? nombres.cliente(valor) : nombres.proveedor(valor),
        );
      case 'producto':
        return conNombre(nombres.producto(valor)?.nombre);
      case 'forma-pago':
        return nombres.formaPago(valor) ?? String(valor);
      case 'bodega':
        return nombres.bodega(valor) ?? String(valor);
      default:
        return String(valor);
    }
  }
  if (typeof valor === 'string') {
    if (formato === 'fecha' && /^\d{4}-\d{2}-\d{2}/.test(valor)) return formatearFecha(valor);
    if (formato === 'enumerado') return ENUMERADOS[valor] ?? valor;
  }
  return String(valor);
}

/**
 * Valor aplanado de un campo: dónde está y cómo se muestra.
 */
interface CampoPlano {
  /** Nombre en pantalla (con la línea a la que pertenece). */
  etiqueta: string;
  /** Valor formateado. */
  valor: string;
}

/**
 * Pone en minúscula la primera letra (los campos dentro de una línea).
 *
 * @param s - Texto.
 * @returns Texto con la primera letra en minúscula.
 */
function minuscula(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

/**
 * Aplana un contenido del historial en campos con ruta única
 * (`lineas[2].cantidad`) y etiqueta legible (`Línea 2 · 231 PAPA · cantidad`).
 *
 * @param valor - Contenido.
 * @param nombres - Nombres para traducir códigos.
 * @param raiz - Contenido completo (para la clase del tercero).
 * @returns Campos por ruta, en orden.
 */
function aplanar(
  valor: ValorJson | null,
  nombres: NombresHistorial,
  raiz: { [clave: string]: ValorJson } | null,
): Map<string, CampoPlano> {
  const campos = new Map<string, CampoPlano>();
  const clase = texto(raiz, 'tipo') === 'proveedor' ? 'proveedor' : 'cliente';
  /**
   * Recorre un objeto.
   *
   * @param objeto - Objeto a recorrer.
   * @param ruta - Ruta con índices.
   * @param rutaSinIndices - Ruta para el diccionario.
   * @param prefijo - Etiqueta de la línea, o vacío.
   */
  const recorrer = (
    objeto: { [clave: string]: ValorJson },
    ruta: string,
    rutaSinIndices: string,
    prefijo: string,
  ): void => {
    const codigo = numero(objeto, 'productoCodigo') ?? numero(raiz, 'productoCodigo');
    const contexto: ContextoFormato = {
      unidad: (codigo !== undefined ? nombres.producto(codigo)?.unidad : undefined) ?? 'KG',
      clase,
    };
    for (const [clave, v] of Object.entries(objeto)) {
      const r = ruta ? `${ruta}.${clave}` : clave;
      const rs = rutaSinIndices ? `${rutaSinIndices}.${clave}` : clave;
      const definicion = CAMPOS[rs] ?? CAMPOS[clave];
      const nombre = definicion?.etiqueta ?? clave;
      if (Array.isArray(v)) {
        v.forEach((elemento, i) => {
          const objetoElemento = comoObjeto(elemento);
          const base = `${LISTAS[clave] ?? nombre} ${i + 1}`;
          if (!objetoElemento) {
            campos.set(`${r}[${i}]`, {
              etiqueta: prefijo ? `${prefijo} · ${minuscula(base)}` : base,
              valor: formatearValor(elemento, 'texto', nombres, contexto),
            });
            return;
          }
          const producto = numero(objetoElemento, 'productoCodigo');
          const factura = numero(objetoElemento, 'facturaNumero');
          const descripcion =
            producto !== undefined
              ? ` · ${producto} ${nombres.producto(producto)?.nombre ?? ''}`.trimEnd()
              : factura !== undefined
                ? ` · factura ${factura}`
                : '';
          recorrer(objetoElemento, `${r}[${i}]`, rs, `${base}${descripcion}`);
        });
        continue;
      }
      const anidado = comoObjeto(v);
      if (anidado) {
        // `valor` de la configuración envuelve los datos, y los objetos con
        // rutas en el diccionario (`precios.mayor`) ya tienen nombre completo.
        const transparente =
          (clave === 'valor' && !ruta) || Object.keys(CAMPOS).some((k) => k.startsWith(`${rs}.`));
        const prefijoAnidado = transparente
          ? prefijo
          : prefijo
            ? `${prefijo} · ${minuscula(nombre)}`
            : nombre;
        recorrer(anidado, r, rs, prefijoAnidado);
        continue;
      }
      const etiqueta = prefijo ? `${prefijo} · ${minuscula(nombre)}` : nombre;
      campos.set(r, {
        etiqueta,
        valor: formatearValor(v, definicion?.formato ?? 'texto', nombres, contexto),
      });
    }
  };
  const objeto = comoObjeto(valor);
  if (objeto) {
    recorrer(objeto, '', '', '');
  } else if (valor !== null) {
    campos.set('', {
      etiqueta: 'Valor',
      valor: formatearValor(valor, 'texto', nombres, {
        unidad: 'KG',
        clase,
      }),
    });
  }
  return campos;
}

/**
 * Compara el «antes» y el «después» de un registro y devuelve solo los
 * campos que cambiaron, con nombres en español. Al crear, se listan todos
 * los campos con valor; un campo técnico sin traducción sale tal cual.
 *
 * @param registro - Registro con su contenido.
 * @param nombres - Nombres para traducir códigos.
 * @returns Campos cambiados, en el orden del «después».
 *
 * @example
 * compararCambio({ antes: { costo: 6200 }, despues: { costo: 6300 }, ... }, nombres);
 * // [{ campo: 'Costo', antes: '6,200', despues: '6,300' }]
 */
export function compararCambio(
  registro: Pick<RegistroHistorialLeido, 'antes' | 'despues'>,
  nombres: NombresHistorial,
): CampoCambiado[] {
  const raiz = comoObjeto(registro.despues) ?? comoObjeto(registro.antes);
  const antes = aplanar(registro.antes, nombres, raiz);
  const despues = aplanar(registro.despues, nombres, raiz);
  const rutas = [...new Set([...despues.keys(), ...antes.keys()])];
  const cambios: CampoCambiado[] = [];
  for (const ruta of rutas) {
    if (FUERA_DE_LA_TABLA.has(ruta)) continue;
    const a = antes.get(ruta);
    const d = despues.get(ruta);
    const valorAntes = a?.valor ?? '';
    const valorDespues = d?.valor ?? '';
    if (valorAntes === valorDespues) continue;
    cambios.push({ campo: (d ?? a)?.etiqueta ?? ruta, antes: valorAntes, despues: valorDespues });
  }
  return cambios;
}

/**
 * Nombre del tercero del contenido (cliente o proveedor), si lo trae.
 *
 * @param objeto - Contenido.
 * @param nombres - Nombres.
 * @returns Clase, código y nombre, o `null`.
 */
function terceroDe(
  objeto: { [clave: string]: ValorJson } | null,
  nombres: NombresHistorial,
): { clase: 'Cliente' | 'Proveedor'; codigo: number; nombre: string } | null {
  const cliente = numero(objeto, 'clienteCodigo');
  if (cliente !== undefined) {
    return { clase: 'Cliente', codigo: cliente, nombre: nombres.cliente(cliente) ?? '' };
  }
  const proveedor = numero(objeto, 'proveedorCodigo');
  if (proveedor !== undefined) {
    return { clase: 'Proveedor', codigo: proveedor, nombre: nombres.proveedor(proveedor) ?? '' };
  }
  const tercero = numero(objeto, 'terceroCodigo');
  if (tercero !== undefined) {
    const proveedorEs = texto(objeto, 'tipo') === 'proveedor';
    return {
      clase: proveedorEs ? 'Proveedor' : 'Cliente',
      codigo: tercero,
      nombre: (proveedorEs ? nombres.proveedor(tercero) : nombres.cliente(tercero)) ?? '',
    };
  }
  return null;
}

/**
 * Resume en una línea los primeros cambios: `Costo 6,200 → 6,300`.
 *
 * @param registro - Registro.
 * @param nombres - Nombres.
 * @returns Resumen de hasta dos cambios.
 */
function cambiosCortos(registro: RegistroHistorialLeido, nombres: NombresHistorial): string {
  return compararCambio(registro, nombres)
    .slice(0, 2)
    .map((c) => `${c.campo} ${c.antes || '—'} → ${c.despues || '—'}`)
    .join(' · ');
}

/**
 * Une las partes no vacías con « · ».
 *
 * @param partes - Partes.
 * @returns Texto unido.
 */
function unir(...partes: (string | undefined | null)[]): string {
  return partes.filter((p): p is string => typeof p === 'string' && p !== '').join(' · ');
}

/**
 * Resumen legible de un registro del historial (columna «Motivo o resumen»):
 * el tercero y el valor de un documento nuevo, el motivo de una anulación o
 * los primeros campos que cambiaron en una edición.
 *
 * @param registro - Registro con su contenido.
 * @param nombres - Nombres para traducir códigos.
 * @returns Resumen.
 *
 * @example
 * // Factura de venta nueva a crédito
 * resumenRegistro(registro, nombres); // 'ASADERO DON POLLO · crédito · $ 66,750'
 */
export function resumenRegistro(
  registro: RegistroHistorialLeido,
  nombres: NombresHistorial,
): string {
  const d = comoObjeto(registro.despues);
  const a = comoObjeto(registro.antes);
  const tercero = terceroDe(d ?? a, nombres);
  const nombreTercero = tercero ? tercero.nombre || String(tercero.codigo) : undefined;
  const total = numero(d, 'total');
  const valor = numero(d, 'valor');
  const forma = numero(d, 'formaPagoId');
  const motivo = registro.motivo ?? undefined;
  const { entidad, accion } = registro;

  if (accion === 'anular' || accion === 'inactivar' || accion === 'reactivar') {
    const nombre = texto(d, 'nombre') ?? texto(a, 'nombre');
    return unir(nombre, motivo) || cambiosCortos(registro, nombres);
  }
  if (accion === 'editar' && (entidad === 'factura_cliente' || entidad === 'factura_proveedor')) {
    const version = numero(d, 'version');
    return unir(version !== undefined ? `Corrección, versión ${version}` : 'Corrección', motivo);
  }
  if (accion === 'crear') {
    switch (entidad) {
      case 'factura_cliente': {
        const condicion = texto(d, 'condicion');
        return unir(
          nombreTercero,
          condicion ? minuscula(ENUMERADOS[condicion] ?? condicion) : undefined,
          total !== undefined ? formatearPesos(total) : undefined,
          motivo,
        );
      }
      case 'factura_proveedor':
        return unir(
          nombreTercero,
          texto(d, 'numeroProveedor'),
          total !== undefined ? formatearPesos(total) : undefined,
          motivo,
        );
      case 'abono_cliente':
      case 'abono_proveedor':
        return unir(
          nombreTercero,
          valor !== undefined ? formatearPesos(valor) : undefined,
          forma !== undefined ? nombres.formaPago(forma) : undefined,
          texto(d, 'observacion'),
        );
      case 'devolucion_venta':
      case 'devolucion_compra': {
        const factura = numero(d, 'facturaNumero');
        const compra = numero(d, 'compraNumero');
        return unir(
          factura !== undefined
            ? `Factura ${factura}`
            : compra !== undefined
              ? `Compra ${compra}`
              : undefined,
          total !== undefined ? formatearPesos(total) : undefined,
          motivo,
        );
      }
      case 'reintegro': {
        const sentido = texto(d, 'sentido');
        return unir(
          nombreTercero,
          valor !== undefined
            ? `${sentido === 'recibe' ? 'recibe' : 'entrega'} ${formatearPesos(valor)}`
            : undefined,
          forma !== undefined ? nombres.formaPago(forma) : undefined,
          texto(d, 'observacion'),
        );
      }
      case 'ajuste_inventario': {
        const codigo = numero(d, 'productoCodigo');
        const cantidad = numero(d, 'cantidad');
        const tipo = texto(d, 'tipo');
        const producto = codigo !== undefined ? nombres.producto(codigo) : undefined;
        return unir(
          tipo ? (ENUMERADOS[tipo] ?? tipo) : undefined,
          codigo !== undefined && cantidad !== undefined
            ? `${codigo} ${producto?.nombre ?? ''} ${formatearCantidad(cantidad, producto?.unidad ?? 'KG')} ${producto?.unidad ?? ''}`
                .replace(/\s+/g, ' ')
                .trim()
            : undefined,
          motivo,
        );
      }
      case 'producto':
      case 'cliente':
      case 'proveedor':
      case 'bodega':
      case 'forma_pago':
        return unir(texto(d, 'nombre'), motivo);
      default:
        break;
    }
  }
  if (entidad === 'importacion') {
    const filas = numero(d, 'filas');
    const importadas = numero(d, 'importadas');
    const tipo = texto(d, 'tipo');
    return unir(
      tipo ? (ENUMERADOS[tipo] ?? tipo) : undefined,
      filas !== undefined && importadas !== undefined
        ? `${importadas} de ${filas} filas importadas`
        : undefined,
    );
  }
  return unir(motivo, cambiosCortos(registro, nombres));
}

/**
 * Fila del visor a partir de un registro.
 *
 * @param registro - Registro con su contenido.
 * @param nombres - Nombres.
 * @returns Fila con tipo, documento y resumen en palabras.
 */
export function registroVisor(
  registro: RegistroHistorialLeido,
  nombres: NombresHistorial,
): RegistroVisor {
  return {
    id: registro.id,
    fecha: registro.fecha,
    tipo: tipoEntidad(registro.entidad),
    documento: textoDocumentoHistorial(registro),
    accion: registro.accion,
    resumen: resumenRegistro(registro, nombres),
  };
}

/**
 * Indica si una fila del visor coincide con el texto buscado: número del
 * documento, tipo, acción o cualquier parte del resumen (nombre del tercero,
 * motivo…), sin distinguir mayúsculas ni tildes.
 *
 * @param fila - Fila del visor.
 * @param buscado - Texto escrito (vacío coincide con todo).
 * @returns `true` si coincide.
 *
 * @example
 * coincideTextoVisor(fila, 'fertilia'); // true si el resumen dice «JUAN JJ FERTILIA»
 */
export function coincideTextoVisor(fila: RegistroVisor, buscado: string): boolean {
  const clave = claveComparacion(buscado);
  if (clave === '') return true;
  return claveComparacion(
    `${fila.tipo} ${fila.documento} ${ACCIONES[fila.accion]} ${fila.resumen}`,
  ).includes(clave);
}

/**
 * Datos generales y campos cambiados de un registro, para el panel del visor.
 *
 * @param registro - Registro con su contenido.
 * @param nombres - Nombres.
 * @returns Título, datos (fecha y hora, tercero, versión, motivo) y campos.
 */
export function detalleRegistro(
  registro: RegistroHistorialLeido,
  nombres: NombresHistorial,
): { titulo: string; datos: { etiqueta: string; valor: string }[]; campos: CampoCambiado[] } {
  const d = comoObjeto(registro.despues);
  const a = comoObjeto(registro.antes);
  const documento = textoDocumentoHistorial(registro);
  const tipo = tipoEntidad(registro.entidad);
  const soloNumero = /^\d+$/.test(registro.entidadId) ? registro.entidadId : null;
  const titulo = `${tipo} ${soloNumero ?? `· ${documento}`} · ${ACCIONES[registro.accion]}`;
  const datos: { etiqueta: string; valor: string }[] = [
    { etiqueta: 'Fecha y hora', valor: formatearFechaHora(registro.fecha) },
  ];
  const tercero = terceroDe(d ?? a, nombres);
  if (tercero) {
    datos.push({
      etiqueta: tercero.clase,
      valor: tercero.nombre ? `${tercero.codigo} - ${tercero.nombre}` : String(tercero.codigo),
    });
  }
  const version = numero(d, 'version');
  if (version !== undefined) {
    datos.push({
      etiqueta: 'Versión',
      valor: `${numero(a, 'version') ?? version - 1} → ${version}`,
    });
  }
  if (registro.motivo) {
    datos.push({ etiqueta: 'Motivo', valor: registro.motivo });
  }
  return { titulo, datos, campos: compararCambio(registro, nombres) };
}
