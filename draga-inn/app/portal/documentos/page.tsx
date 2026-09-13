'use client';

import { BUILDING_ID } from '@/ui/SesionProvider';
import { useApi } from '@/ui/datos';
import { Esqueleto, ErrorDeRed, Vacio } from '@/ui/estados';
import { formatDate } from '@/shared/format';
import { getIdToken } from '@/pwa/firebase-client';

type Doc = { id: string; title: string; docType: string; issuedOn: string | null; expiresOn: string | null };

/** El portal solo ve documentos publicados. Lo interno no se lista ni se insinúa. */
export default function Documentos() {
  const { datos, cargando, error, recargar } = useApi<Doc[]>(BUILDING_ID, '/documents');

  async function abrir(id: string) {
    const token = await getIdToken();
    const res = await fetch(`/api/buildings/${BUILDING_ID}/documents/${id}/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return;
    const { data } = (await res.json()) as { data: { url: string } };
    window.open(data.url, '_blank', 'noopener');
  }

  if (cargando) return <Esqueleto filas={6} />;
  if (error) return <ErrorDeRed onReintentar={recargar} />;

  return (
    <>
      <h1>Documentos</h1>
      {!datos || datos.length === 0 ? (
        <Vacio titulo="Todavía no hay documentos publicados." detalle="Cuando la administración publique actas, reglamentos o informes, los vas a ver acá." />
      ) : (
        datos.map((d) => (
          <div key={d.id} className="tarjeta">
            <div className="entre">
              <div>
                <strong>{d.title}</strong>
                <p style={{ margin: '.2rem 0 0', fontSize: '.85rem', color: 'var(--texto-suave)' }}>
                  {d.docType}{d.issuedOn ? ` · ${formatDate(d.issuedOn)}` : ''}
                </p>
              </div>
              <button type="button" className="boton secundario" onClick={() => void abrir(d.id)}>Abrir</button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
