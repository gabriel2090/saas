import { useMemo, type ReactNode } from 'react';
import { LARGO_MAXIMO_NOMBRE } from '../../domain/maestros';
import { claveComparacion } from '../../domain/texto';
import type { DatosCatalogo, RegistroCatalogo, TipoCatalogo } from '../../shared/maestros';
import { Aviso } from '../componentes/Aviso';
import { BarraMaestro, resumenMaestro } from '../maestros/BarraMaestro';
import { enfocarPrimerCampo } from '../maestros/foco';
import { TablaMaestro, type ColumnaMaestro } from '../maestros/TablaMaestro';
import { useMaestro, type ConfiguracionMaestro } from '../maestros/useMaestro';
import { invocar } from '../servicios/api';

/**
 * Textos de cada catálogo.
 */
const TEXTOS: Readonly<
  Record<TipoCatalogo, { singular: string; plural: string; titulo: string; nueva: string }>
> = {
  bodega: { singular: 'bodega', plural: 'bodegas', titulo: 'Bodega', nueva: 'Bodega nueva' },
  'forma-pago': {
    singular: 'forma de pago',
    plural: 'formas de pago',
    titulo: 'Forma de pago',
    nueva: 'Forma de pago nueva',
  },
};

/**
 * Crea la configuración del maestro para un catálogo.
 *
 * @param tipo - Catálogo.
 * @returns Configuración.
 */
function configuracion(tipo: TipoCatalogo): ConfiguracionMaestro<RegistroCatalogo, DatosCatalogo> {
  return {
    listar: () => invocar('catalogos:listar', tipo),
    clave: (r) => r.id,
    estaActivo: (r) => r.activo,
    nombre: (r) => r.nombre,
    coincide: (r, texto) => claveComparacion(r.nombre).includes(texto),
    formularioDe: (r) => ({ nombre: r.nombre, calculaCambio: r.calculaCambio }),
    formularioNuevo: () => Promise.resolve({ nombre: '', calculaCambio: false }),
    guardar: (datos, seleccionado) =>
      seleccionado
        ? invocar('catalogos:editar', { tipo, id: seleccionado.id, datos })
        : invocar('catalogos:crear', { tipo, datos }),
    cambiarEstado: (r, activo) => invocar('catalogos:cambiarEstado', { tipo, id: r.id, activo }),
  };
}

/**
 * Columnas de la lista.
 *
 * @param tipo - Catálogo.
 * @returns Columnas.
 */
function columnas(tipo: TipoCatalogo): ColumnaMaestro<RegistroCatalogo>[] {
  const lista: ColumnaMaestro<RegistroCatalogo>[] = [
    {
      titulo: 'Nombre',
      clase: 'col-nombre',
      valor: (r) => (
        <>
          {r.nombre}
          {r.esPrincipal && <span className="etiqueta etiqueta--activo">Principal</span>}
          {!r.activo && <span className="etiqueta etiqueta--inactivo">Inactivo</span>}
        </>
      ),
    },
  ];
  if (tipo === 'forma-pago') {
    lista.push({ titulo: 'Calcula cambio', valor: (r) => (r.calculaCambio ? 'Sí' : 'No') });
  }
  return lista;
}

/**
 * Propiedades de {@link Catalogos}.
 */
interface PropiedadesCatalogos {
  /** Catálogo. */
  tipo: TipoCatalogo;
}

/**
 * Ventana de los catálogos simples (§5.4): bodegas y formas de pago. La
 * bodega Principal no se puede inactivar.
 *
 * @param props - Propiedades del componente.
 * @returns La ventana.
 */
export function Catalogos({ tipo }: PropiedadesCatalogos): ReactNode {
  const config = useMemo(() => configuracion(tipo), [tipo]);
  const cols = useMemo(() => columnas(tipo), [tipo]);
  const maestro = useMaestro(config);
  const { formulario: f, seleccionado, esNuevo } = maestro;
  const { ficha } = maestro;
  const textos = TEXTOS[tipo];
  const esPrincipal = !esNuevo && (seleccionado?.esPrincipal ?? false);

  return (
    <>
      <BarraMaestro
        alNuevo={() => void maestro.nuevo()}
        alGuardar={() => void maestro.guardar()}
        alCambiarEstado={() => void maestro.alternarEstado()}
        puedeGuardar={!maestro.ocupado && f !== null && (maestro.conCambios || esNuevo)}
        activoSeleccionado={esNuevo || !seleccionado || esPrincipal ? null : seleccionado.activo}
        busqueda={maestro.busqueda}
        alBuscar={maestro.buscar}
        ayudaBusqueda="Buscar por nombre…"
        mostrarInactivos={maestro.mostrarInactivos}
        alMostrarInactivos={maestro.alternarInactivos}
        resumen={resumenMaestro(maestro.total, maestro.inactivos, textos.singular, textos.plural)}
      />
      <div className="maestro">
        <div className="maestro__lista">
          <TablaMaestro
            columnas={cols}
            registros={maestro.visibles}
            clave={(r) => r.id}
            estaActivo={(r) => r.activo}
            seleccionada={esNuevo ? null : (seleccionado?.id ?? null)}
            alSeleccionar={(c) => void maestro.seleccionar(c)}
            alMover={maestro.moverSeleccion}
            alAceptar={() => enfocarPrimerCampo(ficha.current)}
            textoVacio={`No hay ${textos.plural}.`}
          />
        </div>

        <div className="ficha" ref={ficha}>
          {f === null ? (
            <p className="ficha__vacia">Seleccione un registro o cree uno nuevo.</p>
          ) : (
            <>
              <h2 className="ficha__encabezado">
                {esNuevo ? textos.nueva : textos.titulo}
                {!esNuevo && seleccionado && (
                  <span
                    className={`etiqueta ${seleccionado.activo ? 'etiqueta--activo' : 'etiqueta--inactivo'}`}
                  >
                    {seleccionado.activo ? 'Activo' : 'Inactivo'}
                  </span>
                )}
              </h2>
              <label className="campo">
                <span>Nombre *</span>
                <input
                  value={f.nombre}
                  maxLength={LARGO_MAXIMO_NOMBRE}
                  onChange={(e) => maestro.cambiar({ nombre: e.target.value })}
                />
              </label>
              {tipo === 'forma-pago' && (
                <label className="casilla">
                  <input
                    type="checkbox"
                    checked={f.calculaCambio}
                    onChange={(e) => maestro.cambiar({ calculaCambio: e.target.checked })}
                  />{' '}
                  Al facturar, calcular el cambio a devolver (efectivo)
                </label>
              )}
              {esPrincipal && (
                <p className="campo__ayuda">
                  La bodega Principal siempre existe: se puede renombrar, pero no inactivar.
                </p>
              )}
              {maestro.aviso && <Aviso tipo={maestro.aviso.tipo}>{maestro.aviso.texto}</Aviso>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
