import { describe, expect, it } from 'vitest';
import { calcularHashContrasena, verificarContrasena } from './hash-contrasena';

describe('hash de contraseña (scrypt)', () => {
  it('verifica la contraseña correcta y rechaza la incorrecta', () => {
    const hash = calcularHashContrasena('clave segura');
    expect(verificarContrasena('clave segura', hash)).toBe(true);
    expect(verificarContrasena('clave Segura', hash)).toBe(false);
    expect(verificarContrasena('', hash)).toBe(false);
  });

  it('usa sal aleatoria: la misma contraseña produce hashes distintos', () => {
    expect(calcularHashContrasena('1234')).not.toBe(calcularHashContrasena('1234'));
  });

  it('no guarda la contraseña en claro y declara sus parámetros', () => {
    const hash = calcularHashContrasena('mi-clave');
    expect(hash).not.toContain('mi-clave');
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/);
  });

  it('rechaza hashes mal formados sin lanzar excepciones', () => {
    expect(verificarContrasena('x', '')).toBe(false);
    expect(verificarContrasena('x', 'bcrypt$1$2$3$a$b')).toBe(false);
    expect(verificarContrasena('x', 'scrypt$abc$8$1$c2Fs$aGFzaA==')).toBe(false);
    expect(verificarContrasena('x', 'scrypt$16384$8$1$c2Fs$')).toBe(false);
  });
});
