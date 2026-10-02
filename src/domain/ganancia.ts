import { ESCALAS_PRECIO, type EscalaPrecio, type PreciosProducto } from '../shared/maestros';

/**
 * Calcula el % de ganancia sobre el costo, `(precio − costo) / costo × 100`
 * (§5.1), en **décimas de punto porcentual** enteras: 174 significa 17.4 %.
 *
 * Se redondea a la décima más cercana (las mitades se alejan de cero) con
 * aritmética entera, para que el mismo precio y costo den siempre el mismo
 * resultado, sin errores de punto flotante (D-32).
 *
 * @param costo - Costo en pesos enteros.
 * @param precio - Precio en pesos enteros.
 * @returns Décimas de porcentaje, o `null` si el costo es cero (no hay base para calcular).
 *
 * @example
 * porcentajeGanancia(13200, 15500); // 174  (17.4 %)
 * porcentajeGanancia(13200, 13000); // -15  (-1.5 %)
 * porcentajeGanancia(0, 5000);      // null (se muestra «—»)
 */
export function porcentajeGanancia(costo: number, precio: number): number | null {
  if (costo === 0) {
    return null;
  }
  const diferencia = precio - costo;
  const absoluto = Math.abs(diferencia) * 1000;
  const cociente = Math.floor(absoluto / costo);
  const resto = absoluto % costo;
  const redondeado = resto * 2 >= costo ? cociente + 1 : cociente;
  return diferencia < 0 ? -redondeado : redondeado;
}

/**
 * Devuelve las escalas cuyo precio quedó por debajo del costo, en el orden
 * en que se muestran. Se usa para el aviso ámbar de la ficha (D-34) y para
 * alertar cuando una compra sube el costo (§5.1, Fase 2).
 *
 * @param costo - Costo en pesos.
 * @param precios - Precios de las tres escalas.
 * @returns Escalas por debajo del costo (vacío si ninguna).
 *
 * @example
 * escalasBajoCosto(13200, { mayor: 14500, menor: 15500, minimo: 13000 }); // ['minimo']
 */
export function escalasBajoCosto(costo: number, precios: PreciosProducto): EscalaPrecio[] {
  return ESCALAS_PRECIO.map((e) => e.valor).filter((escala) => precios[escala] < costo);
}
