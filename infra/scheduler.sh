#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Cloud Scheduler → Cloud Run Jobs.
#
# Las horas son las de HANDOFF §7, expresadas en America/Montevideo: Scheduler
# acepta la zona directamente, así que no hay que convertir a UTC ni recordar el
# horario de verano. Todos los jobs son idempotentes ante reejecución.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT="${PROJECT:?definí PROJECT}"
REGION="${REGION:-southamerica-east1}"
ENV_NAME="${ENV_NAME:-prod}"
TZ_NAME="America/Montevideo"
SA="draga-scheduler@${PROJECT}.iam.gserviceaccount.com"

programar() {
  local nombre="$1" cron="$2" descripcion="$3"
  local job="draga-${nombre}-${ENV_NAME}"
  local uri="https://${REGION}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT}/jobs/${job}:run"

  echo "▸ ${nombre}  ${cron}  (${descripcion})"
  gcloud scheduler jobs create http "sched-${job}" \
    --project "${PROJECT}" --location "${REGION}" \
    --schedule "${cron}" --time-zone "${TZ_NAME}" \
    --uri "${uri}" --http-method POST \
    --oauth-service-account-email "${SA}" \
    --description "${descripcion}" \
    --max-retry-attempts 3 --min-backoff 30s --max-backoff 10m \
    2>/dev/null || \
  gcloud scheduler jobs update http "sched-${job}" \
    --project "${PROJECT}" --location "${REGION}" \
    --schedule "${cron}" --time-zone "${TZ_NAME}" --uri "${uri}"
}

programar generate-maintenance-tasks "0 3 * * *"  "Materializa tareas preventivas de los próximos 60 días"
programar flag-overdue               "0 4 * * *"  "Marca tareas y tickets vencidos (RN-24)"
programar expiry-scan                "15 4 * * *" "Vencimientos a 30, 15 y 7 días (RN-18)"
programar auto-close-tickets         "30 4 * * *" "Cierra tickets resueltos sin objeción (RN-11)"
programar compute-compliance         "0 20 * * *" "Cumplimiento del día; dispara RN-44 y RN-45"
programar detect-trends              "15 20 * * *" "Tendencias de piscina (RN-47) e ítems omitidos (RN-46)"
programar generate-monthly-report    "0 5 1 * *"  "Informe del mes anterior con el resumen de control (RN-50)"
programar dispatch-outbox            "*/5 * * * *" "Despacha el outbox de notificaciones"

echo "✔ Listo. Verificá con: gcloud scheduler jobs list --location ${REGION}"
