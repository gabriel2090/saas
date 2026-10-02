import { ErrorDeNegocio } from '../../domain/errores';
import { validarDatosCatalogo } from '../../domain/maestros';
import type { BaseDeDatos } from '../../data/conexion';
import {
  actualizarCatalogo,
  cambiarEstadoCatalogo,
  idPorNombre,
  insertarCatalogo,
  listarCatalogo,
  obtenerCatalogo,
} from '../../data/repositorios/catalogos.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type { DatosCatalogo, RegistroCatalogo, TipoCatalogo } from '../../shared/maestros';

/**
 * Nombre de cada catálogo en los mensajes.
 */
const NOMBRES: Readonly<Record<TipoCatalogo, string>> = {
  bodega: 'una bodega',
  'forma-pago': 'una forma de pago',
};

/**
 * Servicio de los catálogos de bodegas y formas de pago (§5.4).
 */
export interface ServicioCatalogos {
  /**
   * Lista un catálogo.
   *
   * @param tipo - Catálogo.
   * @returns Registros.
   */
  listar(tipo: TipoCatalogo): RegistroCatalogo[];
  /**
   * Crea un registro.
   *
   * @param tipo - Catálogo.
   * @param datos - Datos.
   * @returns El registro creado.
   * @throws {ErrorDeNegocio} Si el nombre falta o ya existe.
   */
  crear(tipo: TipoCatalogo, datos: DatosCatalogo): RegistroCatalogo;
  /**
   * Edita un registro.
   *
   * @param tipo - Catálogo.
   * @param id - Id.
   * @param datos - Datos nuevos.
   * @returns El registro actualizado.
   * @throws {ErrorDeNegocio} Si no existe o el nombre falta o es de otro registro.
   */
  editar(tipo: TipoCatalogo, id: number, datos: DatosCatalogo): RegistroCatalogo;
  /**
   * Inactiva o reactiva un registro. La bodega Principal no se puede inactivar.
   *
   * @param tipo - Catálogo.
   * @param id - Id.
   * @param activo - Estado deseado.
   * @returns El registro actualizado.
   * @throws {ErrorDeNegocio} Si no existe, es la Principal o ya está en ese estado.
   */
  cambiarEstado(tipo: TipoCatalogo, id: number, activo: boolean): RegistroCatalogo;
}

/**
 * Crea el servicio de catálogos.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioCatalogos(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioCatalogos {
  /**
   * Obtiene un registro o lanza el error para el usuario.
   *
   * @param tipo - Catálogo.
   * @param id - Id.
   * @returns El registro.
   */
  const exigir = (tipo: TipoCatalogo, id: number): RegistroCatalogo => {
    const registro = obtenerCatalogo(db, tipo, id);
    if (!registro) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', 'El registro ya no existe.');
    }
    return registro;
  };

  /**
   * Verifica que ningún otro registro tenga un nombre equivalente.
   *
   * @param tipo - Catálogo.
   * @param nombre - Nombre ya validado.
   * @param idPropio - Id del registro que se edita (o `null` al crear).
   */
  const exigirNombreLibre = (tipo: TipoCatalogo, nombre: string, idPropio: number | null): void => {
    const otro = idPorNombre(db, tipo, nombre);
    if (otro !== null && otro !== idPropio) {
      throw new ErrorDeNegocio('CONFLICTO', `Ya existe ${NOMBRES[tipo]} llamada «${nombre}».`);
    }
  };

  return {
    listar: (tipo) => listarCatalogo(db, tipo),

    crear(tipo, nuevos) {
      const datos = validarDatosCatalogo(nuevos, tipo);
      exigirNombreLibre(tipo, datos.nombre, null);
      return ejecutar((ctx) => insertarCatalogo(ctx, tipo, datos));
    },

    editar(tipo, id, nuevos) {
      const anterior = exigir(tipo, id);
      const datos = validarDatosCatalogo(nuevos, tipo);
      exigirNombreLibre(tipo, datos.nombre, id);
      return ejecutar((ctx) => actualizarCatalogo(ctx, tipo, anterior, datos));
    },

    cambiarEstado(tipo, id, activo) {
      const anterior = exigir(tipo, id);
      if (!activo && anterior.esPrincipal) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          'La bodega Principal siempre debe existir y no se puede inactivar.',
        );
      }
      if (anterior.activo === activo) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `El registro ya está ${activo ? 'activo' : 'inactivo'}.`,
        );
      }
      return ejecutar((ctx) => cambiarEstadoCatalogo(ctx, tipo, anterior, activo));
    },
  };
}
