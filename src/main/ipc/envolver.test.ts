import { describe, expect, it, vi } from 'vitest';
import { ErrorDeNegocio } from '../../domain/errores';
import { MENSAJE_ERROR_INESPERADO } from '../../shared/resultado';
import { ejecutarManejador, type ContextoManejador } from './envolver';

/**
 * Crea un contexto de prueba.
 *
 * @param cambios - Valores a sobrescribir.
 * @returns Contexto del manejador.
 */
function contexto(cambios: Partial<ContextoManejador> = {}): ContextoManejador {
  return {
    canal: 'prueba',
    requiereSesion: false,
    haySesion: () => true,
    registrarError: vi.fn(),
    ...cambios,
  };
}

describe('ejecutarManejador', () => {
  it('envuelve el valor devuelto en un resultado exitoso', () => {
    expect(ejecutarManejador((n: number) => n * 2, 21, contexto())).toEqual({
      ok: true,
      datos: 42,
    });
  });

  it('devuelve el mensaje de un error de negocio sin registrarlo como error técnico', () => {
    const ctx = contexto();
    const resultado = ejecutarManejador(
      () => {
        throw new ErrorDeNegocio('VALIDACION', 'El precio no puede quedar por debajo del costo.');
      },
      undefined,
      ctx,
    );
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: 'VALIDACION', mensaje: 'El precio no puede quedar por debajo del costo.' },
    });
    expect(ctx.registrarError).not.toHaveBeenCalled();
  });

  it('oculta el detalle de los errores técnicos y los registra en el log', () => {
    const ctx = contexto();
    const resultado = ejecutarManejador(
      () => {
        throw new Error('SQLITE_CONSTRAINT: detalle técnico');
      },
      undefined,
      ctx,
    );
    expect(resultado).toEqual({
      ok: false,
      error: { codigo: 'INESPERADO', mensaje: MENSAJE_ERROR_INESPERADO },
    });
    expect(ctx.registrarError).toHaveBeenCalledWith('ipc:prueba', expect.any(Error));
  });

  it('bloquea los canales que exigen sesión si no se ha ingresado', () => {
    const manejador = vi.fn();
    const resultado = ejecutarManejador(
      manejador,
      undefined,
      contexto({ requiereSesion: true, haySesion: () => false }),
    );
    expect(resultado).toMatchObject({ ok: false, error: { codigo: 'NO_AUTORIZADO' } });
    expect(manejador).not.toHaveBeenCalled();
  });

  it('espera a los manejadores asíncronos con el mismo trato de errores', async () => {
    const ctx = contexto();
    await expect(ejecutarManejador(() => Promise.resolve(7), undefined, ctx)).resolves.toEqual({
      ok: true,
      datos: 7,
    });
    await expect(
      ejecutarManejador(
        () => Promise.reject(new ErrorDeNegocio('CONFLICTO', 'Ya está anulado.')),
        undefined,
        ctx,
      ),
    ).resolves.toEqual({ ok: false, error: { codigo: 'CONFLICTO', mensaje: 'Ya está anulado.' } });
    await expect(
      ejecutarManejador(() => Promise.reject(new Error('fallo de impresora')), undefined, ctx),
    ).resolves.toEqual({
      ok: false,
      error: { codigo: 'INESPERADO', mensaje: MENSAJE_ERROR_INESPERADO },
    });
    expect(ctx.registrarError).toHaveBeenCalledTimes(1);
  });
});
