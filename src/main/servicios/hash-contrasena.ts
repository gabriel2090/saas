import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Parámetros de scrypt. N = 2^15 con r = 8 usa ~32 MB y tarda unas decenas
 * de milisegundos: lento para un ataque de fuerza bruta, rápido para el usuario.
 */
const PARAMETROS = { N: 32768, r: 8, p: 1, largo: 64, largoSal: 16 } as const;

/**
 * Memoria máxima permitida a scrypt (debe superar 128 · N · r).
 */
const MEMORIA_MAXIMA = 64 * 1024 * 1024;

/**
 * Prefijo del formato del hash guardado.
 */
const PREFIJO = 'scrypt';

/**
 * Calcula el hash de una contraseña con una sal aleatoria.
 *
 * El resultado incluye los parámetros y la sal, para poder verificarlo
 * aunque los parámetros cambien en versiones futuras:
 * `scrypt$N$r$p$salBase64$hashBase64`.
 *
 * @param contrasena - Contraseña en texto plano.
 * @returns Hash en formato autodescriptivo.
 */
export function calcularHashContrasena(contrasena: string): string {
  const sal = randomBytes(PARAMETROS.largoSal);
  const hash = scryptSync(contrasena, sal, PARAMETROS.largo, {
    N: PARAMETROS.N,
    r: PARAMETROS.r,
    p: PARAMETROS.p,
    maxmem: MEMORIA_MAXIMA,
  });
  return [
    PREFIJO,
    PARAMETROS.N,
    PARAMETROS.r,
    PARAMETROS.p,
    sal.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}

/**
 * Verifica una contraseña contra un hash guardado, en tiempo constante.
 *
 * @param contrasena - Contraseña escrita por el usuario.
 * @param hashGuardado - Hash generado por {@link calcularHashContrasena}.
 * @returns `true` si coincide; `false` si no coincide o el hash está mal formado.
 */
export function verificarContrasena(contrasena: string, hashGuardado: string): boolean {
  const partes = hashGuardado.split('$');
  if (partes.length !== 6 || partes[0] !== PREFIJO) {
    return false;
  }
  const [, nTexto, rTexto, pTexto, salTexto = '', hashTexto = ''] = partes;
  const N = Number(nTexto);
  const r = Number(rTexto);
  const p = Number(pTexto);
  if (![N, r, p].every((v) => Number.isSafeInteger(v) && v > 0)) {
    return false;
  }
  const esperado = Buffer.from(hashTexto, 'base64');
  if (esperado.length === 0) {
    return false;
  }
  const calculado = scryptSync(contrasena, Buffer.from(salTexto, 'base64'), esperado.length, {
    N,
    r,
    p,
    maxmem: MEMORIA_MAXIMA,
  });
  return timingSafeEqual(calculado, esperado);
}
