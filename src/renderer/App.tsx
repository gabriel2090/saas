import { useEffect, useRef, useState, type ReactNode } from 'react';
import { obtenerProceso } from '../shared/procesos';
import { ProveedorAtajos } from './atajos/ProveedorAtajos';
import { ProveedorDialogos, useConfirmar } from './componentes/Dialogos';
import { LimiteErrores } from './componentes/LimiteErrores';
import { PantallaAcceso } from './pantallas/PantallaAcceso';
import { invocar } from './servicios/api';
import { Escritorio } from './ventanas/Escritorio';
import { ventanasConCambios } from './ventanas/gestor';
import { ProveedorVentanas, useVentanas } from './ventanas/ProveedorVentanas';

/**
 * Atiende la X de la ventana de Electron cuando no hay sesión: cierra sin preguntar.
 *
 * @returns Nada visible.
 */
function CierreSinSesion(): ReactNode {
  useEffect(
    () => window.api.alSolicitarCierre(() => void invocar('app:confirmarCierre', undefined)),
    [],
  );
  return null;
}

/**
 * Atiende la X de la ventana de Electron con sesión iniciada: pide
 * confirmación, avisando si hay ventanas con cambios sin guardar.
 *
 * @returns Nada visible.
 */
function CierreConSesion(): ReactNode {
  const confirmar = useConfirmar();
  const { estado } = useVentanas();
  const estadoRef = useRef(estado);

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

  useEffect(
    () =>
      window.api.alSolicitarCierre(() => {
        const pendientes = ventanasConCambios(estadoRef.current).map(
          (v) => `«${obtenerProceso(v.id).titulo}»`,
        );
        void confirmar(
          pendientes.length > 0
            ? {
                titulo: 'Cambios sin guardar',
                mensaje: `Hay cambios sin guardar en ${pendientes.join(', ')}. ¿Desea salir y descartarlos?`,
                peligroso: true,
              }
            : { titulo: 'Salir', mensaje: '¿Desea salir del sistema?' },
        ).then((aceptado) => {
          if (aceptado) {
            void invocar('app:confirmarCierre', undefined);
          }
        });
      }),
    [confirmar],
  );
  return null;
}

/**
 * Componente raíz: pantalla de acceso y, tras ingresar, el escritorio.
 *
 * @returns La aplicación.
 */
export function App(): ReactNode {
  const [conSesion, setConSesion] = useState(false);
  return (
    <LimiteErrores>
      <ProveedorAtajos>
        <ProveedorDialogos>
          {conSesion ? (
            <ProveedorVentanas>
              <CierreConSesion />
              <Escritorio />
            </ProveedorVentanas>
          ) : (
            <>
              <CierreSinSesion />
              <PantallaAcceso alIngresar={() => setConSesion(true)} />
            </>
          )}
        </ProveedorDialogos>
      </ProveedorAtajos>
    </LimiteErrores>
  );
}
