import { describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../../src/data/conexion';
import { insertarMovimiento } from '../../src/data/repositorios/kardex.repo';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { crearEjecutorTransacciones, type EjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioCatalogos } from '../../src/main/servicios/catalogos';
import { crearServicioNegocio } from '../../src/main/servicios/negocio';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import type { DatosProductoNuevo, DatosTerceroNuevo } from '../../src/shared/maestros';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Crea los servicios de maestros sobre una base nueva en memoria.
 *
 * @returns Conexión, ejecutor y servicios.
 */
function crear(): {
  db: BaseDeDatos;
  ejecutar: EjecutorTransacciones;
  negocio: ReturnType<typeof crearServicioNegocio>;
  productos: ReturnType<typeof crearServicioProductos>;
  terceros: ReturnType<typeof crearServicioTerceros>;
  catalogos: ReturnType<typeof crearServicioCatalogos>;
} {
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db);
  return {
    db,
    ejecutar,
    negocio: crearServicioNegocio(db, ejecutar),
    productos: crearServicioProductos(db, ejecutar),
    terceros: crearServicioTerceros(db, ejecutar),
    catalogos: crearServicioCatalogos(db, ejecutar),
  };
}

/**
 * Datos de un tercero de prueba.
 *
 * @param cambios - Campos a reemplazar.
 * @returns Datos completos.
 */
function tercero(cambios: Partial<DatosTerceroNuevo> = {}): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona: 'juridica',
    nombre: 'Distribuidora La 14',
    tipoIdentificacion: 'NIT',
    numeroIdentificacion: '900123456',
    celular: '3001234567',
    direccion: 'Calle 1 # 2-3',
    barrio: '',
    ciudad: '',
    topeCredito: null,
    ...cambios,
  };
}

/**
 * Datos de un producto de prueba.
 *
 * @param proveedorCodigo - Proveedor.
 * @param cambios - Campos a reemplazar.
 * @returns Datos completos.
 */
function producto(
  proveedorCodigo: number,
  cambios: Partial<DatosProductoNuevo> = {},
): DatosProductoNuevo {
  return {
    codigo: null,
    nombre: 'Salchichón cervecero',
    proveedorCodigo,
    unidad: 'KG',
    costo: 18_000,
    precios: { mayor: 21_000, menor: 22_000, minimo: 20_000 },
    ...cambios,
  };
}

describe('datos del negocio', () => {
  it('sin configurar devuelve los datos vacíos con el régimen por defecto', () => {
    const { negocio } = crear();
    expect(negocio.obtener().regimen).toBe('No responsable de IVA');
    expect(negocio.obtener().nombre).toBe('');
  });

  it('guarda limpio, exige los obligatorios y deja historial', () => {
    const { db, negocio } = crear();
    expect(() =>
      negocio.guardar({ nombre: '', nit: '1', regimen: 'x', direccion: '', telefono: '' }),
    ).toThrow();
    negocio.guardar({
      nombre: '  El Buen Ciudadano ',
      nit: '70694229-1',
      regimen: 'No responsable de IVA',
      direccion: '',
      telefono: '',
    });
    expect(negocio.obtener().nombre).toBe('El Buen Ciudadano');
    expect(listarHistorial(db, { entidad: 'configuracion' }).length).toBeGreaterThan(0);
  });
});

describe('terceros', () => {
  it('crea con consecutivo o con código elegido y ajusta el consecutivo (D-25)', () => {
    const { terceros } = crear();
    expect(terceros.siguienteCodigo('proveedor')).toBe(10001);
    const a = terceros.crear('proveedor', tercero());
    expect(a.codigo).toBe(10001);
    terceros.crear(
      'proveedor',
      tercero({ codigo: 20000, numeroIdentificacion: '800111222', nombre: 'Otro' }),
    );
    expect(terceros.siguienteCodigo('proveedor')).toBe(20001);
    expect(() =>
      terceros.crear('proveedor', tercero({ codigo: 20000, numeroIdentificacion: '1' })),
    ).toThrow(/Ya existe un proveedor con el código 20000/);
  });

  it('rechaza una identificación repetida en la misma clase pero no entre clases (D-29)', () => {
    const { terceros } = crear();
    terceros.crear('proveedor', tercero());
    expect(() => terceros.crear('proveedor', tercero({ nombre: 'Copia' }))).toThrow(
      /Ya existe un proveedor con NIT 900123456 \(código 10001\)/,
    );
    expect(terceros.crear('cliente', tercero()).codigo).toBe(10001);
  });

  it('el consumidor final no se edita ni se inactiva', () => {
    const { terceros } = crear();
    const consumidor = terceros.listar('cliente').find((c) => c.esSistema);
    expect(consumidor?.codigo).toBe(0);
    expect(() => terceros.editar('cliente', 0, tercero())).toThrow(/no se puede modificar/);
    expect(() => terceros.cambiarEstado('cliente', 0, false)).toThrow(/no se puede modificar/);
  });

  it('inactiva y reactiva con historial, sin borrar (D-27)', () => {
    const { db, terceros } = crear();
    terceros.crear('cliente', tercero({ tipoPersona: 'natural', tipoIdentificacion: 'CC' }));
    expect(terceros.cambiarEstado('cliente', 10001, false).activo).toBe(false);
    expect(() => terceros.cambiarEstado('cliente', 10001, false)).toThrow(/ya está inactivo/);
    expect(terceros.cambiarEstado('cliente', 10001, true).activo).toBe(true);
    const acciones = listarHistorial(db, { entidad: 'cliente' }).map((h) => h.accion);
    expect(acciones).toEqual(expect.arrayContaining(['crear', 'inactivar', 'reactivar']));
  });
});

describe('productos', () => {
  it('crea con el costo manual, guarda bajo el costo y lista el proveedor', () => {
    const { terceros, productos } = crear();
    terceros.crear('proveedor', tercero());
    const creado = productos.crear(
      producto(10001, { precios: { mayor: 17_000, menor: 22_000, minimo: 20_000 } }),
    );
    expect(creado.codigo).toBe(101);
    expect(creado.costo).toBe(18_000);
    expect(creado.stockTotal).toBe(0);
    expect(productos.listar()[0]?.proveedorNombre).toBe('Distribuidora La 14');
    expect(productos.siguienteCodigo()).toBe(102);
  });

  it('no acepta un proveedor inexistente o inactivo', () => {
    const { terceros, productos } = crear();
    expect(() => productos.crear(producto(999))).toThrow(/No existe el proveedor 999/);
    terceros.crear('proveedor', tercero());
    terceros.cambiarEstado('proveedor', 10001, false);
    expect(() => productos.crear(producto(10001))).toThrow(/está inactivo/);
  });

  it('corrige el costo con motivo obligatorio y deja el historial (D-35)', () => {
    const { db, terceros, productos } = crear();
    terceros.crear('proveedor', tercero());
    productos.crear(producto(10001));
    expect(() => productos.corregirCosto(101, 19_000, '  ')).toThrow();
    expect(() => productos.corregirCosto(101, 18_000, 'Igual')).toThrow(/igual al actual/);
    expect(productos.corregirCosto(101, 19_500, 'Error al digitar').costo).toBe(19_500);
    const entrada = listarHistorial(db, { entidad: 'producto' }).find(
      (h) => h.motivo === 'Error al digitar',
    );
    expect(entrada?.antes).toBe('{"costo":18000}');
    expect(entrada?.despues).toBe('{"costo":19500}');
  });

  it('al crear carga el stock inicial en el kardex, en la misma transacción (D-45)', () => {
    const { db, terceros, productos, catalogos } = crear();
    terceros.crear('proveedor', tercero());
    const norte = catalogos.crear('bodega', { nombre: 'Norte', calculaCambio: false });
    const creado = productos.crear(producto(10001), { bodegaId: norte.id, cantidad: 12_500 });
    expect(creado.stockTotal).toBe(12_500);
    expect(creado.stockInicial).toEqual([
      { bodegaId: norte.id, bodegaNombre: 'Norte', cantidad: 12_500 },
    ]);
    expect(creado.tieneMovimientos).toBe(true);
    const movimiento = db
      .prepare(
        'SELECT tipo, costo_unitario AS costo, documento_tipo AS doc, documento_id AS id FROM movimientos_inventario',
      )
      .get();
    expect(movimiento).toEqual({ tipo: 'inicial', costo: 18_000, doc: 'producto', id: '101' });

    // Cantidad cero: el producto se crea sin movimiento.
    expect(
      productos.crear(producto(10001, { nombre: 'Otro' }), { bodegaId: norte.id, cantidad: 0 })
        .tieneMovimientos,
    ).toBe(false);
  });

  it('con un stock inicial inválido no crea el producto ni gasta el consecutivo', () => {
    const { terceros, productos, catalogos } = crear();
    terceros.crear('proveedor', tercero());
    expect(() =>
      productos.crear(producto(10001, { unidad: 'UND' }), { bodegaId: 1, cantidad: 1_500 }),
    ).toThrow(/sin decimales/);
    expect(() => productos.crear(producto(10001), { bodegaId: 1, cantidad: -1_000 })).toThrow(
      'El stock inicial no puede ser negativo.',
    );
    const sur = catalogos.crear('bodega', { nombre: 'Sur', calculaCambio: false });
    catalogos.cambiarEstado('bodega', sur.id, false);
    expect(() => productos.crear(producto(10001), { bodegaId: sur.id, cantidad: 1_000 })).toThrow(
      /no existe o está inactiva/,
    );
    expect(() => productos.crear(producto(10001), { bodegaId: 999, cantidad: 1_000 })).toThrow(
      /no existe o está inactiva/,
    );
    expect(productos.listar()).toHaveLength(0);
    expect(productos.siguienteCodigo()).toBe(101);
  });

  it('no cambia la unidad si el producto ya tiene movimientos', () => {
    const { db, ejecutar, terceros, productos } = crear();
    terceros.crear('proveedor', tercero());
    productos.crear(producto(10001));
    const principal = db.prepare('SELECT id FROM bodegas WHERE es_principal = 1').get() as {
      id: number;
    };
    ejecutar((ctx) =>
      insertarMovimiento(ctx, {
        productoCodigo: 101,
        bodegaId: principal.id,
        tipo: 'inicial',
        cantidad: 2_500,
        costoUnitario: 18_000,
      }),
    );
    const detalle = productos.obtener(101);
    expect(detalle.stockTotal).toBe(2_500);
    expect(detalle.stockPorBodega).toEqual([
      { bodegaId: principal.id, bodegaNombre: 'Principal', cantidad: 2_500 },
    ]);
    expect(() => productos.editar(101, { ...producto(10001), unidad: 'UND' })).toThrow(
      /unidad de medida/,
    );
    expect(productos.editar(101, { ...producto(10001), nombre: 'Salchichón' }).nombre).toBe(
      'Salchichón',
    );
  });
});

describe('catálogos', () => {
  it('trae las semillas y no permite inactivar la bodega Principal', () => {
    const { catalogos } = crear();
    const principal = catalogos.listar('bodega').find((b) => b.esPrincipal);
    expect(principal?.nombre).toBe('Principal');
    expect(() => catalogos.cambiarEstado('bodega', principal?.id ?? 0, false)).toThrow(/Principal/);
    expect(catalogos.listar('forma-pago').map((f) => f.nombre)).toEqual(
      expect.arrayContaining(['Efectivo', 'Transferencia', 'Tarjeta']),
    );
  });

  it('rechaza nombres repetidos sin importar tildes ni mayúsculas', () => {
    const { catalogos } = crear();
    catalogos.crear('bodega', { nombre: 'Bodega Norte', calculaCambio: false });
    expect(() =>
      catalogos.crear('bodega', { nombre: 'bodega norte', calculaCambio: false }),
    ).toThrow(/Ya existe una bodega/);
    expect(() =>
      catalogos.crear('forma-pago', { nombre: 'EFECTIVO', calculaCambio: true }),
    ).toThrow(/Ya existe una forma de pago/);
  });
});
