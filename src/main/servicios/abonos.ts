import { validarAplicaciones, validarTextoAbono } from '../../domain/abonos';
import { diaDeIso, validarFechaDocumento } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import {
  anularAbonoProveedor,
  insertarAbonoProveedor,
  listarAbonosProveedor,
  obtenerAbonoProveedor,
  type AbonoProveedorDetalle,
} from '../../data/repositorios/abonos.repo';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import {
  deudaProveedor,
  facturasPendientesProveedor,
  saldosFacturasProveedor,
} from '../../data/repositorios/compras.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type {
  AbonoGuardado,
  ContextoAbono,
  ContextoAbonoProveedor,
  PeticionAnularAbono,
  PeticionGuardarAbono,
} from '../../shared/abonos';
import { aIsoLocal } from '../../shared/formato/fechas';

/**
 * Servicio de los abonos a proveedor (§8).
 */
export interface ServicioAbonos {
  /**
   * Datos generales de la ventana de abono.
   *
   * @returns Próximo número y día de hoy.
   */
  contexto(): ContextoAbono;
  /**
   * Deuda, facturas pendientes y abonos anteriores de un proveedor.
   *
   * @param proveedorCodigo - Proveedor.
   * @returns Contexto del proveedor.
   * @throws {ErrorDeNegocio} Si el proveedor no existe.
   */
  contextoProveedor(proveedorCodigo: number): ContextoAbonoProveedor;
  /**
   * Guarda un abono repartido entre facturas, en una transacción (§8, D-71).
   *
   * @param peticion - Datos del abono.
   * @returns Número del abono.
   * @throws {ErrorDeNegocio} Si los datos o el reparto no son válidos.
   */
  guardar(peticion: PeticionGuardarAbono): AbonoGuardado;
  /**
   * Anula un abono: el saldo vuelve a sus facturas y queda en el historial (§8).
   *
   * @param peticion - Abono y motivo.
   * @throws {ErrorDeNegocio} Si no existe o ya está anulado.
   */
  anular(peticion: PeticionAnularAbono): void;
  /**
   * Obtiene un abono con los datos del recibo.
   *
   * @param id - Id del abono.
   * @returns El abono.
   * @throws {ErrorDeNegocio} Si no existe.
   */
  obtener(id: number): AbonoProveedorDetalle;
}

/**
 * Opciones del servicio de abonos.
 */
export interface OpcionesServicioAbonos {
  /** Día de hoy `AAAA-MM-DD` (inyectable en pruebas). */
  hoy?: () => string;
}

/**
 * Crea el servicio de abonos a proveedor.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @param opciones - Reloj del día.
 * @returns El servicio.
 */
export function crearServicioAbonos(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
  opciones: OpcionesServicioAbonos = {},
): ServicioAbonos {
  const hoy = opciones.hoy ?? ((): string => diaDeIso(aIsoLocal()));

  /**
   * Verifica que el proveedor exista.
   *
   * @param codigo - Proveedor.
   */
  const exigirProveedor = (codigo: number): void => {
    if (!obtenerTercero(db, 'proveedor', codigo)) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el proveedor ${codigo}.`);
    }
  };

  /**
   * Obtiene un abono o lanza el error para el usuario.
   *
   * @param id - Id del abono.
   * @returns El abono.
   */
  const exigirAbono = (id: number): AbonoProveedorDetalle => {
    const abono = obtenerAbonoProveedor(db, id);
    if (!abono) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', 'El abono no existe.');
    }
    return abono;
  };

  return {
    contexto: () => ({ siguienteNumero: consultarConsecutivo(db, 'abono_proveedor'), hoy: hoy() }),

    contextoProveedor(proveedorCodigo) {
      exigirProveedor(proveedorCodigo);
      return {
        deuda: deudaProveedor(db, proveedorCodigo, hoy()),
        facturas: facturasPendientesProveedor(db, proveedorCodigo),
        abonos: listarAbonosProveedor(db, proveedorCodigo),
      };
    },

    guardar(p) {
      // Un proveedor inactivo puede tener deudas viejas: se le puede abonar.
      exigirProveedor(p.proveedorCodigo);
      const fecha = validarFechaDocumento(p.fecha, hoy());
      const forma = obtenerCatalogo(db, 'forma-pago', p.formaPagoId);
      if (!forma?.activo) {
        throw new ErrorDeNegocio('VALIDACION', 'Elija la forma de pago del abono.');
      }
      const observacion = validarTextoAbono(p.observacion, 'Observación');
      return ejecutar((ctx) => {
        const aplicaciones = validarAplicaciones(
          p.valor,
          p.aplicaciones,
          saldosFacturasProveedor(ctx.db, p.proveedorCodigo),
        );
        const numero = tomarConsecutivo(ctx, 'abono_proveedor');
        const id = insertarAbonoProveedor(ctx, {
          numero,
          proveedorCodigo: p.proveedorCodigo,
          fecha,
          formaPagoId: forma.id,
          valor: p.valor,
          observacion,
          origen: 'manual',
          aplicaciones,
        });
        return { id, numero };
      });
    },

    anular(p) {
      const abono = exigirAbono(p.id);
      if (abono.estado === 'anulado') {
        throw new ErrorDeNegocio('CONFLICTO', `El abono ${abono.numero} ya está anulado.`);
      }
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      ejecutar((ctx) => anularAbonoProveedor(ctx, abono, motivo));
    },

    obtener: exigirAbono,
  };
}
