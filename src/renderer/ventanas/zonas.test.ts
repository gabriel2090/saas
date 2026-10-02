import { describe, expect, it } from 'vitest';
import { obtenerProceso, type IdProceso } from '../../shared/procesos';
import { minimoDeProceso, tamanoInicialDeProceso } from './tamanos';
import {
  ajustarZona,
  celdaLibre,
  celdasDeDiseno,
  limitarMinimo,
  nombreCelda,
  organizar,
  ordenDeLectura,
  rectDeRelativa,
  recortarZona,
  relativaDeRect,
  repartir,
  zonaDeArrastre,
  type ResultadoOrganizar,
  type VentanaZona,
} from './zonas';

/** Escritorio de una pantalla de 1366 × 768 con la barra adelgazada (`DISENO.md` §11.1). */
const E1366 = { ancho: 1366, alto: 634 };
/** Escritorio de una pantalla de 1536 × 864 (1920 × 1080 al 125 %). */
const E1536 = { ancho: 1536, alto: 739 };
/** Escritorio de una pantalla de 1920 × 1080 al 100 %. */
const E1920 = { ancho: 1920, alto: 946 };

/**
 * Datos de zona de un proceso con sus mínimos reales.
 *
 * @param id - Proceso.
 * @returns Ventana para el cálculo.
 */
function v(id: IdProceso): VentanaZona {
  return {
    id,
    titulo: obtenerProceso(id).titulo,
    minimo: minimoDeProceso(id),
    tamanoInicial: tamanoInicialDeProceso(id),
  };
}

/**
 * Exige un resultado exitoso y devuelve id → [x, y, ancho, alto].
 *
 * @param r - Resultado de organizar.
 * @returns Zonas por id.
 */
function zonas(r: ResultadoOrganizar): Record<string, number[]> {
  if (!r.ok) {
    throw new Error(r.razon);
  }
  return Object.fromEntries(
    r.asignaciones.map((a) => [a.id, [a.rect.x, a.rect.y, a.rect.ancho, a.rect.alto]]),
  );
}

describe('repartir', () => {
  it('reparte en partes iguales si todos los mínimos caben', () => {
    expect(repartir(1536, [760, 560])).toEqual([768, 768]);
    expect(repartir(1920, [440, 440, 560])).toEqual([640, 640, 640]);
  });

  it('agranda hasta el mínimo y achica a las demás sin bajar del suyo (D-112)', () => {
    expect(repartir(1366, [760, 560])).toEqual([760, 606]);
    expect(repartir(1536, [560, 440, 440])).toEqual([560, 488, 488]);
    expect(repartir(1920, [760, 560, 440])).toEqual([760, 580, 580]);
  });

  it('el redondeo no deja huecos: la suma es siempre el total', () => {
    const largos = repartir(1000, [0, 0, 0]);
    expect(largos).toEqual([333, 333, 334]);
  });

  it('devuelve null si los mínimos no caben', () => {
    expect(repartir(1366, [760, 720])).toBeNull();
    expect(repartir(100, [])).toBeNull();
  });
});

describe('limitarMinimo', () => {
  it('nunca exige más que el escritorio', () => {
    expect(limitarMinimo({ ancho: 760, alto: 480 }, { ancho: 700, alto: 900 })).toEqual({
      ancho: 700,
      alto: 480,
    });
  });
});

describe('organizar (DISENO.md §11.3)', () => {
  it('2 columnas en 1366: Facturar crece a 760 y el abono queda en 606', () => {
    expect(zonas(organizar('dos-columnas', E1366, [v('facturar'), v('abono-cliente')]))).toEqual({
      facturar: [0, 0, 760, 634],
      'abono-cliente': [760, 0, 606, 634],
    });
  });

  it('2 columnas en 1366 no caben con dos documentos anchos y explica por qué', () => {
    const r = organizar('dos-columnas', E1366, [v('facturar'), v('factura-proveedor')]);
    expect(r).toEqual({
      ok: false,
      razon: 'No caben: cada columna mediría 683 px y Facturar necesita 760.',
    });
  });

  it('3 columnas en 1366 no caben con Facturar', () => {
    const r = organizar('tres-columnas', E1366, [v('facturar'), v('productos'), v('clientes')]);
    expect(r).toEqual({
      ok: false,
      razon: 'No caben: cada columna mediría 455 px y Facturar necesita 760.',
    });
  });

  it('3 columnas en 1536 con maestros angostos y un abono, ajustadas a 560 + 488 + 488', () => {
    expect(
      zonas(organizar('tres-columnas', E1536, [v('abono-cliente'), v('productos'), v('clientes')])),
    ).toEqual({
      'abono-cliente': [0, 0, 560, 739],
      productos: [560, 0, 488, 739],
      clientes: [1048, 0, 488, 739],
    });
  });

  it('3 columnas en 1920 con Facturar: 760 + 580 + 580', () => {
    expect(
      zonas(organizar('tres-columnas', E1920, [v('facturar'), v('abono-cliente'), v('productos')])),
    ).toEqual({
      facturar: [0, 0, 760, 946],
      'abono-cliente': [760, 0, 580, 946],
      productos: [1340, 0, 580, 946],
    });
  });

  it('2 × 2 en 1920: la fila de Facturar crece a 480 y la de abajo queda en 466', () => {
    expect(
      zonas(
        organizar('dos-por-dos', E1920, [
          v('facturar'),
          v('abono-cliente'),
          v('productos'),
          v('clientes'),
        ]),
      ),
    ).toEqual({
      facturar: [0, 0, 960, 480],
      'abono-cliente': [960, 0, 960, 480],
      productos: [0, 480, 960, 466],
      clientes: [960, 480, 960, 466],
    });
  });

  it('2 × 2 en 1536 no cabe con documentos (filas de 369 px)', () => {
    const r = organizar('dos-por-dos', E1536, [
      v('facturar'),
      v('abono-cliente'),
      v('productos'),
      v('clientes'),
    ]);
    expect(r).toEqual({
      ok: false,
      razon: 'No caben: cada fila mediría 369 px y Facturar necesita 480 de alto.',
    });
  });

  it('2 × 2 con 3 ventanas: la activa ocupa la mitad izquierda (D-114)', () => {
    expect(
      zonas(organizar('dos-por-dos', E1920, [v('facturar'), v('productos'), v('clientes')])),
    ).toEqual({
      facturar: [0, 0, 960, 946],
      productos: [960, 0, 960, 473],
      clientes: [960, 473, 960, 473],
    });
  });

  it('pide un mínimo de ventanas abiertas y ubica solo las que caben en las celdas', () => {
    expect(organizar('dos-columnas', E1920, [v('facturar')])).toEqual({
      ok: false,
      razon: 'Necesita al menos 2 ventanas abiertas.',
    });
    expect(organizar('dos-por-dos', E1920, [v('facturar'), v('productos')])).toMatchObject({
      ok: false,
    });
    const r = organizar('dos-columnas', E1920, [v('facturar'), v('productos'), v('clientes')]);
    expect(Object.keys(zonas(r))).toEqual(['facturar', 'productos']);
  });

  it('cascada: la activa al frente (última posición) y sin salirse del escritorio', () => {
    const r = zonas(
      organizar('cascada', E1366, [v('facturar'), v('productos'), v('datos-negocio')]),
    );
    expect(r['datos-negocio']).toEqual([16, 16, 420, 360]);
    expect(r.productos).toEqual([44, 44, 1040, 590]);
    expect(r.facturar).toEqual([72, 72, 1236, 562]);
    expect(organizar('cascada', E1366, [])).toMatchObject({ ok: false });
  });
});

describe('arrastre a los bordes', () => {
  it('borde lateral = mitad; esquinas = cuadrante; borde superior = maximizar', () => {
    expect(zonaDeArrastre({ x: 3, y: 300 }, E1536)).toMatchObject({
      tipo: 'mitad',
      etiqueta: 'Mitad izquierda',
      relativa: { x: 0, y: 0, ancho: 5000, alto: 10000 },
    });
    expect(zonaDeArrastre({ x: 1533, y: 300 }, E1536)).toMatchObject({
      etiqueta: 'Mitad derecha',
      indice: 1,
    });
    expect(zonaDeArrastre({ x: 2, y: 20 }, E1536)).toMatchObject({
      tipo: 'cuadrante',
      etiqueta: 'Cuadrante superior izquierdo',
      indice: 0,
    });
    expect(zonaDeArrastre({ x: 1535, y: 720 }, E1536)).toMatchObject({
      etiqueta: 'Cuadrante inferior derecho',
      indice: 3,
    });
    expect(zonaDeArrastre({ x: 700, y: 2 }, E1536)).toMatchObject({ tipo: 'maximizar' });
    expect(zonaDeArrastre({ x: 700, y: 300 }, E1536)).toBeNull();
  });

  it('ajusta la mitad al mínimo de Facturar en 1366 y lo explica', () => {
    const mitad = rectDeRelativa(celdasDeDiseno('dos-columnas')[0]!, E1366);
    expect(ajustarZona(mitad, minimoDeProceso('facturar'), E1366, 'Facturar', 'La mitad')).toEqual({
      rect: { x: 0, y: 0, ancho: 760, alto: 634 },
      aviso:
        'La mitad mide 683 px y Facturar necesita al menos 760 px de ancho: quedará de 760 px y lo demás, de 606 px.',
    });
  });

  it('una zona pegada a la derecha crece hacia la izquierda; si cabe, no hay aviso', () => {
    const derecha = rectDeRelativa(celdasDeDiseno('dos-columnas')[1]!, E1366);
    expect(
      ajustarZona(derecha, { ancho: 760, alto: 480 }, E1366, 'Facturar', 'La mitad').rect,
    ).toEqual({
      x: 606,
      y: 0,
      ancho: 760,
      alto: 634,
    });
    const cuadrante = rectDeRelativa(celdasDeDiseno('dos-por-dos')[3]!, E1920);
    expect(
      ajustarZona(cuadrante, { ancho: 560, alto: 440 }, E1920, 'Abono', 'El cuadrante'),
    ).toEqual({
      rect: { x: 960, y: 473, ancho: 960, alto: 473 },
      aviso: null,
    });
  });

  it('convierte zonas relativas a píxeles y de vuelta sin huecos', () => {
    const tercios = celdasDeDiseno('tres-columnas').map((c) =>
      rectDeRelativa(c, { ancho: 1000, alto: 600 }),
    );
    expect(tercios.map((t) => [t.x, t.ancho])).toEqual([
      [0, 333],
      [333, 334],
      [667, 333],
    ]);
    expect(relativaDeRect({ x: 760, y: 0, ancho: 606, alto: 634 }, E1366)).toEqual({
      x: 5564,
      y: 0,
      ancho: 4436,
      alto: 10000,
    });
  });
});

describe('asistente de encaje', () => {
  it('la mitad libre se recorta para no tapar a Facturar ajustada', () => {
    expect(celdaLibre('dos-columnas', E1366, [{ x: 0, y: 0, ancho: 760, alto: 634 }])).toEqual({
      indice: 1,
      rect: { x: 760, y: 0, ancho: 606, alto: 634 },
    });
  });

  it('en 2 × 2 ofrece el siguiente cuadrante libre y null cuando no queda ninguno', () => {
    const q = (i: number): ReturnType<typeof rectDeRelativa> =>
      rectDeRelativa(celdasDeDiseno('dos-por-dos')[i]!, E1920);
    expect(celdaLibre('dos-por-dos', E1920, [q(0), q(1)])?.indice).toBe(2);
    expect(celdaLibre('dos-por-dos', E1920, [q(0), q(1), q(2), q(3)])).toBeNull();
  });

  it('recorta verticalmente si la vecina cubre todo el ancho', () => {
    expect(
      recortarZona({ x: 0, y: 0, ancho: 960, alto: 946 }, [{ x: 0, y: 0, ancho: 960, alto: 480 }]),
    ).toEqual({ x: 0, y: 480, ancho: 960, alto: 466 });
  });
});

describe('nombreCelda', () => {
  it('nombra cada celda con y sin artículo', () => {
    expect(nombreCelda('dos-columnas', 1)).toEqual({
      nombre: 'Mitad derecha',
      conArticulo: 'la mitad derecha',
    });
    expect(nombreCelda('tres-columnas', 1).conArticulo).toBe('la columna del centro');
    expect(nombreCelda('dos-por-dos', 2)).toEqual({
      nombre: 'Cuadrante inferior izquierdo',
      conArticulo: 'el cuadrante inferior izquierdo',
    });
  });
});

describe('ordenDeLectura (D-115)', () => {
  it('ordena por filas de arriba abajo y de izquierda a derecha', () => {
    expect(
      ordenDeLectura([
        { id: 'clientes', rect: { x: 960, y: 480, ancho: 960, alto: 466 } },
        { id: 'abono-cliente', rect: { x: 960, y: 0, ancho: 960, alto: 480 } },
        { id: 'productos', rect: { x: 0, y: 480, ancho: 960, alto: 466 } },
        { id: 'facturar', rect: { x: 0, y: 2, ancho: 960, alto: 480 } },
      ]),
    ).toEqual(['facturar', 'abono-cliente', 'productos', 'clientes']);
  });
});
