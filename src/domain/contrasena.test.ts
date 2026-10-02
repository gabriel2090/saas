import { describe, expect, it } from 'vitest';
import { LARGO_MAXIMO_CONTRASENA, validarContrasenaNueva } from './contrasena';
import { ErrorDeNegocio } from './errores';

describe('validarContrasenaNueva', () => {
  it('acepta contraseñas de 4 caracteres o más', () => {
    expect(() => validarContrasenaNueva('1234')).not.toThrow();
    expect(() => validarContrasenaNueva('una frase larga')).not.toThrow();
  });

  it('rechaza contraseñas vacías o cortas', () => {
    expect(() => validarContrasenaNueva('')).toThrow(ErrorDeNegocio);
    expect(() => validarContrasenaNueva('123')).toThrow(/al menos 4/);
  });

  it('rechaza contraseñas demasiado largas', () => {
    expect(() => validarContrasenaNueva('a'.repeat(LARGO_MAXIMO_CONTRASENA + 1))).toThrow(
      ErrorDeNegocio,
    );
  });

  it('rechaza espacios al inicio o al final', () => {
    expect(() => validarContrasenaNueva(' 1234')).toThrow(/espacios/);
    expect(() => validarContrasenaNueva('1234 ')).toThrow(/espacios/);
  });
});
