import type { BuildingSettings } from '@/db/schema/buildings';
import { localDate } from './dates';

/**
 * RN-40 — Temporada alta.
 *
 * La ventana (1/12–31/3 por defecto) es configuración del edificio, no una
 * constante: vive en `buildings.settings.season`. La Semana de Turismo se
 * deriva del algoritmo de Pascua (computus gregoriano), que es determinista
 * y no requiere cargar fechas a mano cada año.
 */

/** Domingo de Pascua del año dado, como `aaaa-mm-dd`. Computus de Meeus/Jones/Butcher. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Semana de Turismo: lunes a domingo de la semana que termina en Pascua. */
export function tourismWeek(year: number): { from: string; to: string } {
  const easter = easterSunday(year);
  const easterDate = new Date(`${easter}T00:00:00Z`);
  const monday = new Date(easterDate);
  monday.setUTCDate(monday.getUTCDate() - 6);
  return { from: monday.toISOString().slice(0, 10), to: easter };
}

const DEFAULT_HIGH_FROM = '12-01';
const DEFAULT_HIGH_TO = '03-31';

export type SeasonInfo = {
  isHigh: boolean;
  label: 'Temporada alta' | 'Temporada baja';
  reason?: string;
};

export function seasonFor(isoDate: string, settings: BuildingSettings = {}): SeasonInfo {
  const year = Number(isoDate.slice(0, 4));
  const mmdd = isoDate.slice(5);
  const from = settings.season?.highFrom ?? DEFAULT_HIGH_FROM;
  const to = settings.season?.highTo ?? DEFAULT_HIGH_TO;

  // La ventana cruza el año: dic–mar
  const inWindow = from <= to ? mmdd >= from && mmdd <= to : mmdd >= from || mmdd <= to;
  if (inWindow) return { isHigh: true, label: 'Temporada alta', reason: 'Ventana de verano' };

  const tw = tourismWeek(year);
  if (isoDate >= tw.from && isoDate <= tw.to) {
    return { isHigh: true, label: 'Temporada alta', reason: 'Semana de Turismo' };
  }

  for (const extra of settings.season?.extraHighRanges ?? []) {
    if (isoDate >= extra.from && isoDate <= extra.to) {
      return { isHigh: true, label: 'Temporada alta', reason: extra.label };
    }
  }
  return { isHigh: false, label: 'Temporada baja' };
}

export function currentSeason(settings: BuildingSettings = {}, tz = 'America/Montevideo'): SeasonInfo {
  return seasonFor(localDate(new Date(), tz), settings);
}

/**
 * RN-52 — En temporada de piscina, un día sin registro cuenta como faltante.
 * Fuera de temporada, no. La temporada de piscina coincide con la alta.
 */
export function poolSeasonActive(isoDate: string, settings: BuildingSettings = {}): boolean {
  return seasonFor(isoDate, settings).isHigh;
}
