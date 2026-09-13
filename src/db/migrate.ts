/**
 * Migrador. Aplica en orden los .sql de src/db/migrations y registra lo aplicado.
 *
 * Las migraciones se escriben a mano en SQL porque el esquema usa DDL que
 * drizzle-kit no expresa: constraint de exclusión GiST (unit_occupancies),
 * triggers de auditoría, reglas de inmutabilidad y vistas de análisis.
 * `drizzle-kit generate` se usa para diffear el esquema TS contra la base y
 * proponer el DDL, que luego se revisa y se guarda acá numerado.
 */
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool } from './client';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

export async function migrate(): Promise<{ applied: string[]; skipped: string[] }> {
  const pool = getPool();
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  try {
    await client.query(`
      create table if not exists _migrations (
        name        text primary key,
        checksum    text not null,
        applied_at  timestamptz not null default now()
      )`);

    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await client.query<{ name: string; checksum: string }>(
      'select name, checksum from _migrations',
    );
    const seen = new Map(rows.map((r) => [r.name, r.checksum]));

    for (const file of files) {
      const sqlText = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      const checksum = createHash('sha256').update(sqlText).digest('hex');
      const previous = seen.get(file);

      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `La migración ${file} ya fue aplicada y cambió su contenido. ` +
              'Nunca edites una migración mergeada: creá una nueva.',
          );
        }
        skipped.push(file);
        continue;
      }

      process.stdout.write(`▸ aplicando ${file}\n`);
      await client.query('begin');
      try {
        await client.query(sqlText);
        await client.query('insert into _migrations (name, checksum) values ($1, $2)', [file, checksum]);
        await client.query('commit');
        applied.push(file);
      } catch (err) {
        await client.query('rollback');
        throw new Error(`Falló la migración ${file}: ${(err as Error).message}`, { cause: err });
      }
    }
    return { applied, skipped };
  } finally {
    client.release();
  }
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  migrate()
    .then(({ applied, skipped }) => {
      process.stdout.write(`✔ ${applied.length} migraciones aplicadas, ${skipped.length} ya estaban.\n`);
      return getPool().end();
    })
    .then(() => process.exit(0))
    .catch((err: Error) => {
      process.stderr.write(`✖ ${err.message}\n`);
      process.exit(1);
    });
}
