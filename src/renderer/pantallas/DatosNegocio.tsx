import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ATAJOS } from '../../shared/keymap';
import type { DatosNegocio as Datos } from '../../shared/maestros';
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
 * Ventana de los datos del negocio que encabezan la factura (D-12, F-01).
 * Se guarda con el botón o con el atajo de guardar del keymap.
 *
 * @returns El formulario.
 */
export function DatosNegocio(): ReactNode {
  const { activa, marcarCambios } = useVentana();
  const [original, setOriginal] = useState<Datos | null>(null);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [aviso, setAviso] = useState<AvisoFormulario>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    void invocar('negocio:obtener', undefined).then((r) => {
      if (r.ok) {
        setOriginal(r.datos);
        setDatos(r.datos);
      } else {
        setAviso({ tipo: 'error', texto: r.error.mensaje });
      }
    });
  }, []);

  const conCambios = datos !== null && JSON.stringify(datos) !== JSON.stringify(original);
  useEffect(() => {
    marcarCambios(conCambios);
  }, [conCambios, marcarCambios]);

  const guardar = async (evento?: FormEvent): Promise<void> => {
    evento?.preventDefault();
    if (datos === null || guardando || !conCambios) {
      return;
    }
    setGuardando(true);
    const resultado = await invocar('negocio:guardar', datos);
    setGuardando(false);
    if (!resultado.ok) {
      setAviso({ tipo: 'error', texto: resultado.error.mensaje });
      return;
    }
    setOriginal(resultado.datos);
    setDatos(resultado.datos);
    setAviso({ tipo: 'exito', texto: 'Datos del negocio guardados.' });
  };

  useAtajos({ guardarRegistro: () => void guardar() }, { activo: activa });

  if (datos === null) {
    return aviso ? <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso> : null;
  }

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
