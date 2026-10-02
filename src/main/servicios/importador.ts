import {
  validarFilasImportacion,
  type ContextoImportacion,
  type RegistroImportable,
  type ResultadoValidacionFilas,
} from '../../domain/importacion';
import { claveComparacion } from '../../domain/texto';
import type { BaseDeDatos } from '../../data/conexion';
import { listarCatalogo } from '../../data/repositorios/catalogos.repo';
import { ajustarConsecutivo, tomarConsecutivo } from '../../data/repositorios/consecutivos.repo';
import {
  productosConOtrosMovimientos,
  registrarStockInicial,
  stockInicialPorPar,
} from '../../data/repositorios/kardex.repo';
import { insertarProducto, mapaProductos } from '../../data/repositorios/productos.repo';
import { indiceTerceros, insertarTercero } from '../../data/repositorios/terceros.repo';
import type { ContextoTransaccion, EjecutorTransacciones } from '../../data/transaccion';
import type {
  FilaImportacion,
  FormatoNumerico,
  ResultadoImportacion,
  ResultadoValidacionImportacion,
  TipoImportacion,
} from '../../shared/importacion';

/**
 * Motivo con que quedan en el historial los registros importados.
 */
const MOTIVO_IMPORTACION = 'Importación desde archivo';

/**
 * Servicio del importador CSV/XLSX (§9.5 de la especificación, D-24 a D-26).
 */
export interface ServicioImportador {
  /**
   * Valida las filas sin guardar nada (vista previa).
   *
   * @param tipo - Qué se importa.
   * @param filas - Filas con los campos asignados.
   * @param formato - Cómo están escritos los números (D-40); por defecto, punto decimal.
   * @returns Resumen, errores y avisos por fila.
   */
  validar(
    tipo: TipoImportacion,
    filas: readonly FilaImportacion[],
    formato?: FormatoNumerico,
  ): ResultadoValidacionImportacion;
  /**
   * Importa **solo las filas válidas** en una sola transacción: o entran
   * todas las válidas, o ninguna. Vuelve a validar dentro de la transacción
   * por si los datos cambiaron desde la vista previa.
   *
   * @param tipo - Qué se importa.
   * @param filas - Filas con los campos asignados.
   * @param formato - Cómo están escritos los números (D-40); por defecto, punto decimal.
   * @returns Cantidad importada, omitida y los errores de las omitidas.
   */
  importar(
    tipo: TipoImportacion,
    filas: readonly FilaImportacion[],
    formato?: FormatoNumerico,
  ): ResultadoImportacion;
}

/**
 * Arma el contexto de validación con lo que ya existe en la base.
 *
 * @param db - Conexión (o la de la transacción en curso).
 * @param tipo - Qué se importa.
 * @returns Contexto para el dominio.
 * @throws {Error} Si no existe la bodega Principal (error técnico: la crea la migración).
 */
function construirContexto(db: BaseDeDatos, tipo: TipoImportacion): ContextoImportacion {
  const productos = mapaProductos(db);
  const proveedores = indiceTerceros(db, 'proveedor');
  const clientes = indiceTerceros(db, 'cliente');
  const bodegas = listarCatalogo(db, 'bodega');
  const principal = bodegas.find((b) => b.esPrincipal);
  if (!principal) {
    throw new Error('No existe la bodega Principal.');
  }
  const codigosExistentes: Record<TipoImportacion, Set<number>> = {
    productos: new Set(productos.keys()),
    clientes: clientes.codigos,
    proveedores: proveedores.codigos,
    stock: new Set(),
  };
  return {
    codigosExistentes: codigosExistentes[tipo],
    identificacionesExistentes:
      tipo === 'clientes' ? clientes.identificaciones : proveedores.identificaciones,
    proveedores: proveedores.codigos,
    productos,
    bodegas: new Map(
      bodegas.filter((b) => b.activo).map((b) => [claveComparacion(b.nombre), b.id]),
    ),
    bodegaPrincipalId: principal.id,
    stockInicial: stockInicialPorPar(db),
    productosConOtrosMovimientos: productosConOtrosMovimientos(db),
  };
}

/**
 * Guarda un registro con el código indicado.
 *
 * @param ctx - Contexto de la transacción.
 * @param registro - Registro válido.
 * @param codigo - Código asignado (del archivo o del consecutivo).
 */
function guardarConCodigo(
  ctx: ContextoTransaccion,
  registro: Extract<RegistroImportable, { tipo: 'productos' | 'clientes' | 'proveedores' }>,
  codigo: number,
): void {
  if (registro.tipo === 'productos') {
    insertarProducto(ctx, codigo, registro.datos, registro.datos.costo, MOTIVO_IMPORTACION);
  } else {
    insertarTercero(
      ctx,
      registro.tipo === 'clientes' ? 'cliente' : 'proveedor',
      codigo,
      registro.datos,
      MOTIVO_IMPORTACION,
    );
  }
}

/**
 * Guarda los registros válidos dentro de la transacción.
 *
 * Primero los que traen código (ajustando el consecutivo) y después los que
 * no, para que el consecutivo nunca asigne un código que aparece más abajo
 * en el mismo archivo.
 *
 * @param ctx - Contexto de la transacción.
 * @param registros - Registros válidos.
 */
function guardarRegistros(
  ctx: ContextoTransaccion,
  registros: readonly RegistroImportable[],
): void {
  const sinCodigo: Extract<
    RegistroImportable,
    { tipo: 'productos' | 'clientes' | 'proveedores' }
  >[] = [];
  for (const registro of registros) {
    if (registro.tipo === 'stock') {
      registrarStockInicial(ctx, {
        productoCodigo: registro.productoCodigo,
        bodegaId: registro.bodegaId,
        diferencia: registro.diferencia,
        costoUnitario: registro.costoUnitario,
        documento: { tipo: 'importacion', id: ctx.fecha },
      });
      continue;
    }
    const clave =
      registro.tipo === 'productos'
        ? 'producto'
        : registro.tipo === 'clientes'
          ? 'cliente'
          : 'proveedor';
    if (registro.datos.codigo === null) {
      sinCodigo.push(registro);
    } else {
      guardarConCodigo(ctx, registro, registro.datos.codigo);
      ajustarConsecutivo(ctx, clave, registro.datos.codigo);
    }
  }
  for (const registro of sinCodigo) {
    const clave =
      registro.tipo === 'productos'
        ? 'producto'
        : registro.tipo === 'clientes'
          ? 'cliente'
          : 'proveedor';
    guardarConCodigo(ctx, registro, tomarConsecutivo(ctx, clave));
  }
}

/**
 * Convierte el resultado del dominio en el resumen para la vista previa.
 *
 * @param resultado - Resultado de la validación.
 * @returns Resumen.
 */
function resumen(resultado: ResultadoValidacionFilas): ResultadoValidacionImportacion {
  return {
    total: resultado.total,
    validas: resultado.registros.length,
    errores: resultado.errores,
    avisos: resultado.avisos,
  };
}

/**
 * Crea el servicio del importador.
 *
 * @param db - Conexión abierta.
 * @param ejecutar - Ejecutor de transacciones.
 * @returns El servicio.
 */
export function crearServicioImportador(
  db: BaseDeDatos,
  ejecutar: EjecutorTransacciones,
): ServicioImportador {
  return {
    validar: (tipo, filas, formato = 'punto-decimal') =>
      resumen(validarFilasImportacion(tipo, filas, construirContexto(db, tipo), formato)),

    importar(tipo, filas, formato = 'punto-decimal') {
      return ejecutar((ctx) => {
        const resultado = validarFilasImportacion(
          tipo,
          filas,
          construirContexto(ctx.db, tipo),
          formato,
        );
        guardarRegistros(ctx, resultado.registros);
        const filasConError = new Set(resultado.errores.map((e) => e.fila)).size;
        ctx.registrarCambio({
          entidad: 'importacion',
          entidadId: tipo,
          accion: 'sistema',
          antes: null,
          despues: {
            tipo,
            formato,
            filas: resultado.total,
            importadas: resultado.registros.length,
            omitidas: filasConError,
            stockInicialReemplazado: resultado.avisos.length,
          },
          motivo: MOTIVO_IMPORTACION,
        });
        return {
          importadas: resultado.registros.length,
          omitidas: filasConError,
          errores: resultado.errores,
        };
      });
    },
  };
}
