import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { NOMBRE_TIPO_RESPALDO, textoDialogoPerdida } from '../../domain/politica-respaldos';
import type { TipoRespaldo } from '../../domain/politica-respaldos';
import { formatearFechaHora } from '../../shared/formato/fechas';
import { ATAJOS } from '../../shared/keymap';
import type {
  CopiaRespaldo,
  EstadoRespaldos,
  OrigenRestauracion,
  PrevisualizacionRestauracion,
} from '../../shared/respaldos';
import type { Resultado } from '../../shared/resultado';
import { textoCombinacion } from '../atajos/combinacion';
import { ATRIBUTO_FLECHAS_PROPIAS, ATRIBUTO_FOCO_INICIAL } from '../atajos/navegacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { useFocoDialogo } from '../documentos/DialogosAbono';
import { useCandado } from '../documentos/useCandado';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Clase visual de cada tipo de copia.
 */
const CLASE_TIPO: Readonly<Record<TipoRespaldo, string>> = {
  automatica: 'tipo-copia tipo-copia--auto',
  manual: 'tipo-copia tipo-copia--manual',
  migracion: 'tipo-copia tipo-copia--migracion',
  restauracion: 'tipo-copia tipo-copia--restauracion',
};

/**
 * Diálogo de confirmación abierto.
 */
interface DialogoAbierto {
  /** De dónde sale la copia. */
  origen: OrigenRestauracion;
  /** Lo que se perdería. */
  previa: PrevisualizacionRestauracion;
}

/**
 * Formatea un tamaño de archivo como en la maqueta (`4,2 MB`).
 *
 * @param bytes - Tamaño en bytes.
 * @returns Texto corto.
 */
function formatearTamano(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  const mb = bytes / (1024 * 1024);
  const texto = (mb >= 10 ? mb.toFixed(0) : mb.toFixed(1)).replace('.', ',');
  return `${texto} MB`;
}

/**
 * Frase del aviso de lo que se perdería.
 *
 * @param previa - Previsualización del servidor.
 * @returns Texto para el diálogo.
 */
function frasePerdida(previa: PrevisualizacionRestauracion): string {
  if (previa.perdida.total === 0) {
    return 'No se perdería ningún documento posterior a esa copia.';
  }
  return `Se perderían ${textoDialogoPerdida(previa.perdida)}.`;
}

/**
 * Texto del estado de la copia externa.
 *
 * @param estado - Estado completo de la ventana.
 * @returns Descripción corta.
 */
function textoExterna(estado: EstadoRespaldos): string {
  const externa = estado.externa;
  if (externa.estado === 'sin_configurar') {
    return 'Sin carpeta de copia externa.';
  }
  if (externa.estado === 'ok') {
    return `Al día (${formatearFechaHora(externa.ultimaCopia)}).`;
  }
  if (externa.estado === 'no_disponible') {
    return externa.ultimaCopia
      ? `No disponible. Última copia: ${formatearFechaHora(externa.ultimaCopia)}.`
      : 'No disponible.';
  }
  if (externa.ultimaCopia === '') {
    return 'Todavía no hay una copia en esa carpeta.';
  }
  return `Lleva ${externa.diasSinEscribir} día${externa.diasSinEscribir === 1 ? '' : 's'} sin actualizarse.`;
}

/**
 * Propiedades de {@link DialogoRestaurar}.
 */
interface PropiedadesDialogoRestaurar {
  /** Copia y pérdida ya calculadas. */
  dialogo: DialogoAbierto;
  /** Si se puede usar la clave de recuperación. */
  tieneClave: boolean;
  /** Cierra sin restaurar. */
  alCerrar: () => void;
  /** Muestra un error que no es del diálogo (el PDF, por ejemplo). */
  alError: (mensaje: string) => void;
}

/**
 * Confirmación de la restauración: advierte la pérdida, pide la contraseña
 * actual y ofrece guardar la lista en PDF (D-174, D-175).
 *
 * @param props - Propiedades del componente.
 * @returns El diálogo modal.
 */
function DialogoRestaurar({
  dialogo,
  tieneClave,
  alCerrar,
  alError,
}: PropiedadesDialogoRestaurar): ReactNode {
  const [clave, setClave] = useState(false);
  const [valor, setValor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conCandado = useCandado();
  useFocoDialogo(() => document.getElementById('restaurar-credencial'));
  useAtajos({ retroceder: alCerrar }, { prioridad: 'modal' });

  const guardarPdf = (): void => {
    void invocar('respaldos:pdf', dialogo.origen).then((resultado) => {
      if (!resultado.ok) {
        alError(resultado.error.mensaje);
      }
    });
  };

  const aceptar = (evento: FormEvent): void => {
    evento.preventDefault();
    void conCandado(async () => {
      setOcupado(true);
      const resultado = await invocar('respaldos:restaurar', {
        origen: dialogo.origen,
        credencial: { tipo: clave ? 'clave' : 'contrasena', valor },
      });
      setOcupado(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
      }
    });
  };

  return (
    <div className="capa-modal" role="presentation">
      <form
        className="dialogo dialogo--formulario"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialogo-restaurar-titulo"
        onSubmit={aceptar}
      >
        <div className="dialogo__titulo" id="dialogo-restaurar-titulo">
          ¿Restaurar la copia del {formatearFechaHora(dialogo.previa.fecha)}?
        </div>
        <div className="dialogo__cuerpo">
          <p className="dialogo__mensaje">
            Se reemplazarán <strong>todos</strong> los datos actuales por los de esa copia. La app
            hará antes una copia «previa a restauración», reiniciará y pedirá la contraseña otra
            vez.
          </p>
          <Aviso tipo="alerta">
            {frasePerdida(dialogo.previa)} Vuelve la <strong>contraseña que tenía esa copia</strong>
            .
          </Aviso>
          <p style={{ margin: 0 }}>
            <button type="button" className="boton" onClick={guardarPdf}>
              Guardar lista en PDF
            </button>
          </p>
          <label className="campo">
            <span>{clave ? 'Clave de recuperación' : 'Contraseña'}</span>
            <input
              id="restaurar-credencial"
              type={clave ? 'text' : 'password'}
              value={valor}
              autoComplete="off"
              onChange={(e) => {
                setValor(e.target.value);
                setError(null);
              }}
            />
          </label>
          {tieneClave && (
            <p className="texto-tenue" style={{ margin: 0, fontSize: 12 }}>
              <button type="button" className="enlace" onClick={() => setClave((v) => !v)}>
                {clave ? 'Usar la contraseña' : 'Olvidé la contraseña: usar clave de recuperación'}
              </button>
            </p>
          )}
          {error && <Aviso tipo="error">{error}</Aviso>}
        </div>
        <div className="dialogo__botones">
          <button type="button" className="boton" onClick={alCerrar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className="boton boton--peligro" disabled={ocupado || valor === ''}>
            {ocupado ? 'Restaurando…' : 'Restaurar y reiniciar'}
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Ventana Respaldos: lista de copias, carpeta, copia externa y restauración
 * (D-175).
 *
 * @returns La ventana.
 */
export function Respaldos(): ReactNode {
  const { activa } = useVentana();
  const [estado, setEstado] = useState<EstadoRespaldos | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState<DialogoAbierto | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback((): void => {
    void invocar('respaldos:estado', undefined).then((resultado) => {
      if (resultado.ok) {
        setEstado(resultado.datos);
        setError(null);
      } else {
        setError(resultado.error.mensaje);
      }
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const copias = estado?.copias ?? [];
  const elegida = copias.find((c) => c.nombre === seleccion) ?? copias[0] ?? null;

  const mover = (delta: number): void => {
    if (!elegida) {
      return;
    }
    const indice = copias.findIndex((c) => c.nombre === elegida.nombre);
    const siguiente = copias[indice + delta];
    if (siguiente) {
      setSeleccion(siguiente.nombre);
    }
  };

  const enLista =
    (accion: () => void): (() => boolean) =>
    () => {
      const contenedor = document.querySelector('.respaldos .tabla-contenedor');
      if (!contenedor?.contains(document.activeElement)) {
        return false;
      }
      accion();
      return true;
    };

  useAtajos(
    {
      actualizarRespaldos: () => cargar(),
      moverAbajo: enLista(() => mover(1)),
      moverArriba: enLista(() => mover(-1)),
    },
    { activo: activa && dialogo === null },
  );

  const aplicar = (resultado: Resultado<EstadoRespaldos>): void => {
    if (resultado.ok) {
      setEstado(resultado.datos);
      setError(null);
    } else {
      setError(resultado.error.mensaje);
    }
  };

  const respaldarAhora = (): void => {
    setOcupado(true);
    void invocar('respaldos:ahora', undefined).then((resultado) => {
      setOcupado(false);
      aplicar(resultado);
    });
  };

  const cambiarCarpeta = (): void => {
    setOcupado(true);
    void invocar('respaldos:cambiarCarpeta', undefined).then((resultado) => {
      setOcupado(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      if (!resultado.datos.cancelado && resultado.datos.estado) {
        setEstado(resultado.datos.estado);
        setError(null);
      }
    });
  };

  const cambiarExterna = (): void => {
    setOcupado(true);
    void invocar('respaldos:cambiarExterna', undefined).then((resultado) => {
      setOcupado(false);
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      if (!resultado.datos.cancelado && resultado.datos.estado) {
        setEstado(resultado.datos.estado);
        setError(null);
      }
    });
  };

  const quitarExterna = (): void => {
    void invocar('respaldos:quitarExterna', undefined).then(aplicar);
  };

  const abrirRestaurar = (origen: OrigenRestauracion): void => {
    void invocar('respaldos:previsualizar', origen).then((resultado) => {
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setDialogo({ origen, previa: resultado.datos });
    });
  };

  const restaurarArchivo = (): void => {
    void invocar('respaldos:elegirArchivo', undefined).then((resultado) => {
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      if (resultado.datos !== null) {
        abrirRestaurar({ tipo: 'archivo', ruta: resultado.datos });
      }
    });
  };

  const externa = estado?.externa;
  const carpetaExterna = externa && externa.estado !== 'sin_configurar' ? externa.carpeta : null;

  return (
    <div className="reporte respaldos">
      <div className="barra-herramientas">
        <button
          type="button"
          className="boton boton--primario"
          disabled={ocupado}
          onClick={respaldarAhora}
        >
          Respaldar ahora
        </button>
        <button type="button" className="boton" disabled={ocupado} onClick={cambiarCarpeta}>
          Cambiar carpeta…
        </button>
        <button
          type="button"
          className="boton"
          onClick={() => void invocar('respaldos:abrirCarpeta', undefined)}
        >
          Abrir carpeta
        </button>
        <button
          type="button"
          className="boton boton--peligro"
          disabled={elegida === null}
          onClick={() => elegida && abrirRestaurar({ tipo: 'copia', nombre: elegida.nombre })}
        >
          Restaurar esta copia…
        </button>
        <button type="button" className="boton" onClick={restaurarArchivo}>
          Restaurar desde archivo…
        </button>
        <span className="barra-herramientas__separador" />
        <span className="barra-herramientas__resumen">
          Últimas 20 · una por hora (48 h) · una diaria (30 días)
        </span>
      </div>
      <p className="respaldos__ruta">
        Carpeta: <strong>{estado?.carpeta ?? '…'}</strong>
        {estado?.ultimoRespaldo
          ? ` · última copia: ${formatearFechaHora(estado.ultimoRespaldo)}`
          : ''}
      </p>
      <p className="respaldos__ruta">
        Copia externa (diaria):{' '}
        {carpetaExterna ? <strong>{carpetaExterna}</strong> : <span>sin configurar</span>}
        {estado && externa && externa.estado !== 'sin_configurar' && (
          <>
            {' · '}
            <span className={externa.estado === 'ok' ? 'texto-exito' : 'texto-alerta'}>
              {textoExterna(estado)}
            </span>
          </>
        )}
        {' · '}
        <button type="button" className="boton" disabled={ocupado} onClick={cambiarExterna}>
          Cambiar…
        </button>
        {carpetaExterna && (
          <>
            {' · '}
            <button type="button" className="boton" onClick={quitarExterna}>
              Quitar
            </button>
          </>
        )}
      </p>
      <Aviso tipo="info">
        Tras cada operación confirmada la app copia la base en unos segundos. Restaurar reemplaza
        todos los datos y reinicia el programa; pide la contraseña otra vez y vuelve la que tenía
        esa copia.
      </Aviso>
      {error && <Aviso tipo="error">{error}</Aviso>}
      <div
        className="tabla-contenedor"
        tabIndex={0}
        {...{ [ATRIBUTO_FLECHAS_PROPIAS]: '', [ATRIBUTO_FOCO_INICIAL]: '' }}
      >
        <table className="tabla tabla--seleccionable">
          <thead>
            <tr>
              <th>Fecha y hora</th>
              <th>Tipo</th>
              <th className="num">Tamaño</th>
              <th>Archivo</th>
            </tr>
          </thead>
          <tbody>
            {copias.length === 0 ? (
              <tr>
                <td className="tabla__vacia" colSpan={4}>
                  {estado ? 'Todavía no hay copias en esta carpeta.' : 'Cargando copias…'}
                </td>
              </tr>
            ) : (
              copias.map((copia) => (
                <FilaCopia
                  key={copia.nombre}
                  copia={copia}
                  seleccionada={copia.nombre === elegida?.nombre}
                  alElegir={() => setSeleccion(copia.nombre)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="texto-tenue respaldos__ayuda">
        ↑/↓ elige la copia. «Restaurar esta copia…» usa la fila seleccionada.{' '}
        {textoCombinacion(ATAJOS.actualizarRespaldos.combinacion)} actualiza la lista.
      </p>
      {dialogo && estado && (
        <DialogoRestaurar
          dialogo={dialogo}
          tieneClave={estado.tieneClaveRecuperacion}
          alCerrar={() => setDialogo(null)}
          alError={setError}
        />
      )}
    </div>
  );
}

/**
 * Propiedades de {@link FilaCopia}.
 */
interface PropiedadesFilaCopia {
  /** Copia a mostrar. */
  copia: CopiaRespaldo;
  /** Si es la fila elegida. */
  seleccionada: boolean;
  /** La elige. */
  alElegir: () => void;
}

/**
 * Fila de la lista de copias.
 *
 * @param props - Propiedades del componente.
 * @returns La fila.
 */
function FilaCopia({ copia, seleccionada, alElegir }: PropiedadesFilaCopia): ReactNode {
  return (
    <tr className={seleccionada ? 'fila--seleccionada' : undefined} onClick={alElegir}>
      <td>{formatearFechaHora(copia.fecha)}</td>
      <td>
        <span className={CLASE_TIPO[copia.tipo]}>{NOMBRE_TIPO_RESPALDO[copia.tipo]}</span>
      </td>
      <td className="num">{formatearTamano(copia.tamano)}</td>
      <td className="respaldos__archivo">{copia.nombre}</td>
    </tr>
  );
}
