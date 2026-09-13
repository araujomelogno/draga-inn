import type { BuildingSettings } from '@/db/schema/buildings';

/**
 * Rangos de referencia de piscina (Anexo A del Manual).
 * Son configuración del edificio: `buildings.settings.pool`. Estos valores son
 * el fallback del seed, no la fuente de verdad en runtime.
 */
export const POOL_PARAMS = ['freeChlorine', 'ph', 'alkalinity', 'calciumHardness'] as const;
export type PoolParam = (typeof POOL_PARAMS)[number];

export type PoolRange = {
  min: number;
  max: number;
  criticalMin?: number;
  criticalMax?: number;
  label: string;
  unit: string;
};

export const DEFAULT_POOL_RANGES: Record<PoolParam, PoolRange> = {
  freeChlorine: { min: 1, max: 3, criticalMin: 0.5, criticalMax: 5, label: 'Cloro libre', unit: 'ppm' },
  ph: { min: 7.2, max: 7.6, criticalMin: 6.8, criticalMax: 8.2, label: 'pH', unit: '' },
  alkalinity: { min: 80, max: 120, criticalMin: 50, criticalMax: 200, label: 'Alcalinidad total', unit: 'ppm' },
  calciumHardness: { min: 200, max: 400, criticalMin: 100, criticalMax: 600, label: 'Dureza cálcica', unit: 'ppm' },
};

export function poolRanges(settings: BuildingSettings = {}): Record<PoolParam, PoolRange> {
  const configured = settings.pool ?? {};
  const out = {} as Record<PoolParam, PoolRange>;
  for (const p of POOL_PARAMS) out[p] = (configured[p] as PoolRange | undefined) ?? DEFAULT_POOL_RANGES[p];
  return out;
}

/** RN-43: tres estados distintos, nunca mezclados. */
export type ReadingState = 'ok' | 'out_of_range' | 'critical' | 'missing';

export function evaluateReading(param: PoolParam, value: number | null | undefined, settings: BuildingSettings = {}): ReadingState {
  if (value === null || value === undefined || Number.isNaN(value)) return 'missing';
  const r = poolRanges(settings)[param];
  if ((r.criticalMin !== undefined && value < r.criticalMin) || (r.criticalMax !== undefined && value > r.criticalMax)) {
    return 'critical';
  }
  if (value < r.min || value > r.max) return 'out_of_range';
  return 'ok';
}

export type PoolReading = Partial<Record<PoolParam, number | null>>;

export type PoolEvaluation = {
  states: Record<PoolParam, ReadingState>;
  outOfRange: PoolParam[];
  critical: PoolParam[];
  /** RN-21: fuera de rango ⇒ la observación es obligatoria. */
  requiresObservation: boolean;
  /** RN-22: fuera de rango crítico ⇒ ticket automático de prioridad critical. */
  requiresCriticalTicket: boolean;
};

export function evaluatePoolReading(reading: PoolReading, settings: BuildingSettings = {}): PoolEvaluation {
  const states = {} as Record<PoolParam, ReadingState>;
  const outOfRange: PoolParam[] = [];
  const critical: PoolParam[] = [];

  for (const p of POOL_PARAMS) {
    const state = evaluateReading(p, reading[p], settings);
    states[p] = state;
    if (state === 'out_of_range') outOfRange.push(p);
    if (state === 'critical') critical.push(p);
  }

  return {
    states,
    outOfRange,
    critical,
    requiresObservation: outOfRange.length > 0 || critical.length > 0,
    requiresCriticalTicket: critical.length > 0,
  };
}

export type TrendDirection = 'up' | 'down';
export type TrendAlert = { param: PoolParam; direction: TrendDirection; magnitude: number; values: number[] };

/**
 * RN-47 — Aviso de tendencia.
 *
 * Tres mediciones consecutivas desviándose en la misma dirección generan aviso,
 * aunque cada valor esté dentro de rango. Los huecos NO se interpolan: una
 * medición faltante rompe la secuencia y el conteo vuelve a empezar.
 */
export function detectTrend(
  param: PoolParam,
  series: { value: number | null | undefined }[],
  settings: BuildingSettings = {},
): TrendAlert | null {
  const threshold = settings.poolTrend?.[param] ?? defaultTrendThreshold(param, settings);
  // Tomamos la cola de la serie; un null corta y descarta lo anterior
  const tail: number[] = [];
  for (const point of series) {
    if (point.value === null || point.value === undefined || Number.isNaN(point.value)) {
      tail.length = 0; // hueco: la secuencia se rompe
      continue;
    }
    tail.push(point.value);
  }
  if (tail.length < 3) return null;

  const [a, b, c] = tail.slice(-3) as [number, number, number];
  const d1 = b - a;
  const d2 = c - b;
  if (d1 === 0 || d2 === 0) return null;
  if (Math.sign(d1) !== Math.sign(d2)) return null;

  const magnitude = Math.abs(c - a);
  if (magnitude < threshold) return null;

  return { param, direction: d1 > 0 ? 'up' : 'down', magnitude, values: [a, b, c] };
}

function defaultTrendThreshold(param: PoolParam, settings: BuildingSettings): number {
  const r = poolRanges(settings)[param];
  // Media banda del rango de referencia: una deriva que consume la mitad del margen
  return (r.max - r.min) / 2;
}
