import { validarAplicaciones, validarTextoAbono } from '../../domain/abonos';
import { diaDeIso, validarFechaDocumento } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import { movimientoFavorAlAnularAbono, validarUsoSaldoFavor } from '../../domain/saldo-favor';
import type { BaseDeDatos } from '../../data/conexion';
import {
  anularAbono,
  facturasAnuladasDeAbono,
  formaPagoDeAbono,
  insertarAbono,
  listarAbonos,
  obtenerAbono,
  saldosFacturas,
  type AbonoDetalle,
} from '../../data/repositorios/abonos.repo';
import {
  idFormaSaldoFavor,
  nombreFormaPago,
  obtenerCatalogo,
} from '../../data/repositorios/catalogos.repo';
import { leerCartera } from '../../data/repositorios/correcciones.repo';
import { insertarMovimientoFavor, saldoFavorDe } from '../../data/repositorios/saldosFavor.repo';
import { deudaProveedor, facturasPendientesProveedor } from '../../data/repositorios/compras.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import { deudaCliente, facturasPendientesCliente } from '../../data/repositorios/ventas.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
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
 * Anula un abono dentro de una transacción y ajusta el libro de saldo a
 * favor (D-127, D-130):
 *
 * 1. Si se pagó con la forma «Saldo a favor», ese saldo vuelve al tercero.
 * 2. Cada factura a la que se aplicó vuelve a deber lo que el abono pagaba;
 *    si había trasladado saldo a favor, lo recupera hasta lo disponible. Si
 *    la factura está anulada, recupera completo lo que el abono le pagó.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param abono - Abono activo.
 * @param motivo - Motivo limpio.
 * @param formaSaldoFavorId - Id de la forma de pago de sistema.
 * @throws {ErrorDeNegocio} Si ya está anulado o el saldo a favor que debe recuperar ya se usó.
 */
export function anularAbonoConSaldoFavor(
  ctx: ContextoTransaccion,
  abono: AbonoDetalle,
  motivo: string,
  formaSaldoFavorId: number,
): void {
  const conSaldoFavor = formaPagoDeAbono(ctx.db, abono.id) === formaSaldoFavorId;
  const anuladas = facturasAnuladasDeAbono(ctx.db, abono);
  let disponible =
    saldoFavorDe(ctx.db, abono.tipo, abono.terceroCodigo) + (conSaldoFavor ? abono.valor : 0);
  const movimientos = abono.aplicaciones.map((a) => {
    const cartera = leerCartera(ctx.db, abono.tipo, a.facturaId);
    const movimiento = movimientoFavorAlAnularAbono(
      {
        numero: a.facturaNumero,
        anulada: anuladas.get(a.facturaId) ?? false,
        valor: a.valor,
        cartera,
      },
      disponible,
    );
    disponible += movimiento;
    return { facturaId: a.facturaId, movimiento };
  });
  const recuperado = new Map(
    movimientos.filter((m) => !anuladas.get(m.facturaId)).map((m) => [m.facturaId, -m.movimiento]),
  );
  if (!anularAbono(ctx, abono, motivo, recuperado)) {
    throw new ErrorDeNegocio(
      'CONFLICTO',
      `El abono ${abono.numero} ya está anulado: no hay nada más que hacer.`,
    );
  }
  const documento = { tipo: 'anulacion_abono', id: abono.id } as const;
  if (conSaldoFavor) {
    insertarMovimientoFavor(ctx, {
      tipo: abono.tipo,
      terceroCodigo: abono.terceroCodigo,
      valor: abono.valor,
      origen: 'anulacion_abono',
      documento,
      facturaId: null,
    });
  }
  for (const { facturaId, movimiento } of movimientos) {
    insertarMovimientoFavor(ctx, {
      tipo: abono.tipo,
      terceroCodigo: abono.terceroCodigo,
      valor: movimiento,
      origen: 'anulacion_abono',
      documento,
      facturaId,
    });
  }
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

  const formaSaldoFavorId = idFormaSaldoFavor(db);

  return {
    contexto: (tipo) => ({
      siguienteNumero: consultarConsecutivo(db, claveConsecutivo(tipo)),
      hoy: hoy(),
      formaSaldoFavor: { id: formaSaldoFavorId, nombre: nombreFormaPago(db, formaSaldoFavorId) },
    }),

    contextoTercero(tipo, codigo) {
      exigirTercero(tipo, codigo);
      const dia = hoy();
      const saldoFavor = saldoFavorDe(db, tipo, codigo);
      return tipo === 'cliente'
        ? {
            deuda: deudaCliente(db, codigo, dia),
            facturas: facturasPendientesCliente(db, codigo),
            abonos: listarAbonos(db, 'cliente', codigo),
            saldoFavor,
          }
        : {
            deuda: deudaProveedor(db, codigo, dia),
            facturas: facturasPendientesProveedor(db, codigo),
            abonos: listarAbonos(db, 'proveedor', codigo),
            saldoFavor,
          };
    },

    guardar(p) {
      exigirTercero(p.tipo, p.terceroCodigo);
      const fecha = validarFechaDocumento(p.fecha, hoy());
      const conSaldoFavor = p.formaPagoId === formaSaldoFavorId;
      const forma = conSaldoFavor ? null : obtenerCatalogo(db, 'forma-pago', p.formaPagoId);
      if (!conSaldoFavor && !forma?.activo) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'Elija la forma de pago del abono (efectivo, transferencia, saldo a favor…).',
        );
      }
      const observacion = validarTextoAbono(p.observacion, 'Observación');
      return ejecutar((ctx) => {
        if (conSaldoFavor) {
          // Se valida dentro de la transacción: otra operación pudo usar el saldo entre tanto.
          validarUsoSaldoFavor(p.valor, saldoFavorDe(ctx.db, p.tipo, p.terceroCodigo));
        }
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
          formaPagoId: p.formaPagoId,
          valor: p.valor,
          observacion,
          origen: 'manual',
          aplicaciones,
        });
        if (conSaldoFavor) {
          insertarMovimientoFavor(ctx, {
            tipo: p.tipo,
            terceroCodigo: p.terceroCodigo,
            valor: -p.valor,
            origen: 'abono',
            documento: { tipo: 'abono', id },
            facturaId: null,
          });
        }
        return { id, numero };
      });
    },

    anular(p) {
      const abono = exigirAbono(p.id);
      if (abono.estado === 'anulado') {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `El abono ${abono.numero} ya está anulado: no hay nada más que hacer.`,
        );
      }
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      ejecutar((ctx) => anularAbonoConSaldoFavor(ctx, abono, motivo, formaSaldoFavorId));
    },

    obtener: exigirAbono,
  };
}
