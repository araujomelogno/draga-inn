import { describe, expect, it } from 'vitest';
import { assertTicketTransition, availableTicketTransitions, checkTicketTransition, type TransitionContext } from '@/policy/transitions';
import { TransitionError } from '@/shared/errors';
import { ctx } from '../helpers/ctx';

const HOY = '2026-06-15';

function tctx(over: Partial<TransitionContext> = {}): TransitionContext {
  return {
    assignedToUserId: null, hasAssignee: false, reopenWindowDays: 7, today: HOY, ...over,
  };
}

describe('§3.1 — máquina de estados del ticket', () => {
  it('new → triage lo puede hacer el administrador', () => {
    expect(checkTicketTransition(ctx(['administrador']), 'new', 'triage', tctx()).ok).toBe(true);
  });

  it('new → triage también lo puede hacer el encargado', () => {
    expect(checkTicketTransition(ctx(['encargado']), 'new', 'triage', tctx()).ok).toBe(true);
  });

  it('un propietario no puede cambiar el estado de un ticket', () => {
    expect(checkTicketTransition(ctx(['owner']), 'new', 'triage', tctx()).ok).toBe(false);
  });

  it('triage → assigned exige responsable asignado y explica qué falta', () => {
    const r = checkTicketTransition(ctx(['administrador']), 'triage', 'assigned', tctx({ hasAssignee: false }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Asigná un responsable');
  });

  it('triage → assigned pasa con responsable', () => {
    expect(checkTicketTransition(ctx(['administrador']), 'triage', 'assigned', tctx({ hasAssignee: true })).ok).toBe(true);
  });

  it('el encargado no puede asignar (triage → assigned es del administrador)', () => {
    expect(checkTicketTransition(ctx(['encargado']), 'triage', 'assigned', tctx({ hasAssignee: true })).ok).toBe(false);
  });

  it('in_progress → resolved exige nota de resolución', () => {
    const r = checkTicketTransition(ctx(['encargado']), 'in_progress', 'resolved', tctx({ assignedToUserId: 'user-1' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('nota de resolución');
  });

  it('in_progress → resolved pasa con nota', () => {
    const r = checkTicketTransition(ctx(['encargado']), 'in_progress', 'resolved',
      tctx({ assignedToUserId: 'user-1', resolutionNote: 'Se cambió el flotante del tanque.' }));
    expect(r.ok).toBe(true);
  });

  it('* → waiting_owner exige comentario visible al propietario', () => {
    const r = checkTicketTransition(ctx(['administrador']), 'in_progress', 'waiting_owner', tctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('visible al propietario');
  });

  it('descartar un ticket exige motivo', () => {
    const r = checkTicketTransition(ctx(['administrador']), 'triage', 'closed', tctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('motivo');
  });

  it('no existe la transición new → resolved', () => {
    const r = checkTicketTransition(ctx(['administrador']), 'new', 'resolved', tctx());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toBe('not_allowed');
  });

  it('assertTicketTransition lanza TransitionError con el detalle', () => {
    expect(() => assertTicketTransition(ctx(['administrador']), 'new', 'resolved', tctx())).toThrowError(TransitionError);
  });

  it('solo el responsable asignado puede pasar a in_progress', () => {
    const r = checkTicketTransition(ctx(['encargado']), 'assigned', 'in_progress', tctx({ assignedToUserId: 'otro-usuario' }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('responsable asignado');
  });

  it('el administrador puede hacerlo aunque no sea el responsable', () => {
    expect(checkTicketTransition(ctx(['administrador']), 'assigned', 'in_progress', tctx({ assignedToUserId: 'otro' })).ok).toBe(true);
  });
});

describe('retroceso de estado — solo administrador y con motivo', () => {
  it('el encargado no puede retroceder', () => {
    const r = checkTicketTransition(ctx(['encargado']), 'in_progress', 'triage', tctx({ backwardReason: 'me equivoqué' }));
    expect(r.ok).toBe(false);
  });

  it('el administrador puede, pero necesita motivo', () => {
    const sinMotivo = checkTicketTransition(ctx(['administrador']), 'in_progress', 'triage', tctx());
    expect(sinMotivo.ok).toBe(false);
    if (!sinMotivo.ok) expect(sinMotivo.message).toContain('motivo');

    const conMotivo = checkTicketTransition(ctx(['administrador']), 'in_progress', 'triage',
      tctx({ backwardReason: 'Se asignó a la persona equivocada.' }));
    expect(conMotivo.ok).toBe(true);
  });
});

describe('RN-12 — reapertura del propietario', () => {
  const resuelto = (diasAtras: number) => {
    const d = new Date(`${HOY}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - diasAtras);
    return d.toISOString();
  };

  it('dentro de los 7 días el propietario puede reabrir', () => {
    const r = checkTicketTransition(ctx(['owner']), 'resolved', 'in_progress', tctx({ resolvedAt: resuelto(3) }));
    expect(r.ok).toBe(true);
  });

  it('pasados los 7 días no puede, y se le dice qué hacer', () => {
    const r = checkTicketTransition(ctx(['owner']), 'resolved', 'in_progress', tctx({ resolvedAt: resuelto(10) }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Abrí un reclamo nuevo');
  });

  it('la ventana es configurable por edificio', () => {
    const r = checkTicketTransition(ctx(['owner']), 'resolved', 'in_progress',
      tctx({ resolvedAt: resuelto(10), reopenWindowDays: 15 }));
    expect(r.ok).toBe(true);
  });

  it('un inquilino también puede reabrir su reclamo', () => {
    expect(checkTicketTransition(ctx(['tenant']), 'resolved', 'in_progress', tctx({ resolvedAt: resuelto(2) })).ok).toBe(true);
  });
});

describe('P3 — la interfaz solo ofrece lo que el rol puede hacer', () => {
  it('un propietario sobre un ticket nuevo no ve ninguna transición', () => {
    expect(availableTicketTransitions(ctx(['owner']), 'new', tctx())).toEqual([]);
  });

  it('el administrador ve triage, waiting_owner y closed desde new', () => {
    const opciones = availableTicketTransitions(ctx(['administrador']), 'new', tctx());
    expect(opciones).toContain('triage');
    expect(opciones).toContain('waiting_owner');
    expect(opciones).toContain('closed');
    expect(opciones).not.toContain('resolved');
  });

  it('el encargado no ve «assigned» desde triage: eso es del administrador', () => {
    expect(availableTicketTransitions(ctx(['encargado']), 'triage', tctx())).not.toContain('assigned');
  });
});
