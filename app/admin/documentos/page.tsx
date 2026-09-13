'use client';

import { Listado } from '@/ui/Listado';
import { formatDate } from '@/shared/format';

type Doc = { id: string; title: string; docType: string; issuedOn: string | null; expiresOn: string | null; visibility: string };

const VIS: Record<string, string> = { internal: 'Interno', committee: 'Comisión', owners: 'Propietarios', public: 'Público' };

export default function Documentos() {
  return (
    <Listado<Doc>
      titulo="Documentos"
      endpoint="/documents"
      aviso={
        <div className="aviso info">
          Todo documento nace como interno. Publicarlo a propietarios es un acto explícito y queda auditado.
        </div>
      }
      vacio={{ titulo: 'Todavía no hay documentos cargados.' }}
      columnas={[
        { clave: 'title', titulo: 'Título', render: (d) => <a href={`/api/buildings/_/documents/${d.id}/download`}>{d.title}</a> },
        { clave: 'tipo', titulo: 'Tipo', render: (d) => d.docType },
        { clave: 'emitido', titulo: 'Emitido', render: (d) => (d.issuedOn ? formatDate(d.issuedOn) : '—') },
        { clave: 'vence', titulo: 'Vence', render: (d) => (d.expiresOn ? formatDate(d.expiresOn) : '—') },
        { clave: 'visibilidad', titulo: 'Visibilidad', render: (d) => (
          <span className={`etiqueta ${d.visibility === 'internal' ? 'neutra' : ''}`}>{VIS[d.visibility] ?? d.visibility}</span>
        ) },
      ]}
    />
  );
}
