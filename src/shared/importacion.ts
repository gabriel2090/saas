/**
 * Qué se puede importar en la Fase 1. Los saldos iniciales de cartera
 * llegan en la Fase 3 (D-24).
 */
export type TipoImportacion = 'productos' | 'clientes' | 'proveedores' | 'stock';

/**
 * Campo del sistema al que se asigna una columna del archivo.
 */
export interface CampoImportacion {
  /** Clave interna del campo. */
  clave: string;
  /** Nombre en pantalla. */
  etiqueta: string;
  /** Si es obligatorio asignarle una columna. */
  obligatorio: boolean;
  /** Nombres de encabezado con que se sugiere automáticamente (ya normalizados). */
  sinonimos: readonly string[];
  /** Ayuda corta sobre el formato esperado. */
  ayuda?: string;
}

/**
 * Campos de los terceros (clientes y proveedores comparten los mismos).
 */
const CAMPOS_TERCERO: readonly CampoImportacion[] = [
  {
    clave: 'codigo',
    etiqueta: 'Código',
    obligatorio: false,
    sinonimos: ['codigo', 'cod', 'id', 'codigo cliente', 'codigo proveedor'],
    ayuda: 'Si se deja sin asignar, se toma el consecutivo.',
  },
  {
    clave: 'tipoPersona',
    etiqueta: 'Tipo de persona',
    obligatorio: false,
    sinonimos: ['tipo persona', 'persona', 'tipo de persona'],
    ayuda: 'Natural o Jurídica. Sin asignar: natural, o jurídica si el documento es NIT.',
  },
  {
    clave: 'nombre',
    etiqueta: 'Nombre o razón social',
    obligatorio: true,
    sinonimos: ['nombre', 'razon social', 'nombre completo', 'cliente', 'proveedor'],
  },
  {
    clave: 'tipoIdentificacion',
    etiqueta: 'Tipo de identificación',
    obligatorio: true,
    sinonimos: ['tipo identificacion', 'tipo documento', 'tipo doc', 'tipo id'],
    ayuda: 'CC, NIT, CE o Pasaporte.',
  },
  {
    clave: 'numeroIdentificacion',
    etiqueta: 'Número de identificación',
    obligatorio: true,
    sinonimos: ['nit', 'cedula', 'identificacion', 'documento', 'numero documento', 'cc'],
  },
  {
    clave: 'celular',
    etiqueta: 'Celular',
    obligatorio: true,
    sinonimos: ['celular', 'telefono', 'tel', 'movil'],
  },
  {
    clave: 'direccion',
    etiqueta: 'Dirección',
    obligatorio: true,
    sinonimos: ['direccion', 'dir'],
  },
  { clave: 'barrio', etiqueta: 'Barrio', obligatorio: false, sinonimos: ['barrio'] },
  { clave: 'ciudad', etiqueta: 'Ciudad', obligatorio: false, sinonimos: ['ciudad', 'municipio'] },
];

/**
 * Campos de cada tipo de importación.
 */
export const CAMPOS_IMPORTACION: Readonly<Record<TipoImportacion, readonly CampoImportacion[]>> = {
  productos: [
    {
      clave: 'codigo',
      etiqueta: 'Código',
      obligatorio: false,
      sinonimos: ['codigo', 'cod', 'referencia', 'codigo producto'],
      ayuda: 'Si se deja sin asignar, se toma el consecutivo (desde 101).',
    },
    {
      clave: 'nombre',
      etiqueta: 'Nombre',
      obligatorio: true,
      sinonimos: ['nombre', 'descripcion', 'producto', 'articulo'],
    },
    {
      clave: 'proveedor',
      etiqueta: 'Código del proveedor',
      obligatorio: true,
      sinonimos: ['proveedor', 'codigo proveedor', 'cod proveedor'],
      ayuda: 'El proveedor debe existir: importe primero los proveedores.',
    },
    {
      clave: 'unidad',
      etiqueta: 'Unidad de medida',
      obligatorio: true,
      sinonimos: ['unidad', 'und', 'unidad medida', 'medida'],
      ayuda: 'UND o KG (también «Unidad» o «Kilo»).',
    },
    {
      clave: 'costo',
      etiqueta: 'Costo',
      obligatorio: true,
      sinonimos: ['costo', 'costo unitario', 'ultimo costo'],
    },
    {
      clave: 'precioMayor',
      etiqueta: 'Precio mayor',
      obligatorio: true,
      sinonimos: ['precio mayor', 'mayor', 'precio 1', 'precio por mayor'],
    },
    {
      clave: 'precioMenor',
      etiqueta: 'Precio menor',
      obligatorio: true,
      sinonimos: ['precio menor', 'menor', 'precio 2', 'precio detal', 'precio al detal'],
    },
    {
      clave: 'precioMinimo',
      etiqueta: 'Precio mínimo',
      obligatorio: true,
      sinonimos: ['precio minimo', 'minimo', 'precio 3'],
    },
  ],
  clientes: CAMPOS_TERCERO,
  proveedores: CAMPOS_TERCERO,
  stock: [
    {
      clave: 'producto',
      etiqueta: 'Código del producto',
      obligatorio: true,
      sinonimos: ['codigo', 'producto', 'codigo producto', 'cod'],
    },
    {
      clave: 'cantidad',
      etiqueta: 'Cantidad',
      obligatorio: true,
      sinonimos: ['cantidad', 'stock', 'existencia', 'existencias', 'saldo'],
      ayuda:
        'KG con hasta tres decimales; UND sin decimales. Volver a importarla reemplaza el stock inicial mientras el producto no tenga otros movimientos.',
    },
    {
      clave: 'bodega',
      etiqueta: 'Bodega',
      obligatorio: false,
      sinonimos: ['bodega', 'almacen'],
      ayuda: 'Nombre de la bodega. Sin asignar: Principal.',
    },
  ],
};

/**
 * Nombre en pantalla de cada tipo de importación.
 */
export const NOMBRES_IMPORTACION: Readonly<Record<TipoImportacion, string>> = {
  proveedores: 'Proveedores',
  productos: 'Productos',
  clientes: 'Clientes',
  stock: 'Stock inicial',
};

/**
 * Una fila leída del archivo, ya con las columnas asignadas a campos.
 */
export interface FilaImportacion {
  /** Número de fila en el archivo (la primera fila de datos es la 2). */
  numero: number;
  /** Texto de cada campo asignado (clave del campo → valor). */
  valores: Readonly<Record<string, string>>;
}

/**
 * Error de una fila del archivo.
 */
export interface ErrorFila {
  /** Número de fila en el archivo. */
  fila: number;
  /** Campo con el problema, o `null` si es de la fila completa. */
  campo: string | null;
  /** Mensaje en español. */
  mensaje: string;
}

/**
 * Cómo están escritos los números del archivo (D-40): lo elige el usuario.
 * - `punto-decimal`: `1,250.5` (como la factura).
 * - `coma-decimal`: `1.250,5` (configuración regional de Colombia en Excel).
 *
 * Las celdas numéricas de Excel no dependen de esta opción: se toman por su valor.
 */
export type FormatoNumerico = 'punto-decimal' | 'coma-decimal';

/**
 * Formatos numéricos con su texto en pantalla, en el orden del selector.
 */
export const FORMATOS_NUMERICOS: readonly { valor: FormatoNumerico; etiqueta: string }[] = [
  { valor: 'punto-decimal', etiqueta: 'Punto decimal: 1,250.5' },
  { valor: 'coma-decimal', etiqueta: 'Coma decimal: 1.250,5' },
];

/**
 * Petición para validar o importar un archivo.
 */
export interface PeticionImportacion {
  /** Qué se importa. */
  tipo: TipoImportacion;
  /** Cómo están escritos los números en las celdas de texto. */
  formato: FormatoNumerico;
  /** Filas con sus campos. */
  filas: readonly FilaImportacion[];
}

/**
 * Resultado de validar un archivo (vista previa).
 */
export interface ResultadoValidacionImportacion {
  /** Filas leídas. */
  total: number;
  /** Filas sin errores. */
  validas: number;
  /** Errores encontrados (puede haber varios por fila). */
  errores: ErrorFila[];
  /** Avisos de filas válidas que conviene revisar (p. ej. reemplazan un stock inicial ya cargado). */
  avisos: ErrorFila[];
}

/**
 * Resultado de importar las filas válidas.
 */
export interface ResultadoImportacion {
  /** Registros importados. */
  importadas: number;
  /** Filas omitidas por tener errores. */
  omitidas: number;
  /** Errores de las filas omitidas (para el reporte). */
  errores: ErrorFila[];
}

/**
 * Petición para guardar el reporte de errores en un archivo elegido por el usuario.
 */
export interface PeticionGuardarReporte {
  /** Nombre de archivo sugerido (`errores-productos.xlsx`). */
  nombreSugerido: string;
  /** Contenido del archivo XLSX. */
  contenido: Uint8Array;
}
