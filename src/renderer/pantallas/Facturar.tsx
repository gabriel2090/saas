import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { calcularVencimiento } from '../../domain/calendario';
import { claveComparacion } from '../../domain/texto';
import {
  ESCALA_POR_DEFECTO,
  nombreEscala,
  PLAZO_CREDITO_PROPUESTO,
  razonesBloqueoCredito,
  siguienteEscala,
  type LineaVentaCalculada,
} from '../../domain/ventas';
import { formatearCantidad } from '../../shared/formato/cantidades';
import { aIsoLocal, formatearFecha, formatearHora } from '../../shared/formato/fechas';
import { pesosEnLetras } from '../../shared/formato/letras';
import { agruparMiles, formatearPesos } from '../../shared/formato/moneda';
import { ATAJOS, type IdAtajo } from '../../shared/keymap';
import {
  ESCALAS_PRECIO,
  type ProductoResumen,
  type RegistroCatalogo,
  type Tercero,
} from '../../shared/maestros';
import {
  CODIGO_CONSUMIDOR_FINAL,
  NUMERO_BORRADORES,
  type ContextoFacturar,
  type CreditoCliente,
} from '../../shared/ventas';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import { Buscador } from '../documentos/Buscador';
import {
  avisosStock,
  calcularVentaEnPantalla,
  cambioEnPantalla,
  formaPagoPropuesta,
  formularioVentaVacio,
  peticionVenta,
  restaurarBorrador,
  serializarBorrador,
  ventaTieneDatos,
  type FormularioVenta,
  type LineaVentaFormulario,
} from '../documentos/formularioVenta';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Espera tras el último cambio antes de autoguardar el borrador en disco.
 */
const ESPERA_AUTOGUARDADO_MS = 500;

/**
 * Atributo de las filas de línea: guarda su clave local.
 */
const ATRIBUTO_LINEA = 'data-linea';

/**
 * Atributo de los campos de una línea (`cantidad` o `precio`) para ubicarlos.
 */
const ATRIBUTO_CAMPO = 'data-campo';

/**
 * Atajo de cada borrador, en orden.
 */
const ATAJOS_BORRADORES: readonly IdAtajo[] = [
  'borrador1',
  'borrador2',
  'borrador3',
  'borrador4',
  'borrador5',
  'borrador6',
];

/**
 * Un borrador de la ventana (una pestaña).
 */
interface Pestana {
  /** Formulario. */
  f: FormularioVenta;
  /** Avisos al reabrirlo (precios cambiados, productos inactivos…, D-83). */
  avisos: string[];
  /** Fecha ISO del último autoguardado, o `null`. */
  guardadoEn: string | null;
}

/**
 * Datos con que se arma un borrador vacío.
 */
interface BaseBorrador {
  /** «Consumidor final». */
  consumidorFinal: Tercero | null;
  /** Bodega Principal. */
  bodegaId: string;
  /** Forma de pago propuesta. */
  formaPagoId: string;
}

/**
 * Campo de una línea que debe recibir el foco tras el próximo render.
 */
interface FocoPendiente {
  /** Línea. */
  linea: number;
  /** Campo. */
  campo: 'cantidad' | 'precio';
}

/**
 * Texto de un tercero en el buscador.
 *
 * @param c - Cliente.
 * @returns `código - nombre`.
 */
const textoCliente = (c: Tercero): string => `${c.codigo} - ${c.nombre}`;

/**
 * Texto de un producto en el buscador.
 *
 * @param p - Producto.
 * @returns `código - nombre`.
 */
const textoProducto = (p: ProductoResumen): string => `${p.codigo} - ${p.nombre}`;

/**
 * Si un cliente coincide con lo buscado por código (prefijo), nombre o
 * número de identificación.
 *
 * @param c - Cliente.
 * @param busqueda - Lo escrito, ya normalizado.
 * @returns `true` si coincide.
 */
const coincideCliente = (c: Tercero, busqueda: string): boolean =>
  String(c.codigo).startsWith(busqueda) ||
  claveComparacion(c.nombre).includes(busqueda) ||
  c.numeroIdentificacion.startsWith(busqueda);

/**
 * Si un producto coincide con lo buscado por código (prefijo) o nombre.
 *
 * @param p - Producto.
 * @param busqueda - Lo escrito, ya normalizado.
 * @returns `true` si coincide.
 */
const coincideProducto = (p: ProductoResumen, busqueda: string): boolean =>
  String(p.codigo).startsWith(busqueda) || claveComparacion(p.nombre).includes(busqueda);

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
 * Pestaña vacía.
 *
 * @param base - Datos del borrador vacío.
 * @returns La pestaña.
 */
function pestanaVacia(base: BaseBorrador): Pestana {
  return {
    f: formularioVentaVacio(base.consumidorFinal, base.bodegaId, base.formaPagoId),
    avisos: [],
    guardadoEn: null,
  };
}

/**
 * Ventana «Facturar» (§7): seis borradores simultáneos que se autoguardan
 * (D-89), flujo de teclado cliente → código → cantidad (D-82), F6 cambia la
 * escala (D-81), F7 altera el precio (D-87), crédito con bloqueo (S-03,
 * D-85) y contado con cambio (D-90). Av. Pág guarda e imprime la tirilla
 * (D-88).
 *
 * @returns La ventana.
 */
export function Facturar(): ReactNode {
  const { activa, marcarConservados } = useVentana();
  const confirmar = useConfirmar();
  const [contexto, setContexto] = useState<ContextoFacturar | null>(null);
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [clientes, setClientes] = useState<Tercero[]>([]);
  const [bodegas, setBodegas] = useState<RegistroCatalogo[]>([]);
  const [formasPago, setFormasPago] = useState<RegistroCatalogo[]>([]);
  const [base, setBase] = useState<BaseBorrador | null>(null);
  const [pestanas, setPestanas] = useState<Pestana[] | null>(null);
  const [actual, setActual] = useState(0);
  const [creditoCargado, setCreditoCargado] = useState<{
    cliente: number;
    credito: CreditoCliente;
  } | null>(null);
  const [stockCargado, setStockCargado] = useState<{
    bodegaId: string;
    mapa: ReadonlyMap<number, number>;
  } | null>(null);
  const [versionDatos, setVersionDatos] = useState(0);
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const siguienteId = useRef(1);
  const ultimoGuardado = useRef<(string | null)[]>(
    Array.from({ length: NUMERO_BORRADORES }, () => null),
  );
  const ranuraGuardando = useRef<number | null>(null);
  const plazoPorProponer = useRef<{ indice: number; cliente: number } | null>(null);
  const focoLinea = useRef<FocoPendiente | null>(null);
  const focoInicio = useRef(false);
  const pestanasRef = useRef<Pestana[] | null>(null);
  const campoCliente = useRef<HTMLInputElement>(null);
  const campoCodigo = useRef<HTMLInputElement>(null);
  const botonContado = useRef<HTMLButtonElement>(null);
  const tabla = useRef<HTMLTableSectionElement>(null);
  const pestana = pestanas?.[actual] ?? null;

  const cargarContexto = useCallback(async (): Promise<void> => {
    const r = await invocar('ventas:contexto', undefined);
    if (r.ok) setContexto(r.datos);
  }, []);

  const cargarProductos = useCallback(async (): Promise<void> => {
    const r = await invocar('productos:listar', undefined);
    if (r.ok) setProductos(r.datos);
  }, []);

  useEffect(() => {
    void (async () => {
      const [ctx, cli, bod, fp, prod, bor] = await Promise.all([
        invocar('ventas:contexto', undefined),
        invocar('terceros:listar', 'cliente'),
        invocar('catalogos:listar', 'bodega'),
        invocar('catalogos:listar', 'forma-pago'),
        invocar('productos:listar', undefined),
        invocar('ventas:borradores', undefined),
      ]);
      const fallido = [ctx, cli, bod, fp, prod, bor].find((r) => !r.ok);
      if (fallido && !fallido.ok) {
        setAviso({ tipo: 'error', texto: fallido.error.mensaje });
        return;
      }
      if (!ctx.ok || !cli.ok || !bod.ok || !fp.ok || !prod.ok || !bor.ok) return;
      const principal = bod.datos.find((b) => b.esPrincipal);
      const nuevaBase: BaseBorrador = {
        consumidorFinal: cli.datos.find((c) => c.codigo === CODIGO_CONSUMIDOR_FINAL) ?? null,
        bodegaId: principal ? String(principal.id) : '',
        formaPagoId: formaPagoPropuesta(fp.datos),
      };
      const guardados = new Map(bor.datos.map((b) => [b.ranura, b]));
      const lista = Array.from({ length: NUMERO_BORRADORES }, (_, i): Pestana => {
        const guardado = guardados.get(i + 1);
        if (!guardado) return pestanaVacia(nuevaBase);
        ultimoGuardado.current[i] = guardado.contenido;
        const vacia = pestanaVacia(nuevaBase);
        const restaurado = restaurarBorrador(
          guardado.contenido,
          { productos: prod.datos, clientes: cli.datos },
          () => siguienteId.current++,
          vacia.f,
        );
        if (!restaurado) {
          return { ...vacia, avisos: ['El borrador guardado no se pudo leer y se descartó.'] };
        }
        return {
          f: restaurado.formulario,
          avisos: restaurado.avisos,
          guardadoEn: guardado.actualizadoEn,
        };
      });
      setContexto(ctx.datos);
      setClientes(cli.datos);
      setBodegas(bod.datos);
      setFormasPago(fp.datos);
      setProductos(prod.datos);
      setBase(nuevaBase);
      setPestanas(lista);
      focoInicio.current = true;
    })();
  }, []);

  // Autoguardado (D-89): fuera del historial; se escribe solo lo que cambió.
  const persistir = useCallback((lista: readonly Pestana[]): void => {
    lista.forEach((p, i) => {
      if (ranuraGuardando.current === i) return;
      const contenido = ventaTieneDatos(p.f) ? serializarBorrador(p.f) : null;
      if (contenido === ultimoGuardado.current[i]) return;
      ultimoGuardado.current[i] = contenido;
      const ranura = i + 1;
      const solicitud =
        contenido === null
          ? invocar('ventas:borrarBorrador', ranura)
          : invocar('ventas:guardarBorrador', { ranura, contenido });
      void solicitud.then((r) => {
        if (!r.ok) {
          ultimoGuardado.current[i] = null;
          setAviso({
            tipo: 'error',
            texto: `No se pudo guardar el borrador ${ranura}: ${r.error.mensaje}`,
          });
          return;
        }
        const ahora = contenido === null ? null : aIsoLocal();
        setPestanas((ps) =>
          ps ? ps.map((x, j) => (j === i ? { ...x, guardadoEn: ahora } : x)) : ps,
        );
      });
    });
  }, []);

  useEffect(() => {
    pestanasRef.current = pestanas;
    if (!pestanas) return undefined;
    const temporizador = setTimeout(() => persistir(pestanas), ESPERA_AUTOGUARDADO_MS);
    return () => clearTimeout(temporizador);
  }, [pestanas, persistir]);

  // Al cerrar la ventana se escribe lo pendiente: los borradores se conservan.
  useEffect(() => {
    const persistirPendientes = (): void => {
      const lista = pestanasRef.current;
      if (lista) persistir(lista);
    };
    return persistirPendientes;
  }, [persistir]);

  const pendientes = pestanas?.filter((p) => ventaTieneDatos(p.f)).length ?? 0;
  useEffect(() => {
    marcarConservados(
      pendientes === 0
        ? null
        : {
            resumen:
              pendientes === 1 ? '1 borrador pendiente' : `${pendientes} borradores pendientes`,
            mensaje:
              pendientes === 1
                ? 'El borrador de Facturar se conserva y vuelve a aparecer al abrirla.'
                : `Los ${pendientes} borradores de Facturar se conservan y vuelven a aparecer al abrirla.`,
          },
    );
  }, [pendientes, marcarConservados]);

  const clienteCodigo = pestana?.f.cliente?.codigo ?? null;
  useEffect(() => {
    if (clienteCodigo === null || clienteCodigo === CODIGO_CONSUMIDOR_FINAL) return undefined;
    let vigente = true;
    void invocar('ventas:creditoCliente', clienteCodigo).then((r) => {
      if (!vigente || !r.ok) return;
      setCreditoCargado({ cliente: clienteCodigo, credito: r.datos });
      const propuesta = plazoPorProponer.current;
      if (propuesta?.cliente === clienteCodigo) {
        plazoPorProponer.current = null;
        const plazo = String(r.datos.ultimoPlazo ?? PLAZO_CREDITO_PROPUESTO);
        setPestanas((ps) =>
          ps ? ps.map((x, i) => (i === propuesta.indice ? { ...x, f: { ...x.f, plazo } } : x)) : ps,
        );
      }
    });
    return () => {
      vigente = false;
    };
  }, [clienteCodigo, versionDatos]);

  const bodegaId = pestana?.f.bodegaId ?? '';
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
  }, [bodegaId, versionDatos]);

  // Foco tras agregar una línea, F7 o cambiar de borrador.
  useEffect(() => {
    const pendiente = focoLinea.current;
    if (pendiente) {
      focoLinea.current = null;
      const campo = tabla.current?.querySelector<HTMLInputElement>(
        `[${ATRIBUTO_LINEA}="${pendiente.linea}"] [${ATRIBUTO_CAMPO}="${pendiente.campo}"]`,
      );
      campo?.focus();
      campo?.select();
    }
    if (focoInicio.current && pestana) {
      focoInicio.current = false;
      (ventaTieneDatos(pestana.f) ? campoCodigo : campoCliente).current?.focus();
    }
  });

  /**
   * Cambia el formulario del borrador visible.
   *
   * @param cambio - Función que recibe el formulario y devuelve el nuevo.
   */
  const cambiarF = (cambio: (f: FormularioVenta) => FormularioVenta): void => {
    const indice = actual;
    setPestanas((ps) =>
      ps ? ps.map((p, i) => (i === indice ? { ...p, f: cambio(p.f) } : p)) : ps,
    );
    setAviso(null);
  };

  const cambiar = (cambios: Partial<FormularioVenta>): void =>
    cambiarF((f) => ({ ...f, ...cambios }));

  const cambiarLinea = (
    id: number,
    cambio: (l: LineaVentaFormulario) => Partial<LineaVentaFormulario>,
  ): void =>
    cambiarF((f) => ({
      ...f,
      lineas: f.lineas.map((l) => (l.id === id ? { ...l, ...cambio(l) } : l)),
    }));

  const elegirCliente = (cliente: Tercero): void => {
    const consumidor = cliente.codigo === CODIGO_CONSUMIDOR_FINAL;
    cambiar({
      cliente,
      condicion: consumidor ? 'contado' : 'credito',
      ...(consumidor ? { plazo: '0' } : {}),
    });
    plazoPorProponer.current = consumidor ? null : { indice: actual, cliente: cliente.codigo };
    campoCodigo.current?.focus();
  };

  const agregarLinea = (producto: ProductoResumen): void => {
    const id = siguienteId.current++;
    cambiarF((f) => ({
      ...f,
      lineas: [
        ...f.lineas,
        { id, producto, escala: ESCALA_POR_DEFECTO, cantidad: '1', precio: null },
      ],
    }));
    focoLinea.current = { linea: id, campo: 'cantidad' };
  };

  const quitarLinea = (id: number | null): boolean => {
    if (id === null || !pestana) return false;
    const { lineas } = pestana.f;
    const indice = lineas.findIndex((l) => l.id === id);
    if (indice < 0) return false;
    const siguiente = lineas[indice + 1] ?? lineas[indice - 1];
    cambiar({ lineas: lineas.filter((l) => l.id !== id) });
    if (siguiente) {
      focoLinea.current = { linea: siguiente.id, campo: 'cantidad' };
    } else {
      campoCodigo.current?.focus();
    }
    return true;
  };

  /**
   * Línea sobre la que actúan F6 y F7: la del foco o, si no, la última (D-81).
   *
   * @returns La línea, o `undefined` si no hay.
   */
  const lineaObjetivo = (): LineaVentaFormulario | undefined => {
    const lineas = pestana?.f.lineas ?? [];
    const conFoco = lineaConFoco();
    return lineas.find((l) => l.id === conFoco) ?? lineas.at(-1);
  };

  const cambiarEscala = (): boolean => {
    const linea = lineaObjetivo();
    if (!linea) return false;
    cambiarLinea(linea.id, (l) => ({ escala: siguienteEscala(l.escala) }));
    return true;
  };

  const alterarPrecio = (): boolean => {
    const linea = lineaObjetivo();
    if (!linea) return false;
    const enSuPrecio =
      lineaConFoco() === linea.id &&
      document.activeElement?.getAttribute(ATRIBUTO_CAMPO) === 'precio';
    if (linea.precio !== null && enSuPrecio) {
      // F7 sobre el precio ya alterado lo devuelve al de la escala.
      cambiarLinea(linea.id, () => ({ precio: null }));
      focoLinea.current = { linea: linea.id, campo: 'cantidad' };
    } else {
      if (linea.precio === null) {
        cambiarLinea(linea.id, (l) => ({ precio: agruparMiles(l.producto.precios[l.escala]) }));
      }
      focoLinea.current = { linea: linea.id, campo: 'precio' };
    }
    return true;
  };

  const irABorrador = (indice: number): boolean => {
    if (!pestanas || indice < 0 || indice >= NUMERO_BORRADORES) return false;
    setActual(indice);
    setAviso(null);
    focoInicio.current = true;
    return true;
  };

  /**
   * Enter (D-82): desde la cantidad o el precio vuelve al código; desde el
   * cliente sin nada nuevo escrito pasa al código. Lo demás lo maneja el buscador.
   *
   * @returns `false` si no le corresponde.
   */
  const aceptar = (): boolean => {
    const elemento = document.activeElement;
    if (!(elemento instanceof HTMLInputElement) || !pestana) return false;
    const campo = elemento.getAttribute(ATRIBUTO_CAMPO);
    if (campo === 'cantidad' || campo === 'precio') {
      campoCodigo.current?.focus();
      return true;
    }
    const cliente = pestana.f.cliente;
    if (elemento === campoCliente.current && cliente && elemento.value === textoCliente(cliente)) {
      campoCodigo.current?.focus();
      return true;
    }
    return false;
  };

  const limpiar = async (): Promise<void> => {
    if (!pestana || !base) return;
    if (
      ventaTieneDatos(pestana.f) &&
      !(await confirmar({
        titulo: 'Limpiar borrador',
        mensaje: `Se borrará todo lo escrito en el borrador ${actual + 1}. ¿Desea continuar?`,
        textoAceptar: 'Limpiar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }))
    ) {
      return;
    }
    const indice = actual;
    setPestanas((ps) => (ps ? ps.map((p, i) => (i === indice ? pestanaVacia(base) : p)) : ps));
    setAviso(null);
    focoInicio.current = true;
  };

  /**
   * Imprime la factura en la tirilla; si falla o se cancela, ofrece
   * reintentar (D-88). La factura ya quedó guardada.
   *
   * @param id - Id de la factura.
   * @param numero - Número de la factura.
   */
  const imprimir = async (id: number, numero: number): Promise<void> => {
    for (;;) {
      const r = await invocar('impresion:imprimir', {
        tipo: 'factura-cliente',
        id,
        reimpresion: false,
      });
      if (r.ok && r.datos) return;
      const motivo = r.ok ? 'Se canceló la impresión.' : r.error.mensaje;
      const reintentar = await confirmar({
        titulo: 'Factura guardada sin imprimir',
        mensaje: `La factura ${numero} quedó guardada, pero no se imprimió. ${motivo}`,
        textoAceptar: 'Reintentar impresión',
        textoCancelar: 'Cerrar',
      });
      if (!reintentar) {
        setAviso({
          tipo: 'alerta',
          texto: `La factura ${numero} quedó guardada sin imprimir. La reimpresión llega con «Reimpresiones» (Fase 4).`,
        });
        return;
      }
    }
  };

  // Datos derivados del borrador visible (se usan en guardar y al pintar).
  const f = pestana?.f ?? null;
  const calculo = f ? calcularVentaEnPantalla(f) : null;
  const total = calculo?.total ?? 0;
  const credito =
    creditoCargado && creditoCargado.cliente === clienteCodigo ? creditoCargado.credito : null;
  const esConsumidor = clienteCodigo === CODIGO_CONSUMIDOR_FINAL;
  const razonesBloqueo =
    f?.condicion === 'credito' && f.cliente && contexto && (esConsumidor || credito)
      ? razonesBloqueoCredito({
          clienteCodigo: f.cliente.codigo,
          clienteNombre: f.cliente.nombre,
          tope: credito?.tope ?? null,
          deuda: credito?.deuda ?? { total: 0, vencido: 0 },
          vencidaMasAntigua: credito?.vencidaMasAntigua ?? null,
          total,
          hoy: contexto.hoy,
        })
      : [];
  const bloqueada = razonesBloqueo.length > 0;

  const guardar = async (): Promise<void> => {
    if (!f || ocupado || !base) return;
    if (bloqueada) {
      botonContado.current?.focus();
      return;
    }
    const peticion = peticionVenta(f, actual + 1, formasPago);
    if (!peticion.ok) {
      setAviso({ tipo: 'error', texto: peticion.error.mensaje });
      return;
    }
    const indice = actual;
    setOcupado(true);
    ranuraGuardando.current = indice;
    const r = await invocar('ventas:guardar', peticion.datos);
    if (!r.ok) {
      ranuraGuardando.current = null;
      setOcupado(false);
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    // El borrador se borró en la misma transacción de la factura.
    ultimoGuardado.current[indice] = null;
    setPestanas((ps) => (ps ? ps.map((p, i) => (i === indice ? pestanaVacia(base) : p)) : ps));
    ranuraGuardando.current = null;
    focoInicio.current = true;
    const { id, numero, cambio } = r.datos;
    setAviso({
      tipo: 'exito',
      texto:
        `Factura ${numero} guardada por ${formatearPesos(r.datos.total)}.` +
        (cambio ? ` Cambio: ${formatearPesos(cambio)}.` : ''),
    });
    void cargarContexto();
    void cargarProductos();
    setVersionDatos((v) => v + 1);
    await imprimir(id, numero);
    setOcupado(false);
  };

  useAtajos(
    {
      guardarFactura: () => void guardar(),
      cambiarEscala,
      alterarPrecio,
      quitarLinea: () => quitarLinea(lineaConFoco()),
      quitarLineaSiempre: () => quitarLinea(lineaConFoco()),
      siguienteBorrador: () => irABorrador((actual + 1) % NUMERO_BORRADORES),
      aceptar,
      borrador1: () => irABorrador(0),
      borrador2: () => irABorrador(1),
      borrador3: () => irABorrador(2),
      borrador4: () => irABorrador(3),
      borrador5: () => irABorrador(4),
      borrador6: () => irABorrador(5),
    },
    { activo: activa },
  );

  if (!pestanas || !f || !calculo || !contexto) {
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

  const stock =
    stockCargado?.bodegaId === f.bodegaId ? stockCargado.mapa : new Map<number, number>();
  const bodegaNombre = bodegas.find((b) => String(b.id) === f.bodegaId)?.nombre ?? 'la bodega';
  const stockBajo = avisosStock(f, stock, bodegaNombre);
  const plazo = /^\d+$/.test(f.plazo.trim()) ? Number(f.plazo.trim()) : null;
  const vence =
    f.condicion === 'credito' && plazo !== null && plazo <= 999
      ? formatearFecha(calcularVencimiento(contexto.hoy, plazo))
      : '';
  const forma = formasPago.find((fp) => String(fp.id) === f.formaPagoId);
  const cambio = f.condicion === 'contado' ? cambioEnPantalla(total, f.recibido, forma) : null;
  const disponible = credito && credito.tope !== null ? credito.tope - credito.deuda.total : null;
  const clientesActivos = clientes.filter((c) => c.activo);
  const productosActivos = productos.filter((p) => p.activo);

  return (
    <div className="documento documento--lineas">
      <div className="borradores" role="tablist">
        {pestanas.map((p, i) => (
          <PestanaBorrador
            key={i}
            numero={i + 1}
            pestana={p}
            activa={i === actual}
            alElegir={() => irABorrador(i)}
          />
        ))}
      </div>

      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          tabIndex={-1}
          disabled={ocupado || bloqueada}
          onClick={() => void guardar()}
        >
          Guardar e imprimir
          <span className="atajo">{textoCombinacion(ATAJOS.guardarFactura.combinacion)}</span>
        </button>
        <button type="button" className="boton" tabIndex={-1} onClick={() => void limpiar()}>
          Limpiar borrador
        </button>
        <span className="barra-herramientas__separador" />
        <span className="texto-tenue">
          Factura No. <strong>{contexto.siguienteNumero}</strong> (número y fecha se asignan al
          guardar)
          {pestana?.guardadoEn
            ? ` · Borrador guardado en disco ${formatearHora(pestana.guardadoEn)}`
            : ''}
          {contexto.impresoraConfigurada
            ? ''
            : ' · Sin impresora térmica: se abrirá el diálogo de Windows'}
        </span>
      </div>

      <div className="documento__encabezado">
        <label className="campo documento__cliente">
          <span>Cliente (código, nombre o identificación)</span>
          <Buscador
            key={actual}
            registros={clientesActivos}
            clave={(c) => c.codigo}
            texto={textoCliente}
            coincide={coincideCliente}
            exacto={(c, escrito) => String(c.codigo) === escrito}
            seleccionado={f.cliente}
            alElegir={elegirCliente}
            campo={campoCliente}
            ayuda="Código, nombre o identificación…"
            etiqueta="Cliente"
          />
        </label>
        <RecuadroCredito
          esConsumidor={esConsumidor}
          credito={credito}
          disponible={disponible}
          bloqueado={bloqueada}
        />
        <div className="campo">
          <span>Condición de pago</span>
          <span className="segmentado">
            <button
              type="button"
              aria-pressed={f.condicion === 'contado'}
              onClick={() => cambiar({ condicion: 'contado' })}
            >
              Contado
            </button>
            <button
              type="button"
              aria-pressed={f.condicion === 'credito'}
              onClick={() => cambiar({ condicion: 'credito' })}
            >
              Crédito
            </button>
          </span>
        </div>
        <label className="campo campo--num">
          <span>Plazo (días)</span>
          <input
            value={f.condicion === 'credito' ? f.plazo : ''}
            inputMode="numeric"
            disabled={f.condicion !== 'credito'}
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
              <th>Escala</th>
              <th className="num">Cantidad</th>
              <th className="num">Precio</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody ref={tabla}>
            {f.lineas.map((l, i) => (
              <FilaVenta
                key={l.id}
                numero={i + 1}
                linea={l}
                calculo={calculo.porLinea.get(l.id)}
                stock={stock.get(l.producto.codigo) ?? 0}
                stockNegativo={stockBajo.lineas.has(l.id)}
                alCambiar={(cambios) => cambiarLinea(l.id, () => cambios)}
                alQuitar={() => quitarLinea(l.id)}
              />
            ))}
            {f.lineas.length === 0 && (
              <tr>
                <td className="tabla__vacia" colSpan={9}>
                  Escriba el código del producto en el campo de abajo y presione Enter.
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
          key={actual}
          registros={productosActivos}
          clave={(p) => p.codigo}
          texto={textoProducto}
          coincide={coincideProducto}
          exacto={(p, escrito) => String(p.codigo) === escrito}
          seleccionado={null}
          alElegir={agregarLinea}
          vaciarAlElegir
          haciaArriba
          campo={campoCodigo}
          ayuda="Escriba el código y Enter, o parte del nombre para buscar…"
          etiqueta="Agregar producto"
        />
      </div>

      <div className="documento__pie">
        <div className="documento__avisos">
          {total > 0 && (
            <p className="en-letras">
              <strong>Son:</strong> {pesosEnLetras(total)}
            </p>
          )}
          {bloqueada && f.cliente && (
            <AvisoBloqueo
              cliente={f.cliente}
              razones={razonesBloqueo}
              boton={botonContado}
              alCambiarAContado={() => cambiar({ condicion: 'contado' })}
            />
          )}
          {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
          {calculo.errores.map((texto) => (
            <Aviso key={texto} tipo="error">
              {texto}
            </Aviso>
          ))}
          {pestana?.avisos.map((texto) => (
            <Aviso key={texto} tipo="alerta">
              {texto}
            </Aviso>
          ))}
          {[...calculo.avisos, ...stockBajo.textos].map((texto) => (
            <Aviso key={texto} tipo="alerta">
              {texto}
            </Aviso>
          ))}
          <label className="facturar__cajas">
            <span>No. cajas de empaque</span>
            <input
              value={f.cajas}
              inputMode="numeric"
              placeholder="Opcional"
              onChange={(e) => cambiar({ cajas: e.target.value })}
            />
          </label>
          <p className="campo__ayuda">
            {textoCombinacion(ATAJOS.cambiarEscala.combinacion)} cambia la escala ·{' '}
            {textoCombinacion(ATAJOS.alterarPrecio.combinacion)} altera el precio (otra vez sobre el
            precio, lo devuelve al de la escala) ·{' '}
            {textoCombinacion(ATAJOS.quitarLinea.combinacion)} quita la línea ·{' '}
            {textoCombinacion(ATAJOS.borrador1.combinacion)}…
            {textoCombinacion(ATAJOS.borrador6.combinacion)} y{' '}
            {textoCombinacion(ATAJOS.siguienteBorrador.combinacion)} cambian de borrador.
          </p>
        </div>

        <table className="totales">
          <tbody>
            <tr>
              <th>Líneas</th>
              <td className="num">{f.lineas.length}</td>
            </tr>
            <tr>
              <th>Su ahorro fue de</th>
              <td className="num">{agruparMiles(calculo.ahorro)}</td>
            </tr>
            <tr className="totales__total">
              <th>Total</th>
              <td className="num">{formatearPesos(total)}</td>
            </tr>
            {f.condicion === 'credito' ? (
              <>
                <tr>
                  <th>Saldo crédito</th>
                  <td className="num">{agruparMiles(total)}</td>
                </tr>
                {disponible !== null && (
                  <tr>
                    <th className="texto-tenue">Disponible después de esta venta</th>
                    <td className={`num ${disponible - total < 0 ? 'texto-error' : 'texto-tenue'}`}>
                      {formatearPesos(disponible - total)}
                    </td>
                  </tr>
                )}
              </>
            ) : (
              <>
                <tr>
                  <th>Forma de pago</th>
                  <td>
                    <select
                      value={f.formaPagoId}
                      aria-label="Forma de pago"
                      onChange={(e) => cambiar({ formaPagoId: e.target.value })}
                    >
                      <option value="">— Forma de pago —</option>
                      {formasPago
                        .filter((fp) => fp.activo || String(fp.id) === f.formaPagoId)
                        .map((fp) => (
                          <option key={fp.id} value={String(fp.id)}>
                            {fp.nombre}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
                {forma?.calculaCambio && (
                  <>
                    <tr>
                      <th>Recibido</th>
                      <td>
                        <input
                          value={f.recibido}
                          inputMode="numeric"
                          placeholder={agruparMiles(total)}
                          aria-label="Recibido"
                          onChange={(e) => cambiar({ recibido: e.target.value })}
                        />
                      </td>
                    </tr>
                    <tr>
                      <th>Cambio</th>
                      <td className="num">
                        <strong>{cambio === null ? '—' : agruparMiles(cambio)}</strong>
                      </td>
                    </tr>
                  </>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Propiedades de {@link PestanaBorrador}.
 */
interface PropiedadesPestanaBorrador {
  /** Número del borrador (1 a 6). */
  numero: number;
  /** Borrador. */
  pestana: Pestana;
  /** Si es el visible. */
  activa: boolean;
  /** Pasa a este borrador. */
  alElegir: () => void;
}

/**
 * Pestaña de un borrador con su atajo, el cliente y el total; los vacíos
 * ocupan lo justo (maqueta `facturar.html`).
 *
 * @param props - Propiedades del componente.
 * @returns La pestaña.
 */
function PestanaBorrador({
  numero,
  pestana,
  activa,
  alElegir,
}: PropiedadesPestanaBorrador): ReactNode {
  const { f } = pestana;
  const conDatos = ventaTieneDatos(f);
  const atajo = ATAJOS_BORRADORES[numero - 1];
  const nombre = !conDatos
    ? 'Vacío'
    : f.cliente === null
      ? 'Sin cliente'
      : f.cliente.codigo === CODIGO_CONSUMIDOR_FINAL
        ? f.cliente.nombre
        : textoCliente(f.cliente);
  const clases = [
    'borradores__pestana',
    activa ? 'borradores__pestana--activa' : '',
    conDatos ? '' : 'borradores__pestana--vacia',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type="button"
      role="tab"
      tabIndex={-1}
      aria-selected={activa}
      className={clases}
      title={conDatos ? 'Borrador guardado en disco' : 'Borrador vacío'}
      onClick={alElegir}
    >
      {atajo && (
        <span className="borradores__atajo">{textoCombinacion(ATAJOS[atajo].combinacion)}</span>
      )}
      <span className="borradores__nombre">{nombre}</span>
      {conDatos && (
        <>
          <span className="borradores__total">
            {formatearPesos(calcularVentaEnPantalla(f).total)}
          </span>
          <span className="borradores__cambios">•</span>
        </>
      )}
    </button>
  );
}

/**
 * Propiedades de {@link RecuadroCredito}.
 */
interface PropiedadesRecuadroCredito {
  /** Si el cliente es «Consumidor final» (solo contado). */
  esConsumidor: boolean;
  /** Crédito del cliente, o `null` mientras carga. */
  credito: CreditoCliente | null;
  /** Disponible (tope − deuda), o `null` sin tope. */
  disponible: number | null;
  /** Si la venta a crédito está bloqueada (se pinta en rojo, D-85). */
  bloqueado: boolean;
}

/**
 * Recuadro con el tope, la deuda, lo vencido y el disponible del cliente.
 *
 * @param props - Propiedades del componente.
 * @returns El recuadro.
 */
function RecuadroCredito({
  esConsumidor,
  credito,
  disponible,
  bloqueado,
}: PropiedadesRecuadroCredito): ReactNode {
  if (esConsumidor || !credito) {
    return (
      <div className={`credito${bloqueado ? ' credito--bloqueado' : ''}`}>
        <span className="credito__nota">
          {esConsumidor ? 'Consumidor final: solo de contado.' : 'Elija el cliente.'}
        </span>
      </div>
    );
  }
  const vencido = credito.deuda.vencido;
  return (
    <div className={`credito${bloqueado ? ' credito--bloqueado' : ''}`}>
      <span>Tope de crédito</span>
      <span>Deuda actual</span>
      <span>Vencido</span>
      <span>Disponible</span>
      <strong>{credito.tope === null ? 'Sin tope' : formatearPesos(credito.tope)}</strong>
      <strong>{formatearPesos(credito.deuda.total)}</strong>
      <strong className={vencido > 0 ? 'texto-error' : undefined}>{formatearPesos(vencido)}</strong>
      <strong
        className={disponible === null ? undefined : disponible > 0 ? 'texto-exito' : 'texto-error'}
      >
        {disponible === null ? 'Sin límite' : formatearPesos(disponible)}
      </strong>
    </div>
  );
}

/**
 * Propiedades de {@link AvisoBloqueo}.
 */
interface PropiedadesAvisoBloqueo {
  /** Cliente de la factura. */
  cliente: Tercero;
  /** Razones del bloqueo. */
  razones: readonly string[];
  /** Referencia al botón «Cambiar a contado» (Av. Pág lo enfoca, D-85). */
  boton: Ref<HTMLButtonElement>;
  /** Pasa la factura a contado. */
  alCambiarAContado: () => void;
}

/**
 * Aviso rojo de venta a crédito bloqueada (S-03, D-85), con cada razón y el
 * botón «Cambiar a contado».
 *
 * @param props - Propiedades del componente.
 * @returns El aviso.
 */
function AvisoBloqueo({
  cliente,
  razones,
  boton,
  alCambiarAContado,
}: PropiedadesAvisoBloqueo): ReactNode {
  return (
    <div className="aviso aviso--error" role="alert">
      <div>
        <strong>No se puede vender a crédito a {textoCliente(cliente)}:</strong>
        <ul>
          {razones.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <div className="aviso__acciones">
          <button type="button" className="boton" ref={boton} onClick={alCambiarAContado}>
            Cambiar a contado
          </button>
          {cliente.codigo !== CODIGO_CONSUMIDOR_FINAL && (
            <span className="texto-tenue">o registre primero un abono del cliente.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Propiedades de {@link FilaVenta}.
 */
interface PropiedadesFilaVenta {
  /** Número de renglón. */
  numero: number;
  /** Línea escrita. */
  linea: LineaVentaFormulario;
  /** Cálculo de la línea, o `undefined` si está a medio escribir. */
  calculo: LineaVentaCalculada | undefined;
  /** Stock del producto en la bodega elegida. */
  stock: number;
  /** Si la venta deja el stock negativo (aviso ámbar). */
  stockNegativo: boolean;
  /** Cambia escala, cantidad o precio. */
  alCambiar: (cambios: Partial<LineaVentaFormulario>) => void;
  /** Quita la línea. */
  alQuitar: () => void;
}

/**
 * Fila de una línea de venta: escala con su precio, cantidad y precio (solo
 * editable después de F7, con el de la escala tachado al lado).
 *
 * @param props - Propiedades del componente.
 * @returns La fila.
 */
function FilaVenta({
  numero,
  linea,
  calculo,
  stock,
  stockNegativo,
  alCambiar,
  alQuitar,
}: PropiedadesFilaVenta): ReactNode {
  const { producto } = linea;
  const precioEscala = producto.precios[linea.escala];
  const clase =
    !producto.activo || calculo?.bajoCosto
      ? 'fila--error'
      : stockNegativo
        ? 'fila--alerta'
        : undefined;
  return (
    <tr className={clase} tabIndex={-1} {...{ [ATRIBUTO_LINEA]: String(linea.id) }}>
      <td className="num">{numero}</td>
      <td className="num">{producto.codigo}</td>
      <td>
        {producto.nombre}
        {!producto.activo && <span className="etiqueta etiqueta--error">inactivo</span>}
        {linea.precio !== null && (
          <span className="etiqueta etiqueta--alerta">
            precio alterado ({textoCombinacion(ATAJOS.alterarPrecio.combinacion)})
          </span>
        )}
        {calculo?.bajoCosto && <span className="etiqueta etiqueta--error">bajo el costo</span>}
        {!calculo?.bajoCosto && calculo?.bajoMinimo && (
          <span className="etiqueta etiqueta--alerta">bajo el mínimo</span>
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
      <td className={`num${stockNegativo || stock <= 0 ? ' texto-alerta' : ' texto-tenue'}`}>
        {formatearCantidad(stock, producto.unidad)}
      </td>
      <td>
        <select
          value={linea.escala}
          tabIndex={-1}
          aria-label={`Escala de la línea ${numero}`}
          title={`Cambiar la escala (${textoCombinacion(ATAJOS.cambiarEscala.combinacion)})`}
          onChange={(e) => {
            const escala = ESCALAS_PRECIO.find((x) => x.valor === e.target.value)?.valor;
            if (escala) alCambiar({ escala });
          }}
        >
          {ESCALAS_PRECIO.map((e) => (
            <option key={e.valor} value={e.valor}>
              {nombreEscala(e.valor)} · {agruparMiles(producto.precios[e.valor])}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          value={linea.cantidad}
          inputMode={producto.unidad === 'KG' ? 'decimal' : 'numeric'}
          aria-label={`Cantidad de la línea ${numero}`}
          {...{ [ATRIBUTO_CAMPO]: 'cantidad' }}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
        />
      </td>
      <td className="num">
        {linea.precio === null ? (
          <input
            value={agruparMiles(precioEscala)}
            readOnly
            tabIndex={-1}
            aria-label={`Precio de la línea ${numero}`}
          />
        ) : (
          <>
            <span className="precio-escala">{agruparMiles(precioEscala)}</span>
            <input
              value={linea.precio}
              inputMode="numeric"
              aria-label={`Precio alterado de la línea ${numero}`}
              {...{ [ATRIBUTO_CAMPO]: 'precio' }}
              onChange={(e) => alCambiar({ precio: e.target.value })}
            />
          </>
        )}
      </td>
      <td className="num">{calculo ? agruparMiles(calculo.total) : '—'}</td>
    </tr>
  );
}
