# Despliegue

**Sistema de Gestión y Gobernanza — Edificio Draga Inn**
Versión 1.0 · 13/09/2026

Este documento lleva de un proyecto de Google Cloud vacío a un sistema en
producción. Los comandos se pueden copiar y pegar en orden.

---

## Índice

1. [Arquitectura desplegada](#1-arquitectura-desplegada)
2. [Lo que hace falta antes de empezar](#2-lo-que-hace-falta-antes-de-empezar)
3. [Desarrollo local](#3-desarrollo-local)
4. [Provisionar Google Cloud](#4-provisionar-google-cloud)
5. [Configurar Firebase Auth](#5-configurar-firebase-auth)
6. [Secretos](#6-secretos)
7. [Primer despliegue](#7-primer-despliegue)
8. [Base de datos: migraciones y seed](#8-base-de-datos-migraciones-y-seed)
9. [Jobs programados](#9-jobs-programados)
10. [Firebase Hosting y dominio](#10-firebase-hosting-y-dominio)
11. [Alta del primer administrador](#11-alta-del-primer-administrador)
12. [Despliegues siguientes](#12-despliegues-siguientes)
13. [Copias de seguridad y restauración](#13-copias-de-seguridad-y-restauración)
14. [Observabilidad y alertas](#14-observabilidad-y-alertas)
15. [Marcha atrás](#15-marcha-atrás)
16. [Problemas frecuentes](#16-problemas-frecuentes)
17. [Costos estimados](#17-costos-estimados)
18. [Lista de verificación](#18-lista-de-verificación-antes-de-abrir-a-usuarios)

---

## 1. Arquitectura desplegada

```
                    ┌──────────────────────┐
   Navegador ──────▶│  Firebase Hosting    │  CDN, TLS, dominio
   (PWA · consola   │  draga-inn.web.app   │
    · portal)       └──────────┬───────────┘
                               │ rewrite  **  →  Cloud Run
                    ┌──────────▼───────────┐
                    │  Cloud Run           │  draga-app-prod
                    │  Next.js standalone  │  min=0  max=4
                    └────┬────────┬────────┘
                         │        │
        conector Cloud SQL│        │ signed URLs v4
                    ┌────▼────┐ ┌─▼──────────────┐
                    │Cloud SQL│ │ Cloud Storage  │  draga-prod-documents
                    │ PG 16   │ │ sin acceso     │  público: NUNCA
                    │ privado │ │ público        │
                    └────▲────┘ └────────────────┘
                         │
   ┌─────────────────────┴──────────────────┐
   │  Cloud Run Jobs  (8 jobs programados)  │◀── Cloud Scheduler
   └────────────────────────────────────────┘     zona America/Montevideo

   Firebase Auth ──▶ identidad (verificada con firebase-admin en cada request)
   Secret Manager ─▶ DATABASE_URL, RESEND_API_KEY
```

**Regiones.** Todo en `southamerica-east1` (São Paulo), que es la más cercana a
Punta del Este. Firebase Auth es global.

---

## 2. Lo que hace falta antes de empezar

| Requisito | Verificación |
|---|---|
| Proyecto de Google Cloud con facturación activa | `gcloud billing projects describe $PROJECT` |
| `gcloud` ≥ 480 | `gcloud version` |
| `firebase-tools` ≥ 13 | `firebase --version` |
| Terraform ≥ 1.6 *(opcional pero recomendado)* | `terraform version` |
| Node 22 y pnpm 10 | `node -v && pnpm -v` |
| Rol `Owner` o `Editor` + `Secret Manager Admin` sobre el proyecto | |

```bash
export PROJECT=draga-inn          # cambialo por el id real del proyecto
export REGION=southamerica-east1
export ENV_NAME=prod

gcloud config set project "$PROJECT"
gcloud auth login
gcloud auth application-default login
```

---

## 3. Desarrollo local

Antes de tocar la nube conviene tener el sistema corriendo en la máquina.

### 3.1. Postgres local

```bash
docker run -d --name draga-pg \
  -e POSTGRES_USER=draga -e POSTGRES_PASSWORD=draga -e POSTGRES_DB=draga \
  -p 5432:5432 postgres:16
```

### 3.2. Variables

```bash
cp .env.example .env
# Editá .env:
#   DATABASE_URL=postgres://draga:draga@127.0.0.1:5432/draga
#   NEXT_PUBLIC_FIREBASE_*  → de la consola de Firebase (paso 5)
```

### 3.3. Migrar, sembrar y levantar

```bash
pnpm install
pnpm db:migrate     # aplica 0000, 0001 y 0002 en orden
pnpm db:seed        # edificio, unidades, plantillas del Manual, activos, insumos
pnpm dev            # http://localhost:3000
```

### 3.4. Emulador de Firebase Auth

Para no depender de cuentas reales en desarrollo:

```bash
firebase emulators:start --only auth
# y en .env:
#   FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

### 3.5. Verificación local completa

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Los tests de integración necesitan `DATABASE_URL`. Sin esa variable se saltean
solos y quedan solo los unitarios.

> **Ojo:** los tests de integración **vacían el esquema `public`** de la base
> apuntada por `DATABASE_URL` antes de correr. Nunca los apuntes a producción.

### 3.6. Correr un job a mano

```bash
pnpm job compute-compliance
pnpm job dispatch-outbox
```

---

## 4. Provisionar Google Cloud

### Opción A — Terraform (recomendado)

Deja todo declarado y reproducible.

```bash
cd infra/terraform
terraform init
terraform apply \
  -var project_id="$PROJECT" \
  -var region="$REGION" \
  -var env="$ENV_NAME" \
  -var billing_account="$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)' | cut -d/ -f2)"
```

Crea: APIs habilitadas, Artifact Registry, Cloud SQL PostgreSQL 16 **sin IP
pública**, VPC con peering privado, bucket de documentos con
`public_access_prevention = enforced`, tres cuentas de servicio con el mínimo
privilegio, los secretos y el presupuesto con alerta al 50 / 80 / 100 %.

Anotá las salidas:

```bash
terraform output
# sql_connection_name  = "draga-inn:southamerica-east1:draga-pg-prod"
# bucket_documentos    = "draga-prod-documents"
# service_account_app  = "draga-app@draga-inn.iam.gserviceaccount.com"
# registro_imagenes    = "southamerica-east1-docker.pkg.dev/draga-inn/draga"
```

### Opción B — a mano

<details>
<summary>Desplegar sin Terraform</summary>

```bash
# APIs
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  secretmanager.googleapis.com cloudscheduler.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com \
  firebase.googleapis.com identitytoolkit.googleapis.com \
  storage.googleapis.com iamcredentials.googleapis.com

# Registro de imágenes
gcloud artifacts repositories create draga \
  --repository-format=docker --location="$REGION"

# Cloud SQL — la instancia más chica que sirve; HA desactivada en v1 por costo
gcloud sql instances create "draga-pg-$ENV_NAME" \
  --database-version=POSTGRES_16 --tier=db-g1-small --region="$REGION" \
  --storage-size=10 --storage-type=SSD --storage-auto-increase \
  --backup --backup-start-time=06:00 \
  --enable-point-in-time-recovery --retained-transaction-log-days=7 \
  --maintenance-window-day=TUE --maintenance-window-hour=8

gcloud sql databases create draga --instance="draga-pg-$ENV_NAME"
DB_PASS="$(openssl rand -base64 24 | tr -d '/+=')"
gcloud sql users create draga_app --instance="draga-pg-$ENV_NAME" --password="$DB_PASS"

# Bucket de documentos — nunca público
gcloud storage buckets create "gs://draga-$ENV_NAME-documents" \
  --location="$REGION" --uniform-bucket-level-access \
  --public-access-prevention
gcloud storage buckets update "gs://draga-$ENV_NAME-documents" --versioning
gcloud storage buckets update "gs://draga-$ENV_NAME-documents" \
  --cors-file=infra/cors-storage.json

# Cuentas de servicio
for SA in draga-app draga-jobs draga-scheduler; do
  gcloud iam service-accounts create "$SA"
done

for ROL in roles/cloudsql.client roles/secretmanager.secretAccessor roles/logging.logWriter; do
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:draga-app@$PROJECT.iam.gserviceaccount.com" --role="$ROL"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:draga-jobs@$PROJECT.iam.gserviceaccount.com" --role="$ROL"
done

# Firmar signed URLs v4 requiere firmar como uno mismo
gcloud iam service-accounts add-iam-policy-binding \
  "draga-app@$PROJECT.iam.gserviceaccount.com" \
  --member="serviceAccount:draga-app@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/iam.serviceAccountTokenCreator

# Acceso al bucket, acotado al bucket
gcloud storage buckets add-iam-policy-binding "gs://draga-$ENV_NAME-documents" \
  --member="serviceAccount:draga-app@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/storage.objectAdmin

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:draga-scheduler@$PROJECT.iam.gserviceaccount.com" \
  --role=roles/run.invoker
```
</details>

---

## 5. Configurar Firebase Auth

1. Abrí <https://console.firebase.google.com> y **agregá Firebase** al proyecto
   de Google Cloud que ya existe (no crees uno nuevo).
2. **Authentication → Sign-in method**: habilitá **Correo/contraseña** y
   **Vínculo de correo (sin contraseña)**.
3. **Authentication → Settings → Authorized domains**: agregá tu dominio
   (`dragainn.uy`) y `draga-inn.web.app`.
4. **Project settings → General → Your apps → Web app**: creá una app web y
   copiá la configuración.

Esos valores van como `NEXT_PUBLIC_FIREBASE_*`. **No son secretos**: viajan en el
bundle del cliente por diseño. Lo que protege el sistema es la verificación del
ID token en el servidor, no el ocultamiento de la `apiKey`.

```bash
export FIREBASE_API_KEY="AIza…"
export FIREBASE_AUTH_DOMAIN="$PROJECT.firebaseapp.com"
export FIREBASE_APP_ID="1:123…:web:abc…"
export BUILDING_ID="11111111-1111-1111-1111-111111111111"
```

---

## 6. Secretos

```bash
SQL_CONN="$(gcloud sql instances describe "draga-pg-$ENV_NAME" --format='value(connectionName)')"

# El conector de Cloud SQL usa socket Unix: no hay IP ni puerto expuestos
printf 'postgres://draga_app:%s@/draga?host=/cloudsql/%s' "$DB_PASS" "$SQL_CONN" \
  | gcloud secrets create "draga-database-url-$ENV_NAME" --data-file=-

# Correo saliente (Resend)
printf 're_xxxxx' | gcloud secrets create draga-resend-key --data-file=-
```

Para rotar después:

```bash
printf 'nuevo-valor' | gcloud secrets versions add "draga-database-url-$ENV_NAME" --data-file=-
gcloud run services update "draga-app-$ENV_NAME" --region="$REGION" \
  --set-secrets="DATABASE_URL=draga-database-url-$ENV_NAME:latest"
```

> Ni una credencial va al repositorio ni al bundle del cliente. Si alguna vez se
> filtra una, rotala **y** revocá la versión anterior:
> `gcloud secrets versions destroy N --secret=nombre`.

---

## 7. Primer despliegue

### 7.1. Con Cloud Build

```bash
gcloud builds submit --config infra/cloudbuild.yaml \
  --substitutions="_ENV=$ENV_NAME,_REGION=$REGION,\
_FIREBASE_API_KEY=$FIREBASE_API_KEY,\
_FIREBASE_AUTH_DOMAIN=$FIREBASE_AUTH_DOMAIN,\
_FIREBASE_APP_ID=$FIREBASE_APP_ID,\
_BUILDING_ID=$BUILDING_ID"
```

El pipeline, en orden: instala, **corre typecheck, lint y tests**, construye las
dos imágenes, las publica, **aplica migraciones**, despliega la aplicación y
actualiza los ocho jobs.

Si los tests fallan, el pipeline se detiene antes de construir nada. Es a
propósito: `CLAUDE.md` pide que cada PR quede desplegable y verde por sí solo.

### 7.2. A mano

<details>
<summary>Sin Cloud Build</summary>

```bash
REG="$REGION-docker.pkg.dev/$PROJECT/draga"
gcloud auth configure-docker "$REGION-docker.pkg.dev"

docker build -f infra/Dockerfile -t "$REG/draga-app:v1" \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY="$FIREBASE_API_KEY" \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$FIREBASE_AUTH_DOMAIN" \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID="$PROJECT" \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID="$FIREBASE_APP_ID" \
  --build-arg NEXT_PUBLIC_BUILDING_ID="$BUILDING_ID" .
docker push "$REG/draga-app:v1"

docker build -f infra/Dockerfile.jobs -t "$REG/draga-jobs:v1" .
docker push "$REG/draga-jobs:v1"

gcloud run deploy "draga-app-$ENV_NAME" \
  --image="$REG/draga-app:v1" --region="$REGION" \
  --service-account="draga-app@$PROJECT.iam.gserviceaccount.com" \
  --set-cloudsql-instances="$SQL_CONN" \
  --set-secrets="DATABASE_URL=draga-database-url-$ENV_NAME:latest,RESEND_API_KEY=draga-resend-key:latest" \
  --set-env-vars="NODE_ENV=production,APP_TIMEZONE=America/Montevideo,GCS_BUCKET=draga-$ENV_NAME-documents,FIREBASE_PROJECT_ID=$PROJECT,NOTIFICATIONS_ENABLED=true" \
  --min-instances=0 --max-instances=4 --cpu=1 --memory=1Gi \
  --concurrency=60 --timeout=60s --no-allow-unauthenticated
```
</details>

### 7.3. Por qué `--no-allow-unauthenticated`

Cloud Run no se expone directamente: el acceso público entra por Firebase
Hosting, que invoca al servicio con su propia identidad. Si necesitás probar sin
Hosting:

```bash
gcloud run services add-iam-policy-binding "draga-app-$ENV_NAME" \
  --region="$REGION" --member=allUsers --role=roles/run.invoker
# …y quitalo cuando termines.
```

---

## 8. Base de datos: migraciones y seed

Cloud Build ya corre las migraciones. Para hacerlo a mano:

```bash
gcloud run jobs deploy "draga-migrate-$ENV_NAME" \
  --image="$REG/draga-jobs:v1" --region="$REGION" \
  --service-account="draga-jobs@$PROJECT.iam.gserviceaccount.com" \
  --set-cloudsql-instances="$SQL_CONN" \
  --set-secrets="DATABASE_URL=draga-database-url-$ENV_NAME:latest" \
  --command=node_modules/.bin/tsx --args=src/db/migrate.ts \
  --max-retries=0 --task-timeout=10m

gcloud run jobs execute "draga-migrate-$ENV_NAME" --region="$REGION" --wait
```

El **seed** se corre **una sola vez**, al principio:

```bash
gcloud run jobs deploy "draga-seed-$ENV_NAME" \
  --image="$REG/draga-jobs:v1" --region="$REGION" \
  --service-account="draga-jobs@$PROJECT.iam.gserviceaccount.com" \
  --set-cloudsql-instances="$SQL_CONN" \
  --set-secrets="DATABASE_URL=draga-database-url-$ENV_NAME:latest" \
  --command=node_modules/.bin/tsx --args=src/db/seed.ts

gcloud run jobs execute "draga-seed-$ENV_NAME" --region="$REGION" --wait
```

Es idempotente: correrlo dos veces no duplica nada. Aun así, después del primer
despliegue conviene borrar el job para que nadie lo ejecute sin querer.

### Lo que siembra, y lo que hay que reemplazar

| Qué | Estado |
|---|---|
| Edificio, zona horaria, moneda, parámetros | **Definitivo** (ajustable en `buildings.settings`) |
| Plantillas de checklist del Manual v1.5 | **Definitivo** |
| Rubros presupuestales | **Definitivo** |
| Insumos críticos del Anexo E | **Definitivo** |
| **Unidades y coeficientes** | **PROVISORIO** — depende de Q5 del PRD |
| **Reglas de gobernanza** | **PROVISORIO** — dependen de Q2 y Q3 |
| **Activos** | **PROVISORIO** — dependen de Q7 |

Reemplazar el padrón real **antes** de abrir el portal a propietarios.

### Conectarse a la base a mano

```bash
gcloud sql connect "draga-pg-$ENV_NAME" --user=draga_app --database=draga
# o con el proxy, para usar psql o un cliente gráfico:
cloud-sql-proxy "$SQL_CONN" --port 5433 &
psql "postgres://draga_app@127.0.0.1:5433/draga"
```

---

## 9. Jobs programados

```bash
PROJECT="$PROJECT" REGION="$REGION" ENV_NAME="$ENV_NAME" ./infra/scheduler.sh
```

| Job | Horario (Montevideo) | Qué hace |
|---|---|---|
| `generate-maintenance-tasks` | 03:00 diario | Materializa tareas preventivas de los próximos 60 días |
| `flag-overdue` | 04:00 diario | Marca tareas vencidas (RN-24) |
| `expiry-scan` | 04:15 diario | Vencimientos a 30, 15 y 7 días (RN-18) |
| `auto-close-tickets` | 04:30 diario | Cierra tickets resueltos sin objeción (RN-11) |
| `compute-compliance` | 20:00 diario | Cumplimiento del día; dispara RN-44 y RN-45 |
| `detect-trends` | 20:15 diario | Tendencias de piscina (RN-47), ítems omitidos (RN-46) |
| `generate-monthly-report` | 05:00 del día 1 | Informe del mes anterior con el resumen de control (RN-50) |
| `dispatch-outbox` | cada 5 minutos | Despacha notificaciones |

Cloud Scheduler recibe la zona `America/Montevideo` directamente, así que el
horario de verano no requiere ningún ajuste. Además, **todos los jobs son
idempotentes**: si uno se ejecuta dos veces por un reintento, no duplica nada
(CB-13).

Verificar:

```bash
gcloud scheduler jobs list --location="$REGION"
gcloud run jobs execute "draga-compute-compliance-$ENV_NAME" --region="$REGION" --wait
gcloud run jobs executions list --job="draga-compute-compliance-$ENV_NAME" --region="$REGION"
```

---

## 10. Firebase Hosting y dominio

```bash
firebase login
firebase use "$PROJECT"

# Ajustá firebase.json si el servicio o la región no son los del ejemplo
firebase deploy --only hosting
```

Dominio propio:

```bash
firebase hosting:sites:list
# Consola de Firebase → Hosting → Agregar dominio personalizado → dragainn.uy
# Cargá los registros A/TXT que indique en tu proveedor de DNS.
```

El certificado TLS lo emite y renueva Firebase. `Strict-Transport-Security` ya
está en las cabeceras de `firebase.json`.

### Verificar que la PWA se instala

1. Abrí `https://dragainn.uy/pwa` en Chrome de un Android.
2. Menú → **Instalar aplicación**.
3. Activá modo avión, cargá un ticket: tiene que decir **«Guardado en el
   teléfono, pendiente de enviar»**.
4. Desactivá modo avión y esperá: el contador de pendientes baja a cero y el
   ticket aparece en la consola de administración **una sola vez**.

---

## 11. Alta del primer administrador

El sistema no tiene registro abierto: se entra por invitación. La primera se
carga a mano.

```sql
-- Conectado a la base de producción
insert into invitations (building_id, email, role)
values ('11111111-1111-1111-1111-111111111111', 'administrador@dragainn.uy', 'administrador');
```

Después, en la consola de Firebase → Authentication → **Add user**, creá la
cuenta con ese mismo correo. Al entrar por primera vez, el sistema resuelve la
invitación, crea el usuario y le asigna el rol.

De ahí en adelante las invitaciones se cargan desde la aplicación.

### Dar de alta al encargado

```sql
insert into parties (building_id, full_name, email, doc_type, doc_number)
values ('11111111-1111-1111-1111-111111111111', 'Nombre del encargado',
        'encargado@dragainn.uy', 'CI', '0.000.000-0');

insert into invitations (building_id, email, role, party_id)
select '11111111-1111-1111-1111-111111111111', 'encargado@dragainn.uy', 'encargado', id
  from parties where email = 'encargado@dragainn.uy';
```

---

## 12. Despliegues siguientes

```bash
git checkout -b pr-XX-descripcion
# … cambios …
pnpm typecheck && pnpm lint && pnpm test
git push -u origin pr-XX-descripcion
# PR, revisión, merge a main
gcloud builds submit --config infra/cloudbuild.yaml --substitutions="_ENV=prod,…"
```

### Migraciones en despliegues siguientes

**Nunca edites una migración ya aplicada.** El migrador guarda el checksum de
cada archivo y falla explícitamente si cambió:

```
✖ La migración 0001_audit.sql ya fue aplicada y cambió su contenido.
  Nunca edites una migración mergeada: creá una nueva.
```

Para un cambio de esquema, agregá `0003_loquesea.sql`.

**Las migraciones corren antes de desplegar la nueva versión.** Eso implica que
el código viejo convive unos segundos con el esquema nuevo: las migraciones
tienen que ser **compatibles hacia atrás**. Para renombrar una columna, hacelo en
dos despliegues (agregar nueva → migrar datos y código → borrar vieja), no en uno.

---

## 13. Copias de seguridad y restauración

Cloud SQL hace copias diarias con 30 de retención y PITR de 7 días. Eso no sirve
de nada si nunca se probó restaurar.

```bash
# Listar copias
gcloud sql backups list --instance="draga-pg-$ENV_NAME"

# Restaurar a una instancia NUEVA (nunca encima de la que está en producción)
gcloud sql instances create draga-pg-restore-test \
  --database-version=POSTGRES_16 --tier=db-g1-small --region="$REGION"

gcloud sql backups restore BACKUP_ID \
  --restore-instance=draga-pg-restore-test \
  --backup-instance="draga-pg-$ENV_NAME"

# Punto en el tiempo (dentro de los 7 días)
gcloud sql instances clone "draga-pg-$ENV_NAME" draga-pg-pitr \
  --point-in-time='2026-09-13T14:30:00Z'
```

Verificar que la restauración sirve:

```sql
select count(*) from audit_log;            -- la auditoría no se pierde
select count(*) from case_events;          -- la línea de tiempo tampoco
select max(occurred_at) from audit_log;    -- ¿hasta qué momento llegó?
select count(*) from units;
```

Y borrar la instancia de prueba, que cuesta plata:

```bash
gcloud sql instances delete draga-pg-restore-test
```

> **Probá la restauración antes de abrir el sistema a usuarios reales.** Es uno
> de los puntos de la definición de terminado del v1.

### Documentos

El bucket tiene versionado, con borrado de versiones antiguas a los 90 días.
Para una copia fuera de línea:

```bash
gcloud storage rsync -r "gs://draga-$ENV_NAME-documents" ./respaldo-documentos
```

---

## 14. Observabilidad y alertas

Los logs son JSON estructurado con `severity`, `event`, `requestId` y `userId`.
**Nunca llevan datos personales** ni contenido de documentos (Ley 18.331).

```bash
# Errores de la aplicación
gcloud logging read \
  'resource.type=cloud_run_revision AND resource.labels.service_name="draga-app-prod" AND severity>=ERROR' \
  --limit 50 --format=json

# Seguir un request de punta a punta
gcloud logging read 'jsonPayload.requestId="UUID-DEL-REQUEST"' --limit 50

# Jobs que fallaron
gcloud logging read 'jsonPayload.event="job.failed"' --limit 20
```

### Alertas recomendadas

```bash
# Tasa de error > 2 % (HANDOFF §10)
gcloud alpha monitoring policies create --policy-from-file=- <<'YAML'
displayName: "Draga Inn — tasa de error alta"
conditions:
  - displayName: "5xx > 2% en 5 minutos"
    conditionThreshold:
      filter: >
        resource.type="cloud_run_revision"
        AND resource.labels.service_name="draga-app-prod"
        AND metric.type="run.googleapis.com/request_count"
        AND metric.labels.response_code_class="5xx"
      comparison: COMPARISON_GT
      thresholdValue: 0.02
      duration: 300s
combiner: OR
YAML
```

Además conviene alertar sobre:

- **Outbox trabado**: `select count(*) from outbox where status = 'failed'` > 0.
- **Job que no corrió**: `job_runs` sin fila para la fecha esperada.
- **Días sin registro**: ya lo cubre RN-45 por correo, pero vale una alerta de
  infraestructura si `compute-compliance` deja de correr.

### Consultas útiles de salud

```sql
-- ¿El outbox está al día?
select status, count(*) from outbox group by status;

-- ¿Corrieron los jobs de hoy?
select job_name, status, started_at from job_runs
 where started_at::date = current_date order by started_at desc;

-- ¿Hay escrituras sin autor? (señal de código que saltea withTx)
select entity_type, count(*) from audit_log
 where actor_user_id is null and occurred_at > now() - interval '7 days'
 group by entity_type;
```

Esa última consulta es la que detecta si alguien agregó código que escribe sin
pasar por `withTx()`.

---

## 15. Marcha atrás

Cloud Run guarda las revisiones anteriores:

```bash
gcloud run revisions list --service="draga-app-$ENV_NAME" --region="$REGION"

gcloud run services update-traffic "draga-app-$ENV_NAME" \
  --region="$REGION" --to-revisions=draga-app-prod-00042-abc=100
```

**La base no vuelve atrás sola.** Si el despliegue incluía una migración
destructiva, volver el código no alcanza. Por eso las migraciones tienen que ser
compatibles hacia atrás: para revertir un cambio de esquema, el camino es una
migración nueva que lo deshaga, no restaurar una copia (que perdería lo que pasó
desde entonces).

---

## 16. Problemas frecuentes

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `Falta DATABASE_URL` | El secreto no está montado | `gcloud run services describe … --format='value(spec.template.spec.containers[0].env)'` |
| `connect ENOENT /cloudsql/…` | Falta `--set-cloudsql-instances` | Volver a desplegar con el `connectionName` correcto |
| `Tu sesión venció` en bucle | Dominio no autorizado en Firebase Auth | Agregarlo en Authentication → Settings → Authorized domains |
| `No tenés acceso a este edificio` | Falta la invitación o el membership | `select * from invitations where email = '…'` |
| Las signed URLs fallan con 403 | Falta `serviceAccountTokenCreator` sobre sí misma | Ver el binding del paso 4 |
| Los jobs no se disparan | La cuenta de Scheduler no es `run.invoker` | `gcloud projects add-iam-policy-binding … --role=roles/run.invoker` |
| El correo no sale | `NOTIFICATIONS_ENABLED` en `false` o falta `RESEND_API_KEY` | Revisar variables; en desarrollo queda en `false` a propósito |
| La PWA no se actualiza | Service worker cacheado | Se resuelve solo: `/sw.js` va con `no-cache` y la versión invalida las cachés viejas |
| Fechas corridas un día | Alguien usó `new Date()` en vez de `localDate(…, tz)` | Todo cálculo de fecha usa la zona del edificio |
| La migración falla por checksum | Se editó una migración ya aplicada | Revertir el archivo y crear una nueva |

### Verificación rápida de que todo está vivo

```bash
SERVICE_URL="$(gcloud run services describe "draga-app-$ENV_NAME" --region="$REGION" --format='value(status.url)')"
curl -s -o /dev/null -w '%{http_code}\n' "$SERVICE_URL"        # 200 o 302
curl -s -o /dev/null -w '%{http_code}\n' "$SERVICE_URL/api/buildings/$BUILDING_ID/me"   # 401 sin token: correcto
```

Un **401 sin token es la respuesta correcta**: significa que la API está
exigiendo identidad.

---

## 17. Costos estimados

Para un edificio, uso real, precios de referencia de `southamerica-east1`:

| Componente | Configuración | USD/mes aprox. |
|---|---|---|
| Cloud SQL PostgreSQL 16 | `db-g1-small`, 10 GB SSD, zonal | 28 – 35 |
| Cloud Run (aplicación) | `min-instances=0`, uso bajo | 0 – 5 |
| Cloud Run Jobs | 8 jobs, segundos por corrida | < 1 |
| Cloud Storage | pocos GB de documentos | 1 – 3 |
| Firebase Hosting | plan Spark alcanza | 0 |
| Firebase Auth | < 50.000 usuarios | 0 |
| Secret Manager | 2 secretos | < 1 |
| Cloud Scheduler | 8 jobs | 0 (3 gratis, resto centavos) |
| Resend | plan gratuito: 3.000 correos/mes | 0 |
| **Total** | | **≈ 30 – 45** |

Cloud SQL es el 80 % del costo, y es el precio de tener auditoría inesquivable y
un modelo relacional listo para el v2 financiero.

**Para bajarlo:** `min-instances=0` ya está (la aplicación escala a cero cuando
nadie la usa). En desarrollo, apagar la instancia de Cloud SQL fuera de horario:

```bash
gcloud sql instances patch draga-pg-dev --activation-policy=NEVER   # apagar
gcloud sql instances patch draga-pg-dev --activation-policy=ALWAYS  # encender
```

La alerta de presupuesto está configurada a USD 120 con avisos al 50, 80 y 100 %.

---

## 18. Lista de verificación antes de abrir a usuarios

**Infraestructura**

- [ ] Cloud SQL **sin IP pública**, solo por conector
- [ ] Bucket con `public_access_prevention = enforced`
- [ ] Secretos en Secret Manager, ninguna credencial en el repositorio
- [ ] Cloud Run con `--no-allow-unauthenticated`
- [ ] Alerta de presupuesto activa

**Datos**

- [ ] Migraciones aplicadas desde cero en una base limpia
- [ ] **Padrón real de unidades cargado** (reemplaza el provisorio del seed — Q5)
- [ ] **Reglas de gobernanza reales** configuradas (Q2 y Q3)
- [ ] **Inventario real de activos** cargado (Q7)
- [ ] Plantillas de checklist revisadas contra el Manual v1.5 vigente
- [ ] Rangos de piscina confirmados con quien mantiene la piscina

**Funcionamiento**

- [ ] Primer administrador entra y ve el tablero
- [ ] El encargado instala la PWA y carga un ticket **en modo avión**
- [ ] Al reconectar, el ticket aparece **una sola vez** en la consola
- [ ] `compute-compliance` corrió y hay fila en `compliance_snapshots`
- [ ] Llegó un correo de prueba (revisar `outbox` en estado `done`)
- [ ] Un propietario de prueba **no ve** los comentarios internos (RN-14)
- [ ] Un propietario de prueba **no ve** unidades ajenas

**Respaldo**

- [ ] Copia restaurada con éxito en una instancia limpia, y verificada
- [ ] Instancia de prueba borrada

**Legal**

- [ ] Tratamiento de datos personales bajo Ley 18.331 documentado (**Q8**)
- [ ] Base legal, finalidad y retención definidas
- [ ] Procedimiento de acceso y rectificación comunicado a los residentes

---

## Anexo — Referencia rápida de comandos

```bash
# Desarrollo
pnpm dev                      # aplicación en local
pnpm db:migrate               # aplicar migraciones
pnpm db:seed                  # sembrar
pnpm job <nombre>             # correr un job a mano
pnpm typecheck && pnpm lint && pnpm test

# Despliegue
gcloud builds submit --config infra/cloudbuild.yaml --substitutions=…
firebase deploy --only hosting
PROJECT=… REGION=… ENV_NAME=… ./infra/scheduler.sh

# Operación
gcloud run services describe draga-app-prod --region=southamerica-east1
gcloud run revisions list --service=draga-app-prod --region=southamerica-east1
gcloud run jobs execute draga-compute-compliance-prod --region=southamerica-east1 --wait
gcloud sql backups list --instance=draga-pg-prod
gcloud logging read 'severity>=ERROR' --limit=50
```
