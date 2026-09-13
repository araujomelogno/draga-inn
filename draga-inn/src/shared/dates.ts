/**
 * Todo cálculo de fecha usa la zona del edificio (CB-13).
 * Nada de `new Date()` a secas para decidir "qué día es hoy".
 */
export const DEFAULT_TZ = 'America/Montevideo';

const ymdFormatterCache = new Map<string, Intl.DateTimeFormat>();

function ymdFormatter(tz: string): Intl.DateTimeFormat {
  let f = ymdFormatterCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    ymdFormatterCache.set(tz, f);
  }
  return f;
}

/** Fecha local del edificio como `aaaa-mm-dd`. */
export function localDate(at: Date = new Date(), tz: string = DEFAULT_TZ): string {
  return ymdFormatter(tz).format(at);
}

/** Hora local del edificio, 0–23. */
export function localHour(at: Date = new Date(), tz: string = DEFAULT_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(at);
  return Number(parts);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function addMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, 1));
  dt.setUTCMonth(dt.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d ?? 1, lastDay));
  return dt.toISOString().slice(0, 10);
}

export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  const last = new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
  return `${isoDate.slice(0, 7)}-${String(last).padStart(2, '0')}`;
}

/** Día de la semana 1 = lunes … 7 = domingo. */
export function isoWeekday(isoDate: string): number {
  const day = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; diffDays(d, to) >= 0; d = addDays(d, 1)) out.push(d);
  return out;
}
