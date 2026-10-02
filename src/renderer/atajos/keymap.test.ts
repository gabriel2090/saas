import { describe, expect, it } from 'vitest';
import {
  ATAJOS,
  ATAJOS_PROCESOS,
  COMBINACIONES_BLOQUEADAS,
  type AmbitoAtajo,
} from '../../shared/keymap';
import { PROCESOS } from '../../shared/procesos';
import { normalizarCombinacion } from './combinacion';

describe('keymap', () => {
  it('todas las combinaciones están bien escritas y ya normalizadas', () => {
    const todas = [
      ...Object.values(ATAJOS).map((a) => a.combinacion),
      ...Object.values(ATAJOS_PROCESOS).filter((c): c is string => c !== null),
      ...COMBINACIONES_BLOQUEADAS,
    ];
    for (const combinacion of todas) {
      expect(normalizarCombinacion(combinacion)).toBe(combinacion);
    }
  });

  it('no repite combinaciones dentro de un mismo ámbito', () => {
    const porAmbito = new Map<AmbitoAtajo, string[]>();
    for (const atajo of Object.values(ATAJOS)) {
      porAmbito.set(atajo.ambito, [...(porAmbito.get(atajo.ambito) ?? []), atajo.combinacion]);
    }
    for (const [ambito, combinaciones] of porAmbito) {
      expect(new Set(combinaciones).size, `ámbito ${ambito}`).toBe(combinaciones.length);
    }
  });

  it('los atajos de los íconos no chocan con los globales ni entre sí', () => {
    const globales = new Set<string>(
      Object.values(ATAJOS)
        .filter((a) => a.ambito === 'global' || a.ambito === 'formulario')
        .map((a) => a.combinacion),
    );
    const deProcesos = Object.values(ATAJOS_PROCESOS).filter((c): c is string => c !== null);
    expect(new Set(deProcesos).size).toBe(deProcesos.length);
    for (const combinacion of deProcesos) {
      expect(globales.has(combinacion), combinacion).toBe(false);
    }
  });

  it('define una entrada de atajo para cada proceso del catálogo', () => {
    expect(Object.keys(ATAJOS_PROCESOS).sort()).toEqual(PROCESOS.map((p) => p.id).sort());
  });

  it('respeta los atajos fijados en la especificación', () => {
    expect(ATAJOS.retroceder.combinacion).toBe('Escape');
    expect(ATAJOS.cerrarTodas.combinacion).toBe('Ctrl+0');
    expect(ATAJOS.siguienteVentana.combinacion).toBe('Ctrl+F6');
    expect(ATAJOS.alterarPrecio.combinacion).toBe('F7');
    expect(ATAJOS.guardarFactura.combinacion).toBe('PageDown');
    expect(ATAJOS.anularFactura.combinacion).toBe('Ctrl+X');
    expect(ATAJOS.anularFactura.permitirEnCampoTexto).toBe(false);
    expect(ATAJOS.imprimirDocumento.combinacion).toBe('Ctrl+P');
  });

  it('intercepta los atajos de Chromium que usa el sistema', () => {
    for (const combinacion of ['Ctrl+P', 'Ctrl+D', 'Ctrl+0']) {
      expect(COMBINACIONES_BLOQUEADAS).toContain(combinacion);
    }
  });
});
