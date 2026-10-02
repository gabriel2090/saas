import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ATAJOS } from '../../shared/keymap';
import type { DatosNegocio as Datos } from '../../shared/maestros';
import type { ImpresoraSistema } from '../../shared/ventas';
import { textoCombinacion } from '../atajos/combinacion';
import { useAtajos } from '../atajos/useAtajos';
import { Aviso } from '../componentes/Aviso';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Mensaje que se muestra bajo el formulario.
 */
type AvisoFormulario = { tipo: 'error' | 'exito'; texto: string } | null;

/**
 * Campos del formulario con su etiqueta y si son obligatorios.
 */
const CAMPOS: readonly { clave: keyof Datos; etiqueta: string; obligatorio: boolean }[] = [
  { clave: 'nombre', etiqueta: 'Nombre del negocio', obligatorio: true },
  { clave: 'nit', etiqueta: 'NIT (con dígito de verificación)', obligatorio: true },
  { clave: 'regimen', etiqueta: 'Régimen', obligatorio: true },
  { clave: 'direccion', etiqueta: 'Dirección', obligatorio: false },
  { clave: 'telefono', etiqueta: 'Teléfono', obligatorio: false },
];

/**
 * Valor del selector de impresora que significa «usar el diálogo de Windows».
 */
const SIN_IMPRESORA = '';

/**
 * Configuración de la facturación tal como se edita en pantalla.
 */
interface FormularioFacturacion {
  /** Próximo número de factura, como texto escrito. */
  siguienteNumero: string;
  /** Impresora elegida, o {@link SIN_IMPRESORA}. */
  impresora: string;
}

/**
 * Ventana de los datos del negocio que encabezan la factura (D-12, F-01) y
 * de la configuración de la facturación: próximo número de factura (D-84) e
 * impresora térmica (D-88). Se guarda con el botón o con el atajo de guardar
 * del keymap.
 *
 * @returns El formulario.
 */
export function DatosNegocio(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const [original, setOriginal] = useState<Datos | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [facturacionOriginal, setFacturacionOriginal] = useState<FormularioFacturacion | null>(
    null,
  );
  const [facturacion, setFacturacion] = useState<FormularioFacturacion | null>(null);
  const [ultimoNumero, setUltimoNumero] = useState<number | null>(null);
  const [impresoras, setImpresoras] = useState<ImpresoraSistema[]>([]);
  const [aviso, setAviso] = useState<AvisoFormulario>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void Promise.all([
      invocar('negocio:obtener', undefined),
      invocar('facturacion:configuracion', undefined),
      invocar('facturacion:impresoras', undefined),
    ]).then(([negocio, configuracion, lista]) => {
      if (!negocio.ok) {
        setAviso({ tipo: 'error', texto: negocio.error.mensaje });
        return;
      }
      if (!configuracion.ok) {
        setAviso({ tipo: 'error', texto: configuracion.error.mensaje });
        return;
      }
      const formulario: FormularioFacturacion = {
        siguienteNumero: String(configuracion.datos.siguienteNumero),
        impresora: configuracion.datos.impresora ?? SIN_IMPRESORA,
      };
      setOriginal(negocio.datos);
      setDatos(negocio.datos);
      setFacturacionOriginal(formulario);
      setFacturacion(formulario);
      setUltimoNumero(configuracion.datos.ultimoNumero);
      if (lista.ok) {
        setImpresoras(lista.datos);
      } else {
        setAviso({ tipo: 'error', texto: lista.error.mensaje });
      }
    });
  }, []);

  const negocioCambiado = datos !== null && JSON.stringify(datos) !== JSON.stringify(original);
  const facturacionCambiada =
    facturacion !== null && JSON.stringify(facturacion) !== JSON.stringify(facturacionOriginal);
  const conCambios = negocioCambiado || facturacionCambiada;
  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  const guardar = async (evento?: FormEvent): Promise<void> => {
    evento?.preventDefault();
    if (datos === null || facturacion === null || guardando || !conCambios) {
      return;
    }
    const siguienteNumero = /^\d+$/.test(facturacion.siguienteNumero.trim())
      ? Number(facturacion.siguienteNumero.trim())
      : null;
    if (siguienteNumero === null || !Number.isSafeInteger(siguienteNumero)) {
      setAviso({
        tipo: 'error',
        texto: 'La próxima factura debe ser un número entero, sin puntos ni comas.',
      });
      return;
    }
    setGuardando(true);
    if (negocioCambiado) {
      const resultado = await invocar('negocio:guardar', datos);
      if (!resultado.ok) {
        setGuardando(false);
        setAviso({ tipo: 'error', texto: resultado.error.mensaje });
        return;
      }
      setOriginal(resultado.datos);
      setDatos(resultado.datos);
    }
    if (facturacionCambiada) {
      const resultado = await invocar('facturacion:configurar', {
        siguienteNumero,
        impresora: facturacion.impresora === SIN_IMPRESORA ? null : facturacion.impresora,
      });
      if (!resultado.ok) {
        setGuardando(false);
        setAviso({ tipo: 'error', texto: resultado.error.mensaje });
        return;
      }
      const formulario: FormularioFacturacion = {
        siguienteNumero: String(resultado.datos.siguienteNumero),
        impresora: resultado.datos.impresora ?? SIN_IMPRESORA,
      };
      setFacturacionOriginal(formulario);
      setFacturacion(formulario);
      setUltimoNumero(resultado.datos.ultimoNumero);
    }
    setGuardando(false);
    setAviso({ tipo: 'exito', texto: 'Datos del negocio guardados.' });
  };

  useAtajos({ guardarRegistro: () => void guardar() }, { activo: activa });

  if (datos === null || facturacion === null) {
    return aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null;
  }

  const impresoraNoInstalada =
    facturacion.impresora !== SIN_IMPRESORA &&
    !impresoras.some((i) => i.nombre === facturacion.impresora);

  return (
    <form className="formulario" onSubmit={(e) => void guardar(e)}>
      <p className="campo__ayuda">Estos datos se imprimen en el encabezado de cada factura.</p>
      {CAMPOS.map((c) => (
        <label key={c.clave} className="campo">
          <span>
            {c.etiqueta}
            {c.obligatorio ? ' *' : ''}
          </span>
          <input
            value={datos[c.clave]}
            onChange={(e) => {
              setAviso(null);
              setDatos({ ...datos, [c.clave]: e.target.value });
            }}
          />
        </label>
      ))}

      <h3 className="formulario__seccion">Facturación</h3>
      <label className="campo campo--num">
        <span>Próxima factura No. *</span>
        <input
          inputMode="numeric"
          value={facturacion.siguienteNumero}
          onChange={(e) => {
            setAviso(null);
            setFacturacion({ ...facturacion, siguienteNumero: e.target.value });
          }}
        />
        <span className="campo__ayuda">
          {ultimoNumero === null
            ? 'Aún no hay facturas: escriba el número con que debe empezar.'
            : `La última factura fue la No. ${ultimoNumero}; la próxima debe ser mayor.`}
        </span>
      </label>
      <label className="campo">
        <span>Impresora térmica (tirilla de 80 mm)</span>
        <select
          value={facturacion.impresora}
          onChange={(e) => {
            setAviso(null);
            setFacturacion({ ...facturacion, impresora: e.target.value });
          }}
        >
          <option value={SIN_IMPRESORA}>Preguntar con el diálogo de impresión de Windows</option>
          {impresoras.map((i) => (
            <option key={i.nombre} value={i.nombre}>
              {i.nombreVisible}
            </option>
          ))}
          {impresoraNoInstalada && (
            <option value={facturacion.impresora}>{facturacion.impresora} (no instalada)</option>
          )}
        </select>
        <span className="campo__ayuda">
          Con impresora elegida, la factura se imprime al guardarla sin preguntar.
        </span>
      </label>

      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="formulario__acciones">
        <button type="submit" className="boton boton--primario" disabled={guardando || !conCambios}>
          Guardar
          <span className="atajo">{textoCombinacion(ATAJOS.guardarRegistro.combinacion)}</span>
        </button>
      </div>
    </form>
  );
}
