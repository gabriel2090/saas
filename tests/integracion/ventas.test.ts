import { describe, expect, it } from 'vitest';
import type { BaseDeDatos } from '../../src/data/conexion';
import { listarHistorial } from '../../src/data/repositorios/historial.repo';
import { stockEnBodega } from '../../src/data/repositorios/kardex.repo';
import { crearEjecutorTransacciones } from '../../src/data/transaccion';
import { crearServicioProductos } from '../../src/main/servicios/productos';
import { crearServicioTerceros } from '../../src/main/servicios/terceros';
import { crearServicioVentas } from '../../src/main/servicios/ventas';
import type { DatosTerceroNuevo } from '../../src/shared/maestros';
import type { PeticionGuardarFactura } from '../../src/shared/ventas';
import { baseDeDatosDePrueba } from './ayudas';

/**
 * Datos de un tercero de prueba.
 *
 * @param numero - Número de identificación (único).
 * @param nombre - Nombre.
 * @param topeCredito - Tope de crédito (solo clientes).
 * @returns Datos completos.
 */
function tercero(numero: string, nombre: string, topeCredito: number | null): DatosTerceroNuevo {
  return {
    codigo: null,
    tipoPersona: 'natural',
    nombre,
    tipoIdentificacion: 'CC',
    numeroIdentificacion: numero,
    celular: '3042620852',
    direccion: 'CARR 25 #122-04',
    barrio: 'LA PRADERA',
    ciudad: 'BARRANQUILLA',
    topeCredito,
  };
}

/**
 * Base con un proveedor, tres productos (los de la factura actual 84771), un
 * cliente con tope y otro sin tope, y un reloj que se puede mover.
 *
 * @returns Conexión, servicios, códigos y el control del reloj.
 */
function crear(): {
  db: BaseDeDatos;
  ventas: ReturnType<typeof crearServicioVentas>;
  terceros: ReturnType<typeof crearServicioTerceros>;
  conTope: number;
  sinTope: number;
  fijarHora: (iso: string) => void;
} {
  let ahora = '2026-09-10T10:00:00.000-05:00';
  const reloj = (): string => ahora;
  const db = baseDeDatosDePrueba();
  const ejecutar = crearEjecutorTransacciones(db, { reloj });
  const terceros = crearServicioTerceros(db, ejecutar);
  const productos = crearServicioProductos(db, ejecutar);
  const prov = terceros.crear('proveedor', { ...tercero('900', 'AGRINA', null) }).codigo;
  productos.crear({
    codigo: 231,
    nombre: 'PAPA FRANCESA AGRINA PREMIUM *2.5 KG',
    proveedorCodigo: prov,
    unidad: 'UND',
    costo: 12_000,
    precios: { mayor: 16_000, menor: 17_500, minimo: 14_000 },
  });
  productos.crear({
    codigo: 101,
    nombre: 'CAJA PIZZA 35*35 FD',
    proveedorCodigo: prov,
    unidad: 'UND',
    costo: 1500,
    precios: { mayor: 1950, menor: 2200, minimo: 1800 },
  });
  productos.crear({
    codigo: 102,
    nombre: 'CAJA PIZZA 40*40 FD',
    proveedorCodigo: prov,
    unidad: 'UND',
    costo: 1800,
    precios: { mayor: 2300, menor: 2600, minimo: 2100 },
  });
  const conTope = terceros.crear(
    'cliente',
    tercero('212121354', 'JUAN JJ FERTILIA', 500_000),
  ).codigo;
  const sinTope = terceros.crear('cliente', tercero('111', 'MARÍA SIN TOPE', null)).codigo;
  return {
    db,
    ventas: crearServicioVentas(db, ejecutar, { reloj }),
    terceros,
    conTope,
    sinTope,
    fijarHora: (iso) => {
      ahora = iso;
    },
  };
}

/**
 * La factura actual 84771: total $ 79,250 y ahorro $ 12,000.
 *
 * @param cambios - Campos a reemplazar.
 * @returns Petición completa.
 */
function factura(cambios: Partial<PeticionGuardarFactura> = {}): PeticionGuardarFactura {
  return {
    ranura: null,
    clienteCodigo: 0,
    condicion: 'contado',
    plazoDias: 0,
    bodegaId: 1,
    lineas: [
      { productoCodigo: 231, escala: 'menor', cantidad: 4000, precioAlterado: 14_500 },
      { productoCodigo: 101, escala: 'mayor', cantidad: 5000, precioAlterado: null },
      { productoCodigo: 102, escala: 'mayor', cantidad: 5000, precioAlterado: null },
    ],
    contado: { formaPagoId: 1, recibido: 100_000 },
    cajasEmpaque: null,
    ...cambios,
  };
}

/**
 * Cuenta las filas de una tabla.
 *
 * @param db - Conexión.
 * @param tabla - Tabla.
 * @returns Cantidad de filas.
 */
function contar(db: BaseDeDatos, tabla: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get() as { n: number }).n;
}

describe('factura de cliente', () => {
  it('guarda la factura de contado, el kardex y el historial en una transacción y vacía el borrador', () => {
    const { db, ventas } = crear();
    ventas.configurar({ siguienteNumero: 84772, impresora: null });
    ventas.guardarBorrador({ ranura: 2, contenido: '{"clienteCodigo":0}' });

    const guardada = ventas.guardar(factura({ ranura: 2, cajasEmpaque: 2 }));

    expect(guardada).toMatchObject({ numero: 84772, total: 79_250, cambio: 20_750 });
    expect(ventas.contexto().siguienteNumero).toBe(84773);
    expect(contar(db, 'facturas_cliente_lineas')).toBe(3);
    expect(contar(db, 'facturas_cliente_versiones')).toBe(1);
    expect(ventas.borradores()).toEqual([]);
    expect(stockEnBodega(db, 231, 1)).toBe(-4000);
    const kardex = db
      .prepare(
        `SELECT tipo, cantidad, costo_unitario AS costo, documento_tipo AS doc, documento_id AS id
         FROM movimientos_inventario WHERE producto_codigo = 231`,
      )
      .all();
    expect(kardex).toEqual([
      { tipo: 'venta', cantidad: -4000, costo: 12_000, doc: 'factura_cliente', id: '84772' },
    ]);
    const historial = listarHistorial(db, { entidad: 'factura_cliente' });
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({ entidadId: '84772', accion: 'crear' });

    const detalle = ventas.obtener(guardada.id);
    expect(detalle).toMatchObject({
      numero: 84772,
      condicion: 'contado',
      total: 79_250,
      ahorro: 12_000,
      recibido: 100_000,
      cambio: 20_750,
      cajasEmpaque: 2,
      saldo: 0,
      formaPagoNombre: 'Efectivo',
      cliente: { codigo: 0, nombre: 'CONSUMIDOR FINAL' },
    });
    expect(detalle.lineas.map((l) => [l.productoNombre, l.precio, l.total, l.alterado])).toEqual([
      ['PAPA FRANCESA AGRINA PREMIUM *2.5 KG', 14_500, 58_000, true],
      ['CAJA PIZZA 35*35 FD', 1950, 9750, false],
      ['CAJA PIZZA 40*40 FD', 2300, 11_500, false],
    ]);
  });

  it('una forma de pago sin cambio no guarda recibido ni cambio', () => {
    const { ventas } = crear();
    const guardada = ventas.guardar(factura({ contado: { formaPagoId: 2, recibido: null } }));
    expect(guardada.cambio).toBeNull();
    expect(ventas.obtener(guardada.id)).toMatchObject({ recibido: null, cambio: null });
  });

  it('a crédito crea la cuenta por cobrar con su vencimiento', () => {
    const { ventas, conTope } = crear();
    expect(ventas.creditoCliente(conTope).ultimoPlazo).toBeNull();
    const guardada = ventas.guardar(
      factura({ clienteCodigo: conTope, condicion: 'credito', plazoDias: 8, contado: null }),
    );
    expect(ventas.obtener(guardada.id)).toMatchObject({
      condicion: 'credito',
      plazoDias: 8,
      vence: '2026-09-18',
      saldo: 79_250,
      formaPagoNombre: null,
    });
    expect(ventas.creditoCliente(conTope)).toEqual({
      tope: 500_000,
      deuda: { total: 79_250, vencido: 0 },
      vencidaMasAntigua: null,
      ultimoPlazo: 8,
    });
  });

  it('bloquea el crédito con facturas vencidas o sin cupo, solo si el cliente tiene tope (S-03)', () => {
    const { db, ventas, conTope, sinTope, fijarHora } = crear();
    const credito = { condicion: 'credito', plazoDias: 8, contado: null } as const;
    ventas.guardar(factura({ ...credito, clienteCodigo: conTope }));
    ventas.guardar(factura({ ...credito, clienteCodigo: sinTope }));

    fijarHora('2026-10-01T09:00:00.000-05:00');
    expect(ventas.creditoCliente(conTope)).toEqual({
      tope: 500_000,
      deuda: { total: 79_250, vencido: 79_250 },
      vencidaMasAntigua: { numero: 1, vence: '2026-09-18' },
      ultimoPlazo: 8,
    });
    expect(() => ventas.guardar(factura({ ...credito, clienteCodigo: conTope }))).toThrow(
      'No se puede vender a crédito a 10001 - JUAN JJ FERTILIA: Tiene facturas vencidas por ' +
        '$ 79,250 (la más antigua, la 1, venció hace 13 días).',
    );
    // El intento fallido no consume número ni deja rastro.
    expect(ventas.contexto().siguienteNumero).toBe(3);
    expect(contar(db, 'facturas_cliente')).toBe(2);
    // De contado sí se le vende; y al cliente sin tope, a crédito aunque tenga vencidas.
    expect(ventas.guardar(factura({ clienteCodigo: conTope })).numero).toBe(3);
    expect(ventas.guardar(factura({ ...credito, clienteCodigo: sinTope })).numero).toBe(4);
  });

  it('bloquea la venta que supera el cupo disponible', () => {
    const { ventas, conTope } = crear();
    const grande = factura({
      clienteCodigo: conTope,
      condicion: 'credito',
      plazoDias: 30,
      contado: null,
      lineas: [{ productoCodigo: 231, escala: 'menor', cantidad: 29_000, precioAlterado: null }],
    });
    expect(() => ventas.guardar(grande)).toThrow(
      /La venta \(\$ 507,500\) supera el crédito disponible \(\$ 500,000\) en \$ 7,500\./,
    );
  });

  it('no vende a crédito a Consumidor final', () => {
    const { ventas } = crear();
    expect(() =>
      ventas.guardar(factura({ condicion: 'credito', plazoDias: 8, contado: null })),
    ).toThrow(/Consumidor final/);
  });

  it('bloquea el precio bajo el costo y no consume el consecutivo', () => {
    const { db, ventas } = crear();
    expect(() =>
      ventas.guardar(
        factura({
          lineas: [
            { productoCodigo: 231, escala: 'menor', cantidad: 1000, precioAlterado: 11_000 },
          ],
        }),
      ),
    ).toThrow(/por debajo del costo/);
    expect(contar(db, 'facturas_cliente')).toBe(0);
    expect(ventas.contexto().siguienteNumero).toBe(1);
  });

  it('rechaza clientes inactivos, recibido insuficiente y contado sin forma de pago', () => {
    const { ventas, terceros, sinTope } = crear();
    expect(() =>
      ventas.guardar(factura({ contado: { formaPagoId: 1, recibido: 50_000 } })),
    ).toThrow(/menor que el total/);
    expect(() => ventas.guardar(factura({ contado: null }))).toThrow(/forma de pago/);
    terceros.cambiarEstado('cliente', sinTope, false);
    expect(() => ventas.guardar(factura({ clienteCodigo: sinTope }))).toThrow(/inactivo/);
  });
});

describe('configuración de la facturación (D-84, D-88)', () => {
  it('cambia el consecutivo y la impresora, con historial', () => {
    const { db, ventas } = crear();
    expect(ventas.configuracion()).toEqual({
      siguienteNumero: 1,
      ultimoNumero: null,
      impresora: null,
    });
    expect(ventas.configurar({ siguienteNumero: 84772, impresora: 'EPSON TM-T20II' })).toEqual({
      siguienteNumero: 84772,
      ultimoNumero: null,
      impresora: 'EPSON TM-T20II',
    });
    expect(ventas.contexto().impresoraConfigurada).toBe(true);
    expect(listarHistorial(db, { entidad: 'consecutivo' })[0]).toMatchObject({
      entidadId: 'factura_cliente',
      accion: 'editar',
    });
  });

  it('no deja volver a un número ya usado', () => {
    const { ventas } = crear();
    ventas.configurar({ siguienteNumero: 84772, impresora: null });
    ventas.guardar(factura());
    expect(() => ventas.configurar({ siguienteNumero: 84772, impresora: null })).toThrow(
      /mayor que 84772/,
    );
    expect(ventas.configurar({ siguienteNumero: 90000, impresora: null }).siguienteNumero).toBe(
      90000,
    );
  });
});

describe('borradores (D-89)', () => {
  it('se guardan, sobrescriben y descartan por ranura sin pasar por el historial', () => {
    const { db, ventas } = crear();
    const antes = contar(db, 'historial_cambios');
    ventas.guardarBorrador({ ranura: 1, contenido: '{"a":1}' });
    ventas.guardarBorrador({ ranura: 3, contenido: '{"b":2}' });
    ventas.guardarBorrador({ ranura: 1, contenido: '{"a":3}' });
    expect(ventas.borradores().map((b) => [b.ranura, b.contenido])).toEqual([
      [1, '{"a":3}'],
      [3, '{"b":2}'],
    ]);
    ventas.borrarBorrador(3);
    expect(ventas.borradores()).toHaveLength(1);
    expect(contar(db, 'historial_cambios')).toBe(antes);
  });

  it('rechaza ranuras y contenidos inválidos', () => {
    const { ventas } = crear();
    expect(() => ventas.guardarBorrador({ ranura: 7, contenido: '{}' })).toThrow(/no existe/);
    expect(() => ventas.guardarBorrador({ ranura: 1, contenido: 'no es json' })).toThrow(/formato/);
    expect(() => ventas.guardarBorrador({ ranura: 1, contenido: '[1]' })).toThrow(/formato/);
  });
});

describe('protecciones de la migración 0004', () => {
  it('las facturas no se borran y cada aplicación va a una sola factura', () => {
    const { db, ventas } = crear();
    const { id } = ventas.guardar(factura());
    expect(() => db.prepare('DELETE FROM facturas_cliente').run()).toThrow(/se anulan/);
    expect(() => db.prepare('UPDATE facturas_cliente_lineas SET precio = 1').run()).toThrow(
      /no se pueden modificar/,
    );
    db.prepare(
      `INSERT INTO abonos (tipo, numero, cliente_codigo, fecha, forma_pago_id, valor, registrado_en)
       VALUES ('cliente', 1, 0, '2026-09-10', 1, 100, '2026-09-10T10:00:00-05:00')`,
    ).run();
    expect(() =>
      db.prepare('INSERT INTO abonos_aplicaciones (abono_id, valor) VALUES (1, 100)').run(),
    ).toThrow(/una sola factura/);
    expect(() =>
      db
        .prepare(
          'INSERT INTO abonos_aplicaciones (abono_id, factura_cliente_id, valor) VALUES (1, ?, 100)',
        )
        .run(id),
    ).not.toThrow();
  });
});
