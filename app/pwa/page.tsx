'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { BUILDING_ID, useSesion } from '@/ui/SesionProvider';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { mutate, readCached } from '@/pwa/sync';
import { pendingMutations, type QueuedMutation } from '@/pwa/queue';
import { formatDate, formatDateTime, pluralize } from '@/shared/format';
import type { ChecklistItem } from '@/db/schema/logbook';

type Checklist = {
  instanceId: string; templateId: string; name: string; freq: string; periodDate: string; status: string;
  items: (ChecklistItem & { done: boolean; note: string | null })[];
  progress: { done: number; total: number };
};
type Hoy = { date: string; season: { isHigh: boolean; label: string; reason?: string }; checklists: Checklist[] };
type Tarea = { id: string; title: string; dueDate: string; status: string; isOverdue: boolean; assetName: string | null };
type Ticket = { id: string; number: number; title: string; priority: string; status: string; unitCode: string | null };

/**
 * ESPEC §4.1 — Hoy.
 * Objetivo: que el encargado sepa en 5 segundos qué tiene que hacer hoy.
 * Totalmente disponible sin conexión.
 */
export default function Hoy() {
  const { perfil } = useSesion();
  const [hoy, setHoy] = useState<Hoy | null>(null);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pendientes, setPendientes] = useState<QueuedMutation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [desdeCache, setDesdeCache] = useState<number | undefined>();
  const [error, setError] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(false);
    try {
      const hoyRes = await readCached<Hoy>(BUILDING_ID, '/checklists/today');
      setHoy(hoyRes.data);
      setDesdeCache(hoyRes.fromCache ? hoyRes.storedAt : undefined);

      const tareasRes = await readCached<Tarea[]>(BUILDING_ID, `/maintenance/tasks?venceAntesDe=${hoyRes.data.date}&estado=pending&estado=overdue`);
      setTareas(tareasRes.data);

      const ticketsRes = await readCached<Ticket[]>(BUILDING_ID, `/tickets?estado=abiertos&responsable=${perfil?.user.id ?? ''}`);
      setTickets(ticketsRes.data);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
      setPendientes(await pendingMutations());
    }
  }, [perfil?.user.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  async function marcar(instanceId: string, item: ChecklistItem, done: boolean) {
    // Respuesta inmediata: la UI no espera a la red (P1, < 200 ms).
    setHoy((prev) =>
      prev
        ? {
            ...prev,
            checklists: prev.checklists.map((c) =>
              c.instanceId === instanceId
                ? {
                    ...c,
                    items: c.items.map((i) => (i.key === item.key ? { ...i, done } : i)),
                    progress: {
                      ...c.progress,
                      done: c.items.filter((i) => i.required && (i.key === item.key ? done : i.done)).length,
                    },
                  }
                : c,
            ),
          }
        : prev,
    );
    await mutate(BUILDING_ID, `/checklists/${instanceId}/items/${encodeURIComponent(item.key)}`, { done }, {
      label: `Checklist: ${item.label}`,
    });
    setPendientes(await pendingMutations());
  }

  if (cargando && !hoy) return <Esqueleto filas={8} />;
  if (error && !hoy) return <ErrorDeRed onReintentar={() => void cargar()} />;
  if (!hoy) return null;

  const vencidas = tareas.filter((t) => t.isOverdue);
  const deHoy = tareas.filter((t) => !t.isOverdue);
  const nombre = perfil?.user.displayName?.split(' ')[0] ?? '';
  const totalPendiente = hoy.checklists.reduce((a, c) => a + (c.progress.total - c.progress.done), 0);

  return (
    <>
      <div className="entre" style={{ marginBottom: '.75rem' }}>
        <div>
          <h1 style={{ marginBottom: 0 }}>Hola{nombre ? `, ${nombre}` : ''}</h1>
          <p style={{ color: 'var(--texto-suave)', margin: 0 }}>{formatDate(hoy.date)}</p>
        </div>
        {/* RN-40 — indicador de temporada */}
        <span className={`etiqueta ${hoy.season.isHigh ? 'ambar' : 'neutra'}`}>
          {hoy.season.label}{hoy.season.reason && hoy.season.isHigh ? ` · ${hoy.season.reason}` : ''}
        </span>
      </div>

      {desdeCache ? <div className="aviso ambar">Mostrando información guardada del {formatDateTime(new Date(desdeCache))}.</div> : null}

      {hoy.checklists.length === 0 && tareas.length === 0 && tickets.length === 0 ? (
        <Vacio
          titulo="No hay tareas para hoy."
          detalle="Podés registrar novedades con el botón +."
          accion={<Link className="boton" href="/pwa/registrar">Registrar</Link>}
        />
      ) : null}

      {/* 2. Checklist del día, agrupado por sección del Manual */}
      {hoy.checklists.map((c) => (
        <section className="tarjeta" key={c.instanceId}>
          <div className="entre">
            <h2 style={{ marginBottom: 0 }}>{c.name}</h2>
            <span className={`etiqueta ${c.progress.done >= c.progress.total ? '' : 'neutra'}`}>
              {c.progress.done}/{c.progress.total}
            </span>
          </div>
          {agrupar(c.items).map(([seccion, items]) => (
            <div key={seccion} style={{ marginTop: '.85rem' }}>
              <p style={{ fontSize: '.76rem', textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--texto-suave)', fontWeight: 700, margin: '0 0 .2rem' }}>
                {seccion}
              </p>
              {items.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className="item-check"
                  aria-pressed={item.done}
                  onClick={() => void marcar(c.instanceId, item, !item.done)}
                >
                  <span className="caja" aria-hidden="true">
                    {item.done ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="texto">
                    {item.label}
                    {/* RN-48: lo opcional no penaliza, y se dice */}
                    {!item.required ? <span className="opcional"> · opcional</span> : null}
                  </span>
                </button>
              ))}
            </div>
          ))}
        </section>
      ))}

      {/* 3. Tareas de mantenimiento — vencidas primero, en rojo */}
      {tareas.length > 0 ? (
        <section className="tarjeta">
          <h2>Tareas de mantenimiento</h2>
          {vencidas.map((t) => (
            <div key={t.id} className="entre" style={{ padding: '.5rem 0', borderBottom: '1px solid var(--borde)' }}>
              <span>{t.title}{t.assetName ? ` · ${t.assetName}` : ''}</span>
              <span className="etiqueta roja">Vencía el {formatDate(t.dueDate)}</span>
            </div>
          ))}
          {deHoy.map((t) => (
            <div key={t.id} className="entre" style={{ padding: '.5rem 0', borderBottom: '1px solid var(--borde)' }}>
              <span>{t.title}{t.assetName ? ` · ${t.assetName}` : ''}</span>
              <span className="etiqueta neutra">Vence hoy</span>
            </div>
          ))}
        </section>
      ) : null}

      {/* 4. Tickets asignados, por prioridad */}
      {tickets.length > 0 ? (
        <section className="tarjeta">
          <h2>Tus tickets abiertos</h2>
          {tickets.map((t) => (
            <Link key={t.id} href={`/pwa/tickets/${t.id}`} className="entre"
              style={{ padding: '.5rem 0', borderBottom: '1px solid var(--borde)', textDecoration: 'none', color: 'inherit' }}>
              <span>#{t.number} · {t.title}{t.unitCode ? ` · ${t.unitCode}` : ''}</span>
              <span className={`etiqueta ${t.priority === 'critical' ? 'roja' : t.priority === 'high' ? 'ambar' : 'neutra'}`}>
                {t.priority === 'critical' ? 'Crítico' : t.priority === 'high' ? 'Alta' : 'Normal'}
              </span>
            </Link>
          ))}
        </section>
      ) : null}

      {/* 5. Pendientes de sincronizar — P2: nunca "guardado" a secas */}
      {pendientes.length > 0 ? (
        <section className="tarjeta">
          <h2>Guardado en el teléfono, pendiente de enviar</h2>
          <p style={{ color: 'var(--texto-suave)', fontSize: '.9rem' }}>
            {pluralize(pendientes.length, 'registro espera', 'registros esperan')} señal. No se pierde nada.
          </p>
          {pendientes.map((m) => (
            <div key={m.clientUuid} className="entre" style={{ padding: '.4rem 0', borderBottom: '1px solid var(--borde)' }}>
              <span style={{ fontSize: '.92rem' }}>{m.label}</span>
              <span className={`etiqueta ${m.status === 'failed' ? 'roja' : 'ambar'}`}>
                {m.status === 'failed' ? 'No se pudo enviar' : 'Pendiente'}
              </span>
            </div>
          ))}
        </section>
      ) : null}

      {totalPendiente > 0 ? (
        <p style={{ color: 'var(--texto-suave)', fontSize: '.88rem', marginTop: '1rem' }}>
          Te {pluralize(totalPendiente, 'queda 1 ítem requerido', `quedan ${totalPendiente} ítems requeridos`)} por marcar hoy.
        </p>
      ) : null}

      <Link href="/pwa/cumplimiento" className="boton secundario ancho" style={{ marginTop: '1rem' }}>
        Ver cumplimiento del plan
      </Link>
    </>
  );
}

function agrupar(items: (ChecklistItem & { done: boolean; note: string | null })[]) {
  const map = new Map<string, typeof items>();
  for (const i of items) {
    const list = map.get(i.section) ?? [];
    list.push(i);
    map.set(i.section, list);
  }
  return [...map.entries()];
}
