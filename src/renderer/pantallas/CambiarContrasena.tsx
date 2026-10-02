import { useState, type FormEvent, type ReactNode } from 'react';
import { invocar } from '../servicios/api';
import { useVentana } from '../ventanas/ContextoVentana';

/**
 * Mensaje que se muestra bajo el formulario.
 */
type Aviso = { tipo: 'error' | 'exito'; texto: string } | null;

/**
 * Ventana para cambiar la contraseña única de acceso. Exige la contraseña
 * actual; el cambio queda registrado en el historial de cambios.
 *
 * @returns El formulario.
 */
export function CambiarContrasena(): ReactNode {
  const { marcarCambios } = useVentana();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [guardando, setGuardando] = useState(false);

  const actualizar = (setter: (valor: string) => void, valor: string, otros: string[]): void => {
    setter(valor);
    setAviso(null);
    marcarCambios([valor, ...otros].some((v) => v !== ''));
  };

  const guardar = async (evento: FormEvent): Promise<void> => {
    evento.preventDefault();
    if (nueva !== confirmacion) {
      setAviso({ tipo: 'error', texto: 'La confirmación no coincide con la contraseña nueva.' });
      return;
    }
    setGuardando(true);
    const resultado = await invocar('autenticacion:cambiar', { actual, nueva });
    setGuardando(false);
    if (!resultado.ok) {
      setAviso({ tipo: 'error', texto: resultado.error.mensaje });
      return;
    }
    setActual('');
    setNueva('');
    setConfirmacion('');
    marcarCambios(false);
    setAviso({ tipo: 'exito', texto: 'La contraseña se cambió correctamente.' });
  };

  return (
    <form className="formulario" onSubmit={(e) => void guardar(e)}>
      <label className="campo">
        <span>Contraseña actual</span>
        <input
          type="password"
          value={actual}
          autoComplete="current-password"
          onChange={(e) => actualizar(setActual, e.target.value, [nueva, confirmacion])}
        />
      </label>
      <label className="campo">
        <span>Contraseña nueva</span>
        <input
          type="password"
          value={nueva}
          autoComplete="new-password"
          onChange={(e) => actualizar(setNueva, e.target.value, [actual, confirmacion])}
        />
      </label>
      <label className="campo">
        <span>Confirmar contraseña nueva</span>
        <input
          type="password"
          value={confirmacion}
          autoComplete="new-password"
          onChange={(e) => actualizar(setConfirmacion, e.target.value, [actual, nueva])}
        />
      </label>
      {aviso && (
        <p
          className={aviso.tipo === 'error' ? 'aviso aviso--error' : 'aviso aviso--exito'}
          role="status"
        >
          {aviso.texto}
        </p>
      )}
      <div className="formulario__acciones">
        <button type="submit" className="boton boton--primario" disabled={guardando}>
          Guardar
        </button>
      </div>
    </form>
  );
}
