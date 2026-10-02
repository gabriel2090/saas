import type { UnidadMedida } from '../../shared/formato/cantidades';
import {
  TIPOS_IDENTIFICACION,
  TIPOS_PERSONA,
  type ClaseTercero,
  type DatosCatalogo,
  type DatosNegocio,
  type DatosProducto,
  type DatosTercero,
  type StockInicialNuevo,
  type TipoCatalogo,
} from '../../shared/maestros';
import type { ServicioCatalogos } from '../servicios/catalogos';
import type { ServicioNegocio } from '../servicios/negocio';
import type { ServicioProductos } from '../servicios/productos';
import type { ServicioTerceros } from '../servicios/terceros';
import type { RegistrarManejador } from './registrar';
import {
  exigirBooleano,
  exigirEntero,
  exigirEnteroONulo,
  exigirObjeto,
  exigirOpcion,
  exigirTexto,
} from './validacion';

/**
 * Unidades de medida aceptadas.
 */
const UNIDADES: readonly UnidadMedida[] = ['UND', 'KG'];

/**
 * Clases de tercero aceptadas.
 */
const CLASES_TERCERO: readonly ClaseTercero[] = ['cliente', 'proveedor'];

/**
 * Catálogos aceptados.
 */
const TIPOS_CATALOGO: readonly TipoCatalogo[] = ['bodega', 'forma-pago'];

/**
 * Servicios que atienden los canales de maestros.
 */
export interface ServiciosMaestros {
  /** Datos del negocio. */
  negocio: ServicioNegocio;
  /** Productos. */
  productos: ServicioProductos;
  /** Clientes y proveedores. */
  terceros: ServicioTerceros;
  /** Bodegas y formas de pago. */
  catalogos: ServicioCatalogos;
}

/**
 * Lee y verifica los datos del negocio recibidos por IPC.
 *
 * @param valor - Dato recibido.
 * @returns Datos con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerDatosNegocio(valor: unknown): DatosNegocio {
  const d = exigirObjeto(valor);
  return {
    nombre: exigirTexto(d.nombre, 'nombre'),
    nit: exigirTexto(d.nit, 'NIT'),
    regimen: exigirTexto(d.regimen, 'régimen'),
    direccion: exigirTexto(d.direccion, 'dirección'),
    telefono: exigirTexto(d.telefono, 'teléfono'),
  };
}

/**
 * Lee y verifica los datos de un producto recibidos por IPC.
 *
 * @param valor - Dato recibido.
 * @returns Datos con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerDatosProducto(valor: unknown): DatosProducto {
  const d = exigirObjeto(valor);
  const precios = exigirObjeto(d.precios);
  return {
    nombre: exigirTexto(d.nombre, 'nombre'),
    proveedorCodigo: exigirEntero(d.proveedorCodigo, 'proveedor'),
    unidad: exigirOpcion(d.unidad, UNIDADES, 'unidad'),
    precios: {
      mayor: exigirEntero(precios.mayor, 'precio mayor'),
      menor: exigirEntero(precios.menor, 'precio menor'),
      minimo: exigirEntero(precios.minimo, 'precio mínimo'),
    },
  };
}

/**
 * Lee y verifica los datos de un cliente o proveedor recibidos por IPC.
 *
 * @param valor - Dato recibido.
 * @returns Datos con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerDatosTercero(valor: unknown): DatosTercero {
  const d = exigirObjeto(valor);
  return {
    tipoPersona: exigirOpcion(
      d.tipoPersona,
      TIPOS_PERSONA.map((t) => t.valor),
      'tipo de persona',
    ),
    nombre: exigirTexto(d.nombre, 'nombre'),
    tipoIdentificacion: exigirOpcion(
      d.tipoIdentificacion,
      TIPOS_IDENTIFICACION.map((t) => t.valor),
      'tipo de identificación',
    ),
    numeroIdentificacion: exigirTexto(d.numeroIdentificacion, 'número de identificación'),
    celular: exigirTexto(d.celular, 'celular'),
    direccion: exigirTexto(d.direccion, 'dirección'),
    barrio: exigirTexto(d.barrio, 'barrio'),
    ciudad: exigirTexto(d.ciudad, 'ciudad'),
    topeCredito: exigirEnteroONulo(d.topeCredito, 'tope de crédito'),
  };
}

/**
 * Lee y verifica los datos de un registro de catálogo recibidos por IPC.
 *
 * @param valor - Dato recibido.
 * @returns Datos con su tipo.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerDatosCatalogo(valor: unknown): DatosCatalogo {
  const d = exigirObjeto(valor);
  return {
    nombre: exigirTexto(d.nombre, 'nombre'),
    calculaCambio: exigirBooleano(d.calculaCambio, 'calcula cambio'),
  };
}

/**
 * Registra los canales IPC de datos del negocio y de los maestros.
 * Todos exigen sesión.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicios - Servicios de maestros.
 */
export function registrarIpcMaestros(
  registrar: RegistrarManejador,
  servicios: ServiciosMaestros,
): void {
  const { negocio, productos, terceros, catalogos } = servicios;

  registrar('negocio:obtener', () => negocio.obtener());
  registrar('negocio:guardar', (datos) => negocio.guardar(leerDatosNegocio(datos)));

  registrar('productos:listar', () => productos.listar());
  registrar('productos:obtener', (codigo) => productos.obtener(exigirEntero(codigo, 'código')));
  registrar('productos:siguienteCodigo', () => productos.siguienteCodigo());
  registrar('productos:crear', (peticion) => {
    const d = exigirObjeto(peticion);
    let stockInicial: StockInicialNuevo | null = null;
    if (d.stockInicial !== null) {
      const s = exigirObjeto(d.stockInicial);
      stockInicial = {
        bodegaId: exigirEntero(s.bodegaId, 'bodega'),
        cantidad: exigirEntero(s.cantidad, 'cantidad'),
      };
    }
    return productos.crear(
      {
        ...leerDatosProducto(d),
        codigo: exigirEnteroONulo(d.codigo, 'código'),
        costo: exigirEntero(d.costo, 'costo'),
      },
      stockInicial,
    );
  });
  registrar('productos:editar', (peticion) => {
    const d = exigirObjeto(peticion);
    return productos.editar(exigirEntero(d.codigo, 'código'), leerDatosProducto(d.datos));
  });
  registrar('productos:cambiarEstado', (peticion) => {
    const d = exigirObjeto(peticion);
    return productos.cambiarEstado(
      exigirEntero(d.id, 'código'),
      exigirBooleano(d.activo, 'activo'),
    );
  });
  registrar('productos:corregirCosto', (peticion) => {
    const d = exigirObjeto(peticion);
    return productos.corregirCosto(
      exigirEntero(d.codigo, 'código'),
      exigirEntero(d.costo, 'costo'),
      exigirTexto(d.motivo, 'motivo'),
    );
  });

  registrar('terceros:listar', (clase) =>
    terceros.listar(exigirOpcion(clase, CLASES_TERCERO, 'clase')),
  );
  registrar('terceros:siguienteCodigo', (clase) =>
    terceros.siguienteCodigo(exigirOpcion(clase, CLASES_TERCERO, 'clase')),
  );
  registrar('terceros:crear', (peticion) => {
    const d = exigirObjeto(peticion);
    const datos = exigirObjeto(d.datos);
    return terceros.crear(exigirOpcion(d.clase, CLASES_TERCERO, 'clase'), {
      ...leerDatosTercero(datos),
      codigo: exigirEnteroONulo(datos.codigo, 'código'),
    });
  });
  registrar('terceros:editar', (peticion) => {
    const d = exigirObjeto(peticion);
    return terceros.editar(
      exigirOpcion(d.clase, CLASES_TERCERO, 'clase'),
      exigirEntero(d.codigo, 'código'),
      leerDatosTercero(d.datos),
    );
  });
  registrar('terceros:cambiarEstado', (peticion) => {
    const d = exigirObjeto(peticion);
    return terceros.cambiarEstado(
      exigirOpcion(d.clase, CLASES_TERCERO, 'clase'),
      exigirEntero(d.id, 'código'),
      exigirBooleano(d.activo, 'activo'),
    );
  });

  registrar('catalogos:listar', (tipo) =>
    catalogos.listar(exigirOpcion(tipo, TIPOS_CATALOGO, 'catálogo')),
  );
  registrar('catalogos:crear', (peticion) => {
    const d = exigirObjeto(peticion);
    return catalogos.crear(
      exigirOpcion(d.tipo, TIPOS_CATALOGO, 'catálogo'),
      leerDatosCatalogo(d.datos),
    );
  });
  registrar('catalogos:editar', (peticion) => {
    const d = exigirObjeto(peticion);
    return catalogos.editar(
      exigirOpcion(d.tipo, TIPOS_CATALOGO, 'catálogo'),
      exigirEntero(d.id, 'id'),
      leerDatosCatalogo(d.datos),
    );
  });
  registrar('catalogos:cambiarEstado', (peticion) => {
    const d = exigirObjeto(peticion);
    return catalogos.cambiarEstado(
      exigirOpcion(d.tipo, TIPOS_CATALOGO, 'catálogo'),
      exigirEntero(d.id, 'id'),
      exigirBooleano(d.activo, 'activo'),
    );
  });
}
