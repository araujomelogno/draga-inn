/** Español rioplatense (P5): dd/mm/aaaa, $ 1.234,56, hora 24 h. */
import { DEFAULT_TZ } from './dates';

export function formatDate(value: string | Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T12:00:00Z` : value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-UY', { timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

export function formatDateTime(value: string | Date | null | undefined, tz = DEFAULT_TZ): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('es-UY', {
    timeZone: tz, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d).replace(',', '');
}

export function formatMoney(amount: string | number | null | undefined, currency = 'UYU'): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (Number.isNaN(n)) return '—';
  const symbol = currency === 'USD' ? 'US$' : '$';
  return `${symbol} ${new Intl.NumberFormat('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
}

export function formatPct(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return '—';
  return `${new Intl.NumberFormat('es-UY', { maximumFractionDigits: 1 }).format(n)} %`;
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function formatMonth(isoDate: string): string {
  const [y, m] = isoDate.split('-').map(Number);
  return `${MESES[(m ?? 1) - 1]} de ${y}`;
}

/** "hace 3 días", "hace 2 h" — para la columna de antigüedad de la bandeja. */
export function formatAge(from: string | Date, now: Date = new Date()): string {
  const d = typeof from === 'string' ? new Date(from) : from;
  const mins = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (mins < 1) return 'recién';
  if (mins < 60) return `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  const months = Math.floor(days / 30);
  return `hace ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

export function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}
