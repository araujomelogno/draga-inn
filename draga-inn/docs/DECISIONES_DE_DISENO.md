# Decisiones de diseño — v1

**Producto:** Sistema de Gestión y Gobernanza — Edificio Draga Inn
**Documento:** registro de las decisiones tomadas durante la implementación del v1
**Versión:** 1.0 — 13/09/2026

---

## 0. Para qué sirve este documento

El PRD dice **qué** y **por qué**. La especificación funcional dice **cómo se
comporta**. El hand-off dice **con qué**. Este documento dice **qué se decidió
al construirlo, y por qué esa opción y no otra** — incluyendo las decisiones que
se apartaron de lo previsto y las que quedaron abiertas.

Cada decisión lleva: el problema, las opciones consideradas, lo elegido, el
costo que asume y cómo se revierte si resulta equivocada.

---

## 1. Stack: Firebase + Cloud SQL, no Firestore

**Problema.** El pedido fue «el stack debe ser Firebase». Los documentos del
proyecto (`CLAUDE.md` §Stack y `HANDOFF_TECNICO` §1.2) descartan explícitamente
Firestore como sistema de registro y exigen Cloud SQL con auditoría por triggers
de Postgres como regla no negociable.

**Opciones consideradas.**

| Opción | A favor | En contra |
|---|---|---|
| Firestore puro | Serverless, escala a cero, `firebase deploy` y listo, costo mínimo | Obliga a mover la auditoría a Cloud Functions, que *sí* se puede saltear; desnormaliza el expediente; encarece el v2 financiero |
| **Firebase + Cloud SQL** | Respeta las cinco reglas tal como están escritas; el dominio es relacional; la auditoría es inesquivable | Requiere instancia Cloud SQL (~USD 25/mes) y conector de VPC |
| Firestore con capa de repositorios migrable | Permitiría cambiar después | Abstracción anticipada que `CLAUDE.md` desaconseja; paga el costo hoy por un beneficio hipotético |

**Decisión: Firebase + Cloud SQL**, confirmada con el solicitante antes de
escribir una línea de código.

La clave es que «Firebase» y «Cloud SQL» no se oponen: el stack **es** Firebase
y ecosistema Google Cloud — Firebase Auth para identidad, Cloud Storage para
archivos, Firebase Hosting como CDN y dominio, Cloud Run para la aplicación,
Cloud Scheduler para los jobs. Lo único que no es Firestore es la base de datos,
y esa exclusión es justamente la que los documentos ya habían razonado.

**Lo que decide esto en la práctica.** La regla 2 («todo se audita, y la
auditoría vive en la base de datos») solo se puede cumplir de verdad con
triggers. En Firestore, la auditoría sería código de aplicación: cualquier ruta
nueva que olvide llamarla genera un hecho sin rastro. Acá, un `INSERT` desde
cualquier lado —incluida una consola de SQL— escribe en `audit_log` igual.

**Costo asumido.** Una instancia Cloud SQL encendida todo el mes, incluso cuando
el edificio no genera actividad.

**Cómo se revierte.** No se revierte barato: el modelo relacional atraviesa todo.
Si el costo resultara prohibitivo, el camino es bajar el `tier` de la instancia,
no cambiar de motor.

---

## 2. La auditoría se hace en la base, con tres mecanismos distintos

No alcanza con «hay triggers». Se usaron tres piezas que se complementan:

1. **`fn_audit()` en 36 tablas.** Registra `INSERT`, `UPDATE` y `DELETE` con
   `before`, `after` y los campos que efectivamente cambiaron.
2. **Reglas `DO INSTEAD NOTHING`** sobre `audit_log`. Un `UPDATE` o un `DELETE`
   sobre la auditoría no fallan ruidosamente: **no hacen nada**. Verificado en
   los tests: `UPDATE 0`, `DELETE 0`, incluso ejecutados como superusuario.
3. **Trigger `fn_append_only()`** sobre `case_events` y `approvals`. Acá sí
   lanza excepción, porque la aplicación nunca debería intentarlo: si lo
   intenta, es un error que hay que ver.

**Decisión de detalle: `updated_at` no ensucia el registro de cambios.** El
trigger la quita de `changed_fields`. Sin eso, cada `UPDATE` reportaría un
cambio aunque no hubiera cambiado nada visible, y la pantalla de auditoría se
volvería ilegible.

**Decisión de detalle: una escritura sin `withTx()` queda auditada pero sin
autor.** Se podría haber hecho que el trigger *rechace* la escritura sin
`app.user_id`. No se hizo: eso rompería las migraciones y el seed, que escriben
legítimamente sin sesión. En cambio, hay un test que demuestra el agujero
—un `INSERT` directo deja `actor_user_id` en `NULL`— y una regla de ESLint que
impide importar el pool desde un módulo de dominio. El hecho igual se registra;
lo que se pierde es el autor, y eso es detectable con una consulta.

---

## 3. `withTx()` como única puerta de escritura

`withTx(ctx, fn)` abre la transacción y ejecuta `set_config('app.user_id', …)`,
`app.user_role` y `app.request_id` antes de cualquier otra sentencia. Eso es lo
que alimenta los triggers.

**Decisión: `set_config($1, $2, true)` con parámetros, no `SET LOCAL` con
interpolación de texto.** `SET LOCAL` no acepta parámetros, así que habría que
concatenar el uuid en el SQL. Es una inyección esperando a pasar. `set_config`
con el tercer argumento en `true` hace exactamente lo mismo, con el alcance
limitado a la transacción, y admite parámetros.

**Decisión: `withRead()` no declara actor.** La lectura no audita, así que
declarar quién lee sería ruido. El filtrado por `building_id` lo hace igual cada
repositorio.

---

## 4. Migraciones SQL escritas a mano, no generadas

`CLAUDE.md` pide «migraciones versionadas con drizzle-kit». Se conservó
drizzle-kit para *diffear* el esquema TypeScript contra la base, pero las
migraciones que se aplican son SQL escrito a mano en `src/db/migrations/`.

**Por qué.** El esquema usa DDL que drizzle-kit no expresa:

- La restricción de exclusión GiST de `unit_occupancies`, que es lo que hace
  imposible tener dos titulares principales solapados (RN-03).
- Los triggers de auditoría y las reglas de inmutabilidad.
- Las vistas de análisis de §2.11.
- La función `fn_next_number()` con lock consultivo por edificio.

Generarlas a mano y revisarlas es más honesto que generar la mitad y parchar la
otra mitad.

**El migrador propio** (`src/db/migrate.ts`) guarda el checksum de cada archivo
aplicado. Si alguien edita una migración ya mergeada, la siguiente corrida
**falla con ese mensaje exacto**, en vez de dejar dos bases distintas conviviendo.

---

## 5. Números correlativos con lock consultivo, no con secuencia

`cases.number`, `tickets.number` y `work_orders.number` son correlativos **por
edificio**, no globales. Una secuencia de Postgres es global y deja huecos.

**Decisión:** `fn_next_number(building, entidad)` toma un
`pg_advisory_xact_lock(hashtext(building || ':' || entidad))` y hace
`max(number) + 1`. El lock serializa solo a los que escriben sobre el mismo
edificio y la misma entidad, se libera solo al terminar la transacción, y no
bloquea la tabla.

**Costo.** Con muchísima concurrencia sobre un mismo edificio esto sería un
cuello de botella. Para un edificio con un encargado y un administrador, no lo es.

---

## 6. RN-43 en el modelo de datos, no solo en la pantalla

La regla dice que hay tres estados: **presente y correcto**, **presente fuera de
rango** y **faltante**, y que se computan distinto. Se tomó en serio:

- `pool_logs.out_of_range` y `out_of_range_params` distinguen el segundo caso.
- `compliance_snapshots.pool_logged` es un **booleano nullable**: `true`
  registrado, `false` faltante, y **`null` fuera de temporada** (RN-52). Tres
  valores para tres significados.
- El calendario de la interfaz tiene **cuatro** estados, no tres: completo,
  parcial, sin registro, y **sin computar** (rayado). Un día que el job todavía
  no procesó no es un día sin registro, y pintarlo de rojo sería mentir sobre el
  encargado.
- Las series de piscina **no interpolan**: un día sin dato se dibuja como hueco
  con línea punteada, y **rompe la secuencia** de detección de tendencia.

Ese último punto es el que más fácil se hace mal. `detectTrend()` recorre la
serie y, ante un `null`, **vacía el acumulador**: tres mediciones con un hueco en
el medio no son tres mediciones consecutivas. Hay un test que lo fija.

---

## 7. El encuadre de RN-51 viaja con el dato, no con la pantalla

La decisión más deliberada del sistema.

Los indicadores de cumplimiento son, técnicamente, monitoreo del desempeño de una
persona identificable: hay un solo encargado. El producto decide tratarlos como
**cumplimiento del plan del edificio**. El riesgo es que alguien construya una
pantalla nueva y se olvide del encuadre.

**Decisión: el encuadre es parte de la respuesta de la API, no de la interfaz.**

```ts
export const COMPLIANCE_FRAMING = {
  title: 'Cumplimiento del plan del edificio',
  legend: 'Estos indicadores miden el cumplimiento del plan operativo del edificio, …',
} as const;
```

Toda función del módulo de cumplimiento devuelve `framing` en su respuesta. Una
pantalla nueva que consuma `/compliance` recibe el título y la leyenda **sin
pedirlos**. Para mostrar el número sin el encuadre habría que descartarlo
activamente.

**RN-49 verificado por igualdad, no por inspección.** Hay un test que corre el
mismo cálculo con el contexto del encargado y con el del administrador y exige
que `compliancePct`, `requiredItems`, `completedItems` e `incompleteDays` sean
**idénticos**. Si alguien agregara un recorte para el encargado, ese test se cae.

---

## 8. Los parámetros regulables no son constantes

`CLAUDE.md` prohíbe hardcodear umbrales, rangos y fechas. Todo eso vive en
`buildings.settings` (jsonb tipado) o en tablas de reglas:

| Parámetro | Dónde vive |
|---|---|
| Rangos de piscina y críticos | `settings.pool` |
| Ventana de temporada alta | `settings.season` |
| Tolerancia de facturación (RN-16) | `settings.invoiceTolerancePct` |
| Cierre automático de tickets (RN-11) | `settings.ticketAutoCloseDays` |
| Ventana de reapertura (RN-12) | `settings.ticketReopenDays` |
| Hora de corte del checklist (RN-44) | `settings.dailyCutoffHour` |
| Días de carga retroactiva (CB-02) | `settings.backdateGraceDays` |
| Umbral de omisión sistemática (RN-46) | `settings.omittedItemThresholdPct` |
| Umbrales, mínimos y rol aprobador (RN-20) | tabla `governance_rules` |

Los valores del código son **el fallback del seed**, no la fuente de verdad en
ejecución. Hay un test que cambia el rango de cloro en `settings` y verifica que
el mismo valor pase de «en rango» a «fuera de rango».

**La excepción deliberada: Semana de Turismo.** No se carga a mano cada año.
Se deriva del **computus gregoriano** (`easterSunday()`), que es determinista.
Cargar fechas a mano garantiza que en 2031 alguien se olvide.

---

## 9. Offline: la idempotencia vive en la base, no en el cliente

El compromiso es «reintentar nunca duplica». Se podría haber implementado con
deduplicación en el cliente. No se hizo: el cliente puede reinstalarse, perder
IndexedDB, o correr en dos dispositivos.

**Decisión:** `unique (client_uuid)` en cada tabla que la PWA escribe, más
`ON CONFLICT DO NOTHING` que devuelve el registro existente. El cliente genera
un UUID v4 por mutación; el servidor resuelve. Hay tests que envían la misma
mutación dos veces y verifican `applied` y después `duplicate`, con el mismo id.

**`sync_receipts`** guarda el resultado por `client_uuid`. No es la garantía
—esa es la restricción única— sino un atajo para responder rápido al reintento.

**Decisión: cada mutación del lote va en su propia transacción.** Un error en la
tercera no revierte las dos primeras. El cliente reintenta solo la que falló.

**Decisión: la PWA no sincroniza transiciones de estado que dependan del estado
remoto.** Solo creaciones y actualizaciones simples. Una transición de ticket
calculada contra un estado viejo produciría un resultado incorrecto silencioso.

**Decisión: las fotos van por un carril aparte** (RN-32). El registro no espera
a la foto. Si la foto no sube tras 10 intentos, el registro queda marcado como
«foto no enviada» y ofrece reintento manual (CB-09) — pero el dato ya está.

---

## 10. Nunca decir «guardado» a secas

El principio P2 se implementó en la función de mutación, no en cada pantalla:

```ts
const res = await mutate(...);
// res.queued === true  ⇒ quedó en el teléfono
```

El componente `<Resultado>` tiene tres estados, y el de `queued` dice, literal:
**«Guardado en el teléfono, pendiente de enviar»**. Ninguna pantalla puede decir
«guardado» sin pasar por ahí. La barra superior muestra el estado de forma
permanente (RN-30), incluyendo cuántos registros esperan.

---

## 11. La interfaz oculta, la API rechaza

P3 dice que un propietario no ve opciones deshabilitadas: no las ve. Eso es
interfaz, y por sí solo no es seguridad.

**Decisión: dos capas con la misma fuente.** El endpoint `/me` devuelve
`abilities`, derivado de la **misma matriz** que usa `can()` en el servidor. La
interfaz oculta según eso. El rechazo real ocurre en la API.

**La matriz de §7 se tradujo a una tabla declarativa**, y el test la recorre
generando el caso positivo y **el negativo por cada ❌**. Son 182 tests de
permisos, cubriendo las 20 filas × 7 roles.

**El aislamiento entre unidades no cabe en la matriz.** Un propietario tiene
`read` de `ticket`, pero solo de los suyos. Eso lo resuelve `scopeGuard()`,
después de la matriz y antes de devolver `true`.

**RN-14 se implementó como filtro de consulta, no de presentación.** Para un
no-staff, `listComments()` agrega `is_internal = false` al `WHERE`: el comentario
interno **no se consulta**. No se devuelve enmascarado ni recortado. El test
negativo verifica que el texto no aparezca en el JSON serializado.

---

## 12. Sin Tailwind ni librería de componentes

**Decisión: CSS con variables nativas, sin dependencias de estilo.**

- `CLAUDE.md` dice no agregar dependencias sin justificarlo.
- El requisito no funcional pide **< 250 KB gzip** en la PWA. El bundle quedó en
  **154 kB sin comprimir** de First Load JS, Firebase Auth incluido.
- La paleta completa son ~20 variables CSS. Una librería de componentes traería
  cientos de estilos que no se usan.

La rampa de verde inglés va de `--verde-900` (#002615) a `--verde-050` (#f0f7f3),
con **#004225** —British racing green— como color institucional. Contraste
verificado AA sobre blanco. El ámbar y el rojo aparecen **solo** cuando el dato
lo exige (RN-27): un tablero con todo en cero es neutro, no verde festivo.

**Decisión: los objetivos táctiles de la PWA son de 44 px** vía la variable
`--toque`, aplicada a botones, campos e ítems de checklist. La barra inferior es
de 58 px. El botón de «Registrar +» está en el centro, alcanzable con el pulgar.

---

## 13. Notificaciones por outbox, no por envío directo

Si el envío fuera parte de la transacción de negocio, una caída del proveedor de
correo haría fallar la creación del ticket.

**Decisión:** la transacción escribe en `outbox` y termina. Un job cada 5 minutos
resuelve destinatarios, renderiza y despacha, con backoff exponencial y tope de
8 intentos.

**RN-33 (agrupadas a las 08:00) se implementó reprogramando, no acumulando.**
Un ítem con `digestKey` fuera de la ventana de las 08:00 se **reprograma**
(`available_at` al próximo día a las 08:00) en vez de quedar «pendiente» siendo
saltado en cada corrida. Así la cola no se llena de ítems que se evalúan 288
veces por día.

**RN-34 con lista negra, no blanca.** `notification_prefs` guarda lo que el
usuario **silenció**. Un tema nuevo llega por defecto. La constante
`UNDISABLEABLE` marca los que no se pueden apagar, y la API **rechaza** el
intento con un mensaje explícito.

---

## 14. Errores de dominio como clases, con mensaje accionable

P6 pide que el error diga qué hacer. Se implementó con clases tipadas que llevan
`code`, `message`, `status` y `details`.

`GovernanceError` es el caso testigo: no dice «error de validación», dice
**«Faltan 2 presupuestos vigentes y falta la aprobación de Comisión para emitir
la orden. Por $ 200.000,00 rige «Gasto mayor»: 3 presupuestos y aprobación de
Comisión.»**, y en `details` viaja `canResolve` con el rol que puede destrabarlo.

El `toResponse()` traduce además los códigos de Postgres a mensajes en español:
`23P01` (exclusión GiST) se convierte en *«Ya hay un titular vigente para esa
unidad en ese período. Cerrá el período anterior antes de abrir uno nuevo.»*

---

## 15. Tres bugs que aparecieron al probar, y qué se cambió

Vale la pena dejarlos registrados porque los tres eran silenciosos.

**15.1. Dinero en coma flotante.** `invoiceNeedsReapproval` calculaba el techo
como `aprobado * (1 + tolerancia/100)`. Con 100.000 y 10 %, JavaScript da
**110000.00000000001**. El techo quedaba un centésimo de centavo por encima del
correcto. Se reescribió en **centavos enteros**. Hay test de regresión.

**15.2. `count(*)` comparado como texto.** La vista `v_checklist_compliance`
devolvía `bigint`, que node-pg entrega como **string**. La comparación
`completed >= required` hacía comparación de texto: `'10' >= '9'` es **false**.
Un checklist de diez ítems nunca se habría marcado completo. Se castearon las
vistas a `int` y se convierte explícitamente en el código.

**15.3. Arrays expandidos como tuplas.** Drizzle expande un array de JavaScript
en una lista de placeholders, así que `any(${array}::uuid[])` producía
`any($1, $2)::uuid[]` y Postgres respondía *«cannot cast type record to uuid[]»*.
Se reemplazó por `inArray()` donde correspondía y por `sql.param()` en el SQL
crudo.

Ninguno de los tres se detecta leyendo el código. Los tres salieron de correr
contra una base real.

---

## 16. Decisiones sobre el seed

**El seed es idempotente y se puede correr sobre una base ya sembrada.** Cada
inserción usa `ON CONFLICT DO NOTHING` o `WHERE NOT EXISTS`. Verificado: dos
corridas dejan 80 unidades, no 160.

**Las plantillas de checklist replican el cronograma del Manual v1.5**: ocho
plantillas (diaria, piscina, semanal, mensual, trimestral, semestral, temporada,
anual) con sus ítems agrupados por sección. Los ítems llevan `required: false`
donde el Manual los trata como deseables — y esos **no penalizan** (RN-48).

**Los datos que dependen de preguntas abiertas del PRD están marcados como
provisorios**, tanto en el código como en la salida del comando:

- `units`: padrón provisorio de 8×4 con coeficientes iguales — depende de **Q5**.
- `governance_rules`: umbrales 0 / 30.000 / 150.000 — dependen de **Q2 y Q3**.
- `assets`: inventario tentativo — depende de **Q7**.

Las unidades llevan una nota en el campo `notes` que lo dice. No se inventaron
nombres de propietarios reales: `parties` queda vacío.

---

## 17. Lo que quedó deliberadamente afuera

**Del v2, nada.** No hay expensas, prorrateo, asambleas, votaciones,
conciliación ni pagos. `invoices` tiene estado `paid` en el enum porque el
modelo lo contempla, pero **ninguna ruta lo escribe**.

**Tests e2e de Playwright: la configuración está, los recorridos no.** Levantar
los tres recorridos críticos requiere el emulador de Firebase Auth con usuarios
sembrados y una base de test dedicada. La configuración (`playwright.config.ts`,
proyectos de escritorio y móvil, locale `es-UY`, zona `America/Montevideo`) está
lista; los specs quedan pendientes.

**Cobertura de casos borde: 11 de 14 con verificación automatizada.** CB-01,
CB-02, CB-03, CB-05, CB-06, CB-07, CB-08, CB-09, CB-10, CB-12 y CB-13 tienen
implementación y test. CB-04 (advertencia antes de borrar datos del sitio),
CB-11 (selector de contexto con dos roles) y CB-14 (unidad borrada mientras el
ticket estaba encolado) están **implementados** pero su verificación requiere el
navegador: van con los e2e.

**WhatsApp por n8n:** el hand-off lo marca como P1. El canal está en el enum de
`notifications` y el dispatcher lo contempla, pero no hay adaptador.

---

## 18. Preguntas abiertas que siguen abiertas

Estas no las resuelve la implementación; las hereda:

| # | Pregunta | Qué bloquea |
|---|---|---|
| **Q2/Q3** | Umbrales reales de gobernanza y quién aprueba cada tramo | Los del seed son provisorios. Se cambian en `governance_rules` sin tocar código |
| **Q5** | Padrón real de unidades con sus coeficientes | El seed genera 8×4 con coeficientes iguales. Hay que reemplazarlo antes de producción |
| **Q7** | Inventario real de activos y sus criticidades | El seed lista 13 activos típicos |
| **Q8** | Tratamiento de datos personales bajo Ley 18.331 | Falta definir base legal, finalidad y retención documentadas. **Bloquea la fase F4** (portal de propietarios) |

Sobre Q8, lo que ya está hecho: los logs no llevan datos personales (solo
`request_id` y `user_id`), el bucket no es público nunca, el acceso a documentos
es por signed URL de vida corta previa verificación de permisos, y el portal
tiene un aviso sobre derechos de acceso y rectificación. Lo que falta es el
documento formal de tratamiento.
