/**
 * Entry point de los Cloud Run Jobs. Cloud Scheduler invoca el contenedor con
 * `JOB_NAME` (o `pnpm job <nombre>`). Todos son idempotentes ante reejecución.
 */
import { getPool } from '@/db/client';
import { generateMaintenanceTasks } from './generate-maintenance-tasks';
import { flagOverdue } from './flag-overdue';
import { expiryScan } from './expiry-scan';
import { computeCompliance } from './compute-compliance';
import { detectTrends } from './detect-trends';
import { generateMonthlyReport } from './generate-monthly-report';
import { dispatchOutbox } from './dispatch-outbox';
import { autoCloseTickets } from './auto-close-tickets';

const JOBS = {
  'generate-maintenance-tasks': generateMaintenanceTasks,
  'flag-overdue': flagOverdue,
  'expiry-scan': expiryScan,
  'compute-compliance': computeCompliance,
  'detect-trends': detectTrends,
  'generate-monthly-report': generateMonthlyReport,
  'dispatch-outbox': dispatchOutbox,
  'auto-close-tickets': autoCloseTickets,
} as const;

export type JobName = keyof typeof JOBS;

async function main(): Promise<void> {
  const name = (process.argv[2] ?? process.env.JOB_NAME) as JobName | undefined;
  if (!name || !(name in JOBS)) {
    process.stderr.write(`Job desconocido. Opciones: ${Object.keys(JOBS).join(', ')}\n`);
    process.exit(2);
  }

  const started = Date.now();
  try {
    const result = await (JOBS[name] as () => Promise<unknown>)();
    console.log(JSON.stringify({ severity: 'INFO', event: 'job.done', job: name, ms: Date.now() - started, result }));
    await getPool().end();
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ severity: 'ERROR', event: 'job.failed', job: name, message: (err as Error).message, stack: (err as Error).stack }));
    await getPool().end().catch(() => undefined);
    process.exit(1);
  }
}

void main();
