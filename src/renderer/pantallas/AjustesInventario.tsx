import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { movimientoAjuste } from '../../domain/ajustes';
import { ErrorDeNegocio } from '../../domain/errores';
import { claveComparacion } from '../../domain/texto';
import { TIPOS_AJUSTE, type AjusteResumen, type TipoAjuste } from '../../shared/ajustes';
import { formatearCantidad, leerCantidad } from '../../shared/formato/cantidades';
import { formatearFechaHora } from '../../shared/formato/fechas';
import { ATAJOS } from '../../shared/keymap';
import type { ProductoResumen, RegistroCatalogo } from '../../shared/maestros';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso, type TipoAviso } from '../componentes/Aviso';
import { Buscador } from '../documentos/Buscador';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Nombre de cada tipo de ajuste.
 */
const ETIQUETA_TIPO = Object.fromEntries(TIPOS_AJUSTE.map((t) => [t.valor, t.etiqueta])) as Record<
  TipoAjuste,
  string
>;

/**
 * Texto de una cantidad con signo (entradas con «+»).
 *
 * @param milesimas - Cantidad con signo.
 * @param unidad - Unidad del producto.
 * @returns Texto como `+2` o `-1.500`.
 */
function cantidadConSigno(milesimas: number, unidad: ProductoResumen['unidad']): string {
  return `${milesimas > 0 ? '+' : ''}${formatearCantidad(milesimas, unidad)}`;
}

/**
 * Ventana «Ajustes de inventario» (§9.2): merma, daño o conteo físico de un
 * producto en una bodega, con motivo obligatorio. Cada ajuste queda en el
 * kardex y en el historial; no se edita (D-73). Av. Pág guarda.
 *
 * @returns La ventana.
 */
export function AjustesInventario(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const [productos, setProductos] = useState<ProductoResumen[]>([]);
  const [bodegas, setBodegas] = useState<RegistroCatalogo[]>([]);
  const [recientes, setRecientes] = useState<AjusteResumen[]>([]);
  const [producto, setProducto] = useState<ProductoResumen | null>(null);
  const [bodegaId, setBodegaId] = useState('');
  const [tipo, setTipo] = useState<TipoAjuste>('merma');
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [stockCargado, setStockCargado] = useState<{ clave: string; cantidad: number } | null>(
    null,
  );
  const [aviso, setAviso] = useState<{ tipo: TipoAviso; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campoProducto = useRef<HTMLInputElement>(null);

  const cargarRecientes = useCallback(async (): Promise<void> => {
    const r = await invocar('ajustes:listar', undefined);
    if (r.ok) setRecientes(r.datos);
  }, []);

  useEffect(() => {
    void (async () => {
      const [prod, bod] = await Promise.all([
        invocar('productos:listar', undefined),
        invocar('catalogos:listar', 'bodega'),
        cargarRecientes(),
      ]);
      if (prod.ok) setProductos(prod.datos);
      if (bod.ok) {
        setBodegas(bod.datos);
        const principal = bod.datos.find((b) => b.esPrincipal);
        if (principal) setBodegaId(String(principal.id));
      }
    })();
  }, [cargarRecientes]);

  const codigo = producto?.codigo ?? null;
  // El stock se guarda con su clave producto/bodega para no mostrar el de otra selección.
  const claveStock = codigo === null || bodegaId === '' ? null : `${codigo}/${bodegaId}`;
  const stock =
    stockCargado !== null && stockCargado.clave === claveStock ? stockCargado.cantidad : null;

  useEffect(() => {
    if (codigo === null || bodegaId === '') return undefined;
    let vigente = true;
    void invocar('ajustes:stock', { productoCodigo: codigo, bodegaId: Number(bodegaId) }).then(
      (r) => {
        if (vigente && r.ok) setStockCargado({ clave: `${codigo}/${bodegaId}`, cantidad: r.datos });
      },
    );
    return () => {
      vigente = false;
    };
  }, [codigo, bodegaId]);

  const tieneDatos = producto !== null || cantidad.trim() !== '' || motivo.trim() !== '';
  useEffect(() => {
    marcarCambios(tieneDatos);
  }, [tieneDatos, marcarCambios]);

  const cantidadLeida = producto ? leerCantidad(cantidad, producto.unidad) : null;
  let movimiento: number | null = null;
  let errorCalculo: string | null = null;
  if (producto && stock !== null && cantidad.trim() !== '') {
    if (cantidadLeida === null) {
      errorCalculo =
        producto.unidad === 'UND'
          ? 'La cantidad debe ser un número entero de unidades.'
          : 'La cantidad no es válida: use hasta tres decimales separados por punto (12.5).';
    } else {
      try {
        movimiento = movimientoAjuste({
          tipo,
          unidad: producto.unidad,
          cantidad: cantidadLeida,
          stockActual: stock,
        });
      } catch (error) {
        if (!(error instanceof ErrorDeNegocio)) throw error;
        errorCalculo = error.message;
      }
    }
  }

  const guardar = async (): Promise<void> => {
    if (ocupado) return;
    if (!producto) {
      setAviso({ tipo: 'error', texto: 'Elija el producto a ajustar.' });
      return;
    }
    if (bodegaId === '') {
      setAviso({ tipo: 'error', texto: 'Elija la bodega.' });
      return;
    }
    if (cantidadLeida === null) {
      setAviso({
        tipo: 'error',
        texto: errorCalculo ?? 'Escriba la cantidad.',
      });
      return;
    }
    setOcupado(true);
    const r = await invocar('ajustes:registrar', {
      productoCodigo: producto.codigo,
      bodegaId: Number(bodegaId),
      tipo,
      cantidad: cantidadLeida,
      motivo,
    });
    setOcupado(false);
    if (!r.ok) {
      setAviso({ tipo: 'error', texto: r.error.mensaje });
      return;
    }
    const a = r.datos;
    setAviso({
      tipo: 'exito',
      texto: `Ajuste ${a.numero} guardado: ${a.productoNombre} ${cantidadConSigno(a.cantidad, a.unidad)} ${a.unidad} en ${a.bodegaNombre}.`,
    });
    setProducto(null);
    setCantidad('');
    setMotivo('');
    void cargarRecientes();
    campoProducto.current?.focus();
  };

  useAtajos({ guardarDocumento: () => void guardar() }, { activo: activa });

  const limpiarAviso = (): void => setAviso(null);

  return (
    <div className="documento ajustes">
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
        <span className="barra-herramientas__separador" />
        <span className="texto-tenue">
          Cada ajuste queda en el kardex y en el historial de cambios; no se edita.
        </span>
      </div>

      <div className="ajustes__formulario">
        <label className="campo ajustes__producto">
          <span>Producto *</span>
          <Buscador
            registros={productos.filter((p) => p.activo)}
            clave={(p) => p.codigo}
            texto={(p) => `${p.codigo} - ${p.nombre}`}
            coincide={(p, b) =>
              String(p.codigo).startsWith(b) || claveComparacion(p.nombre).includes(b)
            }
            exacto={(p, escrito) => String(p.codigo) === escrito}
            seleccionado={producto}
            alElegir={(p) => {
              setProducto(p);
              limpiarAviso();
            }}
            campo={campoProducto}
            ayuda="Código o parte del nombre…"
            etiqueta="Producto"
          />
        </label>
        <label className="campo">
          <span>Bodega *</span>
          <select
            value={bodegaId}
            onChange={(e) => {
              setBodegaId(e.target.value);
              limpiarAviso();
            }}
          >
            {bodegas
              .filter((b) => b.activo || String(b.id) === bodegaId)
              .map((b) => (
                <option key={b.id} value={String(b.id)}>
                  {b.nombre}
                </option>
              ))}
          </select>
        </label>
        <div className="campo">
          <span>Tipo de ajuste *</span>
          <div className="segmentado">
            {TIPOS_AJUSTE.map((t) => (
              <button
                key={t.valor}
                type="button"
                aria-pressed={tipo === t.valor}
                onClick={() => {
                  setTipo(t.valor);
                  limpiarAviso();
                }}
              >
                {t.etiqueta}
              </button>
            ))}
          </div>
        </div>
        <label className="campo campo--num">
          <span>Stock actual</span>
          <input
            value={producto && stock !== null ? formatearCantidad(stock, producto.unidad) : '—'}
            readOnly
            tabIndex={-1}
          />
        </label>
        <label className="campo campo--num">
          <span>
            {tipo === 'conteo' ? 'Cantidad contada *' : 'Cantidad a descontar *'}
            {producto ? ` (${producto.unidad})` : ''}
          </span>
          <input
            value={cantidad}
            inputMode={producto?.unidad === 'KG' ? 'decimal' : 'numeric'}
            placeholder={producto?.unidad === 'KG' ? '0.000' : '0'}
            onChange={(e) => {
              setCantidad(e.target.value);
              limpiarAviso();
            }}
          />
        </label>
        <label className="campo campo--num">
          <span>Stock después</span>
          <input
            value={
              producto && stock !== null && movimiento !== null
                ? `${formatearCantidad(stock + movimiento, producto.unidad)} (${cantidadConSigno(movimiento, producto.unidad)})`
                : '—'
            }
            readOnly
            tabIndex={-1}
          />
        </label>
        <label className="campo ajustes__motivo">
          <span>Motivo *</span>
          <input
            value={motivo}
            placeholder="Por ejemplo: producto vencido, se rompió en la bodega, conteo de fin de mes"
            onChange={(e) => {
              setMotivo(e.target.value);
              limpiarAviso();
            }}
          />
        </label>
      </div>

      {errorCalculo && <Aviso tipo="error">{errorCalculo}</Aviso>}
      {producto && stock !== null && movimiento !== null && stock + movimiento < 0 && (
        <Aviso tipo="alerta">
          El stock quedará negativo. Se puede guardar, pero conviene revisar el conteo.
        </Aviso>
      )}
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <fieldset className="grupo ajustes__recientes">
        <legend>Últimos ajustes</legend>
        <div className="tabla-contenedor">
          <table className="tabla">
            <thead>
              <tr>
                <th className="num">No.</th>
                <th>Fecha</th>
                <th>Producto</th>
                <th>Bodega</th>
                <th>Tipo</th>
                <th className="num">Stock antes</th>
                <th className="num">Movimiento</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {recientes.length === 0 && (
                <tr>
                  <td className="tabla__vacia" colSpan={8}>
                    Aún no hay ajustes de inventario.
                  </td>
                </tr>
              )}
              {recientes.map((a) => (
                <tr key={a.id}>
                  <td className="num">{a.numero}</td>
                  <td>{formatearFechaHora(a.fecha)}</td>
                  <td>
                    {a.productoCodigo} - {a.productoNombre}
                  </td>
                  <td>{a.bodegaNombre}</td>
                  <td>{ETIQUETA_TIPO[a.tipo]}</td>
                  <td className="num">{formatearCantidad(a.stockAnterior, a.unidad)}</td>
                  <td className={`num${a.cantidad < 0 ? ' texto-error' : ''}`}>
                    {cantidadConSigno(a.cantidad, a.unidad)}
                  </td>
                  <td>{a.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </fieldset>
    </div>
  );
}
