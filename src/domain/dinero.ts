import { MILESIMAS_POR_UNIDAD } from '../shared/formato/cantidades';
import { ErrorDeNegocio } from './errores';

/**
 * Valor en pesos colombianos enteros. Es un tipo «marcado»: un `number`
 * cualquiera no se puede usar como `Pesos` sin pasar por {@link aPesos}, lo que
 * evita mezclar dinero con cantidades u otros números por error.
 */
export type Pesos = number & { readonly __marca: 'Pesos' };

/**
 * Cantidad en milésimas (1 und = 1 kg = 1000). Tipo marcado como {@link Pesos}.
 */
export type Milesimas = number & { readonly __marca: 'Milesimas' };

/**
 * Convierte un número en {@link Pesos} validando que sea entero.
 *
 * @param valor - Valor en pesos.
 * @returns El mismo valor tipado como `Pesos`.
 * @throws {ErrorDeNegocio} Si el valor tiene decimales o excede el rango seguro.
 */
export function aPesos(valor: number): Pesos {
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `El valor en pesos debe ser un número entero (se recibió ${String(valor)}).`,
    );
  }
  return valor as Pesos;
}

/**
 * Convierte un número en {@link Milesimas} validando que sea entero.
 *
 * @param valor - Cantidad en milésimas.
 * @returns El mismo valor tipado como `Milesimas`.
 * @throws {ErrorDeNegocio} Si el valor tiene decimales o excede el rango seguro.
 */
export function aMilesimas(valor: number): Milesimas {
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDeNegocio(
      'VALIDACION',
      `La cantidad debe expresarse en milésimas enteras (se recibió ${String(valor)}).`,
    );
  }
  return valor as Milesimas;
}

/**
 * Calcula el valor de una línea: precio por unidad × cantidad en milésimas.
 *
 * El resultado se redondea al peso más cercano (las mitades hacia arriba, en
 * valor absoluto) porque el dinero se guarda en pesos enteros. Se usa
 * aritmética entera para no arrastrar errores de punto flotante.
 *
 * @param precioUnitario - Precio por unidad o por kilogramo.
 * @param cantidad - Cantidad en milésimas.
 * @returns Valor de la línea en pesos enteros.
 * @throws {ErrorDeNegocio} Si el resultado excede el rango seguro de enteros.
 *
 * @example
 * valorLinea(aPesos(3000), aMilesimas(1500)); // 4500 (1,5 kg a $ 3.000/kg)
 * valorLinea(aPesos(999), aMilesimas(333));   // 333 (332,667 redondeado)
 */
export function valorLinea(precioUnitario: Pesos, cantidad: Milesimas): Pesos {
  const producto = precioUnitario * cantidad;
  if (!Number.isSafeInteger(producto)) {
    throw new ErrorDeNegocio('VALIDACION', 'El valor de la línea es demasiado grande.');
  }
  const signo = Math.sign(producto);
  const absoluto = Math.abs(producto);
  const cociente = Math.floor(absoluto / MILESIMAS_POR_UNIDAD);
  const resto = absoluto % MILESIMAS_POR_UNIDAD;
  const redondeado = resto * 2 >= MILESIMAS_POR_UNIDAD ? cociente + 1 : cociente;
  return aPesos(signo * redondeado);
}
