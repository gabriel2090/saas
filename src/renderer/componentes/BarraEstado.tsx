import { useEffect, useState, type ReactNode } from 'react';
import { formatearFechaHora } from '../../shared/formato/fechas';
import type { InfoSistema } from '../../shared/ipc/contrato';
import { ATAJOS } from '../../shared/keymap';
import { textoCombinacion } from '../atajos/combinacion';
import { invocar } from '../servicios/api';

/**
 * Cada cuánto se actualiza la información (para reflejar el último respaldo).
 */
const INTERVALO_ACTUALIZACION_MS = 10_000;

/**
 * Barra inferior con la versión, el último respaldo y los atajos globales.
 *
 * @returns La barra de estado.
 */
export function BarraEstado(): ReactNode {
  const [info, setInfo] = useState<InfoSistema | null>(null);

  useEffect(() => {
    const cargar = (): void => {
      void invocar('sistema:info', undefined).then((resultado) => {
        if (resultado.ok) {
          setInfo(resultado.datos);
        }
      });
    };
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_ACTUALIZACION_MS);
    return () => clearInterval(intervalo);
  }, []);

  return (
    <footer className="barra-estado">
      <span>Versión {info?.version ?? '…'}</span>
      {info?.desarrollo && (
        <span className="texto-alerta" title={info.carpetaDatos}>
          Datos de desarrollo
        </span>
      )}
      <span title={info?.carpetaRespaldos}>
        Último respaldo:{' '}
        {info?.ultimoRespaldo ? formatearFechaHora(info.ultimoRespaldo) : 'sin cambios aún'}
      </span>
      <span className="barra-estado__atajos">
        {textoCombinacion(ATAJOS.buscarProceso.combinacion)} buscar ·{' '}
        {textoCombinacion(ATAJOS.siguienteVentana.combinacion)} cambiar ventana ·{' '}
        {textoCombinacion(ATAJOS.retroceder.combinacion)} cerrar ·{' '}
        {textoCombinacion(ATAJOS.cerrarTodas.combinacion)} cerrar todas
      </span>
    </footer>
  );
}
