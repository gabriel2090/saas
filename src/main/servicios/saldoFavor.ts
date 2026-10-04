import { validarTextoAbono } from '../../domain/abonos';
import { diaDeIso } from '../../domain/calendario';
import { ErrorDeNegocio } from '../../domain/errores';
import { validarUsoSaldoFavor } from '../../domain/saldo-favor';
import type { BaseDeDatos } from '../../data/conexion';
import { nombreFormaPago, obtenerCatalogo } from '../../data/repositorios/catalogos.repo';
import { tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import {
  anularReintegro,
  insertarReintegro,
  listarReintegros,
  obtenerReintegro,
  type DocumentoReintegro,
} from '../../data/repositorios/reintegros.repo';
import { insertarMovimientoFavor, saldoFavorDe } from '../../data/repositorios/saldosFavor.repo';
import { obtenerTercero } from '../../data/repositorios/terceros.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
import type {
  PeticionAnularDocumento,
  PeticionReintegrar,
  PeticionSaldoFavor,
  ReintegroGenerado,
  SaldoFavorTercero,
  SentidoReintegro,
} from '../../shared/correcciones';
import { formatearPesos } from '../../shared/formato/moneda';

/**
 * Datos de un reintegro atado a una venta de contado (D-128, D-129).
 */
export interface ReintegroDeVentaContado {
  /** Cliente. */
  clienteCodigo: number;
  /** Entrega (se devuelve dinero) o recibe (se cobra). */
  sentido: SentidoReintegro;
  /** Valor (positivo). */
  valor: number;
  /** Forma de pago de la factura. */
  formaPagoId: number;
  /** Documento al que queda atado. */
  documento: { tipo: DocumentoReintegro; id: number };
  /** Observación, p. ej. `Corrección de la factura 84772`. */
  observacion: string;
}

/**
 * Registra el reintegro de una venta de contado dentro de la transacción de
 * la corrección, la devolución o la anulación que lo origina.
 *
 * @param ctx - Contexto de la transacción en curso.
 * @param datos - Cliente, sentido, valor, forma de pago y documento.
 * @returns El reintegro registrado.
 */
export function registrarReintegroDeVentaContado(
  ctx: ContextoTransaccion,
  datos: ReintegroDeVentaContado,
): ReintegroGenerado {
  const numero = tomarConsecutivo(ctx, 'reintegro');
  const id = insertarReintegro(ctx, {
    numero,
    tipo: 'cliente',
    terceroCodigo: datos.clienteCodigo,
    sentido: datos.sentido,
    documento: datos.documento,
    dia: diaDeIso(ctx.fecha),
    formaPagoId: datos.formaPagoId,
    valor: datos.valor,
    observacion: datos.observacion,
  });
  return {
    id,
    numero,
    sentido: datos.sentido,
    valor: datos.valor,
    formaPagoNombre: nombreFormaPago(ctx.db, datos.formaPagoId),
  };
}

/**
 * Servicio del saldo a favor de clientes y proveedores y de sus reintegros
 * en dinero (D-120, D-128).
 */
export interface ServicioSaldoFavor {
  /**
   * Saldo a favor disponible de un tercero y sus reintegros.
   *
   * @param peticion - Tipo y código del tercero.
   * @returns Disponible y reintegros.
   * @throws {ErrorDeNegocio} Si el tercero no existe.
   */
  consultar(peticion: PeticionSaldoFavor): SaldoFavorTercero;
  /**
   * Devuelve en dinero un saldo a favor (reintegro): al cliente se le
   * entrega; el proveedor lo devuelve (se recibe). En una transacción.
   *
   * @param peticion - Tercero, forma de pago, valor y el disponible visto.
   * @returns El reintegro registrado.
   * @throws {ErrorDeNegocio} Si el valor supera el disponible, la forma de pago no sirve o el saldo cambió.
   */
  reintegrar(peticion: PeticionReintegrar): ReintegroGenerado;
  /**
   * Anula un reintegro de saldo a favor: el saldo vuelve al tercero.
   *
   * @param peticion - Reintegro y motivo.
   * @throws {ErrorDeNegocio} Si no existe, ya está anulado o es de una venta de contado.
   */
  anularReintegro(peticion: PeticionAnularDocumento): void;
}

/**
 * Crea el servicio de saldo a favor.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioSaldoFavor(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioSaldoFavor {
  /**
   * Verifica que el tercero exista.
   *
   * @param tipo - Cliente o proveedor.
   * @param codigo - Código.
   * @returns Nombre del tercero.
   */
  const exigirTercero = (tipo: PeticionSaldoFavor['tipo'], codigo: number): string => {
    const tercero = obtenerTercero(db, tipo, codigo);
    if (!tercero) {
      throw new ErrorDeNegocio(
        'NO_ENCONTRADO',
        `No existe el ${tipo} ${codigo}. Revise el código o búsquelo por su nombre.`,
      );
    }
    return tercero.nombre;
  };

  return {
    consultar({ tipo, codigo }) {
      exigirTercero(tipo, codigo);
      return {
        disponible: saldoFavorDe(db, tipo, codigo),
        reintegros: listarReintegros(db, tipo, codigo),
      };
    },

    reintegrar(p) {
      const nombre = exigirTercero(p.tipo, p.terceroCodigo);
      const forma = obtenerCatalogo(db, 'forma-pago', p.formaPagoId);
      if (!forma?.activo) {
        throw new ErrorDeNegocio(
          'VALIDACION',
          'Elija con qué forma de pago se devuelve el dinero (efectivo, transferencia…). ' +
            '«Saldo a favor» no sirve para un reintegro.',
        );
      }
      const observacion = validarTextoAbono(p.observacion, 'Observación');
      return ejecutar((ctx) => {
        const disponible = saldoFavorDe(ctx.db, p.tipo, p.terceroCodigo);
        if (disponible !== p.disponibleEsperado) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            `El saldo a favor de ${nombre} cambió desde que lo consultó (ahora es ` +
              `${formatearPesos(disponible)}); puede que el reintegro ya se haya guardado. Revise la ` +
              'lista de reintegros antes de registrar otro.',
          );
        }
        if (disponible <= 0) {
          throw new ErrorDeNegocio(
            'VALIDACION',
            `${nombre} no tiene saldo a favor: no hay nada que devolver.`,
          );
        }
        const valor = validarUsoSaldoFavor(p.valor, disponible);
        const sentido: SentidoReintegro = p.tipo === 'cliente' ? 'entrega' : 'recibe';
        const numero = tomarConsecutivo(ctx, 'reintegro');
        const id = insertarReintegro(ctx, {
          numero,
          tipo: p.tipo,
          terceroCodigo: p.terceroCodigo,
          sentido,
          documento: null,
          dia: diaDeIso(ctx.fecha),
          formaPagoId: forma.id,
          valor,
          observacion,
        });
        insertarMovimientoFavor(ctx, {
          tipo: p.tipo,
          terceroCodigo: p.terceroCodigo,
          valor: -valor,
          origen: 'reintegro',
          documento: { tipo: 'reintegro', id },
          facturaId: null,
        });
        return { id, numero, sentido, valor, formaPagoNombre: forma.nombre };
      });
    },

    anularReintegro(p) {
      const reintegro = obtenerReintegro(db, p.id);
      if (!reintegro) {
        throw new ErrorDeNegocio(
          'NO_ENCONTRADO',
          'El reintegro no existe. Vuelva a consultar el saldo a favor del tercero.',
        );
      }
      if (reintegro.estado === 'anulado') {
        throw new ErrorDeNegocio(
          'CONFLICTO',
          `El reintegro ${reintegro.numero} ya está anulado: no hay nada más que hacer.`,
        );
      }
      if (reintegro.origen === 'documento') {
        throw new ErrorDeNegocio(
          'VALIDACION',
          `El reintegro ${reintegro.numero} es la diferencia de «${reintegro.documento ?? 'una venta de contado'}» ` +
            'y no se anula por separado. Si el dinero no se entregó o no se cobró, corrija de nuevo ' +
            'la factura o anule la devolución.',
        );
      }
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      ejecutar((ctx) => {
        if (!anularReintegro(ctx, reintegro, motivo)) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            `El reintegro ${reintegro.numero} ya está anulado: no hay nada más que hacer.`,
          );
        }
        insertarMovimientoFavor(ctx, {
          tipo: reintegro.tipo,
          terceroCodigo: reintegro.terceroCodigo,
          valor: reintegro.valor,
          origen: 'anulacion_reintegro',
          documento: { tipo: 'anulacion_reintegro', id: reintegro.id },
          facturaId: null,
        });
      });
    },
  };
}
