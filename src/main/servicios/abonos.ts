import { validarAplicaciones, validarTextoAbono } from '../../domain/abonos';
import { diaDeIso, validarFechaDocumento } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import type { BaseDeDatos } from '../../data/conexion';
import {
  anularAbono,
  insertarAbono,
  listarAbonos,
  obtenerAbono,
  saldosFacturas,
  type AbonoDetalle,
} from '../../data/repositorios/abonos.repo';
import { obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import { deudaProveedor, facturasPendientesProveedor } from '../../data/repositorios/compras.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import { deudaCliente, facturasPendientesCliente } from '../../data/repositorios/ventas.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import type {
  AbonoGuardado,
  ContextoAbono,
  ContextoAbonoTercero,
  PeticionAnularAbono,
  PeticionGuardarAbono,
  TipoAbono,
} from '../../shared/abonos';
import { aIsoLocal } from '../../shared/formato/fechas';
import { CODIGO_CONSUMIDOR_FINAL } from '../../shared/ventas';

/**
 * Servicio de los abonos de cliente y de proveedor (§8). Ambos funcionan
 * igual; cada tipo tiene su propio consecutivo.
 */
export interface ServicioAbonos {
  /**
   * Datos generales de la ventana de abono.
   *
   * @param tipo - Cliente o proveedor.
   * @returns Próximo número y día de hoy.
   */
  contexto(tipo: TipoAbono): ContextoAbono;
  /**
   * Deuda, facturas pendientes y abonos anteriores de un cliente o proveedor.
   *
   * @param tipo - Cliente o proveedor.
   * @param codigo - Código del tercero.
   * @returns Contexto del tercero.
   * @throws {ErrorDeNegocio} Si el tercero no existe.
   */
  contextoTercero(tipo: TipoAbono, codigo: number): ContextoAbonoTercero;
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
  obtener(id: number): AbonoDetalle;
}

/**
 * Opciones del servicio de abonos.
 */
export interface OpcionesServicioAbonos {
  /** Día de hoy `AAAA-MM-DD` (inyectable en pruebas). */
  hoy?: () => string;
}

/**
 * Consecutivo de cada tipo de abono.
 *
 * @param tipo - Cliente o proveedor.
 * @returns Clave del consecutivo.
 */
function claveConsecutivo(tipo: TipoAbono): 'abono_cliente' | 'abono_proveedor' {
  return tipo === 'cliente' ? 'abono_cliente' : 'abono_proveedor';
}

/**
 * Crea el servicio de abonos.
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
   * Verifica que el cliente o proveedor exista. Un tercero inactivo puede
   * tener deudas viejas: se le puede abonar.
   *
   * @param tipo - Cliente o proveedor.
   * @param codigo - Código del tercero.
   */
  const exigirTercero = (tipo: TipoAbono, codigo: number): void => {
    if (!obtenerTercero(db, tipo, codigo)) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', `No existe el ${tipo} ${codigo}.`);
    }
    if (tipo === 'cliente' && codigo === CODIGO_CONSUMIDOR_FINAL) {
      throw new ErrorDeNegocio(
        'VALIDACION',
        '«Consumidor final» no tiene cartera: sus ventas son de contado.',
      );
    }
  };

  /**
   * Obtiene un abono o lanza el error para el usuario.
   *
   * @param id - Id del abono.
   * @returns El abono.
   */
  const exigirAbono = (id: number): AbonoDetalle => {
    const abono = obtenerAbono(db, id);
    if (!abono) {
      throw new ErrorDeNegocio('NO_ENCONTRADO', 'El abono no existe.');
    }
    return abono;
  };

  return {
    contexto: (tipo) => ({
      siguienteNumero: consultarConsecutivo(db, claveConsecutivo(tipo)),
      hoy: hoy(),
    }),

    contextoTercero(tipo, codigo) {
      exigirTercero(tipo, codigo);
      const dia = hoy();
      return tipo === 'cliente'
        ? {
            deuda: deudaCliente(db, codigo, dia),
            facturas: facturasPendientesCliente(db, codigo),
            abonos: listarAbonos(db, 'cliente', codigo),
          }
        : {
            deuda: deudaProveedor(db, codigo, dia),
            facturas: facturasPendientesProveedor(db, codigo),
            abonos: listarAbonos(db, 'proveedor', codigo),
          };
    },

    guardar(p) {
      exigirTercero(p.tipo, p.terceroCodigo);
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
          saldosFacturas(ctx.db, p.tipo, p.terceroCodigo),
        );
        const numero = tomarConsecutivo(ctx, claveConsecutivo(p.tipo));
        const id = insertarAbono(ctx, {
          tipo: p.tipo,
          numero,
          terceroCodigo: p.terceroCodigo,
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
      ejecutar((ctx) => anularAbono(ctx, abono, motivo));
    },

    obtener: exigirAbono,
  };
}
