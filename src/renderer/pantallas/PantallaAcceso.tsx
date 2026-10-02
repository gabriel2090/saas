import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavegacionFlechas } from '../atajos/navegacion';
import { invocar } from '../servicios/api';

/**
 * Modo de la pantalla: crear la contraseña (primer arranque) o ingresarla.
 */
type Modo = 'cargando' | 'crear' | 'ingresar';

/**
 * Propiedades de {@link PantallaAcceso}.
 */
interface PropiedadesPantallaAcceso {
  /** Se llama cuando el usuario ingresó correctamente. */
  alIngresar: () => void;
}

/**
 * Pantalla de contraseña única al iniciar. En el primer arranque pide crear
 * la contraseña (D-01); después, ingresarla.
 *
 * @param props - Propiedades del componente.
 * @returns La pantalla de acceso.
 */
export function PantallaAcceso({ alIngresar }: PropiedadesPantallaAcceso): ReactNode {
  const [modo, setModo] = useState<Modo>('cargando');
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const campoContrasena = useRef<HTMLInputElement>(null);

  useNavegacionFlechas(formulario, modo !== 'cargando');

  useEffect(() => {
    void invocar('autenticacion:estado', undefined).then((resultado) => {
      if (resultado.ok) {
        setModo(resultado.datos.tieneContrasena ? 'ingresar' : 'crear');
      } else {
        setError(resultado.error.mensaje);
      }
    });
  }, []);

  useEffect(() => {
    if (modo !== 'cargando') {
      campoContrasena.current?.focus();
    }
  }, [modo]);

  const enviar = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    if (modo === 'crear' && contrasena !== confirmacion) {
      setError('La confirmación no coincide con la contraseña.');
      return;
    }
    setEnviando(true);
    const resultado = await invocar(
      modo === 'crear' ? 'autenticacion:crear' : 'autenticacion:ingresar',
      contrasena,
    );
    setEnviando(false);
    if (resultado.ok) {
      alIngresar();
      return;
    }
    setError(resultado.error.mensaje);
    setContrasena('');
    setConfirmacion('');
    campoContrasena.current?.focus();
  };

  return (
    <main className="acceso">
      <form ref={formulario} className="acceso__tarjeta" onSubmit={(e) => void enviar(e)}>
        <h1 className="acceso__titulo">Inventario y Facturación</h1>
        {modo === 'cargando' && !error && <p className="texto-tenue">Cargando…</p>}
        {modo === 'crear' && (
          <p className="texto-tenue">
            Es el primer inicio del sistema. Cree la contraseña de acceso.
          </p>
        )}
        {modo !== 'cargando' && (
          <>
            <label className="campo">
              <span>{modo === 'crear' ? 'Contraseña nueva' : 'Contraseña'}</span>
              <input
                ref={campoContrasena}
                type="password"
                value={contrasena}
                autoComplete={modo === 'crear' ? 'new-password' : 'current-password'}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  setError(null);
                }}
              />
            </label>
            {modo === 'crear' && (
              <label className="campo">
                <span>Confirmar contraseña</span>
                <input
                  type="password"
                  value={confirmacion}
                  autoComplete="new-password"
                  onChange={(e) => {
                    setConfirmacion(e.target.value);
                    setError(null);
                  }}
                />
              </label>
            )}
          </>
        )}
        {error && (
          <p className="aviso aviso--error" role="alert">
            {error}
          </p>
        )}
        {modo !== 'cargando' && (
          <button type="submit" className="boton boton--primario boton--ancho" disabled={enviando}>
            {modo === 'crear' ? 'Crear contraseña e ingresar' : 'Ingresar'}
          </button>
        )}
      </form>
    </main>
  );
}
