import { useMemo, useRef, type ReactNode } from 'react';
import { LARGO_MAXIMO_NOMBRE, LARGO_MAXIMO_TEXTO } from '../../domain/maestros';
import { claveComparacion } from '../../domain/texto';
import { agruparMiles, leerPesos } from '../../shared/formato/moneda';
import {
  TIPOS_IDENTIFICACION,
  TIPOS_PERSONA,
  type ClaseTercero,
  type DatosTercero,
  type Tercero,
  type TipoIdentificacion,
  type TipoPersona,
} from '../../shared/maestros';
import { fallo, type Resultado } from '../../shared/resultado';
import { Aviso } from '../componentes/Aviso';
import { BarraMaestro, resumenMaestro } from '../maestros/BarraMaestro';
import { enfocarPrimerCampo } from '../maestros/foco';
import { TablaMaestro, type ColumnaMaestro } from '../maestros/TablaMaestro';
import { useMaestro, type ConfiguracionMaestro } from '../maestros/useMaestro';
import { invocar } from '../servicios/api';

/**
 * Formulario de la ficha: los valores se guardan tal como se escriben.
 */
interface FormularioTercero {
  /** Código escrito (solo editable al crear). */
  codigo: string;
  /** Código propuesto por el consecutivo al crear. */
  codigoPropuesto: string;
  /** Persona natural o jurídica. */
  tipoPersona: TipoPersona;
  /** Nombre o razón social. */
  nombre: string;
  /** Tipo de identificación. */
  tipoIdentificacion: TipoIdentificacion;
  /** Número de identificación. */
  numeroIdentificacion: string;
  /** Celular. */
  celular: string;
  /** Dirección. */
  direccion: string;
  /** Barrio. */
  barrio: string;
  /** Ciudad. */
  ciudad: string;
  /** Tope de crédito escrito (vacío = sin tope). Solo clientes. */
  topeCredito: string;
}

/**
 * Textos de cada clase de tercero.
 */
const TEXTOS: Readonly<Record<ClaseTercero, { singular: string; plural: string; titulo: string }>> =
  {
    cliente: { singular: 'cliente', plural: 'clientes', titulo: 'Cliente' },
    proveedor: { singular: 'proveedor', plural: 'proveedores', titulo: 'Proveedor' },
  };

/**
 * Convierte un tercero guardado en el formulario de la ficha.
 *
 * @param t - Tercero.
 * @returns Formulario.
 */
function formularioDe(t: Tercero): FormularioTercero {
  return {
    codigo: String(t.codigo),
    codigoPropuesto: '',
    tipoPersona: t.tipoPersona,
    nombre: t.nombre,
    tipoIdentificacion: t.tipoIdentificacion,
    numeroIdentificacion: t.numeroIdentificacion,
    celular: t.celular,
    direccion: t.direccion,
    barrio: t.barrio,
    ciudad: t.ciudad,
    topeCredito: t.topeCredito === null ? '' : agruparMiles(t.topeCredito),
  };
}

/**
 * Lee los datos escritos en la ficha.
 *
 * @param f - Formulario.
 * @param clase - Cliente o proveedor.
 * @returns Datos listos para enviar o un error de validación local.
 */
function leerFormulario(f: FormularioTercero, clase: ClaseTercero): Resultado<DatosTercero> {
  let topeCredito: number | null = null;
  if (clase === 'cliente' && f.topeCredito.trim() !== '') {
    topeCredito = leerPesos(f.topeCredito);
    if (topeCredito === null) {
      return fallo(
        'VALIDACION',
        'El tope de crédito no es un valor válido en pesos. Déjelo vacío si no tiene tope.',
      );
    }
  }
  return {
    ok: true,
    datos: {
      tipoPersona: f.tipoPersona,
      nombre: f.nombre,
      tipoIdentificacion: f.tipoIdentificacion,
      numeroIdentificacion: f.numeroIdentificacion,
      celular: f.celular,
      direccion: f.direccion,
      barrio: f.barrio,
      ciudad: f.ciudad,
      topeCredito,
    },
  };
}

/**
 * Crea la configuración del maestro para una clase de tercero.
 *
 * @param clase - Cliente o proveedor.
 * @returns Configuración.
 */
function configuracion(clase: ClaseTercero): ConfiguracionMaestro<Tercero, FormularioTercero> {
  return {
    listar: () => invocar('terceros:listar', clase),
    clave: (t) => t.codigo,
    estaActivo: (t) => t.activo,
    nombre: (t) => `${t.codigo} - ${t.nombre}`,
    coincide: (t, texto) =>
      String(t.codigo).startsWith(texto) ||
      t.numeroIdentificacion.startsWith(texto) ||
      claveComparacion(t.nombre).includes(texto),
    formularioDe,
    formularioNuevo: async () => {
      const siguiente = await invocar('terceros:siguienteCodigo', clase);
      const codigo = siguiente.ok ? String(siguiente.datos) : '';
      return {
        codigo,
        codigoPropuesto: codigo,
        tipoPersona: 'natural',
        nombre: '',
        tipoIdentificacion: 'CC',
        numeroIdentificacion: '',
        celular: '',
        direccion: '',
        barrio: '',
        ciudad: '',
        topeCredito: '',
      };
    },
    guardar: async (f, seleccionado) => {
      const datos = leerFormulario(f, clase);
      if (!datos.ok) {
        return datos;
      }
      if (seleccionado) {
        return invocar('terceros:editar', {
          clase,
          codigo: seleccionado.codigo,
          datos: datos.datos,
        });
      }
      const codigoEscrito = f.codigo.trim();
      let codigo: number | null = null;
      if (codigoEscrito !== f.codigoPropuesto) {
        codigo = Number(codigoEscrito);
        if (!/^\d+$/.test(codigoEscrito) || codigo <= 0) {
          return fallo('VALIDACION', 'El código debe ser un número entero mayor que cero.');
        }
      }
      return invocar('terceros:crear', { clase, datos: { ...datos.datos, codigo } });
    },
    cambiarEstado: (t, activo) =>
      invocar('terceros:cambiarEstado', { clase, id: t.codigo, activo }),
  };
}

/**
 * Columnas de la lista; dirección, ciudad y tope aparecen si la ventana se agranda.
 *
 * @param clase - Cliente o proveedor.
 * @returns Columnas.
 */
function columnas(clase: ClaseTercero): ColumnaMaestro<Tercero>[] {
  const lista: ColumnaMaestro<Tercero>[] = [
    { titulo: 'Código', clase: 'num', valor: (t) => t.codigo },
    {
      titulo: 'Nombre',
      clase: 'col-nombre',
      valor: (t) => (
        <>
          {t.nombre}
          {!t.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
        </>
      ),
    },
    {
      titulo: 'Identificación',
      valor: (t) => `${t.tipoIdentificacion} ${t.numeroIdentificacion}`,
    },
    { titulo: 'Celular', valor: (t) => t.celular },
    { titulo: 'Dirección', extra: true, valor: (t) => t.direccion },
    { titulo: 'Ciudad', extra: true, valor: (t) => t.ciudad },
  ];
  if (clase === 'cliente') {
    lista.push({
      titulo: 'Tope crédito',
      clase: 'num',
      extra: true,
      valor: (t) => (t.topeCredito === null ? 'Sin tope' : agruparMiles(t.topeCredito)),
    });
  }
  return lista;
}

/**
 * Propiedades de {@link Terceros}.
 */
interface PropiedadesTerceros {
  /** Cliente o proveedor. */
  clase: ClaseTercero;
}

/**
 * Ventana del maestro de clientes o de proveedores (§5.2, §5.3): comparten
 * los mismos datos; el tope de crédito solo aplica a clientes (D-38).
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
export function Terceros({ clase }: PropiedadesTerceros): ReactNode {
  const config = useMemo(() => configuracion(clase), [clase]);
  const cols = useMemo(() => columnas(clase), [clase]);
  const maestro = useMaestro(config);
  const { formulario: f, seleccionado, esNuevo } = maestro;
  const ficha = useRef<HTMLDivElement>(null);
  const textos = TEXTOS[clase];
  const bloqueado = !esNuevo && (seleccionado?.esSistema ?? false);

  return (
    <>
      <BarraMaestro
        alNuevo={() => void maestro.nuevo()}
        alGuardar={() => void maestro.guardar()}
        alCambiarEstado={() => void maestro.alternarEstado()}
        puedeGuardar={
          !maestro.ocupado && !bloqueado && f !== null && (maestro.conCambios || esNuevo)
        }
        activoSeleccionado={esNuevo || !seleccionado || bloqueado ? null : seleccionado.activo}
        busqueda={maestro.busqueda}
        alBuscar={maestro.buscar}
        ayudaBusqueda="Buscar por código, nombre o identificación…"
        mostrarInactivos={maestro.mostrarInactivos}
        alMostrarInactivos={maestro.alternarInactivos}
        resumen={resumenMaestro(maestro.total, maestro.inactivos, textos.singular, textos.plural)}
      />
      <div className="maestro">
        <div className="maestro__lista">
          <TablaMaestro
            columnas={cols}
            registros={maestro.visibles}
            clave={(t) => t.codigo}
            estaActivo={(t) => t.activo}
            seleccionada={esNuevo ? null : (seleccionado?.codigo ?? null)}
            alSeleccionar={(c) => void maestro.seleccionar(c)}
            alMover={maestro.moverSeleccion}
            alAceptar={() => enfocarPrimerCampo(ficha.current)}
            textoVacio={`No hay ${textos.plural}. Use «Nuevo» o el importador.`}
          />
        </div>

        <div className="ficha" ref={ficha}>
          {f === null ? (
            <p className="ficha__vacia">Seleccione un {textos.singular} o cree uno nuevo.</p>
          ) : (
            <>
              <h2 className="ficha__encabezado">
                {esNuevo ? `${textos.titulo} nuevo` : `${textos.titulo} ${f.codigo}`}
                {!esNuevo && seleccionado && (
                  <span
                    className={`etiqueta ${seleccionado.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}
                  >
                    {seleccionado.activo ? 'Activo' : 'Inactivo'}
                  </span>
                )}
              </h2>
              {bloqueado && (
                <Aviso tipo="alerta">
                  Este registro lo crea el sistema para las ventas sin cliente identificado y no se
                  puede modificar.
                </Aviso>
              )}

              <fieldset className="grupo" disabled={bloqueado}>
                <legend>Identificación</legend>
                <div className="ficha__fila">
                  <label className="campo campo--num">
                    <span>Código{esNuevo ? ' *' : ''}</span>
                    <input
                      value={f.codigo}
                      readOnly={!esNuevo}
                      inputMode="numeric"
                      title={esNuevo ? 'Propuesto por el consecutivo; se puede cambiar' : undefined}
                      onChange={(e) => maestro.cambiar({ codigo: e.target.value })}
                    />
                  </label>
                  <label className="campo">
                    <span>Tipo de persona *</span>
                    <select
                      value={f.tipoPersona}
                      onChange={(e) =>
                        maestro.cambiar({ tipoPersona: e.target.value as TipoPersona })
                      }
                    >
                      {TIPOS_PERSONA.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="campo">
                  <span>
                    {f.tipoPersona === 'juridica' ? 'Razón social *' : 'Nombre completo *'}
                  </span>
                  <input
                    value={f.nombre}
                    maxLength={LARGO_MAXIMO_NOMBRE}
                    onChange={(e) => maestro.cambiar({ nombre: e.target.value })}
                  />
                </label>
                <div className="ficha__fila">
                  <label className="campo">
                    <span>Tipo de identificación *</span>
                    <select
                      value={f.tipoIdentificacion}
                      onChange={(e) =>
                        maestro.cambiar({
                          tipoIdentificacion: e.target.value as TipoIdentificacion,
                        })
                      }
                    >
                      {TIPOS_IDENTIFICACION.map((t) => (
                        <option key={t.valor} value={t.valor}>
                          {t.etiqueta}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Número *</span>
                    <input
                      value={f.numeroIdentificacion}
                      title={
                        f.tipoIdentificacion === 'NIT'
                          ? 'Con o sin dígito de verificación, sin puntos'
                          : 'Sin puntos'
                      }
                      onChange={(e) => maestro.cambiar({ numeroIdentificacion: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="grupo" disabled={bloqueado}>
                <legend>Contacto</legend>
                <label className="campo">
                  <span>Celular *</span>
                  <input
                    value={f.celular}
                    inputMode="tel"
                    onChange={(e) => maestro.cambiar({ celular: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span>Dirección *</span>
                  <input
                    value={f.direccion}
                    maxLength={LARGO_MAXIMO_TEXTO}
                    onChange={(e) => maestro.cambiar({ direccion: e.target.value })}
                  />
                </label>
                <div className="ficha__fila">
                  <label className="campo">
                    <span>Barrio</span>
                    <input
                      value={f.barrio}
                      maxLength={LARGO_MAXIMO_TEXTO}
                      onChange={(e) => maestro.cambiar({ barrio: e.target.value })}
                    />
                  </label>
                  <label className="campo">
                    <span>Ciudad</span>
                    <input
                      value={f.ciudad}
                      maxLength={LARGO_MAXIMO_TEXTO}
                      onChange={(e) => maestro.cambiar({ ciudad: e.target.value })}
                    />
                  </label>
                </div>
              </fieldset>

              {clase === 'cliente' && (
                <fieldset className="grupo" disabled={bloqueado}>
                  <legend>Crédito</legend>
                  <label className="campo campo--num">
                    <span>Tope de crédito ($)</span>
                    <input
                      value={f.topeCredito}
                      inputMode="numeric"
                      placeholder="Sin tope"
                      onChange={(e) => maestro.cambiar({ topeCredito: e.target.value })}
                    />
                    <span className="campo__ayuda">Déjelo vacío si el cliente no tiene tope.</span>
                  </label>
                </fieldset>
              )}

              {maestro.aviso && <Aviso tipo={maestro.aviso.tipo}>{maestro.aviso.texto}</Aviso>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
