import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ATAJOS, ATAJOS_PROCESOS } from '../../shared/keymap';
import { obtenerProceso, type IdProceso } from '../../shared/procesos';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos, useAtajosPorCombinacion, type AccionAtajo } from '../atajos/useAtajos';
import { BarraEstado } from '../componentes/BarraEstado';
import { BarraIconos } from '../componentes/BarraIconos';
import { BuscadorProcesos } from '../componentes/BuscadorProcesos';
import { AsistenteEncaje, type CandidataEncaje } from './AsistenteEncaje';
import { contenidoDeProceso } from './contenidos';
import { ventanaActiva, zonasEncajadas, type EstadoVentanas } from './gestor';
import { MenuOrganizar } from './MenuOrganizar';
import { Miniatura } from './Miniatura';
import { useVentanas } from './ProveedorVentanas';
import { minimoDeProceso } from './tamanos';
import { VentanaInterna, type PuntoPuntero } from './VentanaInterna';
import {
  ajustarZona,
  celdaLibre,
  celdasDeDiseno,
  limitarMinimo,
  nombreCelda,
  rectDeRelativa,
  zonaDeArrastre,
  type DisenoCeldas,
  type Rect,
} from './zonas';

/**
 * Diseños que ofrece la tira «Suelte sobre una zona».
 */
const DISENOS_TIRA: readonly DisenoCeldas[] = ['dos-columnas', 'tres-columnas', 'dos-por-dos'];

/**
 * Celda de un diseño.
 */
interface Celda {
  /** Diseño. */
  diseno: DisenoCeldas;
  /** Índice de la celda. */
  indice: number;
}

/**
 * Ventana que se está arrastrando y dónde está el puntero.
 */
interface Arrastre {
  /** Ventana arrastrada. */
  id: IdProceso;
  /** Puntero relativo al escritorio. */
  punto: { x: number; y: number };
  /** Celda de la tira bajo el puntero, o `null`. */
  celda: Celda | null;
}

/**
 * Lo que pasará al soltar la ventana.
 */
type VistaPrevia =
  | { tipo: 'maximizar'; rect: Rect; etiqueta: string; aviso: null }
  | { tipo: 'celda'; celda: Celda; rect: Rect; etiqueta: string; aviso: string | null };

/**
 * Asistente de encaje abierto.
 */
interface EstadoAsistente {
  /** Diseño de la zona que se llenó. */
  diseno: DisenoCeldas;
  /** Zona libre que se ofrece. */
  celda: { indice: number; rect: Rect };
  /** Zonas ya ocupadas. */
  ocupadas: readonly Rect[];
  /** Ventanas que ya no se ofrecen (la arrastrada y las elegidas). */
  excluidas: readonly IdProceso[];
}

/**
 * Pone en mayúscula la primera letra.
 *
 * @param texto - Texto.
 * @returns Texto con mayúscula inicial.
 */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/**
 * Calcula la vista previa del encaje: la celda de la tira bajo el puntero o
 * la zona del borde, ajustada al mínimo de la ventana (D-112).
 *
 * @param arrastre - Arrastre en curso.
 * @param estado - Estado del gestor.
 * @returns La vista previa, o `null` si al soltar la ventana queda suelta.
 */
function vistaPrevia(arrastre: Arrastre | null, estado: EstadoVentanas): VistaPrevia | null {
  const escritorio = estado.escritorio;
  if (!arrastre || !escritorio) {
    return null;
  }
  let celda = arrastre.celda;
  if (!celda) {
    const zona = zonaDeArrastre(arrastre.punto, escritorio);
    if (!zona) {
      return null;
    }
    if (zona.tipo === 'maximizar' || !zona.diseno) {
      return {
        tipo: 'maximizar',
        rect: { x: 0, y: 0, ...escritorio },
        etiqueta: `Maximizar · ${escritorio.ancho} × ${escritorio.alto}`,
        aviso: null,
      };
    }
    celda = { diseno: zona.diseno, indice: zona.indice };
  }
  const relativa = celdasDeDiseno(celda.diseno)[celda.indice];
  if (!relativa) {
    return null;
  }
  const nombre = nombreCelda(celda.diseno, celda.indice);
  const { rect, aviso } = ajustarZona(
    rectDeRelativa(relativa, escritorio),
    minimoDeProceso(arrastre.id),
    escritorio,
    obtenerProceso(arrastre.id).titulo,
    capitalizar(nombre.conArticulo),
  );
  return {
    tipo: 'celda',
    celda,
    rect,
    etiqueta: `${nombre.nombre} · ${rect.ancho} × ${rect.alto}${aviso ? ' (ajustada)' : ''}`,
    aviso,
  };
}

/**
 * Pantalla principal tras ingresar: barra de iconos, escritorio con las
 * ventanas internas y barra de estado. Registra los atajos globales (Esc,
 * Ctrl+0, Ctrl+K, Ctrl+F6, Ctrl+Shift+O y los de los íconos), mide el
 * escritorio y maneja el encaje al arrastrar, el asistente y el menú
 * «Organizar» (`DISENO.md` §11).
 *
 * @returns El escritorio.
 */
export function Escritorio(): ReactNode {
  const ventanas = useVentanas();
  const { estado, ajustarEscritorio } = ventanas;
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  // `punto` es el clic derecho en un título; `null` abre el menú bajo su botón.
  const [menu, setMenu] = useState<{ punto: PuntoPuntero | null } | null>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const [asistente, setAsistente] = useState<EstadoAsistente | null>(null);
  const escritorio = useRef<HTMLElement>(null);
  const activa = ventanaActiva(estado);
  // El soltar llega antes de que se redibuje el último movimiento: se lee el arrastre más reciente.
  const arrastreRef = useRef<Arrastre | null>(null);
  const vista = vistaPrevia(arrastre, estado);

  useEffect(() => {
    const elemento = escritorio.current;
    if (!elemento) {
      return undefined;
    }
    const medir = (): void =>
      ajustarEscritorio({ ancho: elemento.clientWidth, alto: elemento.clientHeight });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [ajustarEscritorio]);

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
      organizarVentanas: () => setMenu({ punto: null }),
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

  const alArrastrar = (id: IdProceso, puntero: PuntoPuntero): void => {
    const caja = escritorio.current?.getBoundingClientRect();
    if (!caja) {
      return;
    }
    const sobre = document
      .elementFromPoint(puntero.x, puntero.y)
      ?.closest<HTMLElement>('[data-celda]')
      ?.dataset.celda?.split(':');
    const diseno = DISENOS_TIRA.find((d) => d === sobre?.[0]);
    const nuevo: Arrastre = {
      id,
      punto: { x: puntero.x - caja.left, y: puntero.y - caja.top },
      celda: diseno ? { diseno, indice: Number(sobre?.[1]) } : null,
    };
    arrastreRef.current = nuevo;
    setArrastre(nuevo);
  };

  /**
   * Abre el asistente sobre la siguiente zona libre del diseño, si queda
   * alguna y hay ventanas sueltas para ofrecer.
   *
   * @param diseno - Diseño de la zona que se llenó.
   * @param ocupadas - Zonas ocupadas.
   * @param excluidas - Ventanas que no se ofrecen.
   */
  const ofrecerZonaLibre = (
    diseno: DisenoCeldas,
    ocupadas: readonly Rect[],
    excluidas: readonly IdProceso[],
  ): void => {
    const tamano = estado.escritorio;
    const quedan = estado.ventanas.some((v) => !excluidas.includes(v.id));
    const celda = tamano && quedan ? celdaLibre(diseno, tamano, ocupadas) : null;
    setAsistente(celda ? { diseno, celda, ocupadas, excluidas } : null);
  };

  const alSoltar = (id: IdProceso): void => {
    const final = vistaPrevia(arrastreRef.current, estado);
    arrastreRef.current = null;
    setArrastre(null);
    if (!final) {
      return;
    }
    if (final.tipo === 'maximizar') {
      ventanas.maximizar(id);
      return;
    }
    ventanas.encajar(id, final.rect);
    const otras = zonasEncajadas(estado).filter((z) => z.id !== id);
    ofrecerZonaLibre(
      final.celda.diseno,
      [...otras.map((z) => z.rect), final.rect],
      [id, ...otras.map((z) => z.id)],
    );
  };

  const candidatas: CandidataEncaje[] = asistente
    ? [...estado.ventanas]
        .reverse()
        .filter((v) => !asistente.excluidas.includes(v.id))
        .map((v) => {
          const zona = asistente.celda.rect;
          const minimo = limitarMinimo(minimoDeProceso(v.id), estado.escritorio ?? zona);
          const razon =
            minimo.ancho > zona.ancho
              ? `Necesita ${minimo.ancho} px de ancho y la zona mide ${zona.ancho}.`
              : minimo.alto > zona.alto
                ? `Necesita ${minimo.alto} px de alto y la zona mide ${zona.alto}.`
                : null;
          return {
            id: v.id,
            titulo: obtenerProceso(v.id).titulo,
            detalle: v.conCambios ? 'sin guardar' : (v.conservados?.resumen ?? null),
            razon,
          };
        })
    : [];

  const elegirEnAsistente = (id: IdProceso): void => {
    if (!asistente) {
      return;
    }
    ventanas.encajar(id, asistente.celda.rect);
    ventanas.enfocar(id);
    ofrecerZonaLibre(
      asistente.diseno,
      [...asistente.ocupadas, asistente.celda.rect],
      [...asistente.excluidas, id],
    );
  };

  return (
    <div className="aplicacion">
      <BarraIconos
        modo={ventanas.modoBarra}
        organizarAbierto={menu !== null && menu.punto === null}
        alAbrir={ventanas.abrir}
        alBuscar={() => setBuscadorAbierto(true)}
        alOrganizar={() => setMenu((actual) => (actual ? null : { punto: null }))}
        alCambiarModo={ventanas.cambiarModoBarra}
      />
      <main className="escritorio" ref={escritorio}>
        {estado.ventanas.length === 0 && (
          <p className="escritorio__vacio">
            Abra un proceso desde la barra superior o búsquelo con{' '}
            {textoCombinacion(ATAJOS.buscarProceso.combinacion)}.
          </p>
        )}
        {/* El DOM conserva un orden fijo: si React moviera la ventana al
            traerla al frente, el navegador soltaría la captura del puntero a
            mitad del arrastre. El apilado lo da el zIndex. */}
        {[...estado.ventanas]
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((ventana) => {
            const Contenido = contenidoDeProceso(ventana.id);
            return (
              <VentanaInterna
                key={ventana.id}
                ventana={ventana}
                indice={estado.ventanas.indexOf(ventana)}
                activa={ventana === activa}
                alArrastrar={(punto) => alArrastrar(ventana.id, punto)}
                alSoltar={() => alSoltar(ventana.id)}
                alMenu={(punto) => setMenu({ punto })}
              >
                <Contenido />
              </VentanaInterna>
            );
          })}
        {vista && (
          <div
            className={`zona-encaje${vista.aviso ? ' zona-encaje--ajuste' : ''}`}
            style={{
              left: vista.rect.x + 6,
              top: vista.rect.y + 6,
              width: vista.rect.ancho - 12,
              height: vista.rect.alto - 12,
            }}
          >
            <span className="zona-encaje__medida">{vista.etiqueta}</span>
            {vista.aviso && <div className="zona-encaje__texto">{vista.aviso}</div>}
          </div>
        )}
        {arrastre && (
          <div className="disenos-encaje">
            <span className="disenos-encaje__titulo">Suelte sobre una zona:</span>
            {DISENOS_TIRA.map((diseno) => (
              <Miniatura
                key={diseno}
                diseno={diseno}
                soltable
                elegida={
                  vista?.tipo === 'celda' && vista.celda.diseno === diseno
                    ? vista.celda.indice
                    : null
                }
              />
            ))}
          </div>
        )}
        {asistente && (
          <AsistenteEncaje
            key={`${asistente.diseno}:${asistente.celda.indice}`}
            zona={asistente.celda.rect}
            nombreZona={nombreCelda(asistente.diseno, asistente.celda.indice).conArticulo}
            candidatas={candidatas}
            alElegir={elegirEnAsistente}
            alCerrar={() => setAsistente(null)}
          />
        )}
      </main>
      <BarraEstado />
      {menu && <MenuOrganizar punto={menu.punto} alCerrar={() => setMenu(null)} />}
      {buscadorAbierto && (
        <BuscadorProcesos
          alElegir={abrirDesdeBuscador}
          alCerrar={() => setBuscadorAbierto(false)}
        />
      )}
    </div>
  );
}
