import { describe, expect, it } from 'vitest';
import { detectTrend, evaluatePoolReading, evaluateReading, poolRanges } from '@/shared/pool';
import type { BuildingSettings } from '@/db/schema/buildings';

const AJUSTES: BuildingSettings = {};

describe('RN-21 — valor fuera de rango exige observación', () => {
  it('un pH de 8,4 sale de rango y exige observación', () => {
    const r = evaluatePoolReading({ freeChlorine: 2, ph: 8.4 }, AJUSTES);
    expect(r.states.ph).not.toBe('ok');
    expect(r.requiresObservation).toBe(true);
  });

  it('un pH de 7,4 está en rango y no exige nada', () => {
    const r = evaluatePoolReading({ freeChlorine: 2, ph: 7.4 }, AJUSTES);
    expect(r.states.ph).toBe('ok');
    expect(r.requiresObservation).toBe(false);
    expect(r.requiresCriticalTicket).toBe(false);
  });

  it('los bordes del rango cuentan como en rango', () => {
    expect(evaluateReading('ph', 7.2, AJUSTES)).toBe('ok');
    expect(evaluateReading('ph', 7.6, AJUSTES)).toBe('ok');
    expect(evaluateReading('freeChlorine', 1, AJUSTES)).toBe('ok');
    expect(evaluateReading('freeChlorine', 3, AJUSTES)).toBe('ok');
  });
});

describe('RN-22 — fuera de rango crítico genera ticket crítico', () => {
  it('un cloro de 0,2 ppm es crítico', () => {
    const r = evaluatePoolReading({ freeChlorine: 0.2, ph: 7.4 }, AJUSTES);
    expect(r.states.freeChlorine).toBe('critical');
    expect(r.requiresCriticalTicket).toBe(true);
    expect(r.critical).toContain('freeChlorine');
  });

  it('un cloro de 0,8 ppm está fuera de rango pero no es crítico', () => {
    const r = evaluatePoolReading({ freeChlorine: 0.8, ph: 7.4 }, AJUSTES);
    expect(r.states.freeChlorine).toBe('out_of_range');
    expect(r.requiresCriticalTicket).toBe(false);
    expect(r.requiresObservation).toBe(true);
  });
});

describe('RN-43 — presente y correcto, presente fuera de rango, y faltante', () => {
  it('son tres estados distintos y no se mezclan', () => {
    expect(evaluateReading('ph', 7.4, AJUSTES)).toBe('ok');
    expect(evaluateReading('ph', 8.0, AJUSTES)).toBe('out_of_range');
    expect(evaluateReading('ph', null, AJUSTES)).toBe('missing');
    expect(evaluateReading('ph', undefined, AJUSTES)).toBe('missing');
  });

  it('un valor faltante no se cuenta como fuera de rango', () => {
    const r = evaluatePoolReading({ freeChlorine: 2, ph: 7.4, alkalinity: null }, AJUSTES);
    expect(r.states.alkalinity).toBe('missing');
    expect(r.outOfRange).not.toContain('alkalinity');
    expect(r.requiresObservation).toBe(false);
  });
});

describe('RN-47 — aviso de tendencia', () => {
  const subeFuerte = [{ value: 7.2 }, { value: 7.4 }, { value: 7.6 }];

  it('tres mediciones en la misma dirección generan aviso aunque estén en rango', () => {
    const a = detectTrend('ph', subeFuerte, AJUSTES);
    expect(a).not.toBeNull();
    expect(a?.direction).toBe('up');
    // Cada valor individual está dentro de 7,2–7,6
    for (const p of subeFuerte) expect(evaluateReading('ph', p.value, AJUSTES)).toBe('ok');
  });

  it('detecta también la tendencia a la baja', () => {
    const a = detectTrend('ph', [{ value: 7.6 }, { value: 7.4 }, { value: 7.2 }], AJUSTES);
    expect(a?.direction).toBe('down');
  });

  it('una dirección alternada no genera aviso', () => {
    expect(detectTrend('ph', [{ value: 7.2 }, { value: 7.5 }, { value: 7.3 }], AJUSTES)).toBeNull();
  });

  it('un hueco rompe la secuencia: los días sin registro NO se interpolan', () => {
    const conHueco = [{ value: 7.2 }, { value: 7.4 }, { value: null }, { value: 7.6 }];
    expect(detectTrend('ph', conHueco, AJUSTES)).toBeNull();
  });

  it('con menos de tres mediciones no hay tendencia', () => {
    expect(detectTrend('ph', [{ value: 7.2 }, { value: 7.4 }], AJUSTES)).toBeNull();
  });

  it('una deriva menor al umbral configurado no genera aviso', () => {
    // Media banda del rango de pH es 0,2; una deriva de 0,04 no alcanza
    expect(detectTrend('ph', [{ value: 7.40 }, { value: 7.42 }, { value: 7.44 }], AJUSTES)).toBeNull();
  });
});

describe('los rangos son configuración del edificio, no constantes', () => {
  it('un edificio puede definir su propio rango de cloro', () => {
    const ajustes: BuildingSettings = {
      pool: { freeChlorine: { min: 2, max: 4, criticalMin: 1, label: 'Cloro libre', unit: 'ppm' } },
    };
    expect(poolRanges(ajustes).freeChlorine.min).toBe(2);
    // 1,5 ppm sería correcto con el rango por defecto, pero acá está fuera
    expect(evaluateReading('freeChlorine', 1.5, ajustes)).toBe('out_of_range');
    expect(evaluateReading('freeChlorine', 1.5, AJUSTES)).toBe('ok');
  });
});
