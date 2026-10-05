import type { BaseDeDatos } from '../../data/conexion';
import { listarCatalogo } from '../../data/repositorios/catalogos.repo';
import {
  documentoVisibleDeHistorial,
  historialDelPeriodo,
  movimientosKardex,
  nombresHistorial,
  productoKardex,
  registroHistorial,
  saldoKardexAntes,
} from '../../data/repositorios/visores.repo';
import { esFechaValida, sumarDias } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import { coincideTextoVisor, detalleRegistro, registroVisor } from '../../domain/historial';
import { armarKardex } from '../../domain/kardex';
import {
  MAXIMO_REGISTROS_HISTORIAL,
  TIPOS_DOCUMENTO_HISTORIAL,
  type DetalleCambio,
  type PeticionHistorial,
  type ReporteHistorial,
} from '../../shared/historial';
import type { PeticionKardex, ReporteKardex } from '../../shared/kardex';

/**
 * Servicio del kardex y del visor del historial de cambios (Fase 5b). Solo
 * consulta: el historial no se puede editar ni borrar.
 */
export interface ServicioVisores {
  /**
   * Calcula el kardex de un producto en una bodega (o en todas) para un periodo.
   *
   * @param peticion - Producto, bodega y periodo.
   * @returns Saldo anterior, movimientos con saldo corrido y totales.
   * @throws {ErrorDeNegocio} Si el producto o la bodega no existen o el periodo no es válido.
   */
  kardex(peticion: PeticionKardex): ReporteKardex;
  /**
   * Lista el historial de cambios con filtros.
   *
   * @param peticion - Periodo, tipo, acción y texto.
   * @returns Hasta {@link MAXIMO_REGISTROS_HISTORIAL} registros, del más reciente al más antiguo.
   * @throws {ErrorDeNegocio} Si el periodo no es válido.
   */
  historial(peticion: PeticionHistorial): ReporteHistorial;
  /**
   * Detalle de un registro: datos generales y campos que cambiaron.
   *
   * @param id - Id del registro.
   * @returns Detalle.
   * @throws {ErrorDeNegocio} Si el registro no existe.
   */
  detalleHistorial(id: number): DetalleCambio;
}

/**
 * Verifica un periodo `desde`–`hasta`.
 *
 * @param desde - Primer día.
 * @param hasta - Último día.
 * @throws {ErrorDeNegocio} Si una fecha no existe o el rango está al revés.
 */
export function validarPeriodo(desde: string, hasta: string): void {
  for (const [fecha, campo] of [
    [desde, 'Desde'],
    [hasta, 'Hasta'],
  ] as const) {
    if (!esFechaValida(fecha)) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        `La fecha «${campo}» no es válida. Escríbala como dd/mm/aaaa.`,
      );
    }
  }
  if (desde > hasta) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      'La fecha «Desde» es posterior a «Hasta». Corrija el periodo.',
    );
  }
}

/**
 * Dependencias del servicio.
 */
export interface DependenciasVisores {
  /** Momento actual en ISO local con desfase. */
  ahora: () => string;
}

/**
 * Crea el servicio del kardex y del visor del historial.
 *
 * @param db - Conexión abierta.
 * @param dependencias - Reloj.
 * @returns El servicio.
 */
export function crearServicioVisores(
  db: BaseDeDatos,
  dependencias: DependenciasVisores,
): ServicioVisores {
  return {
    kardex(p) {
      validarPeriodo(p.desde, p.hasta);
      const producto = productoKardex(db, p.productoCodigo);
      if (!producto) {
        throw new ErrorDeNegocio(
          'NO_ENCONTRADO',
          `No existe el producto ${p.productoCodigo}. Búsquelo por código o nombre.`,
        );
      }
      let bodega: string | null = null;
      if (p.bodegaId !== null) {
        const encontrada = listarCatalogo(db, 'bodega').find((b) => b.id === p.bodegaId);
        if (!encontrada) {
          throw new ErrorDeNegocio('NO_ENCONTRADO', 'La bodega elegida no existe.');
        }
        bodega = encontrada.nombre;
      }
      const saldoAnterior = saldoKardexAntes(db, producto.codigo, p.bodegaId, p.desde);
      const movimientos = movimientosKardex(db, {
        productoCodigo: producto.codigo,
        bodegaId: p.bodegaId,
        desde: p.desde,
        hastaExclusivo: sumarDias(p.hasta, 1),
      });
      return {
        corte: dependencias.ahora(),
        producto,
        bodega,
        desde: p.desde,
        hasta: p.hasta,
        saldoAnterior,
        ...armarKardex({ saldoAnterior, movimientos, costoActual: producto.costo }),
      };
    },

    historial(p) {
      validarPeriodo(p.desde, p.hasta);
      const entidades =
        p.tipo === null
          ? null
          : (TIPOS_DOCUMENTO_HISTORIAL.find((t) => t.valor === p.tipo)?.entidades ?? []);
      const nombres = nombresHistorial(db);
      // El texto se busca en el resumen ya traducido (nombre del tercero,
      // motivo…), que no está en la base: se filtra aquí y no en SQL.
      const registros = historialDelPeriodo(db, {
        desde: p.desde,
        hastaExclusivo: sumarDias(p.hasta, 1),
        entidades,
        accion: p.accion,
      })
        .map((r) => registroVisor(r, nombres))
        .filter((r) => coincideTextoVisor(r, p.texto));
      return {
        corte: dependencias.ahora(),
        registros: registros.slice(0, MAXIMO_REGISTROS_HISTORIAL),
        truncado: registros.length > MAXIMO_REGISTROS_HISTORIAL,
      };
    },

    detalleHistorial(id) {
      const registro = registroHistorial(db, id);
      if (!registro) {
        throw new ErrorDeNegocio('NO_ENCONTRADO', 'El registro del historial no existe.');
      }
      const numero = Number(registro.entidadId);
      return {
        id,
        ...detalleRegistro(registro, nombresHistorial(db)),
        ver: Number.isSafeInteger(numero)
          ? documentoVisibleDeHistorial(db, registro.entidad, numero)
          : null,
      };
    },
  };
}
