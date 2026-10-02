import { describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../../src/data/conexion';
import { consultarConsecutivo } from '../../src/data/repositorios/consecutivos.repo';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioImportador } from '../../src/main/servicios/importador';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import type { FilaImportacion } from '../../src/shared/importacion';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Crea el importador y los servicios para consultar lo importado.
 *
 * @returns Conexión y servicios.
 */
function crear(): {
  db: BaseDeDatos;
  importador: ReturnType<typeof crearServicioImportador>;
  productos: ReturnType<typeof crearServicioProductos>;
  terceros: ReturnType<typeof crearServicioTerceros>;
} {
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db);
  return {
    db,
    importador: crearServicioImportador(db, ejecutar),
    productos: crearServicioProductos(db, ejecutar),
    terceros: crearServicioTerceros(db, ejecutar),
  };
}

/**
 * Arma filas numeradas desde la 2 (la 1 es el encabezado).
 *
 * @param valores - Valores de cada fila.
 * @returns Filas de importación.
 */
function filas(...valores: Record<string, string>[]): FilaImportacion[] {
  return valores.map((v, i) => ({ numero: i + 2, valores: v }));
}

/**
 * Proveedores de prueba: uno con código y uno sin él.
 */
const PROVEEDORES = filas(
  {
    codigo: '',
    nombre: 'Sin código',
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: '800000001',
    celular: '3000000001',
    direccion: 'Calle 1',
  },
  {
    codigo: '10001',
    nombre: 'Con código',
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: '800000002',
    celular: '3000000002',
    direccion: 'Calle 2',
  },
  {
    codigo: '',
    nombre: 'Mal',
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: '',
    celular: '3000000003',
    direccion: 'Calle 3',
  },
);

/**
 * Producto en KG de prueba (proveedor 10001 de {@link PROVEEDORES}).
 */
const PRODUCTO_KG = {
  codigo: '500',
  nombre: 'Queso costeño',
  proveedor: '10001',
  unidad: 'kg',
  costo: '15,000',
  precioMayor: '$ 18,000',
  precioMenor: '19000',
  precioMinimo: '17500.00',
};

describe('importador', () => {
  it('la vista previa no guarda nada', () => {
    const { importador, terceros } = crear();
    const resultado = importador.validar('proveedores', PROVEEDORES);
    expect(resultado).toMatchObject({ total: 3, validas: 2 });
    expect(resultado.errores.every((e) => e.fila === 4)).toBe(true);
    expect(terceros.listar('proveedor')).toHaveLength(0);
  });

  it('importa solo las válidas; los códigos del archivo no chocan con el consecutivo', () => {
    const { db, importador, terceros } = crear();
    const resultado = importador.importar('proveedores', PROVEEDORES);
    expect(resultado.importadas).toBe(2);
    expect(resultado.omitidas).toBe(1);
    // La fila sin código se guarda después de la que trae 10001 y toma el 10002.
    const guardados = terceros.listar('proveedor');
    expect(guardados.map((p) => [p.codigo, p.nombre])).toEqual([
      [10001, 'Con código'],
      [10002, 'Sin código'],
    ]);
    expect(consultarConsecutivo(db, 'proveedor')).toBe(10003);
    expect(
      listarHistorial(db, { entidad: 'proveedor' }).every(
        (h) => h.motivo === 'Importación desde archivo',
      ),
    ).toBe(true);
    expect(listarHistorial(db, { entidad: 'importacion' })).toHaveLength(1);
  });

  it('importa productos y su stock inicial al kardex (D-39)', () => {
    const { importador, productos } = crear();
    importador.importar('proveedores', PROVEEDORES);
    const resultado = importador.importar(
      'productos',
      filas({
        codigo: '500',
        nombre: 'Queso costeño',
        proveedor: '10001',
        unidad: 'kg',
        costo: '15,000',
        precioMayor: '$ 18,000',
        precioMenor: '19000',
        precioMinimo: '17500.00',
      }),
    );
    expect(resultado).toMatchObject({ importadas: 1, omitidas: 0 });
    expect(productos.siguienteCodigo()).toBe(501);

    const stock = importador.importar(
      'stock',
      filas({ producto: '500', cantidad: '12.5' }, { producto: '500', cantidad: '12,5' }),
    );
    expect([...new Set(stock.errores.map((e) => e.fila))]).toEqual([3]);
    expect(stock.importadas).toBe(1);
    expect(productos.obtener(500).stockTotal).toBe(12_500);
    expect(productos.obtener(500).stockInicial).toMatchObject([{ cantidad: 12_500 }]);
  });

  it('volver a importar reemplaza el stock inicial mientras no haya otros movimientos (D-39)', () => {
    const { db, importador, productos } = crear();
    importador.importar('proveedores', PROVEEDORES);
    importador.importar('productos', filas({ ...PRODUCTO_KG }));
    importador.importar('stock', filas({ producto: '500', cantidad: '12.5' }));

    const vista = importador.validar('stock', filas({ producto: '500', cantidad: '10' }));
    expect(vista.avisos.map((a) => a.mensaje)).toEqual([
      'Reemplaza el stock inicial cargado antes (12.500).',
    ]);
    expect(importador.importar('stock', filas({ producto: '500', cantidad: '10' }))).toMatchObject({
      importadas: 1,
      omitidas: 0,
    });
    const detalle = productos.obtener(500);
    expect(detalle.stockTotal).toBe(10_000);
    expect(detalle.stockInicial).toMatchObject([{ cantidad: 10_000 }]);
    // El kardex no se edita: el reemplazo queda como un movimiento por la diferencia.
    const movimientos = db
      .prepare('SELECT tipo, cantidad FROM movimientos_inventario ORDER BY id')
      .all();
    expect(movimientos).toEqual([
      { tipo: 'inicial', cantidad: 12_500 },
      { tipo: 'inicial', cantidad: -2_500 },
    ]);

    // Con otro movimiento (p. ej. un ajuste de la Fase 2) ya no se puede.
    db.prepare(
      `INSERT INTO movimientos_inventario (fecha, producto_codigo, bodega_id, tipo, cantidad, costo_unitario)
       VALUES ('2026-10-02T00:00:00.000Z', 500, 1, 'ajuste', -1000, 15000)`,
    ).run();
    const bloqueado = importador.importar('stock', filas({ producto: '500', cantidad: '20' }));
    expect(bloqueado).toMatchObject({ importadas: 0, omitidas: 1 });
    expect(bloqueado.errores[0]?.mensaje).toMatch(/ajuste de inventario/);
  });

  it('lee el archivo con coma decimal si el usuario lo elige (D-40)', () => {
    const { importador, productos } = crear();
    importador.importar('proveedores', PROVEEDORES);
    const resultado = importador.importar(
      'productos',
      filas({
        ...PRODUCTO_KG,
        costo: '15.000',
        precioMayor: '$ 18.000',
        precioMinimo: '17.500,00',
      }),
      'coma-decimal',
    );
    expect(resultado).toMatchObject({ importadas: 1, omitidas: 0 });
    importador.importar('stock', filas({ producto: '500', cantidad: '1.250,5' }), 'coma-decimal');
    const detalle = productos.obtener(500);
    expect(detalle.costo).toBe(15_000);
    expect(detalle.precios.minimo).toBe(17_500);
    expect(detalle.stockTotal).toBe(1_250_500);
  });
});
