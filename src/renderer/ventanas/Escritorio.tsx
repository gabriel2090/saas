import { useMemo, useState, type ReactNode } from 'react';
import { ATAJOS, ATAJOS_PROCESOS } from '../../shared/keymap';
import type { IdProceso } from '../../shared/procesos';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos, useAtajosPorCombinacion, type AccionAtajo } from '../atajos/useAtajos';
import { BarraEstado } from '../componentes/BarraEstado';
import { BarraIconos } from '../componentes/BarraIconos';
import { BuscadorProcesos } from '../componentes/BuscadorProcesos';
import { contenidoDeProceso } from './contenidos';
import { ventanaActiva } from './gestor';
import { useVentanas } from './ProveedorVentanas';
import { VentanaInterna } from './VentanaInterna';

/**
 * Pantalla principal tras ingresar: barra de iconos, escritorio con las
 * ventanas internas apiladas y barra de estado. Registra los atajos globales
 * (Esc, Ctrl+0, Ctrl+K, Ctrl+F6 y los de los íconos).
 *
 * @returns El escritorio.
 */
export function Escritorio(): ReactNode {
  const ventanas = useVentanas();
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const activa = ventanaActiva(ventanas.estado);

  useAtajos(
    {
      retroceder: () => {
        if (!activa) {
          return false;
        }
        void ventanas.solicitarCerrar(activa.id);
        return true;
      },
      cerrarTodas: () => void ventanas.solicitarCerrarTodas(),
      buscarProceso: () => setBuscadorAbierto(true),
      siguienteVentana: () => ventanas.siguiente(),
    },
    { prioridad: 'global' },
  );

  const atajosProcesos = useMemo(() => {
    const acciones: Record<string, AccionAtajo> = {};
    for (const [id, combinacion] of Object.entries(ATAJOS_PROCESOS) as [
      IdProceso,
      string | null,
    ][]) {
      if (combinacion) {
        acciones[combinacion] = () => ventanas.abrir(id);
      }
    }
    return acciones;
  }, [ventanas]);
  useAtajosPorCombinacion(atajosProcesos, { prioridad: 'global' });

  const abrirDesdeBuscador = (id: IdProceso): void => {
    setBuscadorAbierto(false);
    ventanas.abrir(id);
  };

  return (
    <div className="aplicacion">
      <BarraIconos alAbrir={ventanas.abrir} alBuscar={() => setBuscadorAbierto(true)} />
      <main className="escritorio">
        {ventanas.estado.ventanas.length === 0 && (
          <p className="escritorio__vacio">
            Abra un proceso desde la barra superior o búsquelo con{' '}
            {textoCombinacion(ATAJOS.buscarProceso.combinacion)}.
          </p>
        )}
        {ventanas.estado.ventanas.map((ventana, indice) => {
          const Contenido = contenidoDeProceso(ventana.id);
          return (
            <VentanaInterna
              key={ventana.id}
              ventana={ventana}
              indice={indice}
              activa={ventana === activa}
            >
              <Contenido />
            </VentanaInterna>
          );
        })}
      </main>
      <BarraEstado />
      {buscadorAbierto && (
        <BuscadorProcesos
          alElegir={abrirDesdeBuscador}
          alCerrar={() => setBuscadorAbierto(false)}
        />
      )}
    </div>
  );
}
