import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { claveComparacion } from '../../domain/texto';
import type { Resultado } from '../../shared/resultado';
import { useAtajos } from '../atajos/useAtajos';
import { useConfirmar } from '../componentes/Dialogos';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Mensaje que se muestra en la ficha.
 */
export type AvisoFicha = { tipo: 'error' | 'exito'; texto: string } | null;

/**
 * Lo que cada ventana de maestro le indica a {@link useMaestro}.
 *
 * @template R - Registro de la lista.
 * @template F - Estado del formulario de la ficha (textos tal como se escriben).
 */
export interface ConfiguracionMaestro<R, F> {
  /** Carga todos los registros (activos e inactivos). */
  listar: () => Promise<Resultado<R[]>>;
  /** Clave única del registro (código o id). */
  clave: (registro: R) => number;
  /** Si el registro está activo. */
  estaActivo: (registro: R) => boolean;
  /** Nombre del registro para los mensajes de confirmación. */
  nombre: (registro: R) => string;
  /** Si el texto de búsqueda (ya normalizado) coincide con el registro. */
  coincide: (registro: R, busqueda: string) => boolean;
  /** Formulario con los datos de un registro guardado. */
  formularioDe: (registro: R) => F;
  /** Formulario vacío para un registro nuevo (puede pedir el próximo código). */
  formularioNuevo: () => Promise<F>;
  /**
   * Guarda el formulario: crea si `seleccionado` es `null`, si no edita.
   * Puede devolver un error de validación local sin llamar al proceso principal.
   */
  guardar: (formulario: F, seleccionado: R | null) => Promise<Resultado<R>>;
  /** Inactiva o reactiva un registro. */
  cambiarEstado: (registro: R, activo: boolean) => Promise<Resultado<R>>;
}

/**
 * Estado y operaciones de una ventana de maestro.
 *
 * @template R - Registro de la lista.
 * @template F - Estado del formulario.
 */
export interface EstadoMaestro<R, F> {
  /** Registros visibles (filtrados por búsqueda e inactivos). */
  visibles: R[];
  /** Total de registros cargados. */
  total: number;
  /** Cantidad de registros inactivos. */
  inactivos: number;
  /** Registro seleccionado (o `null` si se está creando uno nuevo o no hay). */
  seleccionado: R | null;
  /** Si la ficha es de un registro nuevo. */
  esNuevo: boolean;
  /** Formulario de la ficha (o `null` si no hay nada que mostrar). */
  formulario: F | null;
  /** Si el formulario tiene cambios sin guardar. */
  conCambios: boolean;
  /** Si hay una operación en curso. */
  ocupado: boolean;
  /** Mensaje de la ficha. */
  aviso: AvisoFicha;
  /** Texto de búsqueda. */
  busqueda: string;
  /** Si se muestran los inactivos. */
  mostrarInactivos: boolean;
  /**
   * Cambia campos del formulario.
   *
   * @param cambios - Campos nuevos.
   */
  cambiar: (cambios: Partial<F>) => void;
  /**
   * Cambia el texto de búsqueda.
   *
   * @param texto - Texto escrito.
   */
  buscar: (texto: string) => void;
  /**
   * Muestra u oculta los inactivos.
   *
   * @param mostrar - Si se muestran.
   */
  alternarInactivos: (mostrar: boolean) => void;
  /**
   * Selecciona un registro (pide confirmación si hay cambios sin guardar).
   *
   * @param clave - Clave del registro.
   */
  seleccionar: (clave: number) => Promise<void>;
  /** Mueve la selección a la fila siguiente (`1`) o anterior (`-1`). */
  moverSeleccion: (direccion: 1 | -1) => void;
  /** Empieza un registro nuevo. */
  nuevo: () => Promise<void>;
  /** Guarda la ficha. */
  guardar: () => Promise<void>;
  /** Inactiva o reactiva el registro seleccionado (con confirmación). */
  alternarEstado: () => Promise<void>;
  /**
   * Reemplaza un registro tras una operación propia de la ventana (p. ej.
   * corregir costo) y aplica los mismos cambios al formulario sin perder lo
   * que el usuario está editando.
   *
   * @param registro - Registro actualizado.
   * @param cambios - Campos del formulario que cambiaron.
   */
  reemplazar: (registro: R, cambios: Partial<F>) => void;
}

/**
 * Lógica común de las ventanas de maestros (patrón aprobado en la maqueta de
 * productos, D-33): lista con búsqueda e inactivos, ficha con detección de
 * cambios y los atajos F2 / Ctrl+S / F8 del keymap (D-31).
 *
 * @param config - Operaciones propias del maestro.
 * @returns Estado y operaciones.
 */
export function useMaestro<R, F>(config: ConfiguracionMaestro<R, F>): EstadoMaestro<R, F> {
  const { activa, marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  });

  const [registros, setRegistros] = useState<R[]>([]);
  const [claveSeleccionada, setClaveSeleccionada] = useState<number | null>(null);
  const [esNuevo, setEsNuevo] = useState(false);
  const [formulario, setFormulario] = useState<F | null>(null);
  const [original, setOriginal] = useState<F | null>(null);
  const [aviso, setAviso] = useState<AvisoFicha>(null);
  const [ocupado, setOcupado] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [mostrarInactivos, setMostrarInactivos] = useState(false);

  const seleccionado = useMemo(
    () =>
      claveSeleccionada === null
        ? null
        : (registros.find((r) => config.clave(r) === claveSeleccionada) ?? null),
    [registros, claveSeleccionada, config],
  );

  const conCambios = useMemo(
    () => formulario !== null && JSON.stringify(formulario) !== JSON.stringify(original),
    [formulario, original],
  );

  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  const visibles = useMemo(() => {
    const texto = claveComparacion(busqueda.trim());
    return registros.filter(
      (r) =>
        (mostrarInactivos || config.estaActivo(r) || config.clave(r) === claveSeleccionada) &&
        (texto === '' || config.coincide(r, texto)),
    );
  }, [registros, busqueda, mostrarInactivos, claveSeleccionada, config]);

  /**
   * Muestra un registro en la ficha.
   *
   * @param registro - Registro (o `null` para vaciar la ficha).
   */
  const mostrar = useCallback((registro: R | null): void => {
    const formularioRegistro = registro ? configRef.current.formularioDe(registro) : null;
    setClaveSeleccionada(registro ? configRef.current.clave(registro) : null);
    setEsNuevo(false);
    setFormulario(formularioRegistro);
    setOriginal(formularioRegistro);
  }, []);

  /**
   * Vuelve a cargar la lista desde el proceso principal.
   *
   * @returns Los registros cargados, o `null` si falló.
   */
  const recargar = useCallback(async (): Promise<R[] | null> => {
    const resultado = await configRef.current.listar();
    if (!resultado.ok) {
      setAviso({ tipo: 'error', texto: resultado.error.mensaje });
      return null;
    }
    setRegistros(resultado.datos);
    return resultado.datos;
  }, []);

  useEffect(() => {
    void recargar().then((cargados) => {
      const primero = cargados?.find((r) => configRef.current.estaActivo(r)) ?? null;
      mostrar(primero);
    });
  }, [recargar, mostrar]);

  /**
   * Pide confirmación para descartar los cambios sin guardar, si los hay.
   *
   * @returns `true` si se puede continuar.
   */
  const puedeDescartar = async (): Promise<boolean> =>
    !conCambios ||
    confirmar({
      titulo: 'Cambios sin guardar',
      mensaje: '¿Descartar los cambios de la ficha?',
      textoAceptar: 'Descartar',
      textoCancelar: 'Seguir editando',
      peligroso: true,
    });

  const seleccionar = async (clave: number): Promise<void> => {
    if (clave === claveSeleccionada && !esNuevo) {
      return;
    }
    if (!(await puedeDescartar())) {
      return;
    }
    setAviso(null);
    mostrar(registros.find((r) => config.clave(r) === clave) ?? null);
  };

  const moverSeleccion = (direccion: 1 | -1): void => {
    if (visibles.length === 0) {
      return;
    }
    const actual = visibles.findIndex((r) => config.clave(r) === claveSeleccionada);
    const destino = actual < 0 ? 0 : Math.min(Math.max(actual + direccion, 0), visibles.length - 1);
    const registro = visibles[destino];
    if (registro && destino !== actual) {
      void seleccionar(config.clave(registro));
    }
  };

  const nuevo = async (): Promise<void> => {
    if (ocupado || !(await puedeDescartar())) {
      return;
    }
    const formularioNuevo = await config.formularioNuevo();
    setAviso(null);
    setClaveSeleccionada(null);
    setEsNuevo(true);
    setFormulario(formularioNuevo);
    setOriginal(formularioNuevo);
  };

  const guardar = async (): Promise<void> => {
    if (ocupado || formulario === null || (!conCambios && !esNuevo)) {
      return;
    }
    setOcupado(true);
    const resultado = await config.guardar(formulario, esNuevo ? null : seleccionado);
    if (!resultado.ok) {
      setOcupado(false);
      setAviso({ tipo: 'error', texto: resultado.error.mensaje });
      return;
    }
    await recargar();
    setOcupado(false);
    mostrar(resultado.datos);
    setAviso({ tipo: 'exito', texto: esNuevo ? 'Registro creado.' : 'Cambios guardados.' });
  };

  const alternarEstado = async (): Promise<void> => {
    if (ocupado || seleccionado === null || esNuevo) {
      return;
    }
    const activar = !config.estaActivo(seleccionado);
    const nombre = config.nombre(seleccionado);
    const confirmado = await confirmar({
      titulo: activar ? 'Reactivar' : 'Inactivar',
      mensaje: activar
        ? `¿Reactivar «${nombre}»?`
        : `¿Inactivar «${nombre}»? No se borra: se puede reactivar después.`,
      textoAceptar: activar ? 'Reactivar' : 'Inactivar',
      textoCancelar: 'Cancelar',
    });
    if (!confirmado) {
      return;
    }
    setOcupado(true);
    const resultado = await config.cambiarEstado(seleccionado, activar);
    if (!resultado.ok) {
      setOcupado(false);
      setAviso({ tipo: 'error', texto: resultado.error.mensaje });
      return;
    }
    await recargar();
    setOcupado(false);
    // Los cambios de la ficha que no se guardaron se conservan.
    setAviso({ tipo: 'exito', texto: activar ? 'Registro reactivado.' : 'Registro inactivado.' });
  };

  const reemplazar = (registro: R, cambios: Partial<F>): void => {
    setRegistros((actuales) =>
      actuales.map((r) => (config.clave(r) === config.clave(registro) ? registro : r)),
    );
    setFormulario((actual) => (actual ? { ...actual, ...cambios } : actual));
    setOriginal((actual) => (actual ? { ...actual, ...cambios } : actual));
  };

  useAtajos(
    {
      nuevoRegistro: () => void nuevo(),
      guardarRegistro: () => void guardar(),
      cambiarEstadoRegistro: () => void alternarEstado(),
    },
    { activo: activa },
  );

  return {
    visibles,
    total: registros.length,
    inactivos: registros.filter((r) => !config.estaActivo(r)).length,
    seleccionado,
    esNuevo,
    formulario,
    conCambios,
    ocupado,
    aviso,
    busqueda,
    mostrarInactivos,
    cambiar: (cambios) => {
      setAviso(null);
      setFormulario((actual) => (actual ? { ...actual, ...cambios } : actual));
    },
    buscar: setBusqueda,
    alternarInactivos: setMostrarInactivos,
    seleccionar,
    moverSeleccion,
    nuevo,
    guardar,
    alternarEstado,
    reemplazar,
  };
}
