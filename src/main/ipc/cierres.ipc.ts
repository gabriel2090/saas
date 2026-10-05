import type {
  ConteoDenominacion,
  PeticionAnularCierre,
  PeticionGuardarCierre,
} from '../../shared/cierreCaja';
import type { ServicioCierreCaja } from '../servicios/cierreCaja';
import type { RegistrarManejador } from './registrar';
import {
  exigirArreglo,
  exigirEntero,
  exigirEnteroONulo,
  exigirObjeto,
  exigirOpcion,
  exigirTexto,
} from './validacion';

/**
 * Lee y verifica el conteo de billetes y monedas.
 *
 * @param valor - Dato recibido.
 * @returns Conteo, o `null`.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerConteo(valor: unknown): ConteoDenominacion[] | null {
  if (valor === null) return null;
  return exigirArreglo(valor, 'conteo').map((item) => {
    const c = exigirObjeto(item);
    return {
      tipo: exigirOpcion(c.tipo, ['billete', 'moneda'] as const, 'denominación'),
      valor: exigirEntero(c.valor, 'denominación'),
      cantidad: exigirEntero(c.cantidad, 'cantidad'),
    };
  });
}

/**
 * Lee y verifica la petición de guardar un cierre.
 *
 * @param valor - Dato recibido.
 * @returns Petición.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
export function leerPeticionGuardarCierre(valor: unknown): PeticionGuardarCierre {
  const d = exigirObjeto(valor);
  return {
    huella: exigirTexto(d.huella, 'huella'),
    baseInicial: exigirEnteroONulo(d.baseInicial, 'base inicial'),
    contado: exigirArreglo(d.contado, 'contado').map((item) => {
      const c = exigirObjeto(item);
      return {
        formaPagoId: exigirEntero(c.formaPagoId, 'forma de pago'),
        valor: exigirEntero(c.valor, 'contado'),
      };
    }),
    conteo: leerConteo(d.conteo),
    baseQueda: exigirEntero(d.baseQueda, 'base que queda'),
    observacion: exigirTexto(d.observacion, 'observación'),
  };
}

/**
 * Lee y verifica la petición de anular un cierre.
 *
 * @param valor - Dato recibido.
 * @returns Petición.
 * @throws {ErrorDeNegocio} Si la forma no es la esperada.
 */
function leerPeticionAnularCierre(valor: unknown): PeticionAnularCierre {
  const d = exigirObjeto(valor);
  return { numero: exigirEntero(d.numero, 'cierre'), motivo: exigirTexto(d.motivo, 'motivo') };
}

/**
 * Registra los canales del cierre de caja (Fase 5d). Todos exigen sesión;
 * imprimir y el PDF van por los canales de reportes.
 *
 * @param registrar - Función de registro de manejadores.
 * @param servicio - Servicio de cierre de caja.
 */
export function registrarIpcCierres(
  registrar: RegistrarManejador,
  servicio: ServicioCierreCaja,
): void {
  registrar('cierres:nuevo', () => servicio.nuevo());
  registrar('cierres:listar', () => servicio.listar());
  registrar('cierres:obtener', (numero) => servicio.obtener(exigirEntero(numero, 'cierre')));
  registrar('cierres:guardar', (peticion) => servicio.guardar(leerPeticionGuardarCierre(peticion)));
  registrar('cierres:anular', (peticion) => servicio.anular(leerPeticionAnularCierre(peticion)));
}
