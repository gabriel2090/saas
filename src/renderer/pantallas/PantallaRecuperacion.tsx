import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { NOMBRE_TIPO_RESPALDO } from '../../domain/politica-respaldos';
import { aIsoLocal, formatearFechaHora, formatearHora } from '../../shared/formato/fechas';
import type {
  ArchivoParaRecuperar,
  CopiaRecuperacion,
  EstadoRecuperacion,
} from '../../shared/recuperacion';
import type { Resultado } from '../../shared/resultado';
import { Aviso } from '../componentes/Aviso';
import { useCandado } from '../documentos/useCandado';
import { invocar } from '../servicios/api';

/**
 * Confirmación pendiente: una copia de la carpeta o un archivo elegido.
 */
type Confirmacion =
  { tipo: 'copia'; copia: CopiaRecuperacion } | { tipo: 'archivo'; archivo: ArchivoParaRecuperar };

/**
 * Formatea un tamaño de archivo (`4,2 MB`).
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
 * Momento a partir del cual se perderían movimientos, como en la maqueta.
 *
 * @param iso - Fecha ISO de la copia.
 * @returns Texto como `después de las 11:38 a. m. de hoy`.
 */
function textoDesde(iso: string): string {
  const hoy = aIsoLocal().slice(0, 10);
  if (iso.slice(0, 10) === hoy) {
    return `después de las ${formatearHora(iso)} de hoy`;
  }
  return `después del ${formatearFechaHora(iso)}`;
}

/**
 * Pantalla de recuperación al arrancar. No pide contraseña: la contraseña
 * está en la base que no se pudo abrir (D-173).
 *
 * @returns La pantalla.
 */
export function PantallaRecuperacion(): ReactNode {
  const [estado, setEstado] = useState<EstadoRecuperacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const conCandado = useCandado();

  const cargar = useCallback((): void => {
    void invocar('recuperacion:estado', undefined).then((resultado) => {
      if (!resultado.ok) {
        setError(resultado.error.mensaje);
        return;
      }
      setEstado(resultado.datos);
      setError(null);
      const recomendada = resultado.datos.copias.find((copia) => copia.recomendada);
      setSeleccion(recomendada?.nombre ?? null);
    });
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const aplicarError = (resultado: Resultado<unknown>): boolean => {
    if (resultado.ok) {
      return false;
    }
    setError(resultado.error.mensaje);
    setOcupado(false);
    return true;
  };

  const restaurar = (confirmada: Confirmacion): void => {
    setOcupado(true);
    setError(null);
    const origen =
      confirmada.tipo === 'copia'
        ? { tipo: 'copia' as const, nombre: confirmada.copia.nombre }
        : { tipo: 'archivo' as const, ruta: confirmada.archivo.ruta };
    void conCandado(async () => {
      const resultado = await invocar('recuperacion:restaurar', origen);
      if (aplicarError(resultado)) {
        return;
      }
    });
  };

  const elegirArchivo = (): void => {
    setError(null);
    void invocar('recuperacion:elegirArchivo', undefined).then((resultado) => {
      if (aplicarError(resultado) || resultado.ok === false) {
        return;
      }
      if (resultado.datos === null) {
        return;
      }
      setConfirmacion({ tipo: 'archivo', archivo: resultado.datos });
    });
  };

  const copiarSoporte = (): void => {
    void invocar('recuperacion:datosSoporte', undefined).then((resultado) => {
      if (aplicarError(resultado) || !resultado.ok) {
        return;
      }
      void invocar('sistema:copiarTexto', resultado.datos).then((copiado) => {
        if (copiado.ok) {
          setAviso('Datos copiados. Puede pegarlos en un mensaje a soporte.');
          setError(null);
        } else {
          setError(copiado.error.mensaje);
        }
      });
    });
  };

  if (confirmacion) {
    const fecha =
      confirmacion.tipo === 'copia' ? confirmacion.copia.fecha : confirmacion.archivo.fecha;
    const nombre =
      confirmacion.tipo === 'copia' ? confirmacion.copia.nombre : confirmacion.archivo.nombre;
    return (
      <main className="recuperacion">
        <section className="recuperacion__tarjeta">
          <h1>Confirmar restauración</h1>
          <p>
            Copia: <strong>{formatearFechaHora(fecha)}</strong> ({nombre})
          </p>
          <Aviso tipo="alerta">
            Se perderán los movimientos registrados <strong>{textoDesde(fecha)}</strong>.
          </Aviso>
          <p className="texto-tenue recuperacion__nota">
            No pide contraseña aquí: la copia traerá la que tenía guardada. Solo confirme que acepta
            perder lo posterior.
          </p>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="recuperacion__botones">
            <button
              type="button"
              className="boton"
              disabled={ocupado}
              onClick={() => setConfirmacion(null)}
            >
              Volver
            </button>
            <button
              type="button"
              className="boton boton--peligro"
              disabled={ocupado}
              onClick={() => restaurar(confirmacion)}
            >
              Restaurar y reiniciar
            </button>
          </div>
        </section>
      </main>
    );
  }

  const validas = estado?.copias.filter((copia) => copia.valida) ?? [];
  const hayValida = validas.length > 0;
  const elegida =
    estado?.copias.find((copia) => copia.nombre === seleccion && copia.valida) ?? null;

  const elegirOtra = (): void => {
    const indice = validas.findIndex((copia) => copia.nombre === seleccion);
    const siguiente = validas[indice + 1];
    if (!siguiente) {
      setError('No hay otra copia válida en la carpeta. Use «Restaurar desde archivo…».');
      return;
    }
    setSeleccion(siguiente.nombre);
    setError(null);
  };

  return (
    <main className="recuperacion">
      <section className="recuperacion__tarjeta">
        <h1>No se puede abrir la base de datos</h1>
        {hayValida ? (
          <Aviso tipo="error">
            {estado?.mensaje ?? 'La verificación de integridad encontró daños.'} No se puede pedir
            la contraseña porque está guardada en la misma base.
          </Aviso>
        ) : (
          <Aviso tipo="error">
            La base está dañada y <strong>no hay ninguna copia utilizable</strong> en la carpeta de
            respaldos.
          </Aviso>
        )}
        {hayValida ? (
          <p>
            Se revisaron las copias, de la más reciente a la más antigua. Puede restaurar la{' '}
            <strong>última copia válida</strong> o elegir otra.
          </p>
        ) : (
          <p>
            Revise si tiene una copia en otra unidad (USB, OneDrive…) con «Restaurar desde
            archivo…», o contacte a soporte con los datos técnicos.
          </p>
        )}
        {estado && estado.copias.length > 0 && (
          <ul className="recuperacion__lista">
            {estado.copias.map((copia) => (
              <li
                key={copia.nombre}
                className={[
                  copia.valida ? '' : 'invalida',
                  copia.nombre === seleccion ? 'seleccionada' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span aria-hidden="true">{copia.valida ? '✓' : '✗'}</span>
                {copia.valida ? (
                  <button
                    type="button"
                    className="recuperacion__elegir"
                    onClick={() => setSeleccion(copia.nombre)}
                  >
                    <strong>{formatearFechaHora(copia.fecha)}</strong>
                    {' · '}
                    {NOMBRE_TIPO_RESPALDO[copia.tipo]}
                    {' · '}
                    {formatearTamano(copia.tamano)}
                  </button>
                ) : (
                  <span>
                    {formatearFechaHora(copia.fecha)} · {copia.nombre}
                  </span>
                )}
                {copia.recomendada ? (
                  <span className="etiqueta-recomendada">Recomendada</span>
                ) : (
                  <span className="texto-tenue">{copia.motivo ?? ''}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        {elegida && (
          <Aviso tipo="alerta">
            Al restaurar {elegida.recomendada ? 'la copia recomendada' : 'esta copia'} perderá los
            movimientos registrados <strong>{textoDesde(elegida.fecha)}</strong>.
          </Aviso>
        )}
        {estado && (
          <p className="texto-tenue recuperacion__nota">
            La base dañada no se borra: quedará renombrada como{' '}
            <code>{estado.nombreBaseDanada}</code> por si soporte la necesita.
          </p>
        )}
        {!hayValida && estado && (
          <Aviso tipo="info">
            Carpeta: <strong>{estado.carpetaRespaldos}</strong>
          </Aviso>
        )}
        {error && <Aviso tipo="error">{error}</Aviso>}
        {aviso && <Aviso tipo="exito">{aviso}</Aviso>}
        <div className="recuperacion__botones">
          {hayValida && (
            <>
              <button
                type="button"
                className="boton boton--primario"
                disabled={elegida === null || ocupado}
                onClick={() => {
                  if (elegida) {
                    setConfirmacion({ tipo: 'copia', copia: elegida });
                  }
                }}
              >
                {elegida?.recomendada
                  ? 'Restaurar la copia recomendada y reiniciar'
                  : 'Restaurar la copia elegida y reiniciar'}
              </button>
              <button type="button" className="boton" onClick={elegirOtra}>
                Elegir otra copia…
              </button>
            </>
          )}
          <button
            type="button"
            className={hayValida ? 'boton' : 'boton boton--primario'}
            onClick={elegirArchivo}
          >
            Restaurar desde archivo…
          </button>
          <button
            type="button"
            className="boton"
            onClick={() => void invocar('recuperacion:abrirCarpeta', undefined)}
          >
            Abrir carpeta de respaldos
          </button>
          <button type="button" className="boton" onClick={copiarSoporte}>
            Copiar datos para soporte
          </button>
          <button
            type="button"
            className="boton"
            onClick={() => void invocar('app:confirmarCierre', undefined)}
          >
            Salir
          </button>
        </div>
        {hayValida && estado && (
          <p className="recuperacion__pie">Carpeta de respaldos: {estado.carpetaRespaldos}</p>
        )}
      </section>
    </main>
  );
}
