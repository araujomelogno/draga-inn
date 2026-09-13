import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, eachDay, endOfMonth, isoWeekday, localDate, startOfMonth } from '@/shared/dates';
import { formatDate, formatDateTime, formatMoney, formatMonth, formatPct } from '@/shared/format';
import { nextDue } from '@/modules/maintenance/service';
import { periodKey } from '@/modules/logbook/service';

describe('CB-13 — todos los cálculos usan la zona del edificio', () => {
  it('a las 02:00 UTC del 1 de enero, en Montevideo todavía es 31 de diciembre', () => {
    const instante = new Date('2027-01-01T02:00:00Z');
    expect(localDate(instante, 'America/Montevideo')).toBe('2026-12-31');
    expect(localDate(instante, 'UTC')).toBe('2027-01-01');
  });

  it('resiste el cambio de mes y de año', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31');
  });

  it('addMonths recorta al último día del mes destino', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29'); // bisiesto
  });

  it('diffDays y eachDay son consistentes', () => {
    expect(diffDays('2026-06-01', '2026-06-15')).toBe(14);
    expect(eachDay('2026-06-01', '2026-06-05')).toHaveLength(5);
  });

  it('startOfMonth y endOfMonth', () => {
    expect(startOfMonth('2026-02-17')).toBe('2026-02-01');
    expect(endOfMonth('2026-02-17')).toBe('2026-02-28');
    expect(endOfMonth('2028-02-01')).toBe('2028-02-29');
  });

  it('isoWeekday: lunes = 1, domingo = 7', () => {
    expect(isoWeekday('2026-06-15')).toBe(1); // lunes
    expect(isoWeekday('2026-06-21')).toBe(7); // domingo
  });
});

describe('P5 — español rioplatense', () => {
  it('las fechas van en dd/mm/aaaa', () => {
    expect(formatDate('2026-03-09')).toBe('09/03/2026');
  });

  it('los montos llevan separador de miles con punto y decimal con coma', () => {
    expect(formatMoney('1234.56')).toBe('$ 1.234,56');
    expect(formatMoney(1234.5, 'USD')).toBe('US$ 1.234,50');
  });

  it('los porcentajes usan coma decimal', () => {
    expect(formatPct(92.5)).toBe('92,5 %');
  });

  it('los meses van en español', () => {
    expect(formatMonth('2026-03-01')).toBe('marzo de 2026');
  });

  it('la hora va en formato 24 h', () => {
    const s = formatDateTime('2026-03-09T20:30:00Z', 'America/Montevideo');
    expect(s).toContain('09/03/2026');
    expect(s).toMatch(/1[0-9]:30/);
  });

  it('un valor vacío se muestra como guion, no como «null»', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatMoney(null)).toBe('—');
    expect(formatPct(undefined)).toBe('—');
  });
});

describe('generación de tareas preventivas', () => {
  it('avanza según la frecuencia del plan', () => {
    expect(nextDue('daily', '2026-06-15', 1)).toBe('2026-06-16');
    expect(nextDue('weekly', '2026-06-15', 1)).toBe('2026-06-22');
    expect(nextDue('monthly', '2026-06-15', 1)).toBe('2026-07-15');
    expect(nextDue('quarterly', '2026-06-15', 1)).toBe('2026-09-15');
    expect(nextDue('biannual', '2026-06-15', 1)).toBe('2026-12-15');
    expect(nextDue('annual', '2026-06-15', 1)).toBe('2027-06-15');
  });

  it('un plan mensual genera 12 vencimientos en un año, sin duplicar', () => {
    const fechas = new Set<string>();
    let d = '2026-01-15';
    for (let i = 0; i < 12; i += 1) {
      fechas.add(d);
      d = nextDue('monthly', d, 1);
    }
    expect(fechas.size).toBe(12);
  });
});

describe('periodKey — fecha canónica de cada instancia de checklist', () => {
  it('la diaria usa el propio día', () => {
    expect(periodKey('daily', '2026-06-17')).toBe('2026-06-17');
  });

  it('la semanal usa el lunes de esa semana', () => {
    expect(periodKey('weekly', '2026-06-17')).toBe('2026-06-15'); // miércoles → lunes
    expect(periodKey('weekly', '2026-06-21')).toBe('2026-06-15'); // domingo → mismo lunes
  });

  it('la mensual usa el día 1', () => {
    expect(periodKey('monthly', '2026-06-17')).toBe('2026-06-01');
  });

  it('la trimestral usa el primer día del trimestre', () => {
    expect(periodKey('quarterly', '2026-06-17')).toBe('2026-04-01');
    expect(periodKey('quarterly', '2026-11-02')).toBe('2026-10-01');
  });

  it('la anual usa el 1 de enero', () => {
    expect(periodKey('annual', '2026-06-17')).toBe('2026-01-01');
  });
});
