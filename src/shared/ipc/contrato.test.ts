import { describe, expect, it } from 'vitest';
import { CANALES_IPC, type CanalIpc } from './contrato';

/**
 * Todos los canales del contrato. Si se agrega un canal a `ContratoIpc` y
 * no aquí, TypeScript marca error; si no se agrega a `CANALES_IPC`, falla la prueba.
 */
const TODOS_LOS_CANALES = {
  'autenticacion:estado': true,
  'autenticacion:crear': true,
  'autenticacion:ingresar': true,
  'autenticacion:cambiar': true,
  'sistema:info': true,
  'sistema:registrarError': true,
  'app:confirmarCierre': true,
} as const satisfies Record<CanalIpc, true>;

describe('lista blanca de canales IPC', () => {
  it('coincide exactamente con el contrato', () => {
    expect([...CANALES_IPC].sort()).toEqual(Object.keys(TODOS_LOS_CANALES).sort());
  });
});
