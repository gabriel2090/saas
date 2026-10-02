import { describe, expect, it } from 'vitest';
import { read, utils, write } from 'xlsx';
import {
  abrirLibro,
  armarFilas,
  crearReporteErrores,
  decodificarCsv,
  leerHoja,
  textoNumero,
} from './lectura';

/**
 * Crea un XLSX en memoria a partir de una matriz.
 *
 * @param filas - Filas de la hoja.
 * @returns Bytes del archivo.
 */
function xlsx(filas: unknown[][]): Uint8Array {
  const libro = utils.book_new();
  utils.book_append_sheet(libro, utils.aoa_to_sheet(filas), 'Productos');
  return new Uint8Array(write(libro, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('lectura de archivos del importador', () => {
  it('decodifica CSV en UTF-8 (con o sin BOM) y en Windows-1252', () => {
    expect(decodificarCsv(new TextEncoder().encode('\uFEFFCódigo'))).toBe('Código');
    // «ó» en Windows-1252 es el byte 0xF3, inválido como UTF-8 suelto.
    expect(decodificarCsv(new Uint8Array([0x43, 0xf3, 0x64]))).toBe('Cód');
  });

  it('en CSV conserva el texto tal cual (ceros a la izquierda, comas de miles)', () => {
    const bytes = new TextEncoder().encode('Código,Identificación,Costo\n7,001234,"13,200"\n');
    const { libro, hojas } = abrirLibro('clientes.csv', bytes);
    const hoja = leerHoja(libro, hojas[0] ?? '');
    expect(hoja.encabezados).toEqual(['Código', 'Identificación', 'Costo']);
    expect(hoja.filas).toEqual([{ numero: 2, celdas: ['7', '001234', '13,200'] }]);
  });

  it('detecta el punto y coma como separador (CSV de Excel en español)', () => {
    const bytes = new TextEncoder().encode('Código;Nombre;Costo\n7;Queso costeño;13200\n');
    const { libro, hojas } = abrirLibro('productos.csv', bytes);
    expect(leerHoja(libro, hojas[0] ?? '').filas).toEqual([
      { numero: 2, celdas: ['7', 'Queso costeño', '13200'] },
    ]);
  });

  it('en Excel toma el valor numérico, omite filas vacías y conserva su número', () => {
    const bytes = xlsx([
      ['Cod', 'Nombre', 'Cantidad'],
      [101, ' Queso ', 12.5],
      [],
      [102, 'Pan', 3],
    ]);
    const { libro } = abrirLibro('stock.xlsx', bytes);
    const hoja = leerHoja(libro, 'Productos');
    expect(hoja.filas).toEqual([
      { numero: 2, celdas: [101, 'Queso', 12.5] },
      { numero: 4, celdas: [102, 'Pan', 3] },
    ]);
  });

  it('arma las filas solo con los campos asignados', () => {
    const hoja = { encabezados: ['A', 'B'], filas: [{ numero: 2, celdas: ['7', 'Queso'] }] };
    expect(armarFilas(hoja, { codigo: 0, nombre: 1, costo: null }, 'punto-decimal')).toEqual([
      { numero: 2, valores: { codigo: '7', nombre: 'Queso' } },
    ]);
  });

  it('escribe las celdas numéricas en el formato elegido y deja el texto igual (D-40)', () => {
    const hoja = {
      encabezados: ['Cod', 'Costo', 'Cantidad', 'Texto'],
      filas: [{ numero: 2, celdas: [101, 13200, 12.5, '1.250,5'] }],
    };
    const mapeo = { codigo: 0, costo: 1, cantidad: 2, otro: 3 };
    expect(armarFilas(hoja, mapeo, 'coma-decimal')[0]?.valores).toEqual({
      codigo: '101',
      costo: '13200',
      cantidad: '12,5',
      otro: '1.250,5',
    });
    expect(armarFilas(hoja, mapeo, 'punto-decimal')[0]?.valores).toMatchObject({
      cantidad: '12.5',
    });
  });

  it('quita el ruido de coma flotante de los números de Excel', () => {
    expect(textoNumero(0.1 + 0.2, 'punto-decimal')).toBe('0.3');
    expect(textoNumero(12.300000000000001, 'coma-decimal')).toBe('12,3');
    expect(textoNumero(3001234567, 'punto-decimal')).toBe('3001234567');
  });

  it('el reporte de errores incluye fila, campo, mensaje y los datos originales', () => {
    const hoja = { encabezados: ['Cod', 'Nombre'], filas: [{ numero: 3, celdas: ['x', 'Pan'] }] };
    const bytes = crearReporteErrores(
      [{ fila: 3, campo: 'codigo', mensaje: 'El código no es válido.' }],
      hoja,
      { codigo: 'Código' },
    );
    const libro = read(bytes, { type: 'array' });
    const filas = utils.sheet_to_json<unknown[]>(libro.Sheets.Errores ?? {}, { header: 1 });
    expect(filas).toEqual([
      ['Fila', 'Campo', 'Error', 'Cod', 'Nombre'],
      [3, 'Código', 'El código no es válido.', 'x', 'Pan'],
    ]);
  });
});
