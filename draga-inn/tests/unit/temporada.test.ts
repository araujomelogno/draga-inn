import { describe, expect, it } from 'vitest';
import { easterSunday, poolSeasonActive, seasonFor, tourismWeek } from '@/shared/season';
import type { BuildingSettings } from '@/db/schema/buildings';

const AJUSTES: BuildingSettings = {};

describe('RN-40 — temporada alta', () => {
  it('del 1/12 al 31/3 es temporada alta', () => {
    expect(seasonFor('2026-12-01', AJUSTES).isHigh).toBe(true);
    expect(seasonFor('2027-01-15', AJUSTES).isHigh).toBe(true);
    expect(seasonFor('2027-03-31', AJUSTES).isHigh).toBe(true);
  });

  it('de abril a noviembre es temporada baja, salvo Semana de Turismo', () => {
    // El 1/4/2026 cae dentro de Semana de Turismo (30/3 al 5/4), así que se toma
    // una fecha posterior para probar la ventana de baja.
    expect(seasonFor('2026-04-20', AJUSTES).isHigh).toBe(false);
    expect(seasonFor('2026-07-15', AJUSTES).isHigh).toBe(false);
    expect(seasonFor('2026-11-30', AJUSTES).isHigh).toBe(false);
  });

  it('la ventana es configuración del edificio, no una constante', () => {
    const ajustes: BuildingSettings = { season: { highFrom: '11-15', highTo: '04-15' } };
    expect(seasonFor('2026-11-20', ajustes).isHigh).toBe(true);
    expect(seasonFor('2026-11-20', AJUSTES).isHigh).toBe(false);
  });

  it('admite ventanas extra configuradas (fines de semana largos)', () => {
    const ajustes: BuildingSettings = {
      season: { highFrom: '12-01', highTo: '03-31', extraHighRanges: [{ from: '2026-08-24', to: '2026-08-26', label: 'Declaratoria de la Independencia' }] },
    };
    const s = seasonFor('2026-08-25', ajustes);
    expect(s.isHigh).toBe(true);
    expect(s.reason).toBe('Declaratoria de la Independencia');
  });
});

describe('Semana de Turismo — derivada del computus, no cargada a mano', () => {
  it('calcula bien el Domingo de Pascua', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2025)).toBe('2025-04-20');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
  });

  it('la Semana de Turismo va del lunes al domingo de Pascua', () => {
    const semana = tourismWeek(2026);
    expect(semana.to).toBe('2026-04-05');
    expect(semana.from).toBe('2026-03-30');
  });

  it('cae en temporada alta aunque esté fuera de la ventana de verano', () => {
    // 2/4/2026 está fuera del 1/12–31/3 pero dentro de Semana de Turismo
    const s = seasonFor('2026-04-02', AJUSTES);
    expect(s.isHigh).toBe(true);
    expect(s.reason).toBe('Semana de Turismo');
  });
});

describe('RN-52 — el registro de piscina solo cuenta en temporada', () => {
  it('en temporada, un día sin registro cuenta como faltante', () => {
    expect(poolSeasonActive('2027-01-15', AJUSTES)).toBe(true);
  });

  it('fuera de temporada, no cuenta', () => {
    expect(poolSeasonActive('2026-07-15', AJUSTES)).toBe(false);
  });
});
