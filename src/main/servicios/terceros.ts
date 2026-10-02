import { ErrorDeNegocio } from '../../domain/errores';
import { validarCodigo, validarDatosTercero } from '../../domain/maestros';
import type { BaseDeDatos } from '../../data/conexion';
import {
  ajustarConsecutivo,
  consultarConsecutivo,
  tomarConsecutivo,
} from '../../data/repositorios/consecutivos.repo';
import {
  actualizarTercero,
  cambiarEstadoTercero,
  codigoPorIdentificacion,
  insertarTercero,
  listarTerceros,
  obtenerTercero,
} from '../../data/repositorios/terceros.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type { ClaseTercero, DatosTercero, DatosTerceroNuevo, Tercero } from '../../shared/maestros';

/**
 * Nombre de cada clase en los mensajes.
 */
const NOMBRES: Readonly<Record<ClaseTercero, string>> = {
  cliente: 'cliente',
  proveedor: 'proveedor',
};

/**
 * Servicio de los maestros de clientes y proveedores (§5.2, §5.3).
 */
export interface ServicioTerceros {
  /**
   * Lista los terceros de una clase.
   *
   * @param clase - Cliente o proveedor.
   * @returns Terceros ordenados por código.
   */
  listar(clase: ClaseTercero): Tercero[];
  /**
   * Código que se propone al crear (consecutivo desde 10001, S-01).
   *
   * @param clase - Cliente o proveedor.
   * @returns Próximo código.
   */
  siguienteCodigo(clase: ClaseTercero): number;
  /**
   * Crea un tercero.
   *
   * @param clase - Cliente o proveedor.
   * @param datos - Datos, con código elegido o `null` para el consecutivo.
   * @returns El tercero creado.
   * @throws {ErrorDeNegocio} Si los datos no son válidos o el código o la identificación ya existen.
   */
  crear(clase: ClaseTercero, datos: DatosTerceroNuevo): Tercero;
  /**
   * Edita un tercero.
   *
   * @param clase - Cliente o proveedor.
   * @param codigo - Código.
   * @param datos - Datos nuevos.
   * @returns El tercero actualizado.
   * @throws {ErrorDeNegocio} Si no existe, es del sistema, los datos no son válidos o la identificación es de otro.
   */
  editar(clase: ClaseTercero, codigo: number, datos: DatosTercero): Tercero;
  /**
   * Inactiva o reactiva un tercero (nunca se borra, D-27).
   *
   * @param clase - Cliente o proveedor.
   * @param codigo - Código.
   * @param activo - Estado deseado.
   * @returns El tercero actualizado.
   * @throws {ErrorDeNegocio} Si no existe, es del sistema o ya está en ese estado.
   */
  cambiarEstado(clase: ClaseTercero, codigo: number, activo: boolean): Tercero;
}

/**
 * Crea el servicio de terceros.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioTerceros(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioTerceros {
  /**
   * Obtiene un tercero editable o lanza el error para el usuario.
   *
   * @param clase - Cliente o proveedor.
   * @param codigo - Código.
   * @returns El tercero.
   */
  const exigirEditable = (clase: ClaseTercero, codigo: number): Tercero => {
    const tercero = obtenerTercero(db, clase, codigo);
    if (!tercero) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el ${NOMBRES[clase]} ${codigo}.`);
    }
    if (tercero.esSistema) {
      throw new ErrorDeNegocio(
        'CONFLICTO',
        `«${tercero.nombre}» lo crea el sistema y no se puede modificar.`,
      );
    }
    return tercero;
  };

  /**
   * Verifica que la identificación no la tenga otro tercero de la misma clase (D-29).
   *
   * @param clase - Cliente o proveedor.
   * @param datos - Datos ya validados.
   * @param codigoPropio - Código del tercero que se edita (o `null` al crear).
   */
  const exigirIdentificacionLibre = (
    clase: ClaseTercero,
    datos: DatosTercero,
    codigoPropio: number | null,
  ): void => {
    const otro = codigoPorIdentificacion(
      db,
      clase,
      datos.tipoIdentificacion,
      datos.numeroIdentificacion,
    );
    if (otro !== null && otro !== codigoPropio) {
      throw new ErrorDeNegocio(
        'CONFLICTO',
        `Ya existe un ${NOMBRES[clase]} con ${datos.tipoIdentificacion} ${datos.numeroIdentificacion} (código ${otro}).`,
      );
    }
  };

  return {
    listar: (clase) => listarTerceros(db, clase),

    siguienteCodigo: (clase) => consultarConsecutivo(db, clase),

    crear(clase, nuevo) {
      const datos = validarDatosTercero(nuevo, clase);
      exigirIdentificacionLibre(clase, datos, null);
      return ejecutar((ctx) => {
        let codigo: number;
        if (nuevo.codigo === null) {
          codigo = tomarConsecutivo(ctx, clase);
        } else {
          codigo = validarCodigo(nuevo.codigo);
          if (obtenerTercero(ctx.db, clase, codigo)) {
            throw new ErrorDeNegocio(
              'CONFLICTO',
              `Ya existe un ${NOMBRES[clase]} con el código ${codigo}.`,
            );
          }
          ajustarConsecutivo(ctx, clase, codigo);
        }
        return insertarTercero(ctx, clase, codigo, datos);
      });
    },

    editar(clase, codigo, nuevos) {
      const anterior = exigirEditable(clase, codigo);
      const datos = validarDatosTercero(nuevos, clase);
      exigirIdentificacionLibre(clase, datos, codigo);
      return ejecutar((ctx) => actualizarTercero(ctx, clase, anterior, datos));
    },

    cambiarEstado(clase, codigo, activo) {
      const anterior = exigirEditable(clase, codigo);
      if (anterior.activo === activo) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `El ${NOMBRES[clase]} ya está ${activo ? 'activo' : 'inactivo'}.`,
        );
      }
      return ejecutar((ctx) => cambiarEstadoTercero(ctx, clase, anterior, activo));
    },
  };
}
