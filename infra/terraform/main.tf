# ─────────────────────────────────────────────────────────────────────────────
# Infraestructura del Edificio Draga Inn en Google Cloud.
#
#   terraform init
#   terraform apply -var project_id=draga-inn -var env=prod
#
# Lo que NO administra este archivo, a propósito:
#   · Las imágenes de contenedor (las publica Cloud Build).
#   · Los usuarios de Firebase Auth.
#   · El contenido de los secretos (se cargan a mano, una vez).
# ─────────────────────────────────────────────────────────────────────────────
terraform {
  required_version = ">= 1.6"
  required_providers {
    google = { source = "hashicorp/google", version = "~> 6.0" }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

variable "project_id" { type = string }
variable "region"     { type = string, default = "southamerica-east1" }
variable "env"        { type = string, default = "prod" }
variable "db_tier"    { type = string, default = "db-g1-small" }

locals {
  sufijo = var.env
  apis = [
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "storage.googleapis.com",
    "iamcredentials.googleapis.com",
  ]
}

resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  service            = each.value
  disable_on_destroy = false
}

# ─── Registro de imágenes ────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "draga" {
  location      = var.region
  repository_id = "draga"
  format        = "DOCKER"
  description   = "Imágenes de la aplicación y de los jobs"
  depends_on    = [google_project_service.apis]
}

# ─── Cloud SQL PostgreSQL 16 — el sistema de registro ────────────────────────
resource "google_sql_database_instance" "pg" {
  name             = "draga-pg-${local.sufijo}"
  database_version = "POSTGRES_16"
  region           = var.region
  # En v1 no se borra por accidente. Para destruir de verdad, hay que quitarlo a mano.
  deletion_protection = true

  settings {
    # HA desactivada en v1 por costo (HANDOFF §10). Se reevalúa tras el piloto.
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_autoresize   = true
    disk_type         = "PD_SSD"

    backup_configuration {
      enabled                        = true
      start_time                     = "06:00" # 03:00 en Montevideo
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
      backup_retention_settings {
        retained_backups = 30
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      # Sin IP pública: solo se llega por el conector de Cloud SQL.
      ipv4_enabled = false
      # Si se necesita acceso desde fuera de la VPC, va por Cloud SQL Auth Proxy.
      private_network = google_compute_network.vpc.id
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
    database_flags {
      name  = "log_min_duration_statement"
      value = "1000" # consultas de más de 1 s al log
    }

    maintenance_window {
      day          = 2 # martes
      hour         = 8 # 05:00 en Montevideo
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      record_application_tags = true
    }
  }

  depends_on = [google_project_service.apis, google_service_networking_connection.privada]
}

resource "google_sql_database" "draga" {
  name     = "draga"
  instance = google_sql_database_instance.pg.name
  charset  = "UTF8"
}

resource "google_sql_user" "app" {
  name     = "draga_app"
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

resource "random_password" "db" {
  length  = 32
  special = false # el password viaja en una URL de conexión
}

# ─── Red privada para Cloud SQL ──────────────────────────────────────────────
resource "google_compute_network" "vpc" {
  name                    = "draga-vpc-${local.sufijo}"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_global_address" "rango_privado" {
  name          = "draga-sql-range-${local.sufijo}"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "privada" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.rango_privado.name]
}

# ─── Almacenamiento de documentos — nunca público ────────────────────────────
resource "google_storage_bucket" "documentos" {
  name                        = "draga-${local.sufijo}-documents"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false

  versioning { enabled = true }

  lifecycle_rule {
    condition { days_since_noncurrent_time = 90 }
    action { type = "Delete" }
  }

  cors {
    origin          = ["https://${var.project_id}.web.app", "http://localhost:3000"]
    method          = ["GET", "PUT", "HEAD"]
    response_header = ["Content-Type", "Content-MD5", "x-goog-resumable"]
    max_age_seconds = 3600
  }

  depends_on = [google_project_service.apis]
}

# ─── Identidades de servicio, con el mínimo privilegio ───────────────────────
resource "google_service_account" "app" {
  account_id   = "draga-app"
  display_name = "Aplicación Draga Inn (Cloud Run)"
}

resource "google_service_account" "jobs" {
  account_id   = "draga-jobs"
  display_name = "Jobs programados de Draga Inn"
}

resource "google_service_account" "scheduler" {
  account_id   = "draga-scheduler"
  display_name = "Cloud Scheduler → Cloud Run Jobs"
}

locals {
  roles_app = [
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/firebaseauth.viewer",
    "roles/logging.logWriter",
  ]
  roles_jobs = [
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
  ]
}

resource "google_project_iam_member" "app" {
  for_each = toset(local.roles_app)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.app.email}"
}

resource "google_project_iam_member" "jobs" {
  for_each = toset(local.roles_jobs)
  project  = var.project_id
  role     = each.value
  member   = "serviceAccount:${google_service_account.jobs.email}"
}

# Firmar signed URLs v4 requiere poder firmar como la propia cuenta.
resource "google_service_account_iam_member" "firma" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.app.email}"
}

# Acceso al bucket, acotado al bucket y no al proyecto.
resource "google_storage_bucket_iam_member" "app_documentos" {
  bucket = google_storage_bucket.documentos.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.app.email}"
}

# Scheduler solo puede invocar jobs.
resource "google_project_iam_member" "scheduler_run" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler.email}"
}

# ─── Secretos ────────────────────────────────────────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  secret_id = "draga-database-url-${local.sufijo}"
  replication { auto {} }
  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  # Socket Unix del conector de Cloud SQL: no hay puerto ni IP que exponer.
  secret_data = "postgres://${google_sql_user.app.name}:${random_password.db.result}@/draga?host=/cloudsql/${google_sql_database_instance.pg.connection_name}"
}

resource "google_secret_manager_secret" "resend" {
  secret_id = "draga-resend-key"
  replication { auto {} }
  depends_on = [google_project_service.apis]
}

# ─── Presupuesto con alerta (HANDOFF §14) ────────────────────────────────────
variable "billing_account" {
  type        = string
  default     = ""
  description = "ID de la cuenta de facturación. Vacío desactiva la alerta."
}

resource "google_billing_budget" "presupuesto" {
  count           = var.billing_account == "" ? 0 : 1
  billing_account = var.billing_account
  display_name    = "Draga Inn ${var.env}"

  budget_filter { projects = ["projects/${var.project_id}"] }
  amount { specified_amount { currency_code = "USD", units = "120" } }

  dynamic "threshold_rules" {
    for_each = [0.5, 0.8, 1.0]
    content { threshold_percent = threshold_rules.value }
  }
}

# ─── Salidas ─────────────────────────────────────────────────────────────────
output "sql_connection_name" { value = google_sql_database_instance.pg.connection_name }
output "bucket_documentos"   { value = google_storage_bucket.documentos.name }
output "service_account_app" { value = google_service_account.app.email }
output "registro_imagenes"   { value = "${var.region}-docker.pkg.dev/${var.project_id}/draga" }
output "secreto_database_url" { value = google_secret_manager_secret.database_url.secret_id }
