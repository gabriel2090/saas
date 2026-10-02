import { useEffect, useState, type ReactNode } from 'react';
import { escalasBajoCosto, porcentajeGanancia } from '../../domain/ganancia';
import { LARGO_MAXIMO_NOMBRE } from '../../domain/maestros';
import { claveComparacion } from '../../domain/texto';
import { formatearCantidad, type UnidadMedida } from '../../shared/formato/cantidades';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import { formatearPorcentaje, SIN_PORCENTAJE } from '../../shared/formato/porcentaje';
import {
  ESCALAS_PRECIO,
  type DatosProducto,
  type EscalaPrecio,
  type ProductoDetalle,
  type ProductoResumen,
  type Tercero,
} from '../../shared/maestros';
import { fallo, type Resultado } from '../../shared/resultado';
import { Aviso } from '../componentes/Aviso';
import { BarraMaestro, resumenMaestro } from '../maestros/BarraMaestro';
import { DialogoCorregirCosto } from '../maestros/DialogoCorregirCosto';
import { enfocarPrimerCampo } from '../maestros/foco';
import { TablaMaestro, type ColumnaMaestro } from '../maestros/TablaMaestro';
import { useMaestro, type ConfiguracionMaestro } from '../maestros/useMaestro';
import { invocar } from '../servicios/api';

/**
 * Formulario de la ficha: los valores se guardan tal como se escriben.
 */
interface FormularioProducto {
  /** Código escrito (solo editable al crear). */
  codigo: string;
  /** Código propuesto por el consecutivo al crear (si no se cambia, se usa el consecutivo). */
  codigoPropuesto: string;
  /** Nombre. */
  nombre: string;
  /** Código del proveedor seleccionado (vacío si ninguno). */
  proveedorCodigo: string;
  /** Unidad de medida. */
  unidad: UnidadMedida;
  /** Costo escrito. */
  costo: string;
  /** Precio de cada escala escrito. */
  precios: Record<EscalaPrecio, string>;
}

/**
 * Nombre de cada escala en minúscula para los mensajes.
 */
const ESCALA_EN_TEXTO: Readonly<Record<EscalaPrecio, string>> = {
  mayor: 'mayor',
  menor: 'menor',
  minimo: 'mínimo',
};

/**
 * Columnas de la lista: solo el precio mayor; Menor y Mínimo aparecen si la
 * ventana se agranda (D-36).
 */
const COLUMNAS: readonly ColumnaMaestro<ProductoResumen>[] = [
  { titulo: 'Código', clase: 'num', valor: (p) => p.codigo },
  {
    titulo: 'Nombre',
    clase: 'col-nombre',
    valor: (p) => (
      <>
        {p.nombre}
        {!p.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
      </>
    ),
  },
  { titulo: 'Und', valor: (p) => p.unidad },
  { titulo: 'Costo', clase: 'num', valor: (p) => agruparMiles(p.costo) },
  { titulo: 'P. mayor', clase: 'num', valor: (p) => agruparMiles(p.precios.mayor) },
  { titulo: 'P. menor', clase: 'num', extra: true, valor: (p) => agruparMiles(p.precios.menor) },
  {
    titulo: 'P. mínimo',
    clase: 'num',
    extra: true,
    valor: (p) => agruparMiles(p.precios.minimo),
  },
  {
    titulo: 'Stock',
    clase: 'num',
    valor: (p) => formatearCantidad(p.stockTotal, p.unidad),
    claseCelda: (p) => (p.activo && p.stockTotal <= 0 ? 'texto-error' : ''),
  },
];

/**
 * Convierte un producto guardado en el formulario de la ficha.
 *
 * @param p - Producto.
 * @returns Formulario.
 */
function formularioDe(p: ProductoResumen): FormularioProducto {
  return {
    codigo: String(p.codigo),
    codigoPropuesto: '',
    nombre: p.nombre,
    proveedorCodigo: String(p.proveedorCodigo),
    unidad: p.unidad,
    costo: agruparMiles(p.costo),
    precios: {
      mayor: agruparMiles(p.precios.mayor),
      menor: agruparMiles(p.precios.menor),
      minimo: agruparMiles(p.precios.minimo),
    },
  };
}

/**
 * Lee los datos escritos en la ficha.
 *
 * @param f - Formulario.
 * @returns Datos listos para enviar o un error de validación local.
 */
function leerFormulario(f: FormularioProducto): Resultado<DatosProducto> {
  const proveedorCodigo = Number(f.proveedorCodigo);
  if (f.proveedorCodigo === '' || !Number.isSafeInteger(proveedorCodigo)) {
    return fallo('VALIDACION', 'Seleccione el proveedor del producto.');
  }
  const precios: Partial<Record<EscalaPrecio, number>> = {};
  for (const { valor: escala, etiqueta } of ESCALAS_PRECIO) {
    const pesos = leerPesos(f.precios[escala]);
    if (pesos === null) {
      return fallo(
        'VALIDACION',
        `El precio ${etiqueta.toLowerCase()} no es un valor válido en pesos (por ejemplo 13,200).`,
      );
    }
    precios[escala] = pesos;
  }
  return {
    ok: true,
    datos: {
      nombre: f.nombre,
      proveedorCodigo,
      unidad: f.unidad,
      precios: {
        mayor: precios.mayor ?? 0,
        menor: precios.menor ?? 0,
        minimo: precios.minimo ?? 0,
      },
    },
  };
}

/**
 * Configuración del maestro de productos.
 */
const CONFIGURACION: ConfiguracionMaestro<ProductoResumen, FormularioProducto> = {
  listar: () => invocar('productos:listar', undefined),
  clave: (p) => p.codigo,
  estaActivo: (p) => p.activo,
  nombre: (p) => `${p.codigo} - ${p.nombre}`,
  coincide: (p, texto) =>
    String(p.codigo).startsWith(texto) || claveComparacion(p.nombre).includes(texto),
  formularioDe,
  formularioNuevo: async () => {
    const siguiente = await invocar('productos:siguienteCodigo', undefined);
    const codigo = siguiente.ok ? String(siguiente.datos) : '';
    return {
      codigo,
      codigoPropuesto: codigo,
      nombre: '',
      proveedorCodigo: '',
      unidad: 'UND',
      costo: '',
      precios: { mayor: '', menor: '', minimo: '' },
    };
  },
  guardar: async (f, seleccionado) => {
    const datos = leerFormulario(f);
    if (!datos.ok) {
      return datos;
    }
    if (seleccionado) {
      return invocar('productos:editar', { codigo: seleccionado.codigo, datos: datos.datos });
    }
    const costo = leerPesos(f.costo);
    if (costo === null) {
      return fallo('VALIDACION', 'El costo no es un valor válido en pesos (por ejemplo 13,200).');
    }
    // Si no se cambió el código propuesto se pide el consecutivo, que se toma
    // dentro de la transacción (otro registro pudo crearse mientras tanto).
    const codigoEscrito = f.codigo.trim();
    let codigo: number | null = null;
    if (codigoEscrito !== f.codigoPropuesto) {
      codigo = Number(codigoEscrito);
      if (!/^\d+$/.test(codigoEscrito) || codigo <= 0) {
        return fallo('VALIDACION', 'El código debe ser un número entero mayor que cero.');
      }
    }
    return invocar('productos:crear', { ...datos.datos, codigo, costo });
  },
  cambiarEstado: (p, activo) => invocar('productos:cambiarEstado', { id: p.codigo, activo }),
};

/**
 * Ventana del maestro de productos (§5.1): lista con búsqueda y ficha con
 * las tres escalas de precio, % de ganancia, aviso de precio bajo el costo
 * (D-34), «Corregir costo…» (D-35) y stock por bodega.
 *
 * @returns La ventana.
 */
export function Productos(): ReactNode {
  const maestro = useMaestro(CONFIGURACION);
  const { formulario: f, seleccionado, esNuevo } = maestro;
  const [proveedores, setProveedores] = useState<Tercero[]>([]);
  const [detalleCargado, setDetalleCargado] = useState<ProductoDetalle | null>(null);
  const [corrigiendo, setCorrigiendo] = useState(false);
  const { ficha } = maestro;

  useEffect(() => {
    void invocar('terceros:listar', 'proveedor').then((r) => {
      if (r.ok) {
        setProveedores(r.datos);
      }
    });
  }, []);

  // Se vuelve a pedir cada vez que cambia el registro (también tras guardar o
  // inactivar), porque la lista no trae el stock por bodega.
  useEffect(() => {
    if (seleccionado === null) {
      return undefined;
    }
    let vigente = true;
    void invocar('productos:obtener', seleccionado.codigo).then((r) => {
      if (vigente && r.ok) {
        setDetalleCargado(r.datos);
      }
    });
    return () => {
      vigente = false;
    };
  }, [seleccionado]);

  const detalle =
    !esNuevo && detalleCargado?.codigo === seleccionado?.codigo ? detalleCargado : null;

  const costo = f ? (leerPesos(f.costo) ?? null) : null;
  const precios = f
    ? {
        mayor: leerPesos(f.precios.mayor),
        menor: leerPesos(f.precios.menor),
        minimo: leerPesos(f.precios.minimo),
      }
    : null;
  const bajoCosto =
    costo !== null &&
    precios &&
    precios.mayor !== null &&
    precios.menor !== null &&
    precios.minimo !== null
      ? escalasBajoCosto(costo, {
          mayor: precios.mayor,
          menor: precios.menor,
          minimo: precios.minimo,
        })
      : [];

  // El proveedor actual se lista aunque esté inactivo, para no perderlo al editar.
  const opcionesProveedor = proveedores.filter(
    (p) => p.activo || String(p.codigo) === f?.proveedorCodigo,
  );
  const unidadBloqueada = !esNuevo && (detalle?.tieneMovimientos ?? true);

  return (
    <>
      <BarraMaestro
        alNuevo={() => void maestro.nuevo()}
        alGuardar={() => void maestro.guardar()}
        alCambiarEstado={() => void maestro.alternarEstado()}
        puedeGuardar={!maestro.ocupado && f !== null && (maestro.conCambios || esNuevo)}
        activoSeleccionado={esNuevo || !seleccionado ? null : seleccionado.activo}
        busqueda={maestro.busqueda}
        alBuscar={maestro.buscar}
        ayudaBusqueda="Buscar por código o nombre…"
        mostrarInactivos={maestro.mostrarInactivos}
        alMostrarInactivos={maestro.alternarInactivos}
        resumen={resumenMaestro(maestro.total, maestro.inactivos, 'producto', 'productos')}
      />
      <div className="maestro">
        <div className="maestro__lista">
          <TablaMaestro
            columnas={COLUMNAS}
            registros={maestro.visibles}
            clave={(p) => p.codigo}
            estaActivo={(p) => p.activo}
            seleccionada={esNuevo ? null : (seleccionado?.codigo ?? null)}
            alSeleccionar={(c) => void maestro.seleccionar(c)}
            alMover={maestro.moverSeleccion}
            alAceptar={() => enfocarPrimerCampo(ficha.current)}
            textoVacio="No hay productos. Use «Nuevo» o el importador."
          />
        </div>

        <div className="ficha" ref={ficha}>
          {f === null ? (
            <p className="ficha__vacia">Seleccione un producto o cree uno nuevo.</p>
          ) : (
            <>
              <h2 className="ficha__encabezado">
                {esNuevo ? 'Producto nuevo' : `Producto ${f.codigo}`}
                {!esNuevo && seleccionado && (
                  <span
                    className={`etiqueta ${seleccionado.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}
                  >
                    {seleccionado.activo ? 'Activo' : 'Inactivo'}
                  </span>
                )}
              </h2>

              <div className="ficha__fila">
                <label className="campo campo--num">
                  <span>Código{esNuevo ? ' *' : ''}</span>
                  <input
                    value={f.codigo}
                    readOnly={!esNuevo}
                    inputMode="numeric"
                    title={esNuevo ? 'Propuesto por el consecutivo; se puede cambiar' : undefined}
                    onChange={(e) => maestro.cambiar({ codigo: e.target.value })}
                  />
                </label>
                <div className="campo">
                  <span>Unidad de medida</span>
                  <div
                    className="segmentado"
                    title={
                      unidadBloqueada
                        ? 'No se puede cambiar: el producto ya tiene movimientos de inventario'
                        : undefined
                    }
                  >
                    {(['UND', 'KG'] as const).map((u) => (
                      <button
                        key={u}
                        type="button"
                        aria-pressed={f.unidad === u}
                        disabled={unidadBloqueada}
                        onClick={() => maestro.cambiar({ unidad: u })}
                      >
                        {u}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <label className="campo">
                <span>Nombre *</span>
                <input
                  value={f.nombre}
                  maxLength={LARGO_MAXIMO_NOMBRE}
                  onChange={(e) => maestro.cambiar({ nombre: e.target.value })}
                />
              </label>

              <label className="campo">
                <span>Proveedor *</span>
                <select
                  value={f.proveedorCodigo}
                  onChange={(e) => maestro.cambiar({ proveedorCodigo: e.target.value })}
                >
                  <option value="">— Seleccione —</option>
                  {opcionesProveedor.map((p) => (
                    <option key={p.codigo} value={String(p.codigo)}>
                      {p.codigo} - {p.nombre}
                      {p.activo ? '' : ' (inactivo)'}
                    </option>
                  ))}
                </select>
              </label>

              <fieldset className="grupo">
                <legend>Costo y precios</legend>
                <table className="tabla tabla--precios">
                  <thead>
                    <tr>
                      <th />
                      <th className="num">Valor ($)</th>
                      <th className="num">% ganancia</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td>Costo{esNuevo ? ' *' : ''}</td>
                      <td>
                        <input
                          value={f.costo}
                          readOnly={!esNuevo}
                          inputMode="numeric"
                          title={
                            esNuevo
                              ? undefined
                              : 'Lo actualizan las facturas de proveedor; para corregirlo use «Corregir costo…»'
                          }
                          onChange={(e) => maestro.cambiar({ costo: e.target.value })}
                        />
                      </td>
                      <td className="num texto-tenue">{SIN_PORCENTAJE}</td>
                    </tr>
                    {ESCALAS_PRECIO.map(({ valor: escala, etiqueta }) => {
                      const precio = precios?.[escala] ?? null;
                      const alerta = bajoCosto.includes(escala);
                      const porcentaje =
                        costo !== null && precio !== null
                          ? porcentajeGanancia(costo, precio)
                          : null;
                      return (
                        <tr key={escala} className={alerta ? 'fila--alerta' : undefined}>
                          <td>{etiqueta} *</td>
                          <td>
                            <input
                              value={f.precios[escala]}
                              inputMode="numeric"
                              onChange={(e) =>
                                maestro.cambiar({
                                  precios: { ...f.precios, [escala]: e.target.value },
                                })
                              }
                            />
                          </td>
                          <td className={`num${alerta ? ' texto-alerta' : ''}`}>
                            {formatearPorcentaje(porcentaje)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </fieldset>

              {!esNuevo && (
                <div className="grupo__acciones">
                  <button
                    type="button"
                    className="boton"
                    disabled={detalle === null || maestro.conCambios}
                    title={
                      maestro.conCambios
                        ? 'Guarde o descarte los cambios de la ficha antes de corregir el costo'
                        : undefined
                    }
                    onClick={() => setCorrigiendo(true)}
                  >
                    Corregir costo…
                  </button>
                </div>
              )}

              {bajoCosto.length > 0 && costo !== null && (
                <Aviso tipo="alerta">{textoBajoCosto(bajoCosto, costo)}</Aviso>
              )}
              {maestro.aviso && <Aviso tipo={maestro.aviso.tipo}>{maestro.aviso.texto}</Aviso>}

              {!esNuevo && (
                <fieldset className="grupo">
                  <legend>Stock por bodega</legend>
                  <table className="tabla">
                    <tbody>
                      {detalle && detalle.stockPorBodega.length === 0 && (
                        <tr>
                          <td className="tabla__vacia">Sin movimientos de inventario.</td>
                        </tr>
                      )}
                      {detalle?.stockPorBodega.map((s) => (
                        <tr key={s.bodegaId}>
                          <td>{s.bodegaNombre}</td>
                          <td className="num">{formatearCantidad(s.cantidad, detalle.unidad)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </fieldset>
              )}
            </>
          )}
        </div>
      </div>

      {corrigiendo && detalle && (
        <DialogoCorregirCosto
          producto={detalle}
          alCancelar={() => setCorrigiendo(false)}
          alGuardar={(producto) => {
            setCorrigiendo(false);
            setDetalleCargado(producto);
            maestro.reemplazar(producto, { costo: agruparMiles(producto.costo) });
          }}
        />
      )}
    </>
  );
}

/**
 * Texto del aviso ámbar de precio bajo el costo (D-34).
 *
 * @param escalas - Escalas por debajo del costo.
 * @param costo - Costo del producto.
 * @returns Mensaje para el usuario.
 *
 * @example
 * textoBajoCosto(['minimo'], 13200);
 * // 'El precio mínimo está por debajo del costo ($ 13,200). Se puede guardar, pero…'
 */
function textoBajoCosto(escalas: readonly EscalaPrecio[], costo: number): string {
  const nombres = escalas.map((e) => ESCALA_EN_TEXTO[e]);
  const sujeto =
    nombres.length === 1
      ? `El precio ${nombres[0] ?? ''} está`
      : `Los precios ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''} están`;
  return `${sujeto} por debajo del costo (${formatearPesos(costo)}). Se puede guardar, pero al facturar no se podrá vender por debajo del costo.`;
}
