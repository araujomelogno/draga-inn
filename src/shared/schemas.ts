import { z } from 'zod';

/** Esquemas zod compartidos entre cliente y servidor. Mensajes en español. */

export const uuid = z.string().uuid('Identificador inválido.');
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usá el formato aaaa-mm-dd.');
export const clientUuid = z.string().uuid('El identificador de la operación es inválido.');

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const money = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'number' ? v.toFixed(2) : v))
  .refine((v) => /^-?\d+(\.\d{1,2})?$/.test(v), 'Ingresá un monto válido, con hasta dos decimales.');

export const currency = z.string().length(3, 'La moneda son tres letras, por ejemplo UYU.');

export const ticketCategory = z.enum([
  'plomeria', 'electricidad', 'ascensor', 'piscina', 'parque', 'limpieza',
  'seguridad', 'estructura', 'ruidos', 'humedad', 'porteria', 'otros',
]);

export const TICKET_CATEGORY_LABELS: Record<z.infer<typeof ticketCategory>, string> = {
  plomeria: 'Plomería', electricidad: 'Electricidad', ascensor: 'Ascensor', piscina: 'Piscina',
  parque: 'Parque', limpieza: 'Limpieza', seguridad: 'Seguridad', estructura: 'Estructura',
  ruidos: 'Ruidos', humedad: 'Humedad', porteria: 'Portería', otros: 'Otros',
};

export const ticketPriority = z.enum(['low', 'normal', 'high', 'critical']);
export const TICKET_PRIORITY_LABELS: Record<z.infer<typeof ticketPriority>, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta', critical: 'Crítica',
};

/** ESPEC §4.2: descripción ≥ 10 caracteres, categoría obligatoria. */
export const createTicketSchema = z.object({
  clientUuid: clientUuid.optional(),
  title: z.string().trim().min(3, 'Escribí un título de al menos 3 caracteres.').max(200).optional(),
  description: z.string().trim().min(10, 'Contá qué pasa con al menos 10 caracteres.').max(4000),
  category: ticketCategory,
  priority: ticketPriority.default('normal'),
  unitId: uuid.nullish(),
  commonAreaId: uuid.nullish(),
  assetId: uuid.nullish(),
  caseId: uuid.nullish(),
  photoDocumentIds: z.array(uuid).max(5, 'Podés adjuntar hasta 5 fotos.').default([]),
  source: z.enum(['portal', 'pwa', 'admin', 'whatsapp']).default('admin'),
});

export const updateTicketSchema = z.object({
  status: z.enum(['new', 'triage', 'assigned', 'in_progress', 'waiting_owner', 'resolved', 'closed']).optional(),
  priority: ticketPriority.optional(),
  assignedToUserId: uuid.nullish(),
  unitId: uuid.nullish(),
  assetId: uuid.nullish(),
  dueDate: isoDate.nullish(),
  resolutionNote: z.string().trim().min(1).max(2000).optional(),
  ownerVisibleComment: z.string().trim().min(1).max(2000).optional(),
  closeReason: z.string().trim().min(1).max(500).optional(),
  backwardReason: z.string().trim().min(1).max(500).optional(),
  /** CB-01: última escritura gana a nivel de campo, pero un cambio de estado pide recargar. */
  expectedStatus: z.string().optional(),
});

export const ticketCommentSchema = z.object({
  clientUuid: clientUuid.optional(),
  body: z.string().trim().min(1, 'Escribí el comentario.').max(4000),
  isInternal: z.boolean().default(false),
});

/** ESPEC §4.3 — Piscina (Anexo A). */
export const poolLogSchema = z.object({
  clientUuid: clientUuid.optional(),
  loggedOn: isoDate,
  loggedAt: z.string().datetime({ offset: true }).optional(),
  freeChlorine: z.coerce.number().min(0).max(20).nullish(),
  ph: z.coerce.number().min(0).max(14).nullish(),
  alkalinity: z.coerce.number().min(0).max(1000).nullish(),
  calciumHardness: z.coerce.number().min(0).max(2000).nullish(),
  skimmed: z.boolean().nullish(),
  basketsCleaned: z.boolean().nullish(),
  productsApplied: z.string().trim().max(500).nullish(),
  observations: z.string().trim().max(2000).nullish(),
  backdateReason: z.string().trim().max(500).nullish(),
}).refine((v) => v.freeChlorine !== null && v.freeChlorine !== undefined, {
  message: 'El cloro libre es obligatorio.', path: ['freeChlorine'],
}).refine((v) => v.ph !== null && v.ph !== undefined, {
  message: 'El pH es obligatorio.', path: ['ph'],
});

/** ESPEC §4.4 — Tarea aprobada (Anexo B). */
export const approvedTaskSchema = z.object({
  clientUuid: clientUuid.optional(),
  performedOn: isoDate,
  trade: z.enum(['masonry', 'electrical', 'carpentry', 'plumbing', 'painting', 'other']),
  description: z.string().trim().min(10, 'Contá qué hiciste con al menos 10 caracteres.').max(2000),
  materials: z.string().trim().max(1000).nullish(),
  timeSpentMinutes: z.coerce.number().int().min(0).max(1440).nullish(),
  escalated: z.boolean().default(false),
  escalationReason: z.string().trim().max(500).nullish(),
  createEscalationTicket: z.boolean().default(false),
  costAmount: money.nullish(),
  currency: currency.nullish(),
  budgetCategoryId: uuid.nullish(),
  backdateReason: z.string().trim().max(500).nullish(),
}).refine((v) => !v.escalated || (v.escalationReason?.trim().length ?? 0) >= 5, {
  message: 'Contá por qué hizo falta derivar a un técnico.', path: ['escalationReason'],
});

export const TRADE_LABELS = {
  masonry: 'Albañilería ligera', electrical: 'Electricidad', carpentry: 'Carpintería ligera',
  plumbing: 'Sanitaria', painting: 'Pintura', other: 'Otros',
} as const;

/** ESPEC §4.5 — Incidente (Anexo F). */
export const incidentSchema = z.object({
  clientUuid: clientUuid.optional(),
  occurredAt: z.string().datetime({ offset: true }),
  incidentType: z.enum(['service_outage', 'leak', 'fire_start', 'accident', 'unauthorized_entry', 'damage', 'other']),
  description: z.string().trim().min(10, 'Describí el incidente con al menos 10 caracteres.').max(4000),
  actionTaken: z.string().trim().max(2000).nullish(),
  notifiedTo: z.string().trim().max(500).nullish(),
  status: z.enum(['open', 'closed']).default('open'),
});

export const INCIDENT_LABELS = {
  service_outage: 'Corte de servicio', leak: 'Fuga', fire_start: 'Principio de incendio',
  accident: 'Accidente', unauthorized_entry: 'Ingreso no autorizado', damage: 'Daño', other: 'Otro',
} as const;

/** ESPEC §4.6 — Stock (Anexo E). */
export const stockMovementSchema = z.object({
  clientUuid: clientUuid.optional(),
  stockItemId: uuid,
  kind: z.enum(['in', 'out', 'adjust']),
  quantity: z.coerce.number().positive('La cantidad tiene que ser mayor que cero.'),
  reason: z.string().trim().max(500).nullish(),
});

export const checklistItemSchema = z.object({
  clientUuid: clientUuid.optional(),
  done: z.boolean(),
  note: z.string().trim().max(1000).nullish(),
});

export const quoteSchema = z.object({
  caseId: uuid,
  vendorId: uuid,
  description: z.string().trim().min(5).max(2000),
  amount: money,
  currency: currency.default('UYU'),
  budgetCategoryId: uuid.nullish(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).nullish(),
  validUntil: isoDate.nullish(),
  documentId: uuid.nullish(),
});

export const approvalSchema = z.object({
  caseId: uuid,
  subjectType: z.enum(['quote', 'work_order', 'invoice', 'decision']),
  subjectId: uuid,
  decision: z.enum(['approved', 'rejected']),
  approvedAmount: money.nullish(),
  currency: currency.nullish(),
  /** ESPEC §5.7: el fundamento es obligatorio; la decisión es humana (RN-29). */
  rationale: z.string().trim().min(10, 'Fundamentá la decisión: por qué este presupuesto y no otro.').max(2000),
  supersedesId: uuid.nullish(),
  isException: z.boolean().default(false),
  exceptionReason: z.string().trim().max(1000).nullish(),
}).refine((v) => !v.isException || (v.exceptionReason?.trim().length ?? 0) >= 10, {
  message: 'Una excepción de gobernanza necesita un fundamento escrito de al menos 10 caracteres.',
  path: ['exceptionReason'],
});

export const workOrderSchema = z.object({
  caseId: uuid,
  vendorId: uuid,
  quoteId: uuid.nullish(),
  scope: z.string().trim().min(10, 'Describí el alcance del trabajo.').max(4000),
  amount: money.nullish(),
  currency: currency.nullish(),
  budgetCategoryId: uuid.nullish(),
  scheduledFor: isoDate.nullish(),
  /** RN-20: la excepción se pide explícitamente y queda auditada. */
  governanceException: z.object({
    reason: z.string().trim().min(10, 'Fundamentá la excepción de gobernanza.').max(1000),
  }).nullish(),
});

export const acceptanceSchema = z.object({
  acceptanceNotes: z.string().trim().min(5, 'Dejá constancia de cómo quedó el trabajo.').max(2000),
  photoDocumentIds: z.array(uuid).max(10).default([]),
});

export const invoiceSchema = z.object({
  caseId: uuid.nullish(),
  vendorId: uuid,
  workOrderId: uuid.nullish(),
  number: z.string().trim().min(1, 'Ingresá el número de factura.').max(50),
  issueDate: isoDate,
  amount: money,
  currency: currency.default('UYU'),
  budgetCategoryId: uuid.nullish(),
  documentId: uuid.nullish(),
  /** RN-15: sin conformidad no se carga factura, salvo excepción auditada. */
  acceptanceException: z.object({
    reason: z.string().trim().min(10, 'Fundamentá por qué se carga la factura sin conformidad.').max(1000),
  }).nullish(),
});

export const documentSchema = z.object({
  title: z.string().trim().min(3).max(200),
  docType: z.enum(['acta', 'reglamento', 'contrato', 'factura', 'presupuesto', 'seguro', 'certificado', 'plano', 'permiso', 'informe', 'garantia', 'foto', 'otro']),
  storagePath: z.string().trim().min(5),
  mimeType: z.string().trim().max(120).nullish(),
  sizeBytes: z.coerce.number().int().min(0).max(26_214_400, 'El archivo no puede superar los 25 MB.').nullish(),
  checksum: z.string().trim().max(128).nullish(),
  issuedOn: isoDate.nullish(),
  expiresOn: isoDate.nullish(),
  /** RN-17: nace internal. Publicar es un acto explícito. */
  visibility: z.enum(['internal', 'committee', 'owners', 'public']).default('internal'),
  links: z.array(z.object({ entityType: z.string().min(1), entityId: uuid })).default([]),
});

export const uploadUrlSchema = z.object({
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(120),
  sizeBytes: z.coerce.number().int().min(1).max(26_214_400, 'El archivo no puede superar los 25 MB.'),
});

/** HANDOFF §6.2 — lote offline. */
export const syncBatchSchema = z.object({
  mutations: z.array(z.object({
    clientUuid,
    endpoint: z.string().min(1),
    method: z.enum(['POST', 'PATCH']),
    body: z.unknown().default({}),
    createdAt: z.number().int().optional(),
  })).min(1).max(50, 'Se envían hasta 50 operaciones por lote.'),
});

export const governanceRuleSchema = z.object({
  name: z.string().trim().min(3).max(120),
  thresholdAmount: money,
  currency: currency.default('UYU'),
  minQuotes: z.coerce.number().int().min(1).max(10),
  requiredApproverRole: z.enum(['administrador', 'comision']),
  active: z.boolean().default(true),
});

export const checklistTemplateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  freq: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'biannual', 'annual', 'seasonal']),
  seasonal: z.boolean().default(false),
  active: z.boolean().default(true),
  items: z.array(z.object({
    key: z.string().trim().min(1).max(60),
    label: z.string().trim().min(1).max(200),
    required: z.boolean(),
    section: z.string().trim().min(1).max(120),
    seasonal: z.boolean().optional(),
  })).min(1, 'La plantilla necesita al menos un ítem.'),
});

export const monthlyReportSubmitSchema = z.object({
  narrative: z.string().trim().max(8000).nullish(),
  controlJustification: z.string().trim().max(4000).nullish(),
});

export const occupancySchema = z.object({
  unitId: uuid,
  partyId: uuid,
  role: z.enum(['owner', 'tenant', 'occupant']),
  from: isoDate,
  to: isoDate.nullish(),
  isPrimary: z.boolean().default(true),
});
