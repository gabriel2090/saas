import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { sugerirMapeo } from '../../domain/importacion';
import {
  CAMPOS_IMPORTACION,
  FORMATOS_NUMERICOS,
  NOMBRES_IMPORTACION,
  type ErrorFila,
  type FilaImportacion,
  type FormatoNumerico,
  type ResultadoImportacion,
  type ResultadoValidacionImportacion,
  type TipoImportacion,
} from '../../shared/importacion';
import { Aviso } from '../componentes/Aviso';
import { useConfirmar } from '../componentes/Dialogos';
import type * as Lectura from '../importador/lectura';
import type { HojaLeida, LibroLeido } from '../importador/lectura';
import { invocar, registrarErrorRenderer } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Orden sugerido de importación: los productos necesitan a sus proveedores
 * y el stock inicial necesita a los productos.
 */
const ORDEN_TIPOS: readonly TipoImportacion[] = ['proveedores', 'clientes', 'productos', 'stock'];

/**
 * Máximo de filas que se dibujan en la vista previa (el resto se valida e
 * importa igual; solo se evita una tabla gigante en pantalla).
 */
const MAXIMO_FILAS_VISTA = 500;

/**
 * Módulo de lectura de archivos (incluye SheetJS).
 */
type ModuloLectura = typeof Lectura;

/**
 * Carga la lectura de archivos solo cuando se usa el importador: SheetJS
 * pesa más que el resto de la interfaz y no debe demorar el arranque.
 *
 * @returns El módulo de lectura.
 */
const cargarLectura = (): Promise<ModuloLectura> => import('../importador/lectura');

/**
 * Paso del asistente.
 */
type Paso = 'archivo' | 'mapeo' | 'vista' | 'resultado';

/**
 * Pasos en orden con su nombre en pantalla.
 */
const PASOS: readonly { id: Paso; nombre: string }[] = [
  { id: 'archivo', nombre: '1. Archivo' },
  { id: 'mapeo', nombre: '2. Columnas' },
  { id: 'vista', nombre: '3. Vista previa' },
  { id: 'resultado', nombre: '4. Resultado' },
];

/**
 * Ventana del importador CSV/XLSX (D-24 a D-26): elegir tipo y archivo,
 * asignar columnas, revisar la vista previa con los errores por fila e
 * importar solo las filas válidas en una transacción. Los errores se pueden
 * exportar a Excel.
 *
 * @returns El asistente.
 */
export function Importador(): ReactNode {
  const { marcarCambios } = useVentana();
  const confirmar = useConfirmar();
  const [paso, setPaso] = useState<Paso>('archivo');
  const [tipo, setTipo] = useState<TipoImportacion>('proveedores');
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [libro, setLibro] = useState<LibroLeido | null>(null);
  const [nombreHoja, setNombreHoja] = useState('');
  const [hoja, setHoja] = useState<HojaLeida | null>(null);
  const [mapeo, setMapeo] = useState<Record<string, number | null>>({});
  const [formato, setFormato] = useState<FormatoNumerico>('punto-decimal');
  const [filas, setFilas] = useState<FilaImportacion[]>([]);
  const [validacion, setValidacion] = useState<ResultadoValidacionImportacion | null>(null);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [soloErrores, setSoloErrores] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const campos = CAMPOS_IMPORTACION[tipo];
  const etiquetas = useMemo(
    () => Object.fromEntries(campos.map((c) => [c.clave, c.etiqueta])),
    [campos],
  );

  /**
   * Cambia de paso y marca la ventana con cambios mientras haya un archivo sin importar.
   *
   * @param nuevo - Paso destino.
   */
  const irA = (nuevo: Paso): void => {
    setError(null);
    setPaso(nuevo);
    marcarCambios(nuevo === 'mapeo' || nuevo === 'vista');
  };

  /**
   * Abre una hoja y propone la asignación de columnas.
   *
   * @param abierto - Libro abierto.
   * @param nombre - Hoja a leer.
   * @param tipoActual - Tipo de importación.
   */
  const abrirHoja = async (
    abierto: LibroLeido,
    nombre: string,
    tipoActual: TipoImportacion,
  ): Promise<void> => {
    const leida = (await cargarLectura()).leerHoja(abierto.libro, nombre);
    setNombreHoja(nombre);
    setHoja(leida);
    setMapeo(sugerirMapeo(leida.encabezados, CAMPOS_IMPORTACION[tipoActual]));
  };

  const elegirArchivo = async (evento: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const archivo = evento.target.files?.[0];
    evento.target.value = '';
    if (!archivo) {
      return;
    }
    setOcupado(true);
    try {
      const { abrirLibro } = await cargarLectura();
      const abierto = abrirLibro(archivo.name, new Uint8Array(await archivo.arrayBuffer()));
      const primera = abierto.hojas[0];
      if (primera === undefined) {
        setError('El archivo no tiene hojas.');
        return;
      }
      setNombreArchivo(archivo.name);
      setLibro(abierto);
      await abrirHoja(abierto, primera, tipo);
      irA('mapeo');
    } catch (causa) {
      registrarErrorRenderer('importador:leer', causa);
      setError('No se pudo leer el archivo. Verifique que sea un CSV o un libro de Excel válido.');
    } finally {
      setOcupado(false);
    }
  };

  const verVistaPrevia = async (): Promise<void> => {
    if (!hoja) {
      return;
    }
    const faltantes = campos.filter((c) => c.obligatorio && mapeo[c.clave] == null);
    if (faltantes.length > 0) {
      setError(`Asigne una columna a: ${faltantes.map((c) => c.etiqueta).join(', ')}.`);
      return;
    }
    if (hoja.filas.length === 0) {
      setError('La hoja no tiene filas de datos debajo de los encabezados.');
      return;
    }
    const armadas = (await cargarLectura()).armarFilas(hoja, mapeo, formato);
    setOcupado(true);
    const respuesta = await invocar('importador:validar', { tipo, formato, filas: armadas });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error.mensaje);
      return;
    }
    setFilas(armadas);
    setValidacion(respuesta.datos);
    setSoloErrores(respuesta.datos.errores.length + respuesta.datos.avisos.length > 0);
    irA('vista');
  };

  const importar = async (): Promise<void> => {
    if (!validacion || validacion.validas === 0) {
      return;
    }
    const conErrores = validacion.total - validacion.validas;
    const reemplazos = validacion.avisos.length;
    const confirmado = await confirmar({
      titulo: 'Importar',
      mensaje:
        `Se importarán ${validacion.validas} ${NOMBRES_IMPORTACION[tipo].toLowerCase()} en una sola operación` +
        (conErrores > 0 ? ` y se omitirán ${conErrores} filas con errores.` : '.') +
        (reemplazos > 0
          ? ` ${reemplazos === 1 ? 'Una fila reemplaza' : `${reemplazos} filas reemplazan`} el stock inicial cargado antes.`
          : '') +
        ' ¿Continuar?',
      textoAceptar: 'Importar',
      textoCancelar: 'Cancelar',
    });
    if (!confirmado) {
      return;
    }
    setOcupado(true);
    const respuesta = await invocar('importador:importar', { tipo, formato, filas });
    setOcupado(false);
    if (!respuesta.ok) {
      setError(respuesta.error.mensaje);
      return;
    }
    setResultado(respuesta.datos);
    irA('resultado');
  };

  const exportarErrores = async (errores: readonly ErrorFila[]): Promise<void> => {
    if (!hoja) {
      return;
    }
    const contenido = (await cargarLectura()).crearReporteErrores(errores, hoja, etiquetas);
    const base = nombreArchivo.replace(/\.[^.]+$/, '');
    const respuesta = await invocar('importador:guardarReporte', {
      nombreSugerido: `errores-${tipo}-${base}.xlsx`,
      contenido,
    });
    if (!respuesta.ok) {
      setError(respuesta.error.mensaje);
    }
  };

  const reiniciar = (): void => {
    setLibro(null);
    setHoja(null);
    setFilas([]);
    setValidacion(null);
    setResultado(null);
    irA('archivo');
  };

  return (
    <div className="importador">
      <ol className="pasos">
        {PASOS.map((p) => (
          <li key={p.id} className={p.id === paso ? 'pasos__actual' : undefined}>
            {p.nombre}
          </li>
        ))}
      </ol>

      {paso === 'archivo' && (
        <div className="formulario">
          <label className="campo">
            <span>¿Qué va a importar?</span>
            <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoImportacion)}>
              {ORDEN_TIPOS.map((t) => (
                <option key={t} value={t}>
                  {NOMBRES_IMPORTACION[t]}
                </option>
              ))}
            </select>
            <span className="campo__ayuda">
              Importe primero los proveedores, luego los productos y al final el stock inicial.
            </span>
          </label>
          <label className="campo">
            <span>Archivo (CSV o Excel)</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              disabled={ocupado}
              onChange={(e) => void elegirArchivo(e)}
            />
            <span className="campo__ayuda">
              La primera fila debe tener los nombres de las columnas. Los valores en pesos van sin
              centavos. En el paso siguiente indicará cómo están escritos los números.
            </span>
          </label>
        </div>
      )}

      {paso === 'mapeo' && hoja && libro && (
        <div className="formulario">
          <p className="campo__ayuda">
            {nombreArchivo} · {hoja.filas.length} filas con datos. Indique qué columna del archivo
            corresponde a cada dato. Los marcados con * son obligatorios.
          </p>
          {libro.hojas.length > 1 && (
            <label className="campo">
              <span>Hoja</span>
              <select
                value={nombreHoja}
                onChange={(e) => void abrirHoja(libro, e.target.value, tipo)}
              >
                {libro.hojas.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="campo">
            <span>Formato de los números</span>
            <select value={formato} onChange={(e) => setFormato(e.target.value as FormatoNumerico)}>
              {FORMATOS_NUMERICOS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.etiqueta}
                </option>
              ))}
            </select>
            <span className="campo__ayuda">
              Cómo están escritos los decimales y los miles en el archivo. Las celdas numéricas de
              Excel se toman por su valor, sin importar esta opción.
            </span>
          </label>
          <div className="mapeo">
            {campos.map((c) => (
              <label key={c.clave} className="campo">
                <span title={c.ayuda}>
                  {c.etiqueta}
                  {c.obligatorio ? ' *' : ''}
                </span>
                <select
                  value={mapeo[c.clave] ?? ''}
                  onChange={(e) =>
                    setMapeo({
                      ...mapeo,
                      [c.clave]: e.target.value === '' ? null : Number(e.target.value),
                    })
                  }
                >
                  <option value="">— Sin asignar —</option>
                  {hoja.encabezados.map((encabezado, i) => (
                    <option key={i} value={i}>
                      {encabezado === '' ? `Columna ${i + 1}` : encabezado}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="formulario__acciones">
            <button type="button" className="boton" onClick={reiniciar}>
              Elegir otro archivo
            </button>
            <button
              type="button"
              className="boton boton--primario"
              disabled={ocupado}
              onClick={() => void verVistaPrevia()}
            >
              Ver vista previa
            </button>
          </div>
        </div>
      )}

      {paso === 'vista' && validacion && (
        <VistaPrevia
          campos={campos.filter((c) => mapeo[c.clave] != null).map((c) => c.clave)}
          etiquetas={etiquetas}
          filas={filas}
          validacion={validacion}
          soloErrores={soloErrores}
          alCambiarSoloErrores={setSoloErrores}
          error={error}
          ocupado={ocupado}
          alVolver={() => irA('mapeo')}
          alExportar={() => void exportarErrores(validacion.errores)}
          alImportar={() => void importar()}
        />
      )}

      {paso === 'resultado' && resultado && (
        <div className="formulario">
          <Aviso tipo="exito">
            Se importaron {resultado.importadas} {NOMBRES_IMPORTACION[tipo].toLowerCase()}.
            {resultado.omitidas > 0 && ` Se omitieron ${resultado.omitidas} filas con errores.`}
          </Aviso>
          {error && <Aviso tipo="error">{error}</Aviso>}
          <div className="formulario__acciones">
            {resultado.errores.length > 0 && (
              <button
                type="button"
                className="boton"
                onClick={() => void exportarErrores(resultado.errores)}
              >
                Exportar errores
              </button>
            )}
            <button type="button" className="boton boton--primario" onClick={reiniciar}>
              Importar otro archivo
            </button>
          </div>
        </div>
      )}

      {paso === 'archivo' && error && <Aviso tipo="error">{error}</Aviso>}
    </div>
  );
}

/**
 * Agrupa los mensajes por número de fila.
 *
 * @param mensajes - Errores o avisos.
 * @returns Fila → mensajes en orden.
 */
function agruparPorFila(mensajes: readonly ErrorFila[]): Map<number, string[]> {
  const mapa = new Map<number, string[]>();
  for (const m of mensajes) {
    mapa.set(m.fila, [...(mapa.get(m.fila) ?? []), m.mensaje]);
  }
  return mapa;
}

/**
 * Propiedades de {@link VistaPrevia}.
 */
interface PropiedadesVistaPrevia {
  /** Campos asignados (columnas de la tabla). */
  campos: string[];
  /** Campo → nombre en pantalla. */
  etiquetas: Readonly<Record<string, string>>;
  /** Filas armadas. */
  filas: readonly FilaImportacion[];
  /** Resultado de la validación. */
  validacion: ResultadoValidacionImportacion;
  /** Si solo se muestran las filas con errores o avisos. */
  soloErrores: boolean;
  /** Cambia el filtro de errores. */
  alCambiarSoloErrores: (solo: boolean) => void;
  /** Error a mostrar. */
  error: string | null;
  /** Si hay una operación en curso. */
  ocupado: boolean;
  /** Vuelve a la asignación de columnas. */
  alVolver: () => void;
  /** Exporta los errores. */
  alExportar: () => void;
  /** Importa las filas válidas. */
  alImportar: () => void;
}

/**
 * Vista previa: resumen, tabla con los errores marcados por fila y botones
 * para exportar los errores o importar solo las filas válidas (D-26).
 *
 * @param props - Propiedades del componente.
 * @returns La vista previa.
 */
function VistaPrevia(props: PropiedadesVistaPrevia): ReactNode {
  const { validacion } = props;
  const erroresPorFila = useMemo(() => agruparPorFila(validacion.errores), [validacion]);
  const avisosPorFila = useMemo(() => agruparPorFila(validacion.avisos), [validacion]);
  const conErrores = validacion.total - validacion.validas;
  const visibles = props.soloErrores
    ? props.filas.filter((f) => erroresPorFila.has(f.numero) || avisosPorFila.has(f.numero))
    : props.filas;
  const dibujadas = visibles.slice(0, MAXIMO_FILAS_VISTA);

  return (
    <>
      <div className="barra-herramientas">
        <span>
          {validacion.total} filas · <strong>{validacion.validas} válidas</strong>
          {conErrores > 0 && (
            <>
              {' · '}
              <span className="texto-error">{conErrores} con errores</span>
            </>
          )}
        </span>
        <label className="casilla">
          <input
            type="checkbox"
            checked={props.soloErrores}
            onChange={(e) => props.alCambiarSoloErrores(e.target.checked)}
          />{' '}
          {validacion.avisos.length > 0
            ? 'Solo filas con errores o avisos'
            : 'Solo filas con errores'}
        </label>
        <span className="barra-herramientas__resumen">
          {visibles.length > MAXIMO_FILAS_VISTA &&
            `Se muestran las primeras ${MAXIMO_FILAS_VISTA} de ${visibles.length}`}
        </span>
      </div>
      <div className="tabla-contenedor importador__vista">
        <table className="tabla">
          <thead>
            <tr>
              <th className="num">Fila</th>
              {props.campos.map((c) => (
                <th key={c}>{props.etiquetas[c] ?? c}</th>
              ))}
              <th>Errores</th>
            </tr>
          </thead>
          <tbody>
            {dibujadas.map((f) => {
              const errores = erroresPorFila.get(f.numero);
              const avisos = avisosPorFila.get(f.numero);
              let estado = <td className="texto-tenue">Lista</td>;
              if (errores) {
                estado = <td className="texto-error importador__errores">{errores.join(' · ')}</td>;
              } else if (avisos) {
                estado = <td className="texto-alerta importador__errores">{avisos.join(' · ')}</td>;
              }
              return (
                <tr
                  key={f.numero}
                  className={errores ? 'fila--error' : avisos ? 'fila--alerta' : undefined}
                >
                  <td className="num">{f.numero}</td>
                  {props.campos.map((c) => (
                    <td key={c}>{f.valores[c]}</td>
                  ))}
                  {estado}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {props.error && <Aviso tipo="error">{props.error}</Aviso>}
      <div className="formulario__acciones importador__acciones">
        <button type="button" className="boton" onClick={props.alVolver}>
          Volver a las columnas
        </button>
        {conErrores > 0 && (
          <button type="button" className="boton" onClick={props.alExportar}>
            Exportar errores
          </button>
        )}
        <button
          type="button"
          className="boton boton--primario"
          disabled={props.ocupado || validacion.validas === 0}
          onClick={props.alImportar}
        >
          {conErrores > 0
            ? `Importar solo las filas válidas (${validacion.validas})`
            : `Importar ${validacion.validas} filas`}
        </button>
      </div>
    </>
  );
}
