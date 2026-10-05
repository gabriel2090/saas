import type { BaseDeDatos } from '../../data/conexion';
import {
  anularCierre,
  candidatosTramo,
  cierreAnteriorVigente,
  formasPagoCaja,
  insertarCierre,
  listarCierres,
  obtenerCierre,
  type FormaCierreGuardada,
} from '../../data/repositorios/cierres.repo';
import { consultarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import type { EjecutorTransacciones } from '../../data/transaccion';
import { validarTextoAbono } from '../../domain/abonos';
import {
  calcularTramo,
  exigirCierreAnulable,
  huellaCierre,
  movimientoPorForma,
  ultimoCierreVigente,
  validarArqueo,
} from '../../domain/cierre-caja';
import { ErrorDeNegocio } from '../../domain/errores';
import {
  CONCEPTOS_CIERRE,
  type CalculoCierre,
  type CierreGuardado,
  type CierreResumen,
  type ConceptoCierre,
  type EstadoCierreNuevo,
  type PeticionAnularCierre,
  type PeticionGuardarCierre,
} from '../../shared/cierreCaja';
import { aIsoLocal } from '../../shared/formato/fechas';

/**
 * Servicio del cierre de caja (Fase 5d, D-150 a D-155).
 */
export interface ServicioCierreCaja {
  /**
   * Calcula el cierre nuevo: tramo desde el cierre anterior vigente hasta este momento.
   *
   * @returns Número, cierre anterior, base inicial, cálculo y huella.
   * @throws {ErrorDeNegocio} Si ninguna forma de pago calcula el cambio.
   */
  nuevo(): EstadoCierreNuevo;
  /**
   * Lista los cierres guardados.
   *
   * @returns Del más reciente al más antiguo.
   */
  listar(): CierreResumen[];
  /**
   * Obtiene un cierre guardado con sus totales y los documentos de su tramo.
   *
   * @param numero - Número del cierre.
   * @returns El cierre.
   * @throws {ErrorDeNegocio} Si no existe.
   */
  obtener(numero: number): CierreGuardado;
  /**
   * Guarda el cierre nuevo en una transacción: vuelve a calcular el tramo
   * hasta el momento de guardar y lo rechaza si cambió desde que el usuario
   * lo vio.
   *
   * @param peticion - Huella, base, contado, conteo, base que queda y observación.
   * @returns El cierre guardado.
   * @throws {ErrorDeNegocio} Si hubo movimientos nuevos o el arqueo no es válido.
   */
  guardar(peticion: PeticionGuardarCierre): CierreGuardado;
  /**
   * Anula el último cierre vigente; su tramo lo cubre el cierre siguiente (D-150).
   *
   * @param peticion - Número y motivo.
   * @returns El cierre anulado.
   * @throws {ErrorDeNegocio} Si no existe, ya está anulado o no es el último vigente.
   */
  anular(peticion: PeticionAnularCierre): CierreGuardado;
}

/**
 * Dependencias del servicio de cierre de caja.
 */
export interface DependenciasCierreCaja {
  /** Momento actual en ISO local con desfase (inyectable en las pruebas). */
  ahora?: () => string;
}

/**
 * Calcula el tramo que empieza en el cierre anterior vigente.
 *
 * @param db - Conexión (o la de la transacción).
 * @param desde - Inicio del tramo, o `null`.
 * @param hasta - Fin del tramo.
 * @returns El cálculo.
 */
function calcular(db: BaseDeDatos, desde: string | null, hasta: string): CalculoCierre {
  return calcularTramo({
    desde,
    hasta,
    formas: formasPagoCaja(db),
    ...candidatosTramo(db, desde, hasta),
  });
}

/**
 * Cierres anulados entre el anterior vigente y un número.
 *
 * @param cierres - Cierres guardados.
 * @param anterior - Número del anterior, o `null`.
 * @param numero - Número del cierre.
 * @returns Números anulados en orden.
 */
function anuladosEntre(
  cierres: readonly CierreResumen[],
  anterior: number | null,
  numero: number,
): number[] {
  return cierres
    .filter((c) => c.estado === 'anulado' && c.numero > (anterior ?? 0) && c.numero < numero)
    .map((c) => c.numero)
    .sort((a, b) => a - b);
}

/**
 * Lee un cierre guardado: los totales y el arqueo son los guardados; los
 * documentos que los forman se recalculan a la fecha de corte del cierre
 * (lo anulado después no cambia lo que contó).
 *
 * @param db - Conexión abierta.
 * @param numero - Número del cierre.
 * @returns El cierre.
 * @throws {ErrorDeNegocio} Si no existe.
 */
export function leerCierreGuardado(db: BaseDeDatos, numero: number): CierreGuardado {
  const leido = obtenerCierre(db, numero);
  if (!leido) {
    throw new ErrorDeNegocio('NO_ENCONTRADO', `El cierre de caja ${numero} no existe.`);
  }
  const recalculado = calcular(db, leido.desde, leido.hasta);
  const formas = leido.formas.map((f) => f.forma);
  const filas = CONCEPTOS_CIERRE.map((concepto) => ({
    concepto,
    cantidad: leido.cantidades[concepto] ?? 0,
    valores: leido.formas.map((f) => f.conceptos[concepto]),
  }));
  const cierres = listarCierres(db);
  return {
    id: leido.id,
    numero: leido.numero,
    desde: leido.desde,
    hasta: leido.hasta,
    anteriorNumero: leido.anteriorNumero,
    anuladosEntre: anuladosEntre(cierres, leido.anteriorNumero, leido.numero),
    baseInicial: leido.baseInicial,
    baseQueda: leido.baseQueda,
    observacion: leido.observacion,
    estado: leido.estado,
    anuladoEn: leido.anuladoEn,
    motivoAnulacion: leido.motivoAnulacion,
    esUltimo: leido.estado === 'activo' && ultimoCierreVigente(cierres) === leido.numero,
    calculo: {
      formas,
      filas,
      movimiento: movimientoPorForma(filas, formas.length),
      documentos: recalculado.documentos,
      saldoFavor: recalculado.saldoFavor,
      otraFecha: recalculado.otraFecha,
    },
    arqueo: leido.formas.map((f) => ({
      esperado: f.esperado,
      contado: f.contado,
      diferencia: f.diferencia,
    })),
    conteo: leido.conteo,
  };
}

/**
 * Crea el servicio de cierre de caja.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @param dependencias - Reloj.
 * @returns El servicio.
 */
export function crearServicioCierreCaja(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
  dependencias: DependenciasCierreCaja = {},
): ServicioCierreCaja {
  const ahora = dependencias.ahora ?? (() => aIsoLocal());
  const obtener = (numero: number): CierreGuardado => leerCierreGuardado(db, numero);

  return {
    nuevo() {
      const anterior = cierreAnteriorVigente(db);
      const hasta = ahora();
      const desde = anterior?.hasta ?? null;
      const calculo = calcular(db, desde, hasta);
      const numero = consultarConsecutivo(db, 'cierre_caja');
      return {
        numero,
        anterior,
        anuladosEntre: anuladosEntre(listarCierres(db), anterior?.numero ?? null, numero),
        hasta,
        baseInicial: anterior?.baseQueda ?? null,
        calculo,
        huella: huellaCierre(desde, calculo),
      };
    },

    listar: () => listarCierres(db),

    obtener,

    guardar(p) {
      const numero = ejecutar((ctx) => {
        const anterior = cierreAnteriorVigente(ctx.db);
        const desde = anterior?.hasta ?? null;
        const calculo = calcular(ctx.db, desde, ctx.fecha);
        if (huellaCierre(desde, calculo) !== p.huella) {
          throw new ErrorDeNegocio(
            'CONFLICTO',
            'Hubo movimientos nuevos desde que abrió el cierre (ventas, abonos, reintegros o anulaciones). Se volvió a calcular: revise el arqueo y guarde de nuevo.',
          );
        }
        let baseInicial: number;
        if (anterior) {
          baseInicial = anterior.baseQueda;
        } else if (p.baseInicial === null) {
          throw new ErrorDeNegocio(
            'VALIDACION',
            'Escriba la base inicial: es el primer cierre y no hay un cierre anterior que la deje.',
          );
        } else {
          baseInicial = p.baseInicial;
        }
        const arqueo = validarArqueo({
          formas: calculo.formas,
          movimiento: calculo.movimiento,
          baseInicial,
          contado: p.contado,
          conteo: p.conteo,
          baseQueda: p.baseQueda,
          observacion: p.observacion,
        });
        const valorDe = (concepto: ConceptoCierre, i: number): number =>
          calculo.filas.find((f) => f.concepto === concepto)?.valores[i] ?? 0;
        const formas: FormaCierreGuardada[] = calculo.formas.map((forma, i) => ({
          forma,
          conceptos: Object.fromEntries(CONCEPTOS_CIERRE.map((c) => [c, valorDe(c, i)])) as Record<
            ConceptoCierre,
            number
          >,
          baseInicial: forma.recibeBase ? baseInicial : 0,
          esperado: arqueo.esperado[i] ?? 0,
          contado: arqueo.contado[i] ?? 0,
          diferencia: arqueo.diferencia[i] ?? 0,
        }));
        const asignado = tomarConsecutivo(ctx, 'cierre_caja');
        insertarCierre(ctx, {
          numero: asignado,
          desde,
          anteriorNumero: anterior?.numero ?? null,
          baseInicial,
          baseQueda: p.baseQueda,
          observacion: arqueo.observacion,
          cantidades: Object.fromEntries(
            calculo.filas.map((f) => [f.concepto, f.cantidad]),
          ) as Record<ConceptoCierre, number>,
          conteo: arqueo.conteo,
          formas,
        });
        return asignado;
      });
      return obtener(numero);
    },

    anular(p) {
      const motivo = validarTextoAbono(p.motivo, 'Motivo');
      ejecutar((ctx) => {
        exigirCierreAnulable(listarCierres(ctx.db), p.numero);
        if (!anularCierre(ctx, p.numero, motivo)) {
          throw new ErrorDeNegocio('CONFLICTO', `El cierre ${p.numero} ya está anulado.`);
        }
      });
      return obtener(p.numero);
    },
  };
}
