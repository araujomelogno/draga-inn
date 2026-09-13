import { route } from '@/api/handler';
import { created, ok } from '@/api/envelope';
import { withRead, withTx } from '@/db/tx';
import { createTicket, listTickets } from '@/modules/tickets/service';
import { createTicketSchema, pagination } from '@/shared/schemas';
import type { TicketStatus } from '@/policy/transitions';

export const dynamic = 'force-dynamic';

const OPEN_STATUSES: TicketStatus[] = ['new', 'triage', 'assigned', 'in_progress', 'waiting_owner', 'resolved'];

export const GET = route(async (req, ctx) => {
  const sp = req.nextUrl.searchParams;
  const { page, pageSize } = pagination.parse({ page: sp.get('page') ?? 1, pageSize: sp.get('pageSize') ?? 25 });
  const statusParam = sp.getAll('estado');
  const status = statusParam.includes('abiertos') ? OPEN_STATUSES : (statusParam as TicketStatus[]);

  const { rows, total } = await withRead((db) =>
    listTickets(db, ctx, {
      status: status.length ? status : undefined,
      priority: sp.getAll('prioridad'),
      category: sp.getAll('categoria'),
      unitId: sp.get('unidad') ?? undefined,
      assigneeId: sp.get('responsable') ?? undefined,
      source: sp.get('origen') ?? undefined,
      from: sp.get('desde') ?? undefined,
      to: sp.get('hasta') ?? undefined,
      onlyOverdue: sp.get('vencidos') === '1',
      onlyUnassigned: sp.get('sinAsignar') === '1',
      limit: pageSize,
      offset: (page - 1) * pageSize,
    }),
  );
  return ok(rows, { page, pageSize, total });
});

export const POST = route(async (req, ctx) => {
  const input = createTicketSchema.parse(await req.json());
  const result = await withTx(ctx, (tx) => createTicket(tx, ctx, input));
  return result.duplicate ? ok(result.ticket, { duplicate: true }) : created(result.ticket);
});
