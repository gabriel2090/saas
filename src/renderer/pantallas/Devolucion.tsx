import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ErrorDeNegocio } from '../../domain/errores';
import {
  calcularDevolucion,
  devolverTodo,
  efectoAnularDevolucion,
  efectoDevolucion,
  LARGO_MAXIMO_MOTIVO_DEVOLUCION,
  puedeDevolver,
  type DevolucionCalculada,
  type LineaDevolvible,
  type LineaPedida,
} from '../../domain/devoluciones';
import type { EfectoCartera } from '../../domain/correcciones';
import type {
  CarteraDeFactura,
  DevolucionGuardada,
  DevolucionResumen,
  FacturaClienteParaCorregir,
  FacturaProveedorParaCorregir,
  ProductoDeLinea,
  TipoDevolucion,
} from '../../shared/correcciones';
import { formatearCantidad, leerCantidad } from '../../shared/formato/cantidades';
import { formatearFecha, formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import { ATAJOS } from '../../shared/keymap';
import type { RegistroCatalogo } from '../../shared/maestros';
import type { CondicionPago } from '../../shared/ventas';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { DialogoGuardado } from '../documentos/DialogoGuardado';
import { DialogoMotivo } from '../documentos/DialogoMotivo';
import { usePedidoFactura } from '../documentos/pedidosVentana';
import {
  RecuadroCartera,
  TablaDevoluciones,
  textoCondicionCompra,
  textoCondicionVenta,
  textoMovimientoFavor,
  textoReintegro,
  textosInventario,
} from '../documentos/piezasCorreccion';
import { useCandado } from '../documentos/useCandado';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Línea de la factura en la ventana de devolución.
 */
interface LineaPantalla extends LineaDevolvible {
  /** Producto con su unidad. */
  producto: ProductoDeLinea;
}

/**
 * Factura (de cliente o de proveedor) con lo que necesita la devolución.
 */
interface FacturaDevolucion {
  /** Id interno. */
  id: number;
  /** Número (de venta o interno de la compra). */
  numero: number;
  /** Versión vigente. */
  version: number;
  /** Estado. */
  estado: 'activa' | 'anulada';
  /** Si es un saldo inicial importado (sin líneas). */
  saldoInicial: boolean;
  /** Condición (las compras van como crédito: siempre tienen cartera). */
  condicion: CondicionPago;
  /** Forma de pago del contado, o `null`. */
  formaPagoNombre: string | null;
  /** Texto del tercero para el encabezado. */
  tercero: string;
  /** Nombre del tercero para los avisos. */
  terceroNombre: string;
  /** Fecha para el encabezado. */
  fecha: string;
  /** Condición para el encabezado. */
  condicionTexto: string;
  /** Bodega de la factura. */
  bodegaId: number;
  /** Cartera. */
  cartera: CarteraDeFactura;
  /** Saldo a favor disponible del tercero. */
  saldoFavor: number;
  /** Devoluciones de la factura. */
  devoluciones: DevolucionResumen[];
  /** Lo ya devuelto por renglón. */
  yaDevuelto: Map<number, number>;
  /** Líneas vigentes. */
  lineas: LineaPantalla[];
}

/**
 * Adapta una factura de cliente a la ventana de devolución.
 *
 * @param f - Factura de cliente.
 * @returns La factura para devolver.
 */
function desdeVenta(f: FacturaClienteParaCorregir): FacturaDevolucion {
  return {
    id: f.id,
    numero: f.numero,
    version: f.version,
    estado: f.estado,
    saldoInicial: f.origen === 'saldo_inicial',
    condicion: f.condicion,
    formaPagoNombre: f.formaPagoNombre,
    tercero: `${f.tercero.codigo} - ${f.tercero.nombre} · ${f.tercero.identificacion}`,
    terceroNombre: f.tercero.nombre,
    fecha: formatearFechaHora(f.fecha),
    condicionTexto: textoCondicionVenta(f),
    bodegaId: f.bodegaId,
    cartera: f.cartera,
    saldoFavor: f.saldoFavor,
    devoluciones: f.devoluciones,
    yaDevuelto: new Map(f.yaDevuelto.map((d) => [d.renglon, d.cantidad])),
    lineas: f.lineas.map((l) => ({
      renglon: l.renglon,
      producto: l.producto,
      cantidad: l.cantidad,
      valorUnitario: l.precio,
      costoUnitario: l.costo,
    })),
  };
}

/**
 * Adapta una factura de proveedor a la ventana de devolución (D-131: se
 * devuelve al costo unitario facturado y sale del kardex al costo nuevo).
 *
 * @param c - Factura de proveedor.
 * @returns La factura para devolver.
 */
function desdeCompra(c: FacturaProveedorParaCorregir): FacturaDevolucion {
  return {
    id: c.id,
    numero: c.numero,
    version: c.version,
    estado: c.estado,
    saldoInicial: c.origen === 'saldo_inicial',
    condicion: 'credito',
    formaPagoNombre: null,
    tercero: `${c.tercero.codigo} - ${c.tercero.nombre} · ${c.numeroProveedor}`,
    terceroNombre: c.tercero.nombre,
    fecha: formatearFecha(c.fecha),
    condicionTexto: textoCondicionCompra(c),
    bodegaId: c.bodegaId,
    cartera: c.cartera,
    saldoFavor: c.saldoFavor,
    devoluciones: c.devoluciones,
    yaDevuelto: new Map(c.yaDevuelto.map((d) => [d.renglon, d.cantidad])),
    lineas: c.lineas.map((l) => ({
      renglon: l.renglon,
      producto: l.producto,
      cantidad: l.cantidad,
      valorUnitario: l.costoUnitario,
      costoUnitario: l.costoNuevo,
    })),
  };
}

/**
 * Textos que cambian entre la devolución de venta y la de compra.
 */
interface ConfiguracionDevolucion {
  /** Proceso de la ventana. */
  proceso: 'devolucion-venta' | 'devolucion-compra';
  /** «Devolución de venta» o «Devolución de compra». */
  titulo: string;
  /** Etiqueta del número de la factura. */
  campoNumero: string;
  /** «Cliente» o «Proveedor». */
  tercero: string;
  /** «Fecha de la factura» o «Fecha de la compra». */
  campoFecha: string;
  /** «Reingresa a» o «Sale de». */
  campoBodega: string;
  /** «Abonado» o «Pagado». */
  pagado: string;
  /** «Vendido» o «Comprado». */
  columnaCantidad: string;
  /** «Precio vendido» o «Costo unitario». */
  columnaValor: string;
  /** «A favor del cliente» o «A favor con el proveedor». */
  aFavor: string;
  /** «factura» o «compra». */
  documento: string;
}

/**
 * Configuración de cada tipo de devolución.
 */
const CONFIGURACION: Readonly<Record<TipoDevolucion, ConfiguracionDevolucion>> = {
  venta: {
    proceso: 'devolucion-venta',
    titulo: 'Devolución de venta',
    campoNumero: 'Factura No.',
    tercero: 'Cliente',
    campoFecha: 'Fecha de la factura',
    campoBodega: 'Reingresa a',
    pagado: 'Abonado',
    columnaCantidad: 'Vendido',
    columnaValor: 'Precio vendido',
    aFavor: 'A favor del cliente',
    documento: 'factura',
  },
  compra: {
    proceso: 'devolucion-compra',
    titulo: 'Devolución de compra',
    campoNumero: 'Compra No.',
    tercero: 'Proveedor',
    campoFecha: 'Fecha de la compra',
    campoBodega: 'Sale de',
    pagado: 'Pagado',
    columnaCantidad: 'Comprado',
    columnaValor: 'Costo unitario',
    aFavor: 'A favor con el proveedor',
    documento: 'compra',
  },
};

/**
 * Por qué no se le puede hacer una devolución a la factura, o `null`.
 *
 * @param f - Factura.
 * @param config - Textos del tipo.
 * @returns Razón y qué hacer.
 */
function razonSinDevolucion(f: FacturaDevolucion, config: ConfiguracionDevolucion): string | null {
  const nombre = `La ${config.documento} ${f.numero}`;
  if (f.estado === 'anulada') {
    return `${nombre} está anulada: no se le hacen devoluciones (al anularla ya volvió todo).`;
  }
  if (f.saldoInicial) {
    return `${nombre} es un saldo inicial importado: no tiene productos que devolver. Si el saldo está mal, anúlela en Corrección de factura.`;
  }
  if (f.lineas.every((l) => puedeDevolver(l, f.yaDevuelto) === 0)) {
    return `${nombre} ya se devolvió completa. Si una devolución está mal, anúlela en la lista de abajo.`;
  }
  return null;
}

/**
 * Resultado de leer lo escrito en «Devolver».
 */
interface LecturaDevolucion {
  /** Cantidades pedidas. */
  pedidas: LineaPedida[];
  /** Devolución calculada, o `null` si no hay nada escrito o hay un error. */
  calculo: DevolucionCalculada | null;
  /** Efecto en la cartera o en la caja, o `null`. */
  efecto: EfectoCartera | null;
  /** Primer error, o `null`. */
  error: string | null;
}

/**
 * Lee las cantidades escritas y calcula la devolución con la misma regla del
 * proceso principal (§9.2, D-131).
 *
 * @param tipo - Venta o compra.
 * @param f - Factura.
 * @param escrito - Cantidad escrita por renglón.
 * @returns Lo pedido, el cálculo, el efecto y el error.
 */
function leerDevolucion(
  tipo: TipoDevolucion,
  f: FacturaDevolucion,
  escrito: Readonly<Record<number, string>>,
): LecturaDevolucion {
  const pedidas: LineaPedida[] = [];
  for (const l of f.lineas) {
    const texto = (escrito[l.renglon] ?? '').trim();
    if (texto === '' || texto === '0') continue;
    const cantidad = leerCantidad(texto, l.producto.unidad);
    if (cantidad === null) {
      return {
        pedidas: [],
        calculo: null,
        efecto: null,
        error:
          l.producto.unidad === 'UND'
            ? `Línea ${l.renglon} (${l.producto.codigo} - ${l.producto.nombre}): la cantidad debe ser un número entero de unidades.`
            : `Línea ${l.renglon} (${l.producto.codigo} - ${l.producto.nombre}): la cantidad no es válida; use hasta tres decimales con punto (2.5).`,
      };
    }
    pedidas.push({ renglon: l.renglon, cantidad });
  }
  if (pedidas.length === 0) return { pedidas, calculo: null, efecto: null, error: null };
  try {
    const calculo = calcularDevolucion({
      tipo,
      lineas: f.lineas,
      yaDevuelto: f.yaDevuelto,
      pedidas,
    });
    const efecto = efectoDevolucion(calculo.total, f.condicion, f.cartera.total, {
      aplicado: f.cartera.aplicado,
      devuelto: f.cartera.devuelto,
      trasladado: f.cartera.trasladado,
      disponible: f.saldoFavor,
    });
    return { pedidas, calculo, efecto, error: null };
  } catch (error) {
    if (error instanceof ErrorDeNegocio) {
      return { pedidas, calculo: null, efecto: null, error: error.message };
    }
    throw error;
  }
}

/**
 * Datos del diálogo «Devolución N guardada».
 */
interface DatosGuardada {
  /** Respuesta del proceso principal. */
  respuesta: DevolucionGuardada;
  /** Frases de inventario. */
  inventario: string[];
  /** Bodega de la devolución. */
  bodega: string;
}

/**
 * Propiedades de {@link PantallaDevolucion}.
 */
interface PropiedadesPantallaDevolucion {
  /** Venta o compra. */
  tipo: TipoDevolucion;
}

/**
 * Ventana de devolución (§9.2), igual para ventas y compras: se escribe el
 * número de la factura, se indica cuánto se devuelve de cada línea (sin
 * pasar de lo que queda por devolver) y Av. Pág guarda. Abajo se listan las
 * devoluciones de la factura con «Anular…».
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
function PantallaDevolucion({ tipo }: PropiedadesPantallaDevolucion): ReactNode {
  const config = CONFIGURACION[tipo];
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const conCandado = useCandado();
  const [siguienteNumero, setSiguienteNumero] = useState<number | null>(null);
  const [bodegas, setBodegas] = useState<RegistroCatalogo[]>([]);
  const [numero, setNumero] = useState('');
  const [factura, setFactura] = useState<FacturaDevolucion | null>(null);
  const [bodegaId, setBodegaId] = useState('');
  const [escrito, setEscrito] = useState<Record<number, string>>({});
  const [motivo, setMotivo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [guardada, setGuardada] = useState<DatosGuardada | null>(null);
  const [anulando, setAnulando] = useState<DevolucionResumen | null>(null);
  const campoNumero = useRef<HTMLInputElement>(null);
  const tabla = useRef<HTMLTableSectionElement>(null);

  const cargarContexto = useCallback(async (): Promise<void> => {
    const r = await invocar('devoluciones:contexto', tipo);
    if (r.ok) setSiguienteNumero(r.datos.siguienteNumero);
  }, [tipo]);

  useEffect(() => {
    campoNumero.current?.focus();
    void (async () => {
      const [bod] = await Promise.all([invocar('catalogos:listar', 'bodega'), cargarContexto()]);
      if (bod.ok) setBodegas(bod.datos);
    })();
  }, [cargarContexto]);

  const lectura = factura ? leerDevolucion(tipo, factura, escrito) : null;
  const conCambios = (lectura?.pedidas.length ?? 0) > 0 || motivo.trim() !== '';

  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  const cargar = async (texto: string): Promise<FacturaDevolucion | null> => {
    const limpio = texto.trim();
    if (limpio === '' || (tipo === 'venta' && !/^\d+$/.test(limpio))) {
      setAviso({
        tipo: 'error',
        texto:
          tipo === 'venta'
            ? 'Escriba el número de la factura (solo dígitos) y pulse Enter.'
            : 'Escriba la «Compra No.» o el número de la factura del proveedor y pulse Enter.',
      });
      return null;
    }
    const r =
      tipo === 'venta'
        ? await invocar('correcciones:buscarVenta', Number(limpio)).then((x) =>
            x.ok ? { ok: true as const, datos: desdeVenta(x.datos) } : x,
          )
        : await invocar('correcciones:buscarCompra', limpio).then((x) =>
            x.ok ? { ok: true as const, datos: desdeCompra(x.datos) } : x,
          );
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return null;
    }
    setFactura(r.datos);
    setNumero(String(r.datos.numero));
    setBodegaId(String(r.datos.bodegaId));
    setEscrito({});
    setMotivo('');
    window.setTimeout(
      () => tabla.current?.querySelector<HTMLInputElement>('input:not(:disabled)')?.focus(),
      0,
    );
    return r.datos;
  };

  const descartar = async (): Promise<boolean> =>
    !conCambios ||
    confirmar({
      titulo: 'Descartar la devolución',
      mensaje: 'Se borrarán las cantidades y el motivo escritos. ¿Desea continuar?',
      textoAceptar: 'Descartar',
      textoCancelar: 'Cancelar',
      peligroso: true,
    });

  const buscar = async (texto: string): Promise<void> => {
    if (!(await descartar())) return;
    setAviso(null);
    await cargar(texto);
  };

  usePedidoFactura(config.proceso, (texto) => void buscar(texto));

  const limpiar = async (): Promise<void> => {
    if (!(await descartar())) return;
    setEscrito({});
    setMotivo('');
    setAviso(null);
  };

  const todo = (): void => {
    if (!factura) {
      setAviso({ tipo: 'error', texto: `Escriba primero el número de la ${config.documento}.` });
      return;
    }
    const razon = razonSinDevolucion(factura, config);
    if (razon) {
      setAviso({ tipo: 'error', texto: razon });
      return;
    }
    setEscrito(
      Object.fromEntries(
        devolverTodo(factura.lineas, factura.yaDevuelto).map((p) => {
          const l = factura.lineas.find((x) => x.renglon === p.renglon);
          return [p.renglon, l ? formatearCantidad(p.cantidad, l.producto.unidad) : ''];
        }),
      ),
    );
    setAviso(null);
  };

  const nombreBodega = (id: string): string =>
    bodegas.find((b) => String(b.id) === id)?.nombre ?? '';

  const guardar = async (): Promise<void> => {
    if (!factura || !lectura) {
      setAviso({ tipo: 'error', texto: `Escriba primero el número de la ${config.documento}.` });
      return;
    }
    const razon = razonSinDevolucion(factura, config);
    if (razon) {
      setAviso({ tipo: 'error', texto: razon });
      return;
    }
    if (lectura.error) {
      setAviso({ tipo: 'error', texto: lectura.error });
      return;
    }
    if (!lectura.calculo) {
      setAviso({
        tipo: 'error',
        texto: 'Escriba la cantidad a devolver en al menos una línea (o pulse «Devolver todo»).',
      });
      return;
    }
    if (bodegaId === '') {
      setAviso({ tipo: 'error', texto: `Elija la bodega en «${config.campoBodega}».` });
      return;
    }
    const bodega = nombreBodega(bodegaId);
    const inventario = textosInventario(
      lectura.calculo.movimientos,
      new Map(factura.lineas.map((l) => [l.producto.codigo, l.producto])),
      bodega,
    );
    setOcupado(true);
    const r = await invocar('devoluciones:guardar', {
      tipo,
      facturaId: factura.id,
      version: factura.version,
      devolucionesConocidas: factura.devoluciones.length,
      bodegaId: Number(bodegaId),
      lineas: lectura.pedidas,
      motivo,
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    setGuardada({ respuesta: r.datos, inventario, bodega });
    setAviso(null);
  };

  const cerrarGuardada = (): void => {
    setGuardada(null);
    void cargarContexto();
    if (factura) void cargar(String(factura.numero));
  };

  const anular = async (motivoAnulacion: string): Promise<string | null> => {
    if (!anulando || !factura) return null;
    const r = await invocar('devoluciones:anular', { id: anulando.id, motivo: motivoAnulacion });
    if (!r.ok) return r.error.mensaje;
    setAnulando(null);
    await cargar(String(factura.numero));
    const partes = [
      `Devolución ${r.datos.numero} anulada. El saldo de la ${config.documento} quedó en ${formatearPesos(r.datos.saldo)}.`,
      textoMovimientoFavor(r.datos.movimientoFavor, factura.terceroNombre),
      r.datos.reintegro ? textoReintegro(r.datos.reintegro) : null,
    ];
    setAviso({ tipo: 'exito', texto: partes.filter((p) => p !== null).join(' ') });
    return null;
  };

  const hayDialogo = guardada !== null || anulando !== null;
  useAtajos(
    { guardarDocumento: () => void conCandado(guardar) },
    { activo: activa && !hayDialogo },
  );

  const razon = factura ? razonSinDevolucion(factura, config) : null;
  const calculo = lectura?.calculo ?? null;
  const efecto = lectura?.efecto ?? null;
  const porRenglon = new Map(calculo?.lineas.map((l) => [l.facturaRenglon, l]) ?? []);

  return (
    <div className="documento documento--lineas">
      <div className="barra-herramientas">
        <label className="correccion__numero">
          {config.campoNumero}
          <input
            ref={campoNumero}
            value={numero}
            inputMode={tipo === 'venta' ? 'numeric' : undefined}
            aria-label={config.campoNumero}
            onChange={(e) => setNumero(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void buscar(numero);
              }
            }}
          />
        </label>
        <span className="barra-herramientas__separador" />
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={ocupado}
          onClick={() => void conCandado(guardar)}
        >
          Guardar devolución
          <span className="atajo">{textoCombinacion(ATAJOS.guardarDocumento.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={todo}>
          Devolver todo
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={() => void limpiar()}>
          Limpiar
        </button>
        <span className="correccion__version texto-tenue">
          {config.titulo} No. <strong>{siguienteNumero ?? '…'}</strong> (se confirma al guardar)
        </span>
      </div>

      {factura && (
        <div className="correccion__encabezado">
          <label className="campo">
            <span>{config.tercero}</span>
            <input readOnly tabIndex={-1} value={factura.tercero} />
          </label>
          <label className="campo">
            <span>{config.campoFecha}</span>
            <input readOnly tabIndex={-1} value={factura.fecha} />
          </label>
          <label className="campo campo--ancho">
            <span>Condición</span>
            <input readOnly tabIndex={-1} value={factura.condicionTexto} />
          </label>
          <label className="campo">
            <span>{config.campoBodega}</span>
            <select value={bodegaId} onChange={(e) => setBodegaId(e.target.value)}>
              {bodegas
                .filter((b) => b.activo || String(b.id) === bodegaId)
                .map((b) => (
                  <option key={b.id} value={String(b.id)}>
                    {b.nombre}
                  </option>
                ))}
            </select>
          </label>
          <RecuadroCartera cartera={factura.cartera} textoPagado={config.pagado} conDevuelto />
        </div>
      )}

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {razon && <Aviso tipo="alerta">{razon}</Aviso>}

      {!factura && (
        <p className="correccion__nota">
          {tipo === 'venta'
            ? 'Escriba el número de la factura y pulse Enter.'
            : 'Escriba la «Compra No.» o el número de la factura del proveedor y pulse Enter.'}{' '}
          Indique cuánto se devuelve de cada línea y guarde con{' '}
          {textoCombinacion(ATAJOS.guardarDocumento.combinacion)}. Las devoluciones de la{' '}
          {config.documento} aparecen abajo y se pueden anular.
        </p>
      )}

      {factura && (
        <>
          <div className="tabla-contenedor documento__lineas">
            <table className="tabla tabla--precios">
              <thead>
                <tr>
                  <th className="num">#</th>
                  <th className="num">Código</th>
                  <th>Producto</th>
                  <th>Und</th>
                  <th className="num">{config.columnaCantidad}</th>
                  <th className="num">Ya devuelto</th>
                  <th className="num">Puede devolver</th>
                  <th className="num">Devolver</th>
                  <th className="num">{config.columnaValor}</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody ref={tabla}>
                {factura.lineas.map((l) => {
                  const ya = factura.yaDevuelto.get(l.renglon) ?? 0;
                  const puede = puedeDevolver(l, factura.yaDevuelto);
                  const activas = factura.devoluciones.filter((d) => d.estado === 'activa');
                  const total = porRenglon.get(l.renglon)?.total ?? 0;
                  return (
                    <tr key={l.renglon}>
                      <td className="num">{l.renglon}</td>
                      <td className="num">{l.producto.codigo}</td>
                      <td>{l.producto.nombre}</td>
                      <td>{l.producto.unidad}</td>
                      <td className="num">{formatearCantidad(l.cantidad, l.producto.unidad)}</td>
                      <td className="num">
                        {formatearCantidad(ya, l.producto.unidad)}
                        {/* Sin el detalle por línea, el número solo es seguro si hay una sola devolución activa. */}
                        {ya > 0 && activas.length === 1 && (
                          <span className="texto-tenue"> (dev. {activas[0]?.numero})</span>
                        )}
                      </td>
                      <td className="num">{formatearCantidad(puede, l.producto.unidad)}</td>
                      <td className="num">
                        <input
                          value={escrito[l.renglon] ?? ''}
                          placeholder="0"
                          disabled={razon !== null || puede === 0}
                          inputMode={l.producto.unidad === 'KG' ? 'decimal' : 'numeric'}
                          aria-label={`Devolver de la línea ${l.renglon}`}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            setEscrito({ ...escrito, [l.renglon]: e.target.value });
                            setAviso(null);
                          }}
                        />
                      </td>
                      <td className="num">{agruparMiles(l.valorUnitario)}</td>
                      <td className={`num${total === 0 ? ' texto-tenue' : ''}`}>
                        {agruparMiles(total)}
                      </td>
                    </tr>
                  );
                })}
                {factura.lineas.length === 0 && (
                  <tr>
                    <td className="tabla__vacia" colSpan={10}>
                      Saldo inicial importado: no tiene productos.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="documento__pie">
            <div className="documento__avisos">
              {lectura?.error && <Aviso tipo="error">{lectura.error}</Aviso>}
              {calculo && (
                <p className="nota-inventario">
                  Inventario al guardar:{' '}
                  {textosInventario(
                    calculo.movimientos,
                    new Map(factura.lineas.map((l) => [l.producto.codigo, l.producto])),
                    nombreBodega(bodegaId),
                  ).join('; ')}
                  {tipo === 'venta'
                    ? ', a su costo de la venta.'
                    : '. El costo del producto no cambia.'}
                </p>
              )}
              {calculo && efecto && (
                <AvisoEfectoDevolucion
                  config={config}
                  factura={factura}
                  total={calculo.total}
                  efecto={efecto}
                />
              )}
              {razon === null && (
                <label className="campo">
                  <span>Motivo (opcional)</span>
                  <input
                    value={motivo}
                    maxLength={LARGO_MAXIMO_MOTIVO_DEVOLUCION}
                    placeholder={
                      tipo === 'venta' ? 'Por ejemplo: cajas mojadas' : 'Por ejemplo: queso vencido'
                    }
                    onChange={(e) => setMotivo(e.target.value)}
                  />
                </label>
              )}
            </div>
            <table className="totales">
              <tbody>
                <tr>
                  <th>Líneas a devolver</th>
                  <td className="num">{calculo?.lineas.length ?? 0}</td>
                </tr>
                <tr className="totales__total">
                  <th>Total devolución</th>
                  <td className="num">{formatearPesos(calculo?.total ?? 0)}</td>
                </tr>
                {efecto?.tipo === 'contado' || (factura.condicion === 'contado' && !efecto) ? (
                  <tr className="totales__favor">
                    <th>Se le devuelve al cliente</th>
                    <td className="num">
                      {agruparMiles(efecto?.tipo === 'contado' ? efecto.devolver : 0)}
                    </td>
                  </tr>
                ) : (
                  <>
                    <tr>
                      <th>Saldo de la {config.documento} antes</th>
                      <td className="num">{agruparMiles(factura.cartera.saldo)}</td>
                    </tr>
                    <tr>
                      <th>Saldo de la {config.documento} después</th>
                      <td className="num">
                        {agruparMiles(
                          efecto?.tipo === 'credito' ? efecto.saldo : factura.cartera.saldo,
                        )}
                      </td>
                    </tr>
                    <tr className="totales__favor">
                      <th>{config.aFavor}</th>
                      <td className="num">
                        {agruparMiles(
                          efecto?.tipo === 'credito' ? Math.max(0, efecto.movimientoFavor) : 0,
                        )}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          <fieldset className="grupo">
            <legend>Devoluciones de esta {config.documento}</legend>
            <TablaDevoluciones
              devoluciones={factura.devoluciones}
              documento={config.documento}
              alAnular={(d) => {
                setAviso(null);
                setAnulando(d);
              }}
            />
          </fieldset>
        </>
      )}

      {guardada && (
        <DialogoGuardado
          titulo={`${config.titulo} ${guardada.respuesta.numero} guardada`}
          alCerrar={cerrarGuardada}
        >
          <p className="dialogo__mensaje">
            Total devuelto: <strong>{formatearPesos(guardada.respuesta.total)}</strong>.
          </p>
          <ul className="dialogo__lista">
            {guardada.inventario.map((t) => (
              <li key={t}>{t.charAt(0).toUpperCase() + t.slice(1)}.</li>
            ))}
            {[
              guardada.respuesta.reintegro
                ? textoReintegro(guardada.respuesta.reintegro)
                : `El saldo de la ${config.documento} quedó en ${formatearPesos(guardada.respuesta.saldo)}.`,
              textoMovimientoFavor(
                guardada.respuesta.movimientoFavor,
                factura?.terceroNombre ?? '',
              ),
            ]
              .filter((t) => t !== null)
              .map((t) => (
                <li key={t}>{t}</li>
              ))}
          </ul>
        </DialogoGuardado>
      )}

      {anulando && factura && (
        <DialogoMotivo
          titulo={`¿Anular la devolución ${anulando.numero}?`}
          textoAceptar="Anular devolución"
          ejemploMotivo="se registró por error"
          alAceptar={anular}
          alCancelar={() => setAnulando(null)}
        >
          <ExplicacionAnularDevolucion
            tipo={tipo}
            config={config}
            factura={factura}
            devolucion={anulando}
          />
        </DialogoMotivo>
      )}
    </div>
  );
}

/**
 * Propiedades de {@link AvisoEfectoDevolucion}.
 */
interface PropiedadesAvisoEfectoDevolucion {
  /** Textos del tipo. */
  config: ConfiguracionDevolucion;
  /** Factura. */
  factura: FacturaDevolucion;
  /** Total de la devolución. */
  total: number;
  /** Efecto calculado. */
  efecto: EfectoCartera;
}

/**
 * Aviso verde con lo que pasa con el dinero de la devolución.
 *
 * @param props - Propiedades del componente.
 * @returns El aviso.
 */
function AvisoEfectoDevolucion({
  config,
  factura,
  total,
  efecto,
}: PropiedadesAvisoEfectoDevolucion): ReactNode {
  if (efecto.tipo === 'contado') {
    return (
      <Aviso tipo="exito">
        Es una venta de contado: al guardar se registra un reintegro y se le devuelven{' '}
        <strong>{formatearPesos(efecto.devolver)}</strong> al cliente en{' '}
        {factura.formaPagoNombre ?? 'la forma de pago de la venta'}.
      </Aviso>
    );
  }
  if (efecto.movimientoFavor > 0) {
    return (
      <Aviso tipo="exito">
        {factura.cartera.saldo === 0
          ? `La ${config.documento} ya estaba pagada: `
          : `La devolución (${formatearPesos(total)}) pasa del saldo (${formatearPesos(factura.cartera.saldo)}): `}
        <strong>{formatearPesos(efecto.movimientoFavor)}</strong> quedan{' '}
        {config.aFavor.toLowerCase()} ({factura.terceroNombre}). Se puede usar en un abono con la
        forma «Saldo a favor» o devolver en dinero.
      </Aviso>
    );
  }
  return (
    <Aviso tipo="exito">
      La devolución ({formatearPesos(total)}) se descuenta del saldo de la {config.documento}{' '}
      {factura.numero}: queda en <strong>{formatearPesos(efecto.saldo)}</strong>. Si pasara del
      saldo, el resto quedaría {config.aFavor.toLowerCase()}.
    </Aviso>
  );
}

/**
 * Propiedades de {@link ExplicacionAnularDevolucion}.
 */
interface PropiedadesExplicacionAnularDevolucion {
  /** Venta o compra. */
  tipo: TipoDevolucion;
  /** Textos del tipo. */
  config: ConfiguracionDevolucion;
  /** Factura de la devolución. */
  factura: FacturaDevolucion;
  /** Devolución a anular. */
  devolucion: DevolucionResumen;
}

/**
 * Explicación del diálogo de anulación de una devolución: el inventario se
 * revierte y la factura vuelve a deber lo devuelto (o se le cobra al
 * cliente, en contado).
 *
 * @param props - Propiedades del componente.
 * @returns El texto del diálogo.
 */
function ExplicacionAnularDevolucion({
  tipo,
  config,
  factura,
  devolucion,
}: PropiedadesExplicacionAnularDevolucion): ReactNode {
  const efecto = efectoAnularDevolucion(
    devolucion.total,
    factura.condicion,
    factura.cartera.total,
    {
      aplicado: factura.cartera.aplicado,
      devuelto: factura.cartera.devuelto,
      trasladado: factura.cartera.trasladado,
      disponible: factura.saldoFavor,
    },
  );
  return (
    <>
      <p className="dialogo__mensaje">
        La devolución {devolucion.numero} ({formatearPesos(devolucion.total)}) conserva su número y
        queda marcada como <strong>ANULADA</strong>; no se puede deshacer. Al anularla:
      </p>
      <ul className="dialogo__lista">
        <li>
          {tipo === 'venta'
            ? `Lo devuelto vuelve a salir de ${devolucion.bodegaNombre}.`
            : `Lo devuelto vuelve a entrar a ${devolucion.bodegaNombre}.`}
        </li>
        {efecto.tipo === 'contado' ? (
          <li>
            Es una venta de contado: se registra un reintegro y se le cobran{' '}
            {formatearPesos(efecto.cobrar)} al cliente.
          </li>
        ) : (
          <>
            {efecto.movimientoFavor < 0 && (
              <li>
                Se recuperan {formatearPesos(-efecto.movimientoFavor)} del saldo a favor de{' '}
                {factura.terceroNombre}.
              </li>
            )}
            <li>
              El saldo de la {config.documento} pasa de {formatearPesos(factura.cartera.saldo)} a{' '}
              <strong>{formatearPesos(efecto.saldo)}</strong>.
            </li>
          </>
        )}
      </ul>
    </>
  );
}

/**
 * Ventana «Devolución de venta» (§9.2): la mercancía reingresa a la bodega
 * y lo devuelto se descuenta del saldo de la factura (o se le devuelve el
 * dinero, en contado).
 *
 * @returns La ventana.
 */
export function DevolucionVenta(): ReactNode {
  return <PantallaDevolucion tipo="venta" />;
}

/**
 * Ventana «Devolución de compra» (§9.2): la mercancía sale de la bodega y
 * lo devuelto se descuenta de lo que se le debe al proveedor.
 *
 * @returns La ventana.
 */
export function DevolucionCompra(): ReactNode {
  return <PantallaDevolucion tipo="compra" />;
}
