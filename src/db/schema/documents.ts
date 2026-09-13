import { pgTable, uuid, text, date, bigint, pgEnum, unique, index } from 'drizzle-orm/pg-core';
import { createdAt, updatedAt } from './_shared';
import { buildings } from './buildings';
import { users } from './people';

export const docVisibility = pgEnum('doc_visibility', ['internal', 'committee', 'owners', 'public']);

/** RN-17: todo documento nace `internal`. Publicarlo es un acto explícito y auditado. */
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    buildingId: uuid('building_id')
      .notNull()
      .references(() => buildings.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    docType: text('doc_type').notNull(),
    storagePath: text('storage_path').notNull(),
    mimeType: text('mime_type'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }),
    checksum: text('checksum'),
    issuedOn: date('issued_on'),
    /** RN-18: alimenta el tablero de riesgos a 30/15/7 días. */
    expiresOn: date('expires_on'),
    visibility: docVisibility('visibility').notNull().default('internal'),
    /** CB-09: una foto que no subió tras 10 intentos queda marcada, no perdida. */
    uploadState: text('upload_state').notNull().default('confirmed'),
    uploadedBy: uuid('uploaded_by').references(() => users.id),
    createdAt,
    updatedAt,
    createdBy: uuid('created_by'),
  },
  (t) => [index('documents_expiry_idx').on(t.buildingId, t.expiresOn), index('documents_type_idx').on(t.buildingId, t.docType)],
);

export const documentLinks = pgTable(
  'document_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    createdAt,
  },
  (t) => [
    unique('document_links_uq').on(t.documentId, t.entityType, t.entityId),
    index('document_links_entity_idx').on(t.entityType, t.entityId),
  ],
);
