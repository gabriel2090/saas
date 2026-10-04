import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { LARGO_MAXIMO_OBSERVACION } from '../../domain/abonos';
import type { TipoAbono } from '../../shared/abonos';
import type { ReintegroGenerado, ReintegroResumen } from '../../shared/correcciones';
import { formatearFechaHora } from '../../shared/formato/fechas';
import { agruparMiles, formatearPesos, leerPesos } from '../../shared/formato/moneda';
import type { RegistroCatalogo } from '../../shared/maestros';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';
import { useFocoDialogo } from './DialogosAbono';
import { useCandado } from './useCandado';

/**
 * Propiedades de {@link DialogoReintegro}.
 */
interface PropiedadesDialogoReintegro {
  /** Cliente o proveedor. */
  tipo: TipoAbono;
  /** Código del tercero. */
  terceroCodigo: number;
  /** Nombre del tercero. */
  terceroNombre: string;
  /** Saldo a favor disponible que se ve en pantalla. */
  disponible: number;
  /** Formas de pago en dinero (sin la de sistema). */
  formasPago: readonly RegistroCatalogo[];
  /** Se llama después de registrar el reintegro. */
  alRegistrar: (reintegro: ReintegroGenerado) => void;
  /** Cierra sin registrar. */
  alCancelar: () => void;
}

/**
 * Diálogo para devolver en dinero el saldo a favor de un tercero (reintegro,
 * D-128): forma de pago, valor (propone todo el disponible) y observación.
 * La fecha y la hora son las del momento de guardar. El proceso principal
 * compara el disponible con el que se vio aquí, así que una doble pulsación
 * no registra dos reintegros.
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
export function DialogoReintegro({
  tipo,
  terceroCodigo,
  terceroNombre,
  disponible,
  formasPago,
  alRegistrar,
  alCancelar,
}: PropiedadesDialogoReintegro): ReactNode {
  const [formaPagoId, setFormaPagoId] = useState('');
  const [valor, setValor] = useState(agruparMiles(disponible));
  const [observacion, setObservacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const campoForma = useRef<HTMLSelectElement>(null);
  const conCandado = useCandado();
  useFocoDialogo(() => campoForma.current);
  useAtajos({ retroceder: alCancelar }, { prioridad: 'modal' });

  const registrar = (evento: FormEvent): void => {
    evento.preventDefault();
    void conCandado(async () => {
      const pesos = leerPesos(valor);
      if (formaPagoId === '') {
        setError('Elija la forma de pago con que se entrega (o se recibe) el dinero.');
        return;
      }
      if (pesos === null || pesos <= 0) {
        setError('Escriba el valor en pesos, sin centavos (por ejemplo 21,750).');
        return;
      }
      if (pesos > disponible) {
        setError(
          `El valor supera el saldo a favor disponible (${formatearPesos(disponible)}). Escriba un valor igual o menor.`,
        );
        return;
      }
      setOcupado(true);
      const r = await invocar('saldoFavor:reintegrar', {
        tipo,
        terceroCodigo,
        formaPagoId: Number(formaPagoId),
        valor: pesos,
        observacion,
        disponibleEsperado: disponible,
      });
      setOcupado(false);
      if (!r.ok) {
        setError(r.error.mensaje);
        return;
      }
      alRegistrar(r.datos);
    });
  };

  return (
    <div className="capa-modal" role="presentation">
      <form
        className="dialogo dialogo--formulario"
        role="dialog"
        aria-modal="true"
        aria-labelledby="reintegro-titulo"
        onSubmit={registrar}
      >
        <div className="dialogo__titulo" id="reintegro-titulo">
          Devolver en dinero el saldo a favor
        </div>
        <div className="dialogo__cuerpo">
          <p className="dialogo__mensaje">
            {tipo === 'cliente'
              ? `Se le entrega a ${terceroNombre} dinero de su saldo a favor.`
              : `${terceroNombre} le devuelve al negocio dinero del saldo a favor.`}{' '}
            Disponible: <strong className="sin-corte">{formatearPesos(disponible)}</strong>. Queda
            registrado con la fecha y la hora de este momento.
          </p>
          <label className="campo">
            <span>Forma de pago *</span>
            <select
              ref={campoForma}
              value={formaPagoId}
              onChange={(e) => {
                setFormaPagoId(e.target.value);
                setError(null);
              }}
            >
              <option value="">— Seleccione —</option>
              {formasPago
                .filter((f) => f.activo)
                .map((f) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.nombre}
                  </option>
                ))}
            </select>
          </label>
          <label className="campo campo--num">
            <span>Valor *</span>
            <input
              value={valor}
              inputMode="numeric"
              onFocus={(e) => e.target.select()}
              onChange={(e) => {
                setValor(e.target.value);
                setError(null);
              }}
            />
          </label>
          <label className="campo">
            <span>Observación</span>
            <input
              value={observacion}
              maxLength={LARGO_MAXIMO_OBSERVACION}
              placeholder="Opcional"
              onChange={(e) => setObservacion(e.target.value)}
            />
          </label>
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button type="submit" className="boton boton--primario" disabled={ocupado}>
            Registrar reintegro
          </button>
          <button type="button" className="boton" onClick={alCancelar}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Propiedades de {@link TablaReintegros}.
 */
interface PropiedadesTablaReintegros {
  /** Reintegros del tercero. */
  reintegros: readonly ReintegroResumen[];
  /** Pide anular un reintegro de saldo a favor. */
  alAnular: (reintegro: ReintegroResumen) => void;
}

/**
 * Lista de reintegros del tercero. Solo los de saldo a favor se anulan aquí;
 * los que nacieron de una corrección, devolución o anulación de una venta de
 * contado se anulan junto con ese documento.
 *
 * @param props - Propiedades del componente.
 * @returns La tabla.
 */
export function TablaReintegros({ reintegros, alAnular }: PropiedadesTablaReintegros): ReactNode {
  return (
    <div className="tabla-contenedor abono__reintegros">
      <table className="tabla">
        <thead>
          <tr>
            <th className="num">Reintegro</th>
            <th className="num">Fecha</th>
            <th>Origen</th>
            <th>Forma de pago</th>
            <th className="num">Valor</th>
            <th>Estado</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {reintegros.map((r) => (
            <tr key={r.id} className={r.estado === 'anulado' ? 'fila--inactiva' : undefined}>
              <td className="num">{r.numero}</td>
              <td className="num">{formatearFechaHora(r.fecha)}</td>
              <td>
                {r.origen === 'saldo_favor' ? 'Saldo a favor' : (r.documento ?? 'Documento')}
                {r.sentido === 'recibe' ? ' (recibido)' : ' (entregado)'}
              </td>
              <td>{r.formaPagoNombre}</td>
              <td className="num">{agruparMiles(r.valor)}</td>
              <td
                className={r.estado === 'anulado' ? 'estado-anulado' : undefined}
                title={r.motivoAnulacion ?? undefined}
              >
                {r.estado === 'anulado' ? 'ANULADO' : 'Activo'}
              </td>
              <td className="num">
                {r.estado === 'activo' && r.origen === 'saldo_favor' && (
                  <button type="button" className="boton" onClick={() => alAnular(r)}>
                    Anular…
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
