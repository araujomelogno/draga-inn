<div align="center">

<img src="public/icono.svg" width="72" alt="">

# Sistema de Gestión y Gobernanza
### Edificio Draga Inn · Punta del Este, Maldonado

**Propietarios ausentes. Un encargado residente. Un edificio que hay que cuidar
los doce meses del año.**

Este sistema digitaliza la operación del edificio y deja rastro de todo lo que
pasa, para que quien no está presente pueda confiar en lo que se hizo.

</div>

---

## Qué resuelve

El Draga Inn tiene un problema de distancia. Los propietarios viven en
Montevideo, Buenos Aires o São Paulo y ven el edificio pocas semanas al año. El
encargado vive ahí con su familia y sostiene la operación diaria en planillas de
papel que nadie lee hasta que hay un conflicto.

El sistema no reemplaza a nadie: **reemplaza el papel**. Las planillas que el
encargado ya está obligado a llevar por su Manual de Trabajo pasan al teléfono,
y de ahí alimentan solas el informe mensual, el tablero de la administración y el
expediente de cada asunto.

El resultado es un **instrumento de confianza a distancia**: cualquiera con
permiso puede responder, sobre cualquier hecho, quién lo hizo, cuándo, por qué,
cuánto costó y con qué autorización.

---

## Las tres superficies

<table>
<tr>
<td width="33%" valign="top">

### 📱 PWA del encargado
*Móvil · instalable · sin conexión*

Es la que más se usa y la que genera los datos. Se instala como aplicación, y
**funciona entera sin señal**: el subsuelo del edificio no tiene cobertura.

Cargar un ticket lleva menos de 30 segundos. Un registro que todavía no se envió
dice **«guardado en el teléfono, pendiente de enviar»** — nunca «guardado» a
secas.

</td>
<td width="33%" valign="top">

### 🖥️ Consola de administración
*Escritorio*

El tablero responde en un vistazo qué está pendiente, qué venció y qué requiere
una decisión.

Detrás, el **expediente**: la línea de tiempo completa de cada asunto, desde el
reclamo hasta la factura, con las aprobaciones y —destacadas en ámbar— las
excepciones a las reglas de gobernanza.

</td>
<td width="33%" valign="top">

### 🏠 Portal del propietario
*Responsive*

Su unidad, sus reclamos, los documentos publicados.

Ve el estado real de lo que reclamó y la conversación con la administración.
Nunca ve las notas internas, ni las unidades de otros, ni el histórico de
titularidad ajeno.

</td>
</tr>
</table>

---

## Los cinco compromisos que no se negocian

Estas no son buenas intenciones: están puestas donde no se pueden saltear.

**1 · Todo hecho pertenece a un expediente.**
Ningún ticket, presupuesto, orden de trabajo o factura existe suelto. Si el
encargado registra una tarea con costo, el expediente se abre solo.

**2 · Todo se audita, y la auditoría vive en la base de datos.**
No en el código de la aplicación: en *triggers* de PostgreSQL. Un `INSERT` desde
cualquier lado —incluida una consola de SQL— queda registrado con su antes y su
después. Y `audit_log` es **inmutable**: un `UPDATE` o un `DELETE` sobre ella no
fallan, simplemente no hacen nada. Verificado en los tests.

**3 · Todo está scopeado a un edificio.**
`building_id` en cada tabla y en cada consulta, aunque hoy haya un solo edificio.

**4 · Todo hecho económico lleva monto, rubro y autorización.**
Aunque el v1 no calcule expensas. Es el seguro contra reescribir todo en el v2.

**5 · La PWA del encargado funciona sin conexión.**
Y reintentar **nunca** duplica: cada mutación lleva un identificador que la base
usa para resolver el conflicto.

---

## Sobre los indicadores de cumplimiento

Hay una parte del sistema que merece decirse en voz alta.

Los indicadores de cumplimiento son, técnicamente, monitoreo del desempeño de
una persona identificable: hay un solo encargado. El producto toma tres
decisiones deliberadas al respecto.

> **La métrica mide el cumplimiento del plan del edificio**, no el desempeño de
> una persona. Ninguna pantalla, etiqueta, variable ni correo lo rotula de otra
> manera.
>
> **El encargado ve su propio indicador primero**, desde su teléfono, sin pedirle
> permiso a nadie y **con exactamente el mismo detalle** que la administración.
> Hay un test que compara ambos cálculos y exige que sean idénticos.
>
> **Toda vista de cumplimiento lleva al pie** la leyenda de que su uso
> disciplinario requiere el procedimiento del régimen de faltas y sanciones. El
> encuadre viaja en la respuesta de la API, no en cada pantalla: una pantalla
> nueva lo recibe sin pedirlo.

Además, el sistema distingue tres cosas que no son lo mismo y no las mezcla:
dato **presente y correcto**, dato **presente fuera de rango**, y dato
**faltante**. Las series nunca interpolan los huecos: un día sin medición se
dibuja como hueco, y rompe la secuencia de detección de tendencias.

---

## Cómo está hecho

```
Firebase Hosting ──▶ Cloud Run (Next.js 15) ──┬──▶ Cloud SQL PostgreSQL 16
   CDN · TLS           API + las 3 superficies │      sistema de registro
                                              ├──▶ Cloud Storage (signed URLs)
                                              └──▶ Firebase Auth (identidad)
                              ▲
         Cloud Scheduler ─────┴──▶ Cloud Run Jobs  (8 jobs programados)
```

| Pieza | Elección | Por qué |
|---|---|---|
| Framework | **Next.js 15** (App Router) + TypeScript estricto | Una base para las tres superficies |
| Base de datos | **Cloud SQL PostgreSQL 16** | El dominio es relacional y auditable. Firestore obligaría a desnormalizar el expediente y a poner la auditoría en código salteable |
| ORM | **Drizzle** + SQL escrito a mano para triggers y vistas | Tipos inferidos del esquema; control total del DDL |
| Identidad | **Firebase Auth** | Correo/contraseña y enlace mágico, verificado en el servidor |
| Archivos | **Cloud Storage** | Bucket nunca público; acceso solo por signed URL de vida corta |
| Estilos | **CSS con variables nativas** | Sin dependencias. La PWA carga 154 kB de JS |
| Validación | **zod**, compartida cliente y servidor | Un solo lugar donde vive cada regla |
| Tests | **Vitest** + Postgres real | 323 tests, incluidos los negativos de autorización |

**Colores:** verde inglés (*British racing green*, `#004225`) y blanco. Contraste
AA verificado. El ámbar y el rojo aparecen **solo** cuando el dato lo exige: un
tablero sin problemas es neutro, no festivo.

---

## Empezar

```bash
# 1. Postgres local
docker run -d --name draga-pg \
  -e POSTGRES_USER=draga -e POSTGRES_PASSWORD=draga -e POSTGRES_DB=draga \
  -p 5432:5432 postgres:16

# 2. Configuración
cp .env.example .env      # completá DATABASE_URL y las claves de Firebase

# 3. Base y aplicación
pnpm install
pnpm db:migrate           # esquema, triggers de auditoría y vistas
pnpm db:seed              # edificio, unidades, plantillas del Manual, activos
pnpm dev                  # http://localhost:3000
```

| Ruta | Superficie |
|---|---|
| `/pwa` | Encargado — instalable, offline |
| `/admin` | Administración |
| `/portal` | Propietarios |

### Verificar

```bash
pnpm typecheck && pnpm lint && pnpm test
```

> Los tests de integración **vacían el esquema** de la base apuntada por
> `DATABASE_URL`. Sin esa variable se saltean solos. Nunca los apuntes a
> producción.

---

## Estructura

```
app/
├─ (raíz)          Portada con acceso a las tres superficies
├─ pwa/            PWA del encargado: Hoy · Registrar · Tickets · Informe
├─ admin/          Consola: tablero, expedientes, contrataciones, auditoría
├─ portal/         Portal del propietario
└─ api/            Route handlers bajo /api/buildings/:bid/…

src/
├─ auth/           Firebase Admin, AuthContext
├─ policy/         can() · motor de gobernanza · máquinas de estado
├─ db/
│  ├─ schema/      Drizzle, un archivo por dominio
│  ├─ migrations/  SQL: esquema · triggers de auditoría · vistas
│  └─ tx.ts        withTx() ← única puerta de escritura
├─ modules/        Casos de uso por dominio
├─ sync/           Lote offline e idempotencia
├─ jobs/           Los 8 jobs programados
├─ pwa/            Cola IndexedDB y sincronización
└─ shared/         zod · errores · fechas · piscina · temporada

infra/             Dockerfiles · Cloud Build · Terraform · Scheduler
tests/             323 tests: unitarios e integración contra Postgres real
```

---

## Documentación

| Documento | Para qué |
|---|---|
| [`PRD`](draga-inn/docs/PRD_Sistema_Gestion_Gobernanza_Draga_Inn.md) | Qué construimos y por qué |
| [`Especificación funcional v1`](draga-inn/specs/ESPEC_FUNCIONAL_v1_Draga_Inn.md) | Comportamiento: pantallas, reglas RN-01 a RN-52, permisos, casos borde |
| [`Hand-off técnico`](draga-inn/docs/HANDOFF_TECNICO_Draga_Inn.md) | Arquitectura y modelo de datos |
| [`Decisiones de diseño`](draga-inn/docs/DECISIONES_DE_DISENO.md) | Qué se decidió al construirlo, y por qué esa opción |
| [`Despliegue`](draga-inn/docs/DESPLIEGUE.md) | De un proyecto vacío a producción |
| [`Manual completo (PDF)`](draga-inn/docs/manual/) | Todo el detalle, para leer o imprimir |
| [`Alcance diferido v2`](draga-inn/specs/ESPEC_v2_Draga_Inn.md) | Lo que **no** va en el v1 |

---

## Estado del v1

**Implementado y verificado**

- Las tres superficies con la matriz de permisos de §7, con **test negativo por
  cada celda denegada** (182 tests de permisos)
- Reglas de negocio RN-01 a RN-52, cada una con su identificador en el código y
  en el nombre del test
- Auditoría en la base, inmutable, verificada contra Postgres real
- Cumplimiento y análisis operativo con la distinción entre dato faltante y dato
  fuera de rango
- Offline con idempotencia demostrada: la misma mutación enviada dos veces crea
  un solo registro
- Los 8 jobs programados, todos idempotentes ante reejecución
- Migraciones aplicables desde cero y seed idempotente

**Pendiente**

- Recorridos e2e de Playwright: la configuración está, los specs no. Requieren el
  emulador de Firebase Auth con usuarios sembrados
- Adaptador de WhatsApp vía n8n (marcado P1 en el hand-off)
- Datos reales: padrón de unidades (**Q5**), umbrales de gobernanza (**Q2/Q3**) e
  inventario de activos (**Q7**). Lo que hay en el seed está marcado como
  provisorio
- Documento de tratamiento de datos personales bajo Ley N.º 18.331 (**Q8**), que
  bloquea la apertura del portal a propietarios

El detalle de cada decisión y de lo que quedó abierto está en
[Decisiones de diseño](draga-inn/docs/DECISIONES_DE_DISENO.md).

---

## Privacidad

Se manejan datos personales de residentes bajo la **Ley N.º 18.331** (Uruguay,
URCDP). En consecuencia:

- Los logs llevan `request_id` y `user_id`, **nada más**. Ni nombres, ni correos,
  ni contenido de documentos.
- Los buckets de Cloud Storage **no son públicos jamás**. El acceso es por signed
  URL de vida corta, emitida después de verificar permisos.
- Los secretos viven en Secret Manager. Ni una credencial en el repositorio.
- El portal informa a cada residente sus derechos de acceso y rectificación.

---

<div align="center">
<sub>Edificio Draga Inn · Punta del Este, Maldonado, Uruguay<br>
Español rioplatense · <code>dd/mm/aaaa</code> · <code>$ 1.234,56</code> · <code>America/Montevideo</code></sub>
</div>
