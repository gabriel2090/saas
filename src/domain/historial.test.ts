import { describe, expect, it } from 'vitest';
import {
  coincideTextoVisor,
  compararCambio,
  detalleRegistro,
  registroVisor,
  resumenRegistro,
  textoDocumentoHistorial,
  tipoEntidad,
  type NombresHistorial,
  type RegistroHistorialLeido,
} from './historial';

/** Nombres de prueba (los de la maqueta). */
const NOMBRES: NombresHistorial = {
  cliente: (c) =>
    (({ 10001: 'JUAN JJ FERTILIA', 10003: 'RESTAURANTE EL FOGON' }) as Record<number, string>)[c],
  proveedor: (c) => (c === 10001 ? 'AGRINA S.A.S.' : undefined),
  producto: (c) =>
    c === 231
      ? { nombre: 'PAPA FRANCESA', unidad: 'UND' }
      : c === 301
        ? { nombre: 'QUESO MOZZARELLA', unidad: 'KG' }
        : undefined,
  formaPago: (id) => (id === 2 ? 'Transferencia' : undefined),
  bodega: (id) => (id === 1 ? 'Principal' : undefined),
};

/**
 * Registro de prueba.
 *
 * @param parcial - Campos que cambian.
 * @returns Registro completo.
 */
function registro(parcial: Partial<RegistroHistorialLeido>): RegistroHistorialLeido {
  return {
    id: 1,
    fecha: '2026-09-27T09:10:00.000-05:00',
    entidad: 'factura_cliente',
    entidadId: '84783',
    accion: 'crear',
    antes: null,
    despues: null,
    motivo: null,
    ...parcial,
  };
}

/** Factura de la maqueta antes de la corrección. */
const FACTURA_V1 = {
  numero: 84783,
  clienteCodigo: 10003,
  dia: '2026-09-26',
  condicion: 'credito',
  bodegaId: 1,
  total: 271_000,
  lineas: [
    { productoCodigo: 301, cantidad: 3_000, precio: 20_000, total: 60_000 },
    { productoCodigo: 231, cantidad: 12_000, precio: 17_500, total: 210_000 },
  ],
};

describe('visor del historial', () => {
  it('muestra solo los campos que cambiaron, traducidos y con la línea', () => {
    const r = registro({
      accion: 'editar',
      antes: FACTURA_V1,
      despues: {
        ...FACTURA_V1,
        total: 236_000,
        lineas: [
          FACTURA_V1.lineas[0] ?? null,
          { productoCodigo: 231, cantidad: 10_000, precio: 17_500, total: 175_000 },
        ],
        version: 2,
      },
      motivo: 'Cliente devolvió 2 bolsas',
    });
    expect(compararCambio(r, NOMBRES)).toEqual([
      { campo: 'Total', antes: '271,000', despues: '236,000' },
      { campo: 'Línea 2 · 231 PAPA FRANCESA · cantidad', antes: '12', despues: '10' },
      { campo: 'Línea 2 · 231 PAPA FRANCESA · total', antes: '210,000', despues: '175,000' },
    ]);
    const detalle = detalleRegistro(r, NOMBRES);
    expect(detalle.titulo).toBe('Factura de venta 84783 · Editar');
    expect(detalle.datos).toEqual([
      { etiqueta: 'Fecha y hora', valor: '27/09/2026 9:10 a. m.' },
      { etiqueta: 'Cliente', valor: '10003 - RESTAURANTE EL FOGON' },
      { etiqueta: 'Versión', valor: '1 → 2' },
      { etiqueta: 'Motivo', valor: 'Cliente devolvió 2 bolsas' },
    ]);
    expect(resumenRegistro(r, NOMBRES)).toBe('Corrección, versión 2 · Cliente devolvió 2 bolsas');
  });

  it('un campo sin traducción sale con su nombre técnico, y los secretos ocultos', () => {
    const r = registro({
      entidad: 'configuracion',
      entidadId: 'auth.hash_contrasena',
      accion: 'editar',
      antes: { valor: '[OCULTO]', campoNuevo: 'a' },
      despues: { valor: '[OCULTO]', campoNuevo: 'b' },
    });
    expect(compararCambio(r, NOMBRES)).toEqual([{ campo: 'campoNuevo', antes: 'a', despues: 'b' }]);
    expect(textoDocumentoHistorial(r)).toBe('Contraseña');
    expect(tipoEntidad('entidad_futura')).toBe('entidad_futura');
  });

  it('al crear lista los campos con valor, con nombres, fechas y códigos traducidos', () => {
    const r = registro({ despues: { ...FACTURA_V1, observacion: '', cajasEmpaque: null } });
    const campos = compararCambio(r, NOMBRES);
    expect(campos.slice(0, 5)).toEqual([
      { campo: 'Número', antes: '', despues: '84783' },
      { campo: 'Cliente', antes: '', despues: '10003 - RESTAURANTE EL FOGON' },
      { campo: 'Día', antes: '', despues: '26/09/2026' },
      { campo: 'Condición', antes: '', despues: 'Crédito' },
      { campo: 'Bodega', antes: '', despues: 'Principal' },
    ]);
    expect(campos.map((c) => c.campo)).not.toContain('Observación');
    expect(campos.find((c) => c.campo === 'Línea 1 · 301 QUESO MOZZARELLA · cantidad')).toEqual({
      campo: 'Línea 1 · 301 QUESO MOZZARELLA · cantidad',
      antes: '',
      despues: '3.000',
    });
    expect(resumenRegistro(r, NOMBRES)).toBe('RESTAURANTE EL FOGON · crédito · $ 271,000');
  });

  it('los precios anidados del producto tienen nombre propio', () => {
    const r = registro({
      entidad: 'producto',
      entidadId: '231',
      accion: 'editar',
      antes: { precios: { mayor: 16_000, menor: 17_500, minimo: 12_300 } },
      despues: { precios: { mayor: 16_000, menor: 18_200, minimo: 12_300 } },
    });
    expect(resumenRegistro(r, NOMBRES)).toBe('Precio al por menor 17,500 → 18,200');
    expect(registroVisor(r, NOMBRES)).toMatchObject({ tipo: 'Producto', documento: '231' });
  });

  it('resume abonos, ajustes, anulaciones e importaciones', () => {
    expect(
      resumenRegistro(
        registro({
          entidad: 'abono_cliente',
          entidadId: '58',
          despues: {
            numero: 58,
            clienteCodigo: 10001,
            valor: 20_000,
            formaPagoId: 2,
            observacion: '',
          },
        }),
        NOMBRES,
      ),
    ).toBe('JUAN JJ FERTILIA · $ 20,000 · Transferencia');
    expect(
      resumenRegistro(
        registro({
          entidad: 'ajuste_inventario',
          entidadId: '9',
          despues: { productoCodigo: 301, bodegaId: 1, tipo: 'conteo', cantidad: -750 },
        }),
        NOMBRES,
      ),
    ).toBe('Conteo físico · 301 QUESO MOZZARELLA -0.750 KG');
    expect(
      resumenRegistro(
        registro({
          accion: 'anular',
          antes: { estado: 'activa' },
          despues: { estado: 'anulada', total: 13_900 },
          motivo: 'Cliente no recogió el pedido',
        }),
        NOMBRES,
      ),
    ).toBe('Cliente no recogió el pedido');
    expect(
      resumenRegistro(
        registro({
          entidad: 'importacion',
          entidadId: 'stock',
          accion: 'sistema',
          despues: { tipo: 'stock', filas: 3, importadas: 3, omitidas: 0 },
        }),
        NOMBRES,
      ),
    ).toBe('Stock inicial · 3 de 3 filas importadas');
  });

  it('el documento lleva el prefijo del tipo y el texto busca en todo', () => {
    const fila = registroVisor(
      registro({
        entidad: 'abono_cliente',
        entidadId: '58',
        despues: { numero: 58, clienteCodigo: 10001, valor: 20_000, formaPagoId: 2 },
      }),
      NOMBRES,
    );
    expect(fila.documento).toBe('Abono 58');
    expect(coincideTextoVisor(fila, 'fertilia')).toBe(true);
    expect(coincideTextoVisor(fila, 'ABONO 58')).toBe(true);
    expect(coincideTextoVisor(fila, 'transferéncia')).toBe(true);
    expect(coincideTextoVisor(fila, '84783')).toBe(false);
    expect(coincideTextoVisor(fila, '  ')).toBe(true);
  });
});
