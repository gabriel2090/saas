import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import {
  borrarPreferencia,
  borrarPreferenciasConPrefijo,
  guardarPreferencia,
  listarPreferencias,
} from '../../data/repositorios/interfaz.repo';
import { aIsoLocal } from '../../shared/formato/fechas';
import {
  ESCALA_RELATIVA,
  MODO_BARRA_POR_DEFECTO,
  MODOS_BARRA,
  type GeometriaGuardada,
  type ModoBarra,
  type PeticionGuardarVentana,
  type PreferenciasInterfaz,
  type RectRelativo,
} from '../../shared/interfaz';
import { PROCESOS, type IdProceso } from '../../shared/procesos';

/**
 * Clave de la preferencia del modo de la barra superior.
 */
const CLAVE_BARRA = 'barra';

/**
 * Prefijo de las claves de geometría de ventana (`ventana:<id>`).
 */
const PREFIJO_VENTANA = 'ventana:';

/**
 * Coordenada máxima aceptada en píxeles: holgada para cualquier pantalla,
 * pero evita guardar valores absurdos.
 */
const PIXELES_MAXIMOS = 20_000;

/**
 * Servicio de las preferencias de interfaz (D-108, D-113). No pasa por el
 * historial de cambios.
 */
export interface ServicioInterfaz {
  /**
   * Devuelve las preferencias guardadas (las inválidas se ignoran).
   *
   * @returns Modo de la barra y geometría recordada por proceso.
   */
  preferencias(): PreferenciasInterfaz;
  /**
   * Guarda el modo de la barra superior.
   *
   * @param modo - Modo elegido.
   * @throws {ErrorDeNegocio} Si el modo no existe.
   */
  guardarBarra(modo: ModoBarra): void;
  /**
   * Recuerda el tamaño y la posición de una ventana.
   *
   * @param peticion - Proceso y geometría.
   * @throws {ErrorDeNegocio} Si el proceso no existe o la geometría es inválida.
   */
  guardarVentana(peticion: PeticionGuardarVentana): void;
  /**
   * Olvida la geometría de una ventana o, con `null`, la de todas
   * («Restablecer su tamaño y posición» / «Restablecer todas»).
   *
   * @param id - Proceso, o `null` para todas.
   * @throws {ErrorDeNegocio} Si el proceso no existe.
   */
  restablecerVentanas(id: IdProceso | null): void;
}

/**
 * Opciones del servicio.
 */
export interface OpcionesServicioInterfaz {
  /** Reloj inyectable (fecha ISO local) para pruebas. */
  reloj?: () => string;
}

/**
 * Error de validación de una geometría.
 *
 * @returns El error.
 */
function geometriaInvalida(): ErrorDeNegocio {
  return new ErrorDeNegocio('VALIDACION', 'El tamaño o la posición de la ventana son inválidos.');
}

/**
 * Exige un entero dentro de un rango.
 *
 * @param valor - Dato recibido.
 * @param minimo - Mínimo aceptado.
 * @param maximo - Máximo aceptado.
 * @returns El entero.
 * @throws {ErrorDeNegocio} Si no es un entero en el rango.
 */
function enteroEnRango(valor: unknown, minimo: number, maximo: number): number {
  if (
    typeof valor !== 'number' ||
    !Number.isSafeInteger(valor) ||
    valor < minimo ||
    valor > maximo
  ) {
    throw geometriaInvalida();
  }
  return valor;
}

/**
 * Exige un objeto con propiedades.
 *
 * @param valor - Dato recibido.
 * @returns El objeto.
 * @throws {ErrorDeNegocio} Si no es un objeto.
 */
function objeto(valor: unknown): Record<string, unknown> {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
    throw geometriaInvalida();
  }
  return valor as Record<string, unknown>;
}

/**
 * Lee y verifica una zona relativa: dentro del escritorio y no vacía.
 *
 * @param valor - Dato recibido.
 * @returns La zona.
 * @throws {ErrorDeNegocio} Si es inválida.
 */
function leerEncaje(valor: unknown): RectRelativo {
  const e = objeto(valor);
  const x = enteroEnRango(e.x, 0, ESCALA_RELATIVA - 1);
  const y = enteroEnRango(e.y, 0, ESCALA_RELATIVA - 1);
  return {
    x,
    y,
    ancho: enteroEnRango(e.ancho, 1, ESCALA_RELATIVA - x),
    alto: enteroEnRango(e.alto, 1, ESCALA_RELATIVA - y),
  };
}

/**
 * Lee y verifica la geometría de una ventana recibida del renderer o leída
 * de la base.
 *
 * @param valor - Dato recibido.
 * @returns Geometría válida.
 * @throws {ErrorDeNegocio} Si la forma o los valores no son válidos.
 *
 * @example
 * leerGeometria({ x: 16, y: 16, ancho: null, alto: null, maximizada: false, encaje: null });
 */
export function leerGeometria(valor: unknown): GeometriaGuardada {
  const g = objeto(valor);
  const ancho = g.ancho === null ? null : enteroEnRango(g.ancho, 1, PIXELES_MAXIMOS);
  const alto = g.alto === null ? null : enteroEnRango(g.alto, 1, PIXELES_MAXIMOS);
  // El tamaño se fija completo o se ajusta al contenido: nunca solo un eje.
  if ((ancho === null) !== (alto === null) || typeof g.maximizada !== 'boolean') {
    throw geometriaInvalida();
  }
  return {
    x: enteroEnRango(g.x, 0, PIXELES_MAXIMOS),
    y: enteroEnRango(g.y, 0, PIXELES_MAXIMOS),
    ancho,
    alto,
    maximizada: g.maximizada,
    encaje: g.encaje === null ? null : leerEncaje(g.encaje),
  };
}

/**
 * Verifica que un id sea de un proceso existente.
 *
 * @param id - Dato recibido.
 * @returns El id.
 * @throws {ErrorDeNegocio} Si el proceso no existe.
 */
export function exigirProceso(id: unknown): IdProceso {
  const proceso = PROCESOS.find((p) => p.id === id);
  if (!proceso) {
    throw new ErrorDeNegocio('VALIDACION', 'La ventana indicada no existe.');
  }
  return proceso.id;
}

/**
 * Lee una preferencia guardada sin romper si quedó inválida (p. ej. de una
 * versión anterior): en ese caso se ignora y la app usa el valor por defecto.
 *
 * @param valor - JSON guardado.
 * @param leer - Verificador del valor.
 * @returns El valor, o `null` si no es válido.
 */
function leerGuardado<T>(valor: string, leer: (dato: unknown) => T): T | null {
  try {
    return leer(JSON.parse(valor));
  } catch {
    return null;
  }
}

/**
 * Verifica un modo de barra.
 *
 * @param modo - Dato recibido.
 * @returns El modo.
 * @throws {ErrorDeNegocio} Si no existe.
 */
export function exigirModoBarra(modo: unknown): ModoBarra {
  const encontrado = MODOS_BARRA.find((m) => m === modo);
  if (!encontrado) {
    throw new ErrorDeNegocio('VALIDACION', 'El modo de la barra es inválido.');
  }
  return encontrado;
}

/**
 * Crea el servicio de preferencias de interfaz.
 *
 * @param db - Conexión abierta.
 * @param opciones - Reloj inyectable.
 * @returns El servicio.
 */
export function crearServicioInterfaz(
  db: BaseDeDatos,
  opciones: OpcionesServicioInterfaz = {},
): ServicioInterfaz {
  const reloj = opciones.reloj ?? aIsoLocal;
  return {
    preferencias() {
      const resultado: PreferenciasInterfaz = { barra: MODO_BARRA_POR_DEFECTO, ventanas: {} };
      for (const { clave, valor } of listarPreferencias(db)) {
        if (clave === CLAVE_BARRA) {
          resultado.barra = leerGuardado(valor, exigirModoBarra) ?? MODO_BARRA_POR_DEFECTO;
        } else if (clave.startsWith(PREFIJO_VENTANA)) {
          const id = PROCESOS.find((p) => clave === `${PREFIJO_VENTANA}${p.id}`)?.id;
          const geometria = leerGuardado(valor, leerGeometria);
          if (id && geometria) {
            resultado.ventanas[id] = geometria;
          }
        }
      }
      return resultado;
    },

    guardarBarra(modo) {
      guardarPreferencia(db, CLAVE_BARRA, JSON.stringify(exigirModoBarra(modo)), reloj());
    },

    guardarVentana({ id, geometria }) {
      const clave = `${PREFIJO_VENTANA}${exigirProceso(id)}`;
      guardarPreferencia(db, clave, JSON.stringify(leerGeometria(geometria)), reloj());
    },

    restablecerVentanas(id) {
      if (id === null) {
        borrarPreferenciasConPrefijo(db, PREFIJO_VENTANA);
      } else {
        borrarPreferencia(db, `${PREFIJO_VENTANA}${exigirProceso(id)}`);
      }
    },
  };
}
