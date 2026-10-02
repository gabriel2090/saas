import { ErrorDeNegocio } from '../../domain/errores';
import {
  validarCodigo,
  validarDatosProducto,
  validarMotivo,
  validarPesos,
} from '../../domain/maestros';
import { diferenciaStockInicial } from '../../domain/stock';
import type { BaseDeDatos } from '../../data/conexion';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import { registrarStockInicial } from '../../data/repositorios/kardex.repo';
import {
  ajustarConsecutivo,
  consultarConsecutivo,
  tomarConsecutivo,
} from '../../data/repositorios/consecutivos.repo';
import {
  actualizarCostoProducto,
  actualizarProducto,
  cambiarEstadoProducto,
  insertarProducto,
  listarProductos,
  obtenerProducto,
} from '../../data/repositorios/productos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type {
  DatosProducto,
  DatosProductoNuevo,
  ProductoDetalle,
  ProductoResumen,
  StockInicialNuevo,
} from '../../shared/maestros';

/**
 * Servicio del maestro de productos (§5.1).
 */
export interface ServicioProductos {
  /**
   * Lista todos los productos (activos e inactivos) con su stock total.
   *
   * @returns Productos ordenados por código.
   */
  listar(): ProductoResumen[];
  /**
   * Obtiene un producto con su stock por bodega.
   *
   * @param codigo - Código.
   * @returns El producto.
   * @throws {ErrorDeNegocio} Si no existe.
   */
  obtener(codigo: number): ProductoDetalle;
  /**
   * Código que se propone al crear un producto (consecutivo desde 101).
   *
   * @returns Próximo código.
   */
  siguienteCodigo(): number;
  /**
   * Crea un producto. Si no se indica código se toma el consecutivo; si se
   * indica, debe estar libre y el consecutivo se ajusta (D-25). El stock
   * inicial, si se indica, entra al kardex en la misma transacción y con las
   * mismas reglas del importador (D-39, D-45).
   *
   * @param datos - Datos del producto, con su costo inicial.
   * @param stockInicial - Stock inicial opcional (bodega y cantidad en milésimas).
   * @returns El producto creado.
   * @throws {ErrorDeNegocio} Si los datos no son válidos, el código ya existe, el proveedor no existe o está inactivo, o la bodega o la cantidad del stock inicial no son válidas.
   */
  crear(datos: DatosProductoNuevo, stockInicial?: StockInicialNuevo | null): ProductoDetalle;
  /**
   * Edita los datos de un producto (no el costo: ver {@link ServicioProductos.corregirCosto}).
   *
   * @param codigo - Código.
   * @param datos - Datos nuevos.
   * @returns El producto actualizado.
   * @throws {ErrorDeNegocio} Si no existe, los datos no son válidos o se cambia la unidad de un producto con movimientos.
   */
  editar(codigo: number, datos: DatosProducto): ProductoDetalle;
  /**
   * Inactiva o reactiva un producto (nunca se borra, D-27).
   *
   * @param codigo - Código.
   * @param activo - Estado deseado.
   * @returns El producto actualizado.
   * @throws {ErrorDeNegocio} Si no existe o ya está en ese estado.
   */
  cambiarEstado(codigo: number, activo: boolean): ProductoDetalle;
  /**
   * Corrige el costo a mano, con motivo obligatorio que queda en el historial (D-35).
   *
   * @param codigo - Código.
   * @param costo - Costo nuevo.
   * @param motivo - Motivo de la corrección.
   * @returns El producto actualizado.
   * @throws {ErrorDeNegocio} Si no existe, el costo no es válido, es igual al actual o falta el motivo.
   */
  corregirCosto(codigo: number, costo: number, motivo: string): ProductoDetalle;
}

/**
 * Crea el servicio de productos.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioProductos(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioProductos {
  /**
   * Obtiene un producto o lanza el error para el usuario.
   *
   * @param codigo - Código.
   * @returns El producto.
   */
  const exigir = (codigo: number): ProductoDetalle => {
    const producto = obtenerProducto(db, codigo);
    if (!producto) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el producto con código ${codigo}.`);
    }
    return producto;
  };

  /**
   * Verifica que el proveedor exista y esté activo.
   *
   * @param proveedorCodigo - Código del proveedor.
   */
  const exigirProveedorActivo = (proveedorCodigo: number): void => {
    const proveedor = obtenerTercero(db, 'proveedor', proveedorCodigo);
    if (!proveedor) {
      throw new ErrorDeNegocio('VALIDACION', `No existe el proveedor ${proveedorCodigo}.`);
    }
    if (!proveedor.activo) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        `El proveedor ${proveedorCodigo} - ${proveedor.nombre} está inactivo.`,
      );
    }
  };

  return {
    listar: () => listarProductos(db),

    obtener: exigir,

    siguienteCodigo: () => consultarConsecutivo(db, 'producto'),

    crear(nuevo, stockInicial = null) {
      const datos = validarDatosProducto(nuevo);
      const costo = validarPesos(nuevo.costo, 'Costo');
      exigirProveedorActivo(datos.proveedorCodigo);
      const diferencia =
        stockInicial === null
          ? 0
          : diferenciaStockInicial({
              productoCodigo: nuevo.codigo ?? 0,
              unidad: datos.unidad,
              cantidad: stockInicial.cantidad,
              cantidadAnterior: 0,
              tieneOtrosMovimientos: false,
              permitirNegativo: false,
            });
      const codigo = ejecutar((ctx) => {
        let elegido: number;
        if (nuevo.codigo === null) {
          elegido = tomarConsecutivo(ctx, 'producto');
        } else {
          elegido = validarCodigo(nuevo.codigo);
          if (obtenerProducto(ctx.db, elegido)) {
            throw new ErrorDeNegocio(
              'CONFLICTO',
              `Ya existe un producto con el código ${elegido}.`,
            );
          }
          ajustarConsecutivo(ctx, 'producto', elegido);
        }
        insertarProducto(ctx, elegido, datos, costo);
        if (stockInicial !== null) {
          const bodega = obtenerCatalogo(ctx.db, 'bodega', stockInicial.bodegaId);
          if (!bodega?.activo) {
            throw new ErrorDeNegocio(
              'VALIDACION',
              'La bodega del stock inicial no existe o está inactiva.',
            );
          }
          registrarStockInicial(ctx, {
            productoCodigo: elegido,
            bodegaId: bodega.id,
            diferencia,
            costoUnitario: costo,
            documento: { tipo: 'producto', id: String(elegido) },
          });
        }
        return elegido;
      });
      return exigir(codigo);
    },

    editar(codigo, nuevos) {
      const anterior = exigir(codigo);
      const datos = validarDatosProducto(nuevos);
      if (datos.proveedorCodigo !== anterior.proveedorCodigo) {
        exigirProveedorActivo(datos.proveedorCodigo);
      }
      if (datos.unidad !== anterior.unidad && anterior.tieneMovimientos) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'No se puede cambiar la unidad de medida: el producto ya tiene movimientos de inventario.',
        );
      }
      ejecutar((ctx) => actualizarProducto(ctx, anterior, datos));
      return exigir(codigo);
    },

    cambiarEstado(codigo, activo) {
      const anterior = exigir(codigo);
      if (anterior.activo === activo) {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `El producto ya está ${activo ? 'activo' : 'inactivo'}.`,
        );
      }
      ejecutar((ctx) => cambiarEstadoProducto(ctx, anterior, activo));
      return exigir(codigo);
    },

    corregirCosto(codigo, costo, motivo) {
      const anterior = exigir(codigo);
      const nuevo = validarPesos(costo, 'Costo');
      const motivoLimpio = validarMotivo(motivo);
      if (nuevo === anterior.costo) {
        throw new ErrorDeNegocio('VALIDACION', 'El costo nuevo es igual al actual.');
      }
      ejecutar((ctx) => actualizarCostoProducto(ctx, anterior, nuevo, motivoLimpio));
      return exigir(codigo);
    },
  };
}
