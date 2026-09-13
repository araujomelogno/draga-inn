import { formatDate, formatMoney, formatMonth, formatPct } from '@/shared/format';
import { TICKET_STATUS_LABELS } from '@/policy/transitions';
import { INCIDENT_LABELS } from '@/shared/schemas';

/** Plantillas de §8. Asunto siempre con el nombre del edificio como prefijo. */
export type RenderedNotification = { subject: string; body: string; digestKey?: string; critical?: boolean };

const P = (buildingName: string, s: string) => `[${buildingName}] ${s}`;

type Ctx = { buildingName: string; baseUrl: string };

export const TEMPLATES = {
  'ticket.created': (c: Ctx, p: { number: number; title: string; priority: string; unitLabel?: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Reclamo #${p.number} — Nuevo`),
    body: [
      `Se registró el reclamo #${p.number}: ${p.title}.`,
      p.unitLabel ? `Unidad: ${p.unitLabel}.` : 'Área común.',
      `Prioridad: ${p.priority}.`,
      `Verlo: ${c.baseUrl}/admin/tickets/${p.number}`,
    ].join('\n'),
  }),

  'ticket.status_changed': (c: Ctx, p: { number: number; title: string; to: keyof typeof TICKET_STATUS_LABELS }): RenderedNotification => ({
    subject: P(c.buildingName, `Reclamo #${p.number} — ${TICKET_STATUS_LABELS[p.to]}`),
    body: `Tu reclamo #${p.number} («${p.title}») pasó a «${TICKET_STATUS_LABELS[p.to]}».\n${c.baseUrl}/portal/reclamos/${p.number}`,
  }),

  'ticket.waiting_owner': (c: Ctx, p: { number: number; comment: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Reclamo #${p.number} — Necesitamos tu respuesta`),
    body: `Para avanzar con el reclamo #${p.number} necesitamos que nos confirmes algo:\n\n${p.comment}\n\n${c.baseUrl}/portal/reclamos/${p.number}`,
  }),

  'ticket.comment': (c: Ctx, p: { number: number; title: string; body: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Reclamo #${p.number} — Nuevo comentario`),
    body: `Hay un comentario nuevo en el reclamo #${p.number} («${p.title}»):\n\n${p.body}\n\n${c.baseUrl}/portal/reclamos/${p.number}`,
  }),

  'ticket.unit_detached': (c: Ctx, p: { number: number; title: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Reclamo #${p.number} — Falta reasignar la unidad`),
    body: `El reclamo #${p.number} («${p.title}») se cargó sin conexión sobre una unidad que ya no existe. Hay que reasignarlo a mano.\n${c.baseUrl}/admin/tickets`,
  }),

  'ticket.critical': (c: Ctx, p: { number: number; title: string }): RenderedNotification => ({
    subject: P(c.buildingName, `URGENTE — Reclamo crítico #${p.number}`),
    body: `Se abrió un reclamo de prioridad crítica: #${p.number} — ${p.title}.\n${c.baseUrl}/admin/tickets/${p.number}`,
    critical: true,
  }),

  // RN-25: no se puede desactivar.
  'incident.grave': (c: Ctx, p: { type: keyof typeof INCIDENT_LABELS; description: string; occurredAt: string }): RenderedNotification => ({
    subject: P(c.buildingName, `URGENTE — ${INCIDENT_LABELS[p.type]}`),
    body: `Se registró un incidente grave el ${formatDate(p.occurredAt)}.\n\nTipo: ${INCIDENT_LABELS[p.type]}\n${p.description}`,
    critical: true,
  }),

  'approval.pending': (c: Ctx, p: { caseNumber: number; amount: string; currency: string; ruleName: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Aprobación pendiente — Expediente #${p.caseNumber}`),
    body: `Hay una aprobación pendiente por ${formatMoney(p.amount, p.currency)} en el expediente #${p.caseNumber}.\nRegla aplicable: ${p.ruleName}.\n${c.baseUrl}/admin/aprobaciones`,
  }),

  'governance.exception': (c: Ctx, p: { caseNumber: number; reason: string; actor: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Excepción de gobernanza — Expediente #${p.caseNumber}`),
    body: `Se registró una excepción de gobernanza en el expediente #${p.caseNumber}.\n\nFundamento: ${p.reason}\nRegistrada por: ${p.actor}.`,
  }),

  // RN-44: SOLO al encargado.
  'compliance.day_incomplete': (c: Ctx, p: { date: string; missing: string[]; pct: number }): RenderedNotification => ({
    subject: P(c.buildingName, `Checklist del ${formatDate(p.date)} sin completar`),
    body: [
      `El plan del día quedó en ${formatPct(p.pct)}.`,
      p.missing.length ? `Falta marcar: ${p.missing.join(', ')}.` : '',
      'Podés completarlo desde la app: todavía está disponible.',
    ].filter(Boolean).join('\n'),
  }),

  // RN-45
  'compliance.two_days': (c: Ctx, p: { dates: string[] }): RenderedNotification => ({
    subject: P(c.buildingName, 'Dos días consecutivos con el plan incompleto'),
    body: `El plan del edificio quedó incompleto el ${p.dates.map((d) => formatDate(d)).join(' y el ')}.\n${c.baseUrl}/admin/cumplimiento`,
  }),

  'compliance.seven_days': (c: Ctx, p: { since: string }): RenderedNotification => ({
    subject: P(c.buildingName, 'Siete días sin ningún registro'),
    body: `No hay registros operativos desde el ${formatDate(p.since)}. Conviene verificar qué está pasando.\n${c.baseUrl}/admin/cumplimiento`,
    critical: true,
  }),

  // RN-47
  'pool.trend': (c: Ctx, p: { param: string; direction: string; values: number[] }): RenderedNotification => ({
    subject: P(c.buildingName, `Aviso de tendencia en la piscina — ${p.param}`),
    body: `Las últimas tres mediciones de ${p.param} vienen ${p.direction === 'up' ? 'subiendo' : 'bajando'} de forma sostenida (${p.values.join(' → ')}), aunque estén dentro de rango.`,
    digestKey: 'pool.trend',
  }),

  // RN-46
  'checklist.omitted_item': (c: Ctx, p: { items: { label: string; missPct: number }[] }): RenderedNotification => ({
    subject: P(c.buildingName, 'Ítems del checklist sistemáticamente sin marcar'),
    body: [
      'Estos ítems no se marcan en más del 80 % de los días. Puede que la plantilla necesite revisión:',
      ...p.items.map((i) => `· ${i.label} — sin marcar el ${formatPct(i.missPct)} de las veces`),
    ].join('\n'),
    digestKey: 'checklist.omitted',
  }),

  'stock.low': (c: Ctx, p: { items: { name: string; current: string; min: string }[] }): RenderedNotification => ({
    subject: P(c.buildingName, 'Insumos por debajo del mínimo'),
    body: ['Hay insumos por reponer:', ...p.items.map((i) => `· ${i.name}: ${i.current} (mínimo ${i.min})`)].join('\n'),
    digestKey: 'stock.low',
  }),

  'maintenance.overdue': (c: Ctx, p: { tasks: { title: string; dueDate: string }[] }): RenderedNotification => ({
    subject: P(c.buildingName, 'Tareas de mantenimiento vencidas'),
    body: ['Estas tareas están vencidas:', ...p.tasks.map((t) => `· ${t.title} — vencía el ${formatDate(t.dueDate)}`)].join('\n'),
    digestKey: 'maintenance.overdue',
  }),

  // RN-18
  'expiry.upcoming': (c: Ctx, p: { items: { label: string; kind: string; expiresOn: string; daysLeft: number }[] }): RenderedNotification => ({
    subject: P(c.buildingName, 'Vencimientos próximos'),
    body: ['Vencen en los próximos días:', ...p.items.map((i) => `· ${i.label} — ${formatDate(i.expiresOn)} (${i.daysLeft} días)`)].join('\n'),
    digestKey: 'expiry.upcoming',
  }),

  'report.monthly_ready': (c: Ctx, p: { period: string }): RenderedNotification => ({
    subject: P(c.buildingName, `Informe mensual de ${formatMonth(p.period)}`),
    body: `Ya está disponible el informe mensual de ${formatMonth(p.period)}.\n${c.baseUrl}/admin/informes`,
  }),

  'report.owners_digest': (c: Ctx, p: { period: string; openTickets: number; closedTickets: number }): RenderedNotification => ({
    subject: P(c.buildingName, `Resumen de ${formatMonth(p.period)}`),
    body: [
      `Resumen del edificio en ${formatMonth(p.period)}:`,
      `· Reclamos resueltos: ${p.closedTickets}`,
      `· Reclamos abiertos al cierre: ${p.openTickets}`,
      `Podés ver el detalle de tu unidad en ${c.baseUrl}/portal`,
    ].join('\n'),
  }),
} as const;

export type TopicName = keyof typeof TEMPLATES;

/** RN-34: las críticas de seguridad no se pueden desactivar. */
export const UNDISABLEABLE: TopicName[] = ['incident.grave', 'ticket.critical', 'compliance.seven_days'];
