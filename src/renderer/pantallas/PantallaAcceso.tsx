import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavegacionFlechas } from '../atajos/navegacion';
import { Aviso } from '../componentes/Aviso';
import { MostrarClaveRecuperacion } from '../componentes/MostrarClaveRecuperacion';
import { invocar } from '../servicios/api';

/**
 * Paso de la pantalla de acceso:
 * - `crear`: primer arranque, se crea la contraseña (D-01).
 * - `ingresar`: se escribe la contraseña.
 * - `restablecer`: se usa la clave de recuperación para poner una contraseña nueva.
 * - `ofrecerClave`: la instalación no tiene clave de recuperación y se ofrece generarla.
 * - `mostrarClave`: se muestra la clave recién generada (una sola vez).
 */
type Paso = 'cargando' | 'crear' | 'ingresar' | 'restablecer' | 'ofrecerClave' | 'mostrarClave';

/**
 * Propiedades de {@link PantallaAcceso}.
 */
interface PropiedadesPantallaAcceso {
  /** Se llama cuando el usuario ingresó correctamente. */
  alIngresar: () => void;
}

/**
 * Pantalla de contraseña única al iniciar. En el primer arranque pide crear
 * la contraseña y muestra la clave de recuperación (D-22); después pide la
 * contraseña y permite restablecerla con la clave.
 *
 * @param props - Propiedades del componente.
 * @returns La pantalla de acceso.
 */
export function PantallaAcceso({ alIngresar }: PropiedadesPantallaAcceso): ReactNode {
  const [paso, setPaso] = useState<Paso>('cargando');
  const [tieneClave, setTieneClave] = useState(false);
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [clave, setClave] = useState('');
  const [claveGenerada, setClaveGenerada] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const formulario = useRef<HTMLFormElement>(null);
  const primerCampo = useRef<HTMLInputElement>(null);

  useNavegacionFlechas(formulario, paso !== 'cargando' && paso !== 'mostrarClave');

  useEffect(() => {
    void invocar('autenticacion:estado', undefined).then((resultado) => {
      if (resultado.ok) {
        setTieneClave(resultado.datos.tieneClaveRecuperacion);
        setPaso(resultado.datos.tieneContrasena ? 'ingresar' : 'crear');
      } else {
        setError(resultado.error.mensaje);
      }
    });
  }, []);

  useEffect(() => {
    primerCampo.current?.focus();
  }, [paso]);

  const cambiarPaso = (nuevo: Paso): void => {
    setPaso(nuevo);
    setContrasena('');
    setConfirmacion('');
    setClave('');
    setError(null);
  };

  const mostrarClave = (generada: string): void => {
    setClaveGenerada(generada);
    cambiarPaso('mostrarClave');
  };

  const enviar = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    if ((paso === 'crear' || paso === 'restablecer') && contrasena !== confirmacion) {
      setError('La confirmación no coincide con la contraseña.');
      return;
    }
    setEnviando(true);
    try {
      if (paso === 'crear') {
        const resultado = await invocar('autenticacion:crear', contrasena);
        if (resultado.ok) {
          mostrarClave(resultado.datos.claveRecuperacion);
          return;
        }
        setError(resultado.error.mensaje);
      } else if (paso === 'restablecer') {
        const resultado = await invocar('autenticacion:restablecer', {
          clave,
          nueva: contrasena,
        });
        if (resultado.ok) {
          mostrarClave(resultado.datos.claveRecuperacion);
          return;
        }
        setError(resultado.error.mensaje);
      } else {
        const resultado = await invocar('autenticacion:ingresar', contrasena);
        if (resultado.ok) {
          if (tieneClave) {
            alIngresar();
          } else {
            cambiarPaso('ofrecerClave');
          }
          return;
        }
        setError(resultado.error.mensaje);
      }
      setContrasena('');
      setConfirmacion('');
      primerCampo.current?.focus();
    } finally {
      setEnviando(false);
    }
  };

  const generarClave = async (): Promise<void> => {
    setEnviando(true);
    const resultado = await invocar('autenticacion:generarClave', undefined);
    setEnviando(false);
    if (resultado.ok) {
      mostrarClave(resultado.datos.claveRecuperacion);
    } else {
      setError(resultado.error.mensaje);
    }
  };

  if (paso === 'mostrarClave') {
    return (
      <main className="acceso">
        <div className="acceso__tarjeta">
          <h1 className="acceso__titulo">Clave de recuperación</h1>
          <MostrarClaveRecuperacion clave={claveGenerada} alConfirmar={alIngresar} />
        </div>
      </main>
    );
  }

  const conConfirmacion = paso === 'crear' || paso === 'restablecer';

  return (
    <main className="acceso">
      <form ref={formulario} className="acceso__tarjeta" onSubmit={(e) => void enviar(e)}>
        <h1 className="acceso__titulo">
          {paso === 'restablecer' ? 'Restablecer contraseña' : 'Inventario y Facturación'}
        </h1>
        {paso === 'cargando' && !error && <p className="texto-tenue">Cargando…</p>}
        {paso === 'crear' && (
          <p className="texto-tenue">
            Es el primer inicio del sistema. Cree la contraseña de acceso.
          </p>
        )}
        {paso === 'restablecer' && (
          <p className="texto-tenue">
            Escriba la clave de recuperación que guardó al crear la contraseña y elija una
            contraseña nueva.
          </p>
        )}
        {paso === 'ofrecerClave' && (
          <p>
            Este equipo aún no tiene clave de recuperación. Sin ella, si olvida la contraseña tendrá
            que llamar a soporte. ¿Desea generarla ahora?
          </p>
        )}

        {paso === 'restablecer' && (
          <label className="campo">
            <span>Clave de recuperación</span>
            <input
              ref={primerCampo}
              value={clave}
              placeholder="ABCD-EFGH-JKLM-NPQR-STUV-WXYZ"
              autoComplete="off"
              onChange={(e) => {
                setClave(e.target.value);
                setError(null);
              }}
            />
          </label>
        )}

        {(paso === 'crear' || paso === 'ingresar' || paso === 'restablecer') && (
          <label className="campo">
            <span>{paso === 'ingresar' ? 'Contraseña' : 'Contraseña nueva'}</span>
            <input
              ref={paso === 'restablecer' ? undefined : primerCampo}
              type="password"
              value={contrasena}
              autoComplete={paso === 'ingresar' ? 'current-password' : 'new-password'}
              onChange={(e) => {
                setContrasena(e.target.value);
                setError(null);
              }}
            />
          </label>
        )}
        {conConfirmacion && (
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

        {error && <Aviso tipo="error">{error}</Aviso>}

        {paso === 'ofrecerClave' ? (
          <div className="formulario__acciones">
            <button type="button" className="boton" onClick={alIngresar}>
              Ahora no
            </button>
            <button
              type="button"
              className="boton boton--primario"
              disabled={enviando}
              onClick={() => void generarClave()}
            >
              Generar clave
            </button>
          </div>
        ) : (
          paso !== 'cargando' && (
            <button
              type="submit"
              className="boton boton--primario boton--ancho"
              disabled={enviando}
            >
              {paso === 'crear'
                ? 'Crear contraseña e ingresar'
                : paso === 'restablecer'
                  ? 'Restablecer e ingresar'
                  : 'Ingresar'}
            </button>
          )
        )}

        {paso === 'ingresar' && tieneClave && (
          <button type="button" className="enlace" onClick={() => cambiarPaso('restablecer')}>
            ¿Olvidó la contraseña?
          </button>
        )}
        {paso === 'restablecer' && (
          <button type="button" className="enlace" onClick={() => cambiarPaso('ingresar')}>
            Volver
          </button>
        )}
      </form>
    </main>
  );
}
