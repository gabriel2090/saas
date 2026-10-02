/**
 * Identificadores de todos los procesos (ventanas) del sistema. Cada uno se
 * abre desde la barra de iconos, el buscador de procesos o su atajo.
 */
export type IdProceso =
  | 'facturar'
  | 'factura-proveedor'
  | 'abono-cliente'
  | 'abono-proveedor'
  | 'productos'
  | 'clientes'
  | 'proveedores'
  | 'bodegas'
  | 'formas-pago'
  | 'datos-negocio'
  | 'importador'
  | 'correccion-cliente'
  | 'correccion-proveedor'
  | 'devoluciones'
  | 'ajustes-inventario'
  | 'reimpresiones'
  | 'reporte-inventario'
  | 'cuentas-cobrar'
  | 'cuentas-pagar'
  | 'kardex'
  | 'historial-cambios'
  | 'cierre-caja'
  | 'estados-cuenta'
  | 'respaldos'
  | 'cambiar-contrasena';

/**
 * Fase de trabajo (sección 13) en la que se entrega un proceso.
 */
export type FaseEntrega = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Descripción de un proceso para la barra de iconos y el buscador.
 */
export interface DefinicionProceso {
  /** Identificador único. */
  id: IdProceso;
  /** Título de la ventana y del ícono. */
  titulo: string;
  /** Palabras extra con las que el buscador encuentra el proceso. */
  palabrasClave: readonly string[];
  /** Fase en la que el proceso queda disponible. */
  fase: FaseEntrega;
  /** Si aparece anclado en la barra superior de iconos. */
  anclado: boolean;
}

/**
 * Catálogo de procesos en el orden en que aparecen en la barra y el buscador.
 */
export const PROCESOS: readonly DefinicionProceso[] = [
  {
    id: 'facturar',
    titulo: 'Facturar',
    palabrasClave: ['venta', 'factura cliente', 'pos'],
    fase: 3,
    anclado: true,
  },
  {
    id: 'factura-proveedor',
    titulo: 'Factura de proveedor',
    palabrasClave: ['compra', 'entrada'],
    fase: 2,
    anclado: true,
  },
  {
    id: 'abono-cliente',
    titulo: 'Abono de cliente',
    palabrasClave: ['pago', 'recibo', 'cartera'],
    fase: 3,
    anclado: true,
  },
  {
    id: 'abono-proveedor',
    titulo: 'Abono a proveedor',
    palabrasClave: ['pago', 'egreso'],
    fase: 2,
    anclado: true,
  },
  {
    id: 'productos',
    titulo: 'Productos',
    palabrasClave: ['articulos', 'precios', 'inventario'],
    fase: 1,
    anclado: true,
  },
  { id: 'clientes', titulo: 'Clientes', palabrasClave: ['terceros'], fase: 1, anclado: true },
  { id: 'proveedores', titulo: 'Proveedores', palabrasClave: ['terceros'], fase: 1, anclado: true },
  { id: 'bodegas', titulo: 'Bodegas', palabrasClave: ['almacen'], fase: 1, anclado: false },
  {
    id: 'formas-pago',
    titulo: 'Formas de pago',
    palabrasClave: ['efectivo', 'transferencia'],
    fase: 1,
    anclado: false,
  },
  {
    id: 'datos-negocio',
    titulo: 'Datos del negocio',
    palabrasClave: ['empresa', 'nit', 'encabezado'],
    fase: 1,
    anclado: false,
  },
  {
    id: 'importador',
    titulo: 'Importar datos',
    palabrasClave: ['excel', 'csv', 'xlsx', 'cargar'],
    fase: 1,
    anclado: false,
  },
  {
    id: 'correccion-cliente',
    titulo: 'Corrección de factura de cliente',
    palabrasClave: ['editar', 'anular', 'venta'],
    fase: 4,
    anclado: false,
  },
  {
    id: 'correccion-proveedor',
    titulo: 'Corrección de factura de proveedor',
    palabrasClave: ['editar', 'anular', 'compra'],
    fase: 4,
    anclado: false,
  },
  {
    id: 'devoluciones',
    titulo: 'Devoluciones',
    palabrasClave: ['devolucion venta', 'devolucion compra'],
    fase: 4,
    anclado: false,
  },
  {
    id: 'ajustes-inventario',
    titulo: 'Ajustes de inventario',
    palabrasClave: ['merma', 'dano', 'conteo fisico'],
    fase: 2,
    anclado: false,
  },
  {
    id: 'reimpresiones',
    titulo: 'Reimpresiones',
    palabrasClave: ['imprimir', 'copia'],
    fase: 4,
    anclado: true,
  },
  {
    id: 'reporte-inventario',
    titulo: 'Reporte de inventario',
    palabrasClave: ['existencias', 'stock'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'cuentas-cobrar',
    titulo: 'Cuentas por cobrar',
    palabrasClave: ['cartera', 'vencidas', 'deudores'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'cuentas-pagar',
    titulo: 'Cuentas por pagar',
    palabrasClave: ['deudas', 'proveedores'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'kardex',
    titulo: 'Kardex',
    palabrasClave: ['movimientos', 'entradas', 'salidas'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'historial-cambios',
    titulo: 'Historial de cambios',
    palabrasClave: ['auditoria', 'log'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'cierre-caja',
    titulo: 'Cierre de caja',
    palabrasClave: ['arqueo', 'cuadre'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'estados-cuenta',
    titulo: 'Estados de cuenta',
    palabrasClave: ['extracto', 'saldo'],
    fase: 5,
    anclado: false,
  },
  {
    id: 'respaldos',
    titulo: 'Respaldos',
    palabrasClave: ['copia de seguridad', 'restaurar', 'backup'],
    fase: 6,
    anclado: false,
  },
  {
    id: 'cambiar-contrasena',
    titulo: 'Cambiar contraseña',
    palabrasClave: ['clave', 'seguridad', 'password'],
    fase: 0,
    anclado: false,
  },
];

/**
 * Busca la definición de un proceso.
 *
 * @param id - Identificador del proceso.
 * @returns La definición del proceso.
 * @throws {Error} Si el identificador no existe en {@link PROCESOS}.
 */
export function obtenerProceso(id: IdProceso): DefinicionProceso {
  const proceso = PROCESOS.find((p) => p.id === id);
  if (!proceso) {
    throw new Error(`Proceso desconocido: ${id}`);
  }
  return proceso;
}

/**
 * Normaliza un texto para búsqueda: minúsculas y sin tildes.
 *
 * @param texto - Texto a normalizar.
 * @returns Texto normalizado.
 */
export function normalizarBusqueda(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Filtra los procesos que coinciden con lo que el usuario escribe en el
 * buscador. Coinciden si cada palabra escrita aparece en el título o en las
 * palabras clave; primero van los que empiezan por el texto buscado.
 *
 * @param consulta - Texto escrito en el buscador.
 * @param procesos - Catálogo donde buscar (por defecto, {@link PROCESOS}).
 * @returns Procesos coincidentes, ordenados por relevancia.
 *
 * @example
 * buscarProcesos('abono'); // [Abono de cliente, Abono a proveedor]
 */
export function buscarProcesos(
  consulta: string,
  procesos: readonly DefinicionProceso[] = PROCESOS,
): DefinicionProceso[] {
  const texto = normalizarBusqueda(consulta);
  if (texto === '') {
    return [...procesos];
  }
  const palabras = texto.split(/\s+/);
  const coincidentes = procesos.filter((p) => {
    const pajar = normalizarBusqueda([p.titulo, ...p.palabrasClave].join(' '));
    return palabras.every((palabra) => pajar.includes(palabra));
  });
  // Orden estable: primero los títulos que empiezan por la consulta.
  return coincidentes.sort((a, b) => {
    const aEmpieza = normalizarBusqueda(a.titulo).startsWith(texto) ? 0 : 1;
    const bEmpieza = normalizarBusqueda(b.titulo).startsWith(texto) ? 0 : 1;
    return aEmpieza - bEmpieza;
  });
}
