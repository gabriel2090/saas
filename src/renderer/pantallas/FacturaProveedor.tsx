import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { calcularVencimiento, PLAZO_MAXIMO_DIAS } from '../../domain/calendario';
import { LARGO_MAXIMO_NUMERO_DOCUMENTO, type LineaCompraCalculada } from '../../domain/compras';
import { claveComparacion } from '../../domain/texto';
import type { ContextoCompra, ResumenDeuda } from '../../shared/compras';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, leerFecha } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import { formatearPorcentaje } from '../../shared/formato/porcentaje';
import { ATAJOS } from '../../shared/keymap';
import type { ProductoResumen, RegistroCatalogo, Tercero } from '../../shared/maestros';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { Buscador } from '../documentos/Buscador';
import { Deuda } from '../documentos/Deuda';
import {
  calcularEnPantalla,
  compraTieneDatos,
  formularioCompraVacio,
  peticionCompra,
  type FormularioCompra,
  type LineaFormulario,
} from '../documentos/formularioCompra';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Nombre de cada escala en minúscula para los avisos.
 */
const ESCALA_EN_TEXTO = { mayor: 'mayor', menor: 'menor', minimo: 'mínimo' } as const;

/**
 * Atributo de las filas de línea: guarda su clave local para ubicar la fila
 * con el foco al quitarla con Supr.
 */
const ATRIBUTO_LINEA = 'data-linea';

/**
 * Texto de un proveedor en el buscador.
 *
 * @param p - Proveedor.
 * @returns `código - nombre`.
 */
const textoTercero = (p: Tercero): string => `${p.codigo} - ${p.nombre}`;

/**
 * Texto de un producto en el buscador.
 *
 * @param p - Producto.
 * @returns `código - nombre`.
 */
const textoProducto = (p: ProductoResumen): string => `${p.codigo} - ${p.nombre}`;

/**
 * Si un registro coincide con lo buscado por código (prefijo) o nombre.
 *
 * @param r - Registro con código y nombre.
 * @param r.codigo - Código.
 * @param r.nombre - Nombre.
 * @param busqueda - Lo escrito, ya normalizado.
 * @returns `true` si coincide.
 */
const coincideCodigoONombre = (r: { codigo: number; nombre: string }, busqueda: string): boolean =>
  String(r.codigo).startsWith(busqueda) || claveComparacion(r.nombre).includes(busqueda);

/**
 * Ubica la línea que contiene al elemento con el foco.
 *
 * @returns Clave local de la línea, o `null` si el foco no está en una línea.
 */
function lineaConFoco(): number | null {
  const fila = document.activeElement?.closest(`[${ATRIBUTO_LINEA}]`);
  const id = fila?.getAttribute(ATRIBUTO_LINEA);
  return id ? Number(id) : null;
}

/**
 * Ventana «Factura de proveedor» (§6): registra la compra, suma el stock en
 * el kardex, actualiza el costo de los productos con el flete y el
 * descuento repartidos y deja la deuda en cuentas por pagar. Av. Pág guarda.
 *
 * @returns La ventana.
 */
export function FacturaProveedor(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const [contexto, setContexto] = useState<ContextoCompra | null>(null);
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [proveedores, setProveedores] = useState<Tercero[]>([]);
  const [bodegas, setBodegas] = useState<RegistroCatalogo[]>([]);
  const [formasPago, setFormasPago] = useState<RegistroCatalogo[]>([]);
  const [f, setF] = useState<FormularioCompra | null>(null);
  // Deuda y stock se guardan con la clave a la que pertenecen: así una
  // respuesta que llega tarde (de otro proveedor o bodega) no se muestra.
  const [deudaCargada, setDeudaCargada] = useState<{
    proveedor: number;
    deuda: ResumenDeuda;
  } | null>(null);
  const [stockCargado, setStockCargado] = useState<{
    bodegaId: string;
    mapa: ReadonlyMap<number, number>;
  } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const enfocarLinea = useRef<number | null>(null);
  const siguienteId = useRef(1);
  const tabla = useRef<HTMLTableSectionElement>(null);
  const campoProducto = useRef<HTMLInputElement>(null);
  const campoProveedor = useRef<HTMLInputElement>(null);
  const cargado = f !== null;

  // La ventana abre mientras se cargan los datos: al terminar, el foco va al proveedor.
  useEffect(() => {
    if (cargado) campoProveedor.current?.focus();
  }, [cargado]);

  const cargarProductos = useCallback(async (): Promise<void> => {
    const r = await invocar('productos:listar', undefined);
    if (r.ok) setProductos(r.datos);
  }, []);

  const cargarContexto = useCallback(async (): Promise<ContextoCompra | null> => {
    const r = await invocar('compras:contexto', undefined);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setContexto(r.datos);
    return r.datos;
  }, []);

  useEffect(() => {
    void (async () => {
      const [ctx, prov, bod, fp] = await Promise.all([
        cargarContexto(),
        invocar('terceros:listar', 'proveedor'),
        invocar('catalogos:listar', 'bodega'),
        invocar('catalogos:listar', 'forma-pago'),
        cargarProductos(),
      ]);
      if (prov.ok) setProveedores(prov.datos);
      if (bod.ok) setBodegas(bod.datos);
      if (fp.ok) setFormasPago(fp.datos);
      const principal = bod.ok ? bod.datos.find((b) => b.esPrincipal) : undefined;
      if (ctx) setF(formularioCompraVacio(ctx.hoy, principal ? String(principal.id) : ''));
    })();
  }, [cargarContexto, cargarProductos]);

  const proveedorCodigo = f?.proveedor?.codigo ?? null;
  const bodegaId = f?.bodegaId ?? '';

  // Al elegir el proveedor: su deuda y el último plazo usado con él (D-67).
  useEffect(() => {
    if (proveedorCodigo === null) return undefined;
    let vigente = true;
    void invocar('compras:contextoProveedor', proveedorCodigo).then((r) => {
      if (!vigente || !r.ok) return;
      setDeudaCargada({ proveedor: proveedorCodigo, deuda: r.datos.deuda });
      setF((actual) => (actual ? { ...actual, plazo: String(r.datos.ultimoPlazo) } : actual));
    });
    return () => {
      vigente = false;
    };
  }, [proveedorCodigo]);

  const cargarStock = useCallback(async (id: string): Promise<void> => {
    if (id === '') return;
    const r = await invocar('compras:stockBodega', Number(id));
    if (r.ok) {
      setStockCargado({
        bodegaId: id,
        mapa: new Map(r.datos.map((s) => [s.productoCodigo, s.cantidad])),
      });
    }
  }, []);

  useEffect(() => {
    if (bodegaId === '') return undefined;
    let vigente = true;
    void invocar('compras:stockBodega', Number(bodegaId)).then((r) => {
      if (vigente && r.ok) {
        setStockCargado({
          bodegaId,
          mapa: new Map(r.datos.map((s) => [s.productoCodigo, s.cantidad])),
        });
      }
    });
    return () => {
      vigente = false;
    };
  }, [bodegaId]);

  useEffect(() => {
    marcarCambios(f !== null && compraTieneDatos(f));
  }, [f, marcarCambios]);

  // Tras agregar o quitar una línea, el foco va a la cantidad de la línea indicada.
  useEffect(() => {
    if (enfocarLinea.current === null) return;
    tabla.current
      ?.querySelector<HTMLInputElement>(`[${ATRIBUTO_LINEA}="${enfocarLinea.current}"] input`)
      ?.focus();
    enfocarLinea.current = null;
  });

  const cambiar = (cambios: Partial<FormularioCompra>): void => {
    setF((actual) => (actual ? { ...actual, ...cambios } : actual));
    setAviso(null);
  };

  const cambiarLinea = (id: number, cambios: Partial<LineaFormulario>): void => {
    setF((actual) =>
      actual
        ? { ...actual, lineas: actual.lineas.map((l) => (l.id === id ? { ...l, ...cambios } : l)) }
        : actual,
    );
    setAviso(null);
  };

  const agregarLinea = (producto: ProductoResumen): void => {
    const id = siguienteId.current++;
    setF((actual) =>
      actual
        ? {
            ...actual,
            lineas: [
              ...actual.lineas,
              // Se propone el costo actual del producto; casi siempre se corrige con la factura (D-75).
              { id, producto, cantidad: '', costo: agruparMiles(producto.costo) },
            ],
          }
        : actual,
    );
    enfocarLinea.current = id;
    setAviso(null);
  };

  const quitarLinea = (id: number | null): boolean => {
    if (id === null || !f) return false;
    const indice = f.lineas.findIndex((l) => l.id === id);
    const siguiente = f.lineas[indice + 1] ?? f.lineas[indice - 1];
    cambiar({ lineas: f.lineas.filter((l) => l.id !== id) });
    if (siguiente) {
      enfocarLinea.current = siguiente.id;
    } else {
      campoProducto.current?.focus();
    }
    return true;
  };

  const limpiar = async (): Promise<void> => {
    if (!f || !contexto) return;
    if (
      compraTieneDatos(f) &&
      !(await confirmar({
        titulo: 'Limpiar la factura',
        mensaje: 'Se borrará todo lo escrito en esta factura de proveedor. ¿Desea continuar?',
        textoAceptar: 'Limpiar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }))
    ) {
      return;
    }
    setF(formularioCompraVacio(contexto.hoy, f.bodegaId));
    setAviso(null);
  };

  const guardar = async (): Promise<void> => {
    if (!f || ocupado) return;
    const peticion = peticionCompra(f);
    if (!peticion.ok) {
      setAviso({ tipo: 'error', texto: peticion.error.mensaje });
      return;
    }
    setOcupado(true);
    const r = await invocar('compras:guardar', peticion.datos);
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    const { numero, total, abonoNumero } = r.datos;
    const ctx = await cargarContexto();
    setF(formularioCompraVacio(ctx?.hoy ?? contexto?.hoy ?? '', f.bodegaId));
    void cargarProductos();
    void cargarStock(f.bodegaId);
    setAviso({
      tipo: 'exito',
      texto:
        `Compra ${numero} guardada por ${formatearPesos(total)}.` +
        (abonoNumero === null ? '' : ` Se registró el abono ${abonoNumero} de contado.`),
    });
  };

  useAtajos(
    {
      guardarDocumento: () => void guardar(),
      quitarLinea: () => quitarLinea(lineaConFoco()),
      quitarLineaSiempre: () => quitarLinea(lineaConFoco()),
    },
    { activo: activa },
  );

  if (!f) {
    return (
      <div className="documento">
        {aviso ? (
          <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>
        ) : (
          <p className="texto-tenue">Cargando…</p>
        )}
      </div>
    );
  }

  const deuda = deudaCargada?.proveedor === proveedorCodigo ? deudaCargada.deuda : null;
  const stock =
    stockCargado?.bodegaId === f.bodegaId ? stockCargado.mapa : new Map<number, number>();
  const calculo = calcularEnPantalla(f);
  const fechaIso = leerFecha(f.fecha);
  const plazo = /^\d+$/.test(f.plazo.trim()) ? Number(f.plazo.trim()) : null;
  const vence =
    fechaIso !== null && plazo !== null && plazo <= PLAZO_MAXIMO_DIAS
      ? formatearFecha(calcularVencimiento(fechaIso, plazo))
      : '—';
  const proveedoresActivos = proveedores.filter((p) => p.activo);
  const productosActivos = productos.filter((p) => p.activo);
  const avisosLineas = f.lineas.flatMap((l, i) =>
    textosAvisoLinea(l, i, calculo.porLinea.get(l.id), proveedores),
  );

  return (
    <div className="documento documento--lineas">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={ocupado}
          onClick={() => void guardar()}
        >
          Guardar
          <span className="atajo">{textoCombinacion(ATAJOS.guardarDocumento.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={() => void limpiar()}>
          Limpiar
        </button>
        <span className="barra-herramientas__separador" />
        <span className="texto-tenue">
          Compra No. <strong>{contexto?.siguienteNumero ?? '…'}</strong> (se confirma al guardar)
        </span>
      </div>

      <div className="documento__encabezado">
        <label className="campo documento__proveedor">
          <span>Proveedor *</span>
          <Buscador
            registros={proveedoresActivos}
            clave={(p) => p.codigo}
            texto={textoTercero}
            coincide={coincideCodigoONombre}
            exacto={(p, escrito) => String(p.codigo) === escrito}
            seleccionado={f.proveedor}
            alElegir={(proveedor) => cambiar({ proveedor })}
            campo={campoProveedor}
            ayuda="Código o parte del nombre…"
            etiqueta="Proveedor"
          />
        </label>
        <Deuda deuda={deuda} />
        <label className="campo">
          <span>No. factura del proveedor *</span>
          <input
            value={f.numeroProveedor}
            maxLength={LARGO_MAXIMO_NUMERO_DOCUMENTO}
            onChange={(e) => cambiar({ numeroProveedor: e.target.value })}
          />
        </label>
        <label className="campo campo--num">
          <span>Fecha *</span>
          <input
            value={f.fecha}
            placeholder="dd/mm/aaaa"
            onChange={(e) => cambiar({ fecha: e.target.value })}
          />
        </label>
        <label className="campo campo--num">
          <span>Plazo (días)</span>
          <input
            value={f.plazo}
            inputMode="numeric"
            onChange={(e) => cambiar({ plazo: e.target.value })}
          />
        </label>
        <label className="campo campo--num">
          <span>Vence</span>
          <input value={vence} readOnly tabIndex={-1} />
        </label>
        <label className="campo">
          <span>Bodega</span>
          <select value={f.bodegaId} onChange={(e) => cambiar({ bodegaId: e.target.value })}>
            {bodegas
              .filter((b) => b.activo || String(b.id) === f.bodegaId)
              .map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.nombre}
                </option>
              ))}
          </select>
        </label>
        <label className="campo">
          <span>Orden de compra</span>
          <input
            value={f.ordenCompra}
            maxLength={LARGO_MAXIMO_NUMERO_DOCUMENTO}
            placeholder="Opcional"
            onChange={(e) => cambiar({ ordenCompra: e.target.value })}
          />
        </label>
      </div>

      <div className="tabla-contenedor documento__lineas">
        <table className="tabla tabla--precios">
          <thead>
            <tr>
              <th className="num">#</th>
              <th className="num">Código</th>
              <th>Producto</th>
              <th>Und</th>
              <th className="num" title="Stock actual en la bodega elegida">
                Stock
              </th>
              <th className="num">Cantidad</th>
              <th className="num">Costo unit.</th>
              <th className="num">Total</th>
              <th className="num" title="Parte del flete que le toca a la línea">
                Flete
              </th>
              <th
                className="num"
                title="Costo unitario con flete (y descuento si se reparte): así queda el costo del producto"
              >
                Costo nuevo
              </th>
              <th className="num">Costo anterior</th>
            </tr>
          </thead>
          <tbody ref={tabla}>
            {f.lineas.map((l, i) => (
              <FilaLinea
                key={l.id}
                numero={i + 1}
                linea={l}
                calculo={calculo.porLinea.get(l.id)}
                stock={stock.get(l.producto.codigo) ?? 0}
                alCambiar={(cambios) => cambiarLinea(l.id, cambios)}
                alQuitar={() => quitarLinea(l.id)}
              />
            ))}
            {f.lineas.length === 0 && (
              <tr>
                <td className="tabla__vacia" colSpan={11}>
                  Agregue los productos de la factura en el campo de abajo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Fuera de la tabla: dentro, la lista de sugerencias quedaría recortada por su desplazamiento. */}
      <div className="documento__agregar">
        <span>Línea {f.lineas.length + 1}</span>
        <Buscador
          registros={productosActivos}
          clave={(p) => p.codigo}
          texto={textoProducto}
          coincide={coincideCodigoONombre}
          exacto={(p, escrito) => String(p.codigo) === escrito}
          seleccionado={null}
          alElegir={agregarLinea}
          vaciarAlElegir
          haciaArriba
          campo={campoProducto}
          ayuda="Escriba el código y Enter, o parte del nombre para buscar…"
          etiqueta="Agregar producto"
        />
      </div>

      <div className="documento__pie">
        <div className="documento__avisos">
          {calculo.error && <Aviso tipo="error">{calculo.error}</Aviso>}
          {avisosLineas.map((texto) => (
            <Aviso key={texto} tipo="alerta">
              {texto}
            </Aviso>
          ))}
          {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
          <p className="campo__ayuda">
            {textoCombinacion(ATAJOS.quitarLinea.combinacion)} quita la línea seleccionada;{' '}
            {textoCombinacion(ATAJOS.quitarLineaSiempre.combinacion)} la quita aunque esté
            escribiendo en ella.
          </p>
        </div>

        <table className="totales">
          <tbody>
            <tr>
              <th>
                Subtotal ({f.lineas.length} {f.lineas.length === 1 ? 'línea' : 'líneas'})
              </th>
              <td className="num">{agruparMiles(calculo.compra?.subtotal ?? 0)}</td>
            </tr>
            <tr>
              <th>Flete a distribuir en costo</th>
              <td>
                <input
                  value={f.flete}
                  inputMode="numeric"
                  placeholder="0"
                  aria-label="Flete"
                  onChange={(e) => cambiar({ flete: e.target.value })}
                />
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="totales__casilla">
                <label className="casilla">
                  <input
                    type="checkbox"
                    checked={f.fleteProveedor}
                    onChange={(e) => cambiar({ fleteProveedor: e.target.checked })}
                  />{' '}
                  El flete lo cobra el proveedor (suma al total a pagar)
                </label>
              </td>
            </tr>
            <tr>
              <th>
                Descuento
                <span className="segmentado segmentado--mini">
                  {(['pesos', 'porcentaje'] as const).map((modo) => (
                    <button
                      key={modo}
                      type="button"
                      tabIndex={-1}
                      aria-pressed={f.descuentoModo === modo}
                      onClick={() => cambiar({ descuentoModo: modo, descuento: '' })}
                    >
                      {modo === 'pesos' ? '$' : '%'}
                    </button>
                  ))}
                </span>
              </th>
              <td>
                <input
                  value={f.descuento}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={f.descuentoModo === 'pesos' ? 'Descuento en pesos' : 'Descuento en %'}
                  onChange={(e) => cambiar({ descuento: e.target.value })}
                />
                {f.descuentoModo === 'porcentaje' && (
                  <span className="totales__detalle">
                    − {agruparMiles(calculo.compra?.descuento ?? 0)}
                  </span>
                )}
              </td>
            </tr>
            <tr>
              <td colSpan={2} className="totales__casilla">
                <label className="casilla">
                  <input
                    type="checkbox"
                    checked={f.descuentoEnCosto}
                    onChange={(e) => cambiar({ descuentoEnCosto: e.target.checked })}
                  />{' '}
                  Repartir el descuento en el costo de los productos
                </label>
              </td>
            </tr>
            <tr className="totales__total">
              <th>Total a pagar</th>
              <td className="num">{formatearPesos(calculo.compra?.total ?? 0)}</td>
            </tr>
            <tr>
              <td colSpan={2} className="totales__casilla">
                <div className="totales__contado">
                  <label className="casilla">
                    <input
                      type="checkbox"
                      checked={f.contado}
                      onChange={(e) => cambiar({ contado: e.target.checked })}
                    />{' '}
                    Pagada de contado
                  </label>
                  <select
                    value={f.formaPagoId}
                    disabled={!f.contado}
                    aria-label="Forma de pago del contado"
                    onChange={(e) => cambiar({ formaPagoId: e.target.value })}
                  >
                    <option value="">
                      {f.contado ? '— Forma de pago —' : '— Marque «Pagada de contado» —'}
                    </option>
                    {formasPago
                      .filter((fp) => fp.activo)
                      .map((fp) => (
                        <option key={fp.id} value={String(fp.id)}>
                          {fp.nombre}
                        </option>
                      ))}
                  </select>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Propiedades de {@link FilaLinea}.
 */
interface PropiedadesFilaLinea {
  /** Número de renglón. */
  numero: number;
  /** Línea escrita. */
  linea: LineaFormulario;
  /** Cálculo de la línea, o `undefined` si está a medio escribir. */
  calculo: LineaCompraCalculada | undefined;
  /** Stock del producto en la bodega elegida. */
  stock: number;
  /** Cambia cantidad o costo. */
  alCambiar: (cambios: Partial<LineaFormulario>) => void;
  /** Quita la línea. */
  alQuitar: () => void;
}

/**
 * Fila de una línea de compra con sus etiquetas de alerta: «revisar
 * precios» (D-64), variación del costo mayor al 25 % (D-65) y «otro
 * proveedor» (D-50). Un clic en la fila la selecciona para quitarla con Supr.
 *
 * @param props - Propiedades del componente.
 * @returns La fila.
 */
function FilaLinea({
  numero,
  linea,
  calculo,
  stock,
  alCambiar,
  alQuitar,
}: PropiedadesFilaLinea): ReactNode {
  const { producto } = linea;
  const revisarPrecios = (calculo?.escalasBajoCosto.length ?? 0) > 0;
  const alerta = revisarPrecios || calculo?.variacionAlta === true;
  const variacion = calculo?.variacion ?? null;
  return (
    <tr
      className={alerta ? 'fila--alerta' : undefined}
      tabIndex={-1}
      {...{ [ATRIBUTO_LINEA]: String(linea.id) }}
    >
      <td className="num">{numero}</td>
      <td className="num">{producto.codigo}</td>
      <td>
        {producto.nombre}
        {revisarPrecios && <span className="etiqueta etiqueta--alerta">revisar precios</span>}
        {calculo?.variacionAlta && (
          <span className="etiqueta etiqueta--alerta">
            costo {variacion !== null && variacion > 0 ? '+' : ''}
            {formatearPorcentaje(variacion)}
          </span>
        )}
        {calculo?.otroProveedor && (
          <span className="etiqueta etiqueta--alerta">otro proveedor</span>
        )}
        <button
          type="button"
          className="linea__quitar"
          tabIndex={-1}
          title={`Quitar la línea (${textoCombinacion(ATAJOS.quitarLineaSiempre.combinacion)})`}
          onClick={alQuitar}
        >
          ×
        </button>
      </td>
      <td>{producto.unidad}</td>
      <td className={`num${stock <= 0 ? ' texto-error' : ' texto-tenue'}`}>
        {formatearCantidad(stock, producto.unidad)}
      </td>
      <td>
        <input
          value={linea.cantidad}
          inputMode={producto.unidad === 'KG' ? 'decimal' : 'numeric'}
          placeholder={producto.unidad === 'KG' ? '0.000' : '0'}
          aria-label={`Cantidad de la línea ${numero}`}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
        />
      </td>
      <td>
        <input
          value={linea.costo}
          inputMode="numeric"
          aria-label={`Costo unitario de la línea ${numero}`}
          onChange={(e) => alCambiar({ costo: e.target.value })}
        />
      </td>
      <td className="num">{calculo ? agruparMiles(calculo.total) : '—'}</td>
      <td className="num texto-tenue">{calculo ? agruparMiles(calculo.flete) : '—'}</td>
      <td className={`num${alerta ? ' texto-alerta' : ''}`}>
        {calculo ? agruparMiles(calculo.costoNuevo) : '—'}
      </td>
      <td className="num texto-tenue">{agruparMiles(producto.costo)}</td>
    </tr>
  );
}

/**
 * Avisos ámbar de una línea: precios por debajo del costo nuevo, variación
 * grande del costo y producto de otro proveedor.
 *
 * @param linea - Línea escrita.
 * @param indice - Posición de la línea.
 * @param calculo - Cálculo de la línea, si está completa.
 * @param proveedores - Proveedores (para nombrar al dueño del producto).
 * @returns Textos de los avisos.
 */
function textosAvisoLinea(
  linea: LineaFormulario,
  indice: number,
  calculo: LineaCompraCalculada | undefined,
  proveedores: readonly Tercero[],
): string[] {
  if (!calculo) return [];
  const { producto } = linea;
  const renglon = `Línea ${indice + 1} · ${producto.codigo} ${producto.nombre}`;
  const textos: string[] = [];
  if (calculo.escalasBajoCosto.length > 0) {
    const nombres = calculo.escalasBajoCosto.map((e) => ESCALA_EN_TEXTO[e]);
    const sujeto =
      nombres.length === 1
        ? `el precio ${nombres[0] ?? ''} queda`
        : `los precios ${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1) ?? ''} quedan`;
    textos.push(
      `${renglon}: con el costo nuevo (${formatearPesos(calculo.costoNuevo)}) ${sujeto} por debajo del costo. Los precios no cambian; revíselos en Productos.`,
    );
  }
  if (calculo.variacionAlta) {
    textos.push(
      `${renglon}: el costo pasa de ${formatearPesos(calculo.costoAnterior)} a ${formatearPesos(calculo.costoNuevo)} (${calculo.variacion !== null && calculo.variacion > 0 ? '+' : ''}${formatearPorcentaje(calculo.variacion)}). Revise la cantidad y el costo escritos.`,
    );
  }
  if (calculo.otroProveedor) {
    const dueno = proveedores.find((p) => p.codigo === producto.proveedorCodigo);
    textos.push(
      `${renglon} pertenece a ${dueno ? textoTercero(dueno) : producto.proveedorNombre}. Se puede comprar; el producto no cambia de proveedor.`,
    );
  }
  return textos;
}
