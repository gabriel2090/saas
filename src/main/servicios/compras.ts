import {
  calcularVencimiento,
  diaDeIso,
  validarFechaDocumento,
  validarPlazo,
} from '../../domain/calendario';
import {
  calcularCompra,
  claveNumeroProveedor,
  validarNumeroProveedor,
  validarOrdenCompra,
  type LineaCompraEntrada,
} from '../../domain/compras';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import { insertarAbonoProveedor } from '../../data/repositorios/abonos.repo';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import {
  compraConNumeroProveedor,
  deudaProveedor,
  insertarCompra,
  ultimoPlazoProveedor,
} from '../../data/repositorios/compras.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { insertarMovimiento, stockDeBodega } from '../../data/repositorios/kardex.repo';
import { actualizarCostoProducto, obtenerProducto } from '../../data/repositorios/productos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { aIsoLocal } from '../../shared/formato/fechas';
import type {
  CompraGuardada,
  ContextoCompra,
  ContextoCompraProveedor,
  PeticionGuardarCompra,
  StockProducto,
} from '../../shared/compras';
import type { ProductoDetalle } from '../../shared/maestros';

/**
 * Servicio de las facturas de proveedor (§6).
 */
export interface ServicioCompras {
  /**
   * Datos generales de la ventana de compra.
   *
   * @returns Próximo número y día de hoy.
   */
  contexto(): ContextoCompra;
  /**
   * Deuda y último plazo de un proveedor (§5.3, D-67).
   *
   * @param proveedorCodigo - Proveedor.
   * @returns Contexto del proveedor.
   * @throws {ErrorDeNegocio} Si el proveedor no existe.
   */
  contextoProveedor(proveedorCodigo: number): ContextoCompraProveedor;
  /**
   * Stock de los productos en una bodega (columna «Stock», D-66).
   *
   * @param bodegaId - Bodega.
   * @returns Stock por producto.
   */
  stockBodega(bodegaId: number): StockProducto[];
  /**
   * Guarda una factura de proveedor en **una sola transacción**: la factura
   * con sus líneas y su versión 1, la entrada al kardex, el costo nuevo de
   * cada producto (con historial), la cuenta por pagar y, si es de contado,
   * el abono automático (§3, §6, D-48).
   *
   * @param peticion - Datos de la compra.
   * @returns Número interno y total.
   * @throws {ErrorDeNegocio} Si algún dato no es válido o el número del proveedor ya está registrado.
   */
  guardar(peticion: PeticionGuardarCompra): CompraGuardada;
}

/**
 * Opciones del servicio de compras.
 */
export interface OpcionesServicioCompras {
  /** Día de hoy `AAAA-MM-DD` (inyectable en pruebas). */
  hoy?: () => string;
}

/**
 * Crea el servicio de compras.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @param opciones - Reloj del día.
 * @returns El servicio.
 */
export function crearServicioCompras(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
  opciones: OpcionesServicioCompras = {},
): ServicioCompras {
  const hoy = opciones.hoy ?? ((): string => diaDeIso(aIsoLocal()));

  /**
   * Verifica que el proveedor exista.
   *
   * @param codigo - Proveedor.
   * @returns Nombre y estado.
   */
  const exigirProveedor = (codigo: number): { nombre: string; activo: boolean } => {
    const proveedor = obtenerTercero(db, 'proveedor', codigo);
    if (!proveedor) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el proveedor ${codigo}.`);
    }
    return proveedor;
  };

  return {
    contexto: () => ({ siguienteNumero: consultarConsecutivo(db, 'compra'), hoy: hoy() }),

    contextoProveedor(proveedorCodigo) {
      exigirProveedor(proveedorCodigo);
      return {
        deuda: deudaProveedor(db, proveedorCodigo, hoy()),
        ultimoPlazo: ultimoPlazoProveedor(db, proveedorCodigo),
      };
    },

    stockBodega: (bodegaId) => stockDeBodega(db, bodegaId),

    guardar(p) {
      const proveedor = exigirProveedor(p.proveedorCodigo);
      if (!proveedor.activo) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `El proveedor ${p.proveedorCodigo} - ${proveedor.nombre} está inactivo.`,
        );
      }
      const numeroProveedor = validarNumeroProveedor(p.numeroProveedor);
      const clave = claveNumeroProveedor(numeroProveedor);
      const fecha = validarFechaDocumento(p.fecha, hoy());
      const plazoDias = validarPlazo(p.plazoDias);
      const ordenCompra = validarOrdenCompra(p.ordenCompra);
      const bodega = obtenerCatalogo(db, 'bodega', p.bodegaId);
      if (!bodega?.activo) {
        throw new ErrorDeNegocio('VALIDACION', 'La bodega no existe o está inactiva.');
      }
      if (p.contado !== null) {
        const forma = obtenerCatalogo(db, 'forma-pago', p.contado.formaPagoId);
        if (!forma?.activo) {
          throw new ErrorDeNegocio('VALIDACION', 'Elija la forma de pago de la compra de contado.');
        }
      }

      const productos = new Map<number, ProductoDetalle>();
      const lineas: LineaCompraEntrada[] = p.lineas.map((linea, i) => {
        const producto =
          productos.get(linea.productoCodigo) ?? obtenerProducto(db, linea.productoCodigo);
        if (!producto) {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `Línea ${i + 1}: no existe el producto con código ${linea.productoCodigo}.`,
          );
        }
        productos.set(producto.codigo, producto);
        return { producto, cantidad: linea.cantidad, costoUnitario: linea.costoUnitario };
      });
      const calculo = calcularCompra({
        proveedorCodigo: p.proveedorCodigo,
        lineas,
        flete: p.flete,
        fleteProveedor: p.fleteProveedor,
        descuento: p.descuento,
        descuentoEnCosto: p.descuentoEnCosto,
      });
      if (p.contado !== null && calculo.total === 0) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'El total a pagar es cero: no hay nada que pagar de contado.',
        );
      }

      return ejecutar((ctx) => {
        // Se vuelve a revisar dentro de la transacción: otra compra pudo
        // guardarse con ese número entre la validación y este momento.
        const repetida = compraConNumeroProveedor(ctx.db, p.proveedorCodigo, clave);
        if (repetida !== null) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            `El proveedor ya tiene registrada la factura ${numeroProveedor} (compra ${repetida}).`,
          );
        }
        const numero = tomarConsecutivo(ctx, 'compra');
        const id = insertarCompra(ctx, {
          numero,
          proveedorCodigo: p.proveedorCodigo,
          numeroProveedor,
          numeroProveedorClave: clave,
          fecha,
          plazoDias,
          vence: calcularVencimiento(fecha, plazoDias),
          bodegaId: bodega.id,
          ordenCompra,
          subtotal: calculo.subtotal,
          flete: p.flete,
          fleteProveedor: p.fleteProveedor,
          descuento: calculo.descuento,
          descuentoPorcentaje: p.descuento.modo === 'porcentaje' ? p.descuento.valor : null,
          descuentoEnCosto: p.descuentoEnCosto,
          total: calculo.total,
          pagadaContado: p.contado !== null,
          lineas: lineas.map((l, i) => {
            const c = calculo.lineas[i];
            if (!c) {
              throw new Error('El cálculo no devolvió todas las líneas.');
            }
            return {
              productoCodigo: l.producto.codigo,
              cantidad: l.cantidad,
              costoUnitario: l.costoUnitario,
              total: c.total,
              flete: c.flete,
              descuento: c.descuento,
              costoNuevo: c.costoNuevo,
              costoAnterior: c.costoAnterior,
            };
          }),
        });
        const documento = { tipo: 'factura_proveedor', id: String(numero) };
        lineas.forEach((l, i) => {
          insertarMovimiento(ctx, {
            productoCodigo: l.producto.codigo,
            bodegaId: bodega.id,
            tipo: 'compra',
            cantidad: l.cantidad,
            costoUnitario: calculo.lineas[i]?.costoNuevo ?? l.costoUnitario,
            documento,
          });
        });
        for (const [codigo, costoNuevo] of calculo.costosNuevos) {
          const producto = productos.get(codigo);
          if (producto && producto.costo !== costoNuevo) {
            actualizarCostoProducto(ctx, producto, costoNuevo, `Compra ${numero}`);
          }
        }
        let abonoNumero: number | null = null;
        if (p.contado !== null) {
          abonoNumero = tomarConsecutivo(ctx, 'abono_proveedor');
          insertarAbonoProveedor(ctx, {
            numero: abonoNumero,
            proveedorCodigo: p.proveedorCodigo,
            fecha,
            formaPagoId: p.contado.formaPagoId,
            valor: calculo.total,
            observacion: `Pago de contado de la compra ${numero}`,
            origen: 'contado',
            aplicaciones: [{ facturaId: id, valor: calculo.total }],
          });
        }
        return { id, numero, total: calculo.total, abonoNumero };
      });
    },
  };
}
