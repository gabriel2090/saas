import { movimientoAjuste } from '../../domain/ajustes';
import { ErrorDeNegocio } from '../../domain/errores';
import { validarMotivo } from '../../domain/maestros';
import type { BaseDeDatos } from '../../data/conexion';
import { insertarAjuste, listarAjustes } from '../../data/repositorios/ajustes.repo';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import { tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { stockEnBodega } from '../../data/repositorios/kardex.repo';
import { obtenerProducto } from '../../data/repositorios/productos.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type { AjusteResumen, PeticionAjuste } from '../../shared/ajustes';

/**
 * Cantidad de ajustes recientes que muestra la ventana.
 */
const AJUSTES_RECIENTES = 50;

/**
 * Servicio de los ajustes de inventario (§9.2, D-46).
 */
export interface ServicioAjustes {
  /**
   * Lista los ajustes más recientes.
   *
   * @returns Ajustes, del más reciente al más antiguo.
   */
  listar(): AjusteResumen[];
  /**
   * Stock actual de un producto en una bodega.
   *
   * @param productoCodigo - Producto.
   * @param bodegaId - Bodega.
   * @returns Milésimas.
   */
  stock(productoCodigo: number, bodegaId: number): number;
  /**
   * Registra un ajuste y su movimiento de kardex en una transacción.
   *
   * @param peticion - Datos del ajuste.
   * @returns El ajuste guardado.
   * @throws {ErrorDeNegocio} Si el producto o la bodega no existen, falta el motivo o la cantidad no es válida.
   */
  registrar(peticion: PeticionAjuste): AjusteResumen;
}

/**
 * Crea el servicio de ajustes de inventario.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioAjustes(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioAjustes {
  return {
    listar: () => listarAjustes(db, AJUSTES_RECIENTES),

    stock: (productoCodigo, bodegaId) => stockEnBodega(db, productoCodigo, bodegaId),

    registrar(p) {
      const producto = obtenerProducto(db, p.productoCodigo);
      if (!producto) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `No existe el producto con código ${p.productoCodigo}.`,
        );
      }
      const bodega = obtenerCatalogo(db, 'bodega', p.bodegaId);
      if (!bodega?.activo) {
        throw new ErrorDeNegocio('VALIDACION', 'La bodega no existe o está inactiva.');
      }
      const motivo = validarMotivo(p.motivo);
      const numero = ejecutar((ctx) => {
        const stockActual = stockEnBodega(ctx.db, producto.codigo, bodega.id);
        const cantidad = movimientoAjuste({
          tipo: p.tipo,
          unidad: producto.unidad,
          cantidad: p.cantidad,
          stockActual,
        });
        const asignado = tomarConsecutivo(ctx, 'ajuste');
        insertarAjuste(ctx, {
          numero: asignado,
          productoCodigo: producto.codigo,
          bodegaId: bodega.id,
          tipo: p.tipo,
          cantidad,
          stockAnterior: stockActual,
          cantidadContada: p.tipo === 'conteo' ? p.cantidad : null,
          costoUnitario: producto.costo,
          motivo,
        });
        return asignado;
      });
      const guardado = listarAjustes(db, AJUSTES_RECIENTES).find((a) => a.numero === numero);
      if (!guardado) {
        throw new Error(`El ajuste ${numero} no se encontró después de guardarlo.`);
      }
      return guardado;
    },
  };
}
