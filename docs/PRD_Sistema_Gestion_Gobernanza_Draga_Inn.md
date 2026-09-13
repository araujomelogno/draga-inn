# PRD — Sistema de Gestión y Gobernanza del Edificio

**Producto:** Sistema de Gestión y Gobernanza (nombre de trabajo: *Draga*)
**Cliente piloto:** Edificio Draga Inn — Punta del Este, Departamento de Maldonado, Uruguay
**Versión:** 1.0 — 13/09/2026
**Estado:** Aprobado para implementación (v1)

---

## 1. Resumen ejecutivo

El Edificio Draga Inn se gestiona hoy con Excel, WhatsApp y planillas en papel. No existe un lugar donde un hecho del edificio —un reclamo, una reparación, una decisión de la comisión, un gasto— pueda seguirse de punta a punta. El resultado es pérdida de información, gasto sin respaldo verificable y desconfianza entre propietarios y administración.

Este producto no es un sistema de expensas. Es un **sistema de gestión y gobernanza**: un registro trazable de todo lo que pasa en el edificio, construido alrededor de un principio rector único.

> **Principio rector:** todo hecho relevante del edificio debe poder responder **quién, qué, cuándo, por qué, cuánto y con qué autorización.**

El v1 ataca la **operación diaria** —donde se generan los hechos— y expone una **vista completa para el propietario**, que es quien financia el edificio y hoy no ve nada.

---

## 2. Problema

### 2.1. Situación actual

| Síntoma | Consecuencia |
|---|---|
| Los reclamos llegan por WhatsApp al encargado o al administrador | Se pierden, no tienen estado, nadie sabe quién es responsable |
| El encargado lleva planillas en papel (piscina, mantenimiento, incidentes, stock) | Los datos no son consultables; el informe mensual se arma a mano |
| No hay inventario de activos ni plan preventivo | El mantenimiento es reactivo: se actúa cuando algo se rompe |
| Los presupuestos y aprobaciones viven en mails y conversaciones | No se puede demostrar con qué autorización se gastó |
| Los propietarios están mayormente ausentes (Montevideo, Buenos Aires, São Paulo) | No tienen visibilidad; la falta de información se convierte en sospecha |
| La memoria del edificio está en la cabeza del administrador y del encargado | Cuando alguno se va, la información se va con él |

### 2.2. Quiénes lo sufren y con qué frecuencia

- **Propietarios (ausentes):** permanentemente. Ven el edificio 2–4 semanas al año y pagan todo el año.
- **Comisión directiva:** en cada decisión. Deciden sin información consolidada y sin seguimiento de lo que aprobaron.
- **Administrador:** en cada rendición de cuentas. No puede demostrar fácilmente qué se hizo, por qué y con qué autorización.
- **Encargado residente:** todos los días. Registra en papel, duplica trabajo y no tiene respaldo de lo que hizo — algo especialmente sensible desde que existe un régimen de faltas y sanciones documentado.

### 2.3. Costo de no resolverlo

Gasto sin respaldo, activos que fallan por falta de preventivo, conflicto recurrente en asambleas, y pérdida total de memoria institucional ante cualquier cambio de administrador o de encargado.

### 2.4. Contexto específico que define el producto

- **Propietarios ausentes:** el usuario principal no está en el edificio. El producto es tanto una herramienta de gestión como un **instrumento de confianza a distancia**.
- **Estacionalidad fuerte:** verano, Semana de Turismo y fines de semana largos concentran ocupación, incidencias y uso de áreas comunes. El sistema debe ser más útil, no más pesado, en temporada alta.
- **Documentación ya existente:** el edificio cuenta con Descripción del Puesto (v1.5), Manual de Trabajo del Encargado (v1.5) y Contrato de Trabajo. **El manual ya obliga al encargado a llevar planillas y entregar un informe mensual.** El sistema digitaliza obligaciones que ya existen: no agrega trabajo, lo reemplaza.

---

## 3. Objetivos

| # | Objetivo | Métrica | Umbral de éxito |
|---|---|---|---|
| G1 | Que todo gasto relevante tenga expediente completo | % de gastos sobre el umbral de gobernanza con cadena necesidad → presupuestos → aprobación → OT → factura | ≥ 95 % a los 6 meses |
| G2 | Que el encargado registre en el sistema en lugar de en papel | % de registros diarios/semanales obligatorios cargados en el sistema | ≥ 90 % a los 60 días |
| G3 | Eliminar el armado manual del informe mensual | Horas de armado manual | 0 h (generado por el sistema) |
| G4 | Dar visibilidad real al propietario ausente | % de unidades con al menos un ingreso en 90 días | ≥ 60 % |
| G5 | Que ningún reclamo se pierda | Reclamos sin estado o sin responsable asignado | 0 |
| G6 | Pasar de mantenimiento reactivo a preventivo | % de tareas preventivas de activos críticos ejecutadas en fecha | ≥ 90 % |

**Objetivo de negocio (diferido):** validar el producto en Draga Inn para evaluar su comercialización a administradores en Uruguay. El modelo de datos es multi-edificio desde el día uno; el producto no expone esa capacidad en v1.

---

## 4. No-objetivos (v1)

| No-objetivo | Por qué |
|---|---|
| **Contabilidad y expensas completas** (prorrateo, emisión, cobranza, morosidad, convenios) | Es el módulo más caro y requiere definiciones contables y fiscales que aún no están tomadas. **Mitigación arquitectónica:** todo hecho del v1 lleva monto, rubro presupuestal y autorización, para que el v2 financiero no sea un rewrite. |
| **Conciliación bancaria y pasarela de pagos** | Alto costo, integración con terceros y requisitos regulatorios. v3. |
| **Asambleas y votaciones electrónicas** | Requiere definir validez jurídica frente al Reglamento de Copropiedad. v2. El v1 sí registra decisiones ya tomadas. |
| **Login propio para mucamas y auxiliar de mantenimiento** | No se van a loguear; forzarlo hunde la adopción. En v1 el encargado registra por ellos y les asigna tareas. |
| **Portal de proveedores** | En v1 el administrador carga presupuestos y facturas. El portal se evalúa en v2. |
| **App nativa (iOS/Android)** | Una PWA instalable cubre el caso del encargado, incluido el uso offline. |
| **Multi-edificio como producto** (onboarding self-service, facturación SaaS, marca blanca) | El modelo de datos lo soporta; el producto no lo expone hasta validar el piloto. |
| **Integración automática con el sistema del contador** | En v1 alcanza con exportación CSV/XLSX. |

---

## 5. Actores y trabajos a resolver (JTBD)

| Actor | Frecuencia | Dispositivo | Job principal |
|---|---|---|---|
| **Encargado residente** | Diaria (varias veces) | Celular, offline frecuente | "Quiero registrar lo que hice sin que me lleve tiempo, y que quede constancia de que lo hice." |
| **Administrador** | Diaria | Escritorio | "Quiero poder rendir cuentas de cada peso y cada decisión sin que me acusen." |
| **Comisión directiva** | Semanal / mensual | Escritorio o celular | "Quiero decidir con información y que después se pueda verificar que se ejecutó lo que aprobamos." |
| **Propietario / inquilino** | Mensual o esporádica | Celular o escritorio, a distancia | "Quiero saber cómo está mi edificio y en qué se gasta mi plata, sin tener que ir ni llamar." |
| **Auxiliar de mantenimiento / mucamas** | Diaria (sin login en v1) | — | "Quiero saber qué tengo que hacer hoy." (vía encargado) |
| **Proveedor** | Esporádica (sin login en v1) | — | "Quiero que me aprueben el presupuesto y me paguen." |
| **Contador** | Mensual | Escritorio | "Quiero los datos del mes en un formato que pueda procesar." |

**Job emocional transversal, y el más importante:** *sacar la sospecha del medio.* El sistema protege al administrador de la acusación, al encargado del reproche y al propietario de la opacidad.

---

## 6. Concepto central: el expediente

El objeto central del sistema no es la unidad ni el gasto: es el **expediente** (`case`), la cadena que une un hecho desde su origen hasta su cierre.

```
Vecino reporta problema
   └─ Ticket #453 (unidad 302, categoría: sanitaria, prioridad: alta)
        └─ Administrador asigna responsable
             └─ Proveedor presenta presupuesto  ─┐
             └─ Proveedor presenta presupuesto  ─┼─ (regla: > umbral ⇒ 3 presupuestos)
             └─ Proveedor presenta presupuesto  ─┘
                  └─ Comisión aprueba (autorización registrada)
                       └─ Orden de trabajo emitida
                            └─ Trabajo ejecutado (fotos, fecha, conformidad)
                                 └─ Factura cargada y validada
                                      └─ Gasto registrado (monto + rubro)
                                           └─ Aparece en la rendición del mes
                                                └─ Queda asociado a la decisión/acta
```

Todo elemento de esa cadena comparte cuatro atributos obligatorios: **quién** lo creó, **cuándo**, a qué **expediente** pertenece y, cuando corresponde, **con qué autorización**. Esto no es una funcionalidad: es la restricción de diseño que gobierna todo el modelo de datos.

---

## 7. Alcance del v1

### 7.1. Superficies

1. **PWA del Encargado** (móvil, instalable, funciona sin señal)
2. **Consola de Administración** (escritorio — administrador y comisión)
3. **Portal del Propietario** (responsive — propietarios e inquilinos)

### 7.2. Módulos incluidos

| # | Módulo (del modelo conceptual) | v1 |
|---|---|---|
| 1 | Estructura del edificio | ✅ Completo |
| 2 | Personas, unidades y responsabilidades | ✅ Completo (con titularidad histórica) |
| 3 | Administración financiera | ⚠️ Parcial — solo captura de monto, rubro y autorización. Sin prorrateo ni cobranza |
| 4 | Mantenimiento y activos | ✅ Completo |
| 5 | Reclamos, solicitudes y tickets | ✅ Completo |
| 6 | Gobernanza y toma de decisiones | ⚠️ Parcial — registro de decisiones y su seguimiento. Sin asambleas ni votaciones |
| 7 | Documentación | ✅ Completo |
| 8 | Proveedores y contrataciones | ✅ Completo (sin pagos) |
| 9 | Roles, permisos y auditoría | ✅ Completo |
| 10 | Tablero de gobernanza | ✅ Versión operativa |
| 11 | Trazabilidad (capa transversal) | ✅ Completo — es el spine |
| — | **Planillas del encargado + informe mensual** *(nuevo, no estaba en el modelo)* | ✅ Completo |
| — | **Cumplimiento y análisis operativo** *(nuevo — convierte las planillas en información)* | ✅ Completo |

---

## 8. Épicas y user stories

### E1 — Estructura, unidades y personas

- **US1.1** Como administrador, quiero cargar la estructura del edificio (unidades, cocheras, bauleras, áreas comunes) con sus coeficientes, para que todo lo demás pueda vincularse a un lugar concreto.
- **US1.2** Como administrador, quiero registrar propietarios, inquilinos y ocupantes con el período en que lo fueron, para saber quién era responsable de una unidad en una fecha dada.
- **US1.3** Como administrador, quiero ver la ficha integral de una unidad (propietario, inquilino, coeficiente, cochera, baulera, reclamos abiertos, pendientes) en una sola pantalla.

**Criterios de aceptación (US1.2)**
- [ ] Una unidad puede tener múltiples ocupaciones con `fecha_desde` y `fecha_hasta`
- [ ] Los períodos de un mismo rol (propietario) no pueden solaparse
- [ ] Al consultar una unidad en una fecha pasada, el sistema devuelve el propietario e inquilino vigentes en esa fecha
- [ ] Cambiar el propietario no borra el histórico ni desvincula los expedientes anteriores

### E2 — Expediente y trazabilidad *(spine)*

- **US2.1** Como administrador, quiero que cualquier hecho (ticket, presupuesto, orden de trabajo, factura, decisión) pertenezca a un expediente, para poder seguirlo de punta a punta.
- **US2.2** Como miembro de la comisión, quiero ver un expediente como una línea de tiempo con todos sus eventos, documentos, montos y autorizaciones.
- **US2.3** Como administrador, quiero que el sistema me impida avanzar de etapa si falta un requisito de gobernanza (ej.: tres presupuestos).

**Criterios de aceptación (US2.3)**
- [ ] Existe una regla configurable por edificio: monto umbral ⇒ cantidad mínima de presupuestos y nivel de aprobación requerido
- [ ] Al intentar emitir una orden de trabajo sin cumplir la regla, el sistema bloquea la acción y explica cuál requisito falta
- [ ] La regla puede omitirse explícitamente por urgencia, dejando registro de quién la omitió y por qué (excepción auditada)
- [ ] La línea de tiempo del expediente muestra la excepción de forma visible

### E3 — Reclamos y tickets

- **US3.1** Como propietario, quiero abrir un reclamo desde el portal con fotos y categoría, y ver su estado sin tener que llamar a nadie.
- **US3.2** Como encargado, quiero crear un ticket desde el celular con una foto, en menos de 30 segundos, parado donde está el problema.
- **US3.3** Como administrador, quiero una bandeja de tickets filtrable por estado, prioridad, categoría, unidad y responsable.
- **US3.4** Como propietario, quiero recibir una notificación cuando cambia el estado de mi reclamo.

**Criterios de aceptación (US3.2)**
- [ ] Flujo de creación: foto → categoría → descripción (texto o dictado) → enviar
- [ ] Funciona sin conexión: el ticket se encola y se sincroniza al recuperar señal
- [ ] El ticket encolado se muestra al encargado como "pendiente de sincronizar"
- [ ] La sincronización es idempotente: reintentos no generan tickets duplicados
- [ ] Estados: Nuevo → En análisis → Asignado → En ejecución → Pendiente de propietario → Resuelto → Cerrado
- [ ] Todo cambio de estado registra autor, fecha y comentario opcional

### E4 — Activos y mantenimiento preventivo

- **US4.1** Como administrador, quiero un inventario de activos (ascensores, bombas, tableros, portones, cámaras, piscina, contra incendio) con fecha de instalación, proveedor, garantía y documentación.
- **US4.2** Como administrador, quiero definir planes de mantenimiento preventivo por activo (frecuencia y tareas) y que el sistema genere las tareas automáticamente.
- **US4.3** Como encargado, quiero ver en el celular las tareas de mantenimiento que me tocan hoy y esta semana, y marcarlas como hechas.
- **US4.4** Como comisión, quiero ver qué activos tienen mantenimiento vencido o garantía por expirar.

**Criterios de aceptación (US4.2)**
- [ ] Un plan define frecuencia (diaria, semanal, mensual, trimestral, semestral, anual) y una lista de tareas
- [ ] El sistema genera instancias de tarea con fecha prevista y responsable por defecto
- [ ] Una tarea vencida se marca como tal y aparece en el tablero
- [ ] Al completar una tarea se registra ejecutor, fecha real, observaciones y fotos opcionales
- [ ] El historial de fallas y reparaciones del activo es consultable en su ficha

### E5 — Planillas del encargado e informe mensual *(gancho de adopción)*

- **US5.1** Como encargado, quiero completar el **checklist diario y semanal** desde el celular, siguiendo el cronograma del Manual de Trabajo.
- **US5.2** Como encargado, quiero registrar la **planilla de piscina** (cloro, pH, alcalinidad, productos aplicados) con validación de rangos.
- **US5.3** Como encargado, quiero registrar las **tareas de mantenimiento aprobadas** por la Administración (albañilería ligera, electricidad, carpintería ligera) que ya estoy obligado a documentar.
- **US5.4** Como encargado, quiero registrar **incidentes** y **movimientos de stock** de insumos críticos.
- **US5.5** Como encargado, quiero que el **informe mensual al Administrador se genere solo** con todo lo que registré en el mes.
- **US5.6** Como administrador, quiero recibir el informe mensual y ver qué se cumplió y qué quedó pendiente.

**Criterios de aceptación (US5.2)**
- [ ] Rangos de referencia visibles: cloro libre 1–3 ppm, pH 7,2–7,6, alcalinidad total 80–120 ppm
- [ ] Un valor fuera de rango se marca visualmente y pide observación obligatoria
- [ ] Un valor fuera de rango crítico genera automáticamente un ticket de alta prioridad
- [ ] Funciona offline
- [ ] La planilla del mes es exportable en PDF con el mismo formato del Anexo A del Manual

**Criterios de aceptación (US5.5)**
- [ ] El informe incluye: trabajos ejecutados, pendientes, estado de piscina con resumen de parámetros, estado del parque, incidentes, lecturas de medidores, stock crítico, presupuestos solicitados, novedades de personal y recomendaciones
- [ ] Se genera automáticamente el primer día hábil del mes siguiente
- [ ] El encargado puede editar el texto libre antes de enviarlo
- [ ] Queda versionado y asociado al mes; se exporta en PDF

### E6 — Proveedores, presupuestos y órdenes de trabajo

- **US6.1** Como administrador, quiero una ficha por proveedor con datos fiscales, servicios, contratos, seguros vigentes e historial.
- **US6.2** Como administrador, quiero cargar presupuestos comparables para una misma necesidad y verlos lado a lado.
- **US6.3** Como comisión, quiero aprobar o rechazar un presupuesto dejando constancia de quién aprobó, cuándo y con qué fundamento.
- **US6.4** Como administrador, quiero emitir una orden de trabajo a partir del presupuesto aprobado y registrar la conformidad al finalizar.
- **US6.5** Como administrador, quiero que el sistema me avise cuando un contrato, seguro o documentación de un proveedor esté por vencer.

**Criterios de aceptación (US6.3)**
- [ ] La aprobación registra usuario, rol, fecha, monto aprobado y comentario
- [ ] Una aprobación no puede modificarse; una corrección genera una nueva con referencia a la anterior
- [ ] Si el monto ejecutado supera el aprobado por encima de una tolerancia configurable, se exige una nueva aprobación
- [ ] La aprobación queda visible en la línea de tiempo del expediente

### E7 — Documentos contextualizados

- **US7.1** Como administrador, quiero subir documentos (actas, reglamentos, contratos, facturas, presupuestos, seguros, certificados, planos, permisos, informes técnicos, garantías) y asociarlos al elemento que corresponda.
- **US7.2** Como propietario, quiero acceder a los documentos que la administración publicó para los propietarios.
- **US7.3** Como administrador, quiero controlar qué documentos son visibles para propietarios y cuáles son internos.

**Criterios de aceptación (US7.1)**
- [ ] Un documento puede vincularse a: unidad, persona, activo, proveedor, expediente, ticket, orden de trabajo, decisión o al edificio
- [ ] Un documento puede tener más de un vínculo
- [ ] Tiene tipo, fecha de emisión y fecha de vencimiento opcional
- [ ] Los documentos con vencimiento próximo aparecen en el tablero de riesgos

### E8 — Roles, permisos y auditoría

- **US8.1** Como administrador, quiero que cada usuario vea y modifique solo lo que le corresponde según su rol.
- **US8.2** Como comisión, quiero un registro de auditoría que muestre quién cambió qué, cuándo, con valor anterior y valor nuevo.
- **US8.3** Como propietario, quiero ver solo mi unidad y la información general del edificio, no los datos de otras unidades.

**Matriz de permisos (v1)**

| Rol | Puede ver | Puede modificar | Puede aprobar |
|---|---|---|---|
| Propietario | Su unidad, sus reclamos, info general y documentos publicados | Sus reclamos y sus datos de contacto | No |
| Inquilino | Su unidad (sin datos financieros del propietario), sus reclamos | Sus reclamos | No |
| Encargado | Operación del edificio, tickets, activos, planillas | Tickets, planillas, tareas, incidentes, stock | No |
| Administrador | Toda la información del edificio | Toda la operativa | Según reglas y umbrales |
| Comisión directiva | Toda la información, finanzas y documentos | Según permisos | Gastos por encima del umbral |
| Contador | Datos financieros y exportaciones | No | No |

**Criterios de aceptación (US8.2)**
- [ ] Toda creación, modificación y borrado de entidades relevantes genera un registro de auditoría
- [ ] El registro incluye: usuario, rol, timestamp, entidad, acción, valor anterior y valor nuevo
- [ ] El registro es inmutable: no puede editarse ni borrarse desde la aplicación
- [ ] Es filtrable por usuario, entidad, tipo de acción y rango de fechas
- [ ] Ejemplo verificable: `10/09/2026 14:32 — Administrador — Presupuesto reparación ascensor — Antes: $380.000 — Después: $425.000`

### E9 — Tablero

- **US9.1** Como comisión, quiero un tablero con el estado integral del edificio.

**Criterios de aceptación**
- [ ] **Operación:** reclamos abiertos, críticos y vencidos; mantenimientos próximos y vencidos
- [ ] **Gobernanza:** decisiones pendientes de ejecución y aprobaciones pendientes
- [ ] **Riesgos:** seguros, certificados, contratos e inspecciones por vencer
- [ ] **Proveedores:** contratos por vencer y desempeño
- [ ] **Finanzas (v1, parcial):** gasto acumulado del mes por rubro; sin saldos ni morosidad
- [ ] Cada indicador es clickeable y lleva al detalle filtrado

### E10 — Portal del propietario

- **US10.1** Como propietario ausente, quiero ver el estado general del edificio y qué se hizo este mes.
- **US10.2** Como propietario, quiero ver la ficha de mi unidad y mis reclamos.
- **US10.3** Como propietario, quiero acceder a los documentos publicados.
- **US10.4** Como propietario, quiero recibir avisos de novedades relevantes del edificio.

### E11 — Notificaciones

- **US11.1** Como usuario, quiero recibir notificaciones por correo de lo que me concierne.
- **US11.2** Como administrador, quiero configurar qué eventos generan notificación y a qué roles.

### E12 — Cumplimiento y análisis operativo

Las planillas del Manual no sirven solo para registrar: sirven para saber **si el plan del edificio se está cumpliendo**. El v1 captura los datos (E5); esta épica los convierte en información.

- **US12.1** Como administrador, quiero ver el nivel de cumplimiento del plan operativo (checklists, planillas y tareas) en el período, para saber si el edificio está funcionando como se definió.
- **US12.2** Como administrador, quiero que el sistema me avise cuando **deja de haber registros**, no solo cuando un valor está mal.
- **US12.3** Como encargado, quiero ver mi propio indicador de cumplimiento, con el mismo detalle y antes que nadie, para poder corregir a tiempo.
- **US12.4** Como encargado y como administrador, quiero ver la **evolución de los parámetros de piscina** en el tiempo, no solo la medición del día.
- **US12.5** Como administrador, quiero saber qué ítems del checklist se omiten sistemáticamente, para revisar si el ítem sirve o si hay un problema real ahí.
- **US12.6** Como administración, quiero analizar las tareas de mantenimiento aprobadas por rubro, tiempo y costo, y el porcentaje que terminó derivado a un técnico.
- **US12.7** Como comisión, quiero el **resumen de control mensual** (previstas / completadas / pendientes con justificación) dentro del informe, como en el checklist en papel.
- **US12.8** Como comisión, quiero comparar temporada alta contra temporada baja.

**Criterios de aceptación (US12.2 — ausencia de registro)**
- [ ] El sistema distingue tres situaciones: registro correcto, registro con valor fuera de rango y **registro faltante**
- [ ] Un día sin checklist completo se marca como incompleto y se notifica **solo al encargado**
- [ ] Dos días consecutivos incompletos notifican al administrador
- [ ] Siete días consecutivos sin ningún registro generan alerta en el tablero de riesgos y notifican a administrador y comisión
- [ ] En temporada de piscina, un día sin registro de piscina cuenta como faltante

**Criterios de aceptación (US12.4 — tendencias)**
- [ ] Serie temporal de cloro, pH y alcalinidad con las bandas de rango dibujadas
- [ ] Tres mediciones consecutivas desviándose en la misma dirección generan aviso de tendencia **aunque cada valor esté dentro de rango**
- [ ] El rango de visualización es configurable (7, 30, 90 días y temporada)

**Criterios de aceptación (US12.3 — encuadre)**
- [ ] El encargado accede a su indicador desde la PWA sin pedir permiso a nadie
- [ ] El indicador se titula y se presenta como **cumplimiento del plan del edificio**, no como desempeño de una persona
- [ ] La vista incluye la leyenda de que su uso disciplinario requiere el procedimiento del régimen de faltas

> **Nota de diseño — encuadre laboral.** Estos indicadores son, técnicamente, monitoreo del desempeño de una persona identificable. El producto adopta tres decisiones deliberadas: la métrica mide el **plan del edificio**, no a la persona; el **encargado ve su indicador primero** y con el mismo detalle que la administración; y ningún indicador sustituye el debido proceso del régimen de faltas y sanciones. Ver también Q8 (Ley 18.331).

---

## 9. Requerimientos priorizados

### P0 — Sin esto no se lanza

| ID | Requerimiento |
|---|---|
| R1 | Estructura del edificio, unidades y personas con titularidad histórica |
| R2 | Expediente como spine, con línea de tiempo y vínculos |
| R3 | Tickets con ciclo completo, fotos y notificaciones |
| R4 | PWA del encargado funcionando offline con cola de sincronización idempotente |
| R5 | Planillas del encargado (checklist, piscina, tareas aprobadas, incidentes, stock) |
| R6 | Informe mensual autogenerado y exportable en PDF |
| R7 | Activos con plan de mantenimiento preventivo y generación automática de tareas |
| R8 | Proveedores, presupuestos comparables, aprobación y orden de trabajo |
| R9 | Reglas de gobernanza por monto (N presupuestos + nivel de aprobación), con excepción auditada |
| R10 | Documentos con vínculo polimórfico y control de visibilidad |
| R11 | RBAC por rol y por edificio |
| R12 | Log de auditoría inmutable con valor anterior y valor nuevo |
| R13 | Tablero operativo, de riesgos y de gobernanza |
| R14 | Portal del propietario |
| R15 | Campos de monto, rubro presupuestal y autorización en todo hecho económico |
| R28 | Indicador de cumplimiento del plan operativo (checklists, planillas y tareas) por período, visible en el tablero |
| R29 | Detección de **ausencia de registro** con escalamiento: encargado → administrador → comisión |
| R30 | Resumen de control mensual dentro del informe (previstas / completadas / pendientes con justificación) |

### P1 — Alta prioridad, no bloquea el lanzamiento

| ID | Requerimiento |
|---|---|
| R16 | Exportación CSV/XLSX para el contador |
| R17 | Notificaciones por WhatsApp (vía n8n) además de correo |
| R18 | Dictado de voz para descripción de tickets |
| R19 | Registro de decisiones de la comisión con responsable y plazo, y su seguimiento |
| R20 | Lecturas de medidores y seguimiento de consumos |
| R21 | Modo temporada alta en el tablero (indicadores y frecuencias reforzadas) |
| R31 | Series temporales de parámetros de piscina con detección de tendencia |
| R32 | Detección de ítems de checklist sistemáticamente omitidos |
| R33 | Análisis de tareas aprobadas por rubro, tiempo, costo y tasa de derivación |
| R34 | Comparativo temporada alta vs. temporada baja |

### P2 — Fuera de v1, pero el diseño no debe bloquearlos

| ID | Requerimiento |
|---|---|
| R22 | Módulo financiero completo: presupuesto anual, prorrateo por coeficiente, expensas, morosidad, convenios |
| R23 | Asambleas, propuestas, votaciones y actas |
| R24 | Conciliación bancaria y órdenes de pago |
| R25 | Portal de proveedores |
| R26 | Multi-edificio como producto (onboarding, facturación, marca blanca) |
| R27 | Login propio para auxiliar de mantenimiento y mucamas |

---

## 10. Métricas de éxito

### Indicadores tempranos (1–8 semanas)

| Métrica | Objetivo | Cómo se mide |
|---|---|---|
| Registros diarios del encargado | ≥ 90 % de los días con checklist completo | Conteo de `checklist_instances` completadas / días hábiles |
| Tiempo de creación de un ticket en móvil | ≤ 30 s (mediana) | Telemetría del formulario |
| Tickets sin responsable asignado | 0 | Consulta directa |
| Propietarios con primer ingreso | ≥ 60 % de las unidades a los 90 días | Usuarios únicos con rol propietario |
| Informe mensual generado sin intervención manual | 100 % | Generación automática vs. manual |
| Cumplimiento del plan operativo del período | ≥ 85 % de ítems requeridos | Indicador del sistema (E12), medido por el propio sistema |
| Detección de ausencia de registro | 100 % de las rachas ≥ 2 días notificadas | Conteo de alertas emitidas vs. rachas reales |

### Indicadores de resultado (3–12 meses)

| Métrica | Objetivo |
|---|---|
| Gastos sobre el umbral con expediente completo | ≥ 95 % |
| Mediana de tiempo de resolución de reclamos | Reducción del 40 % respecto de la línea de base |
| Tareas preventivas de activos críticos ejecutadas en fecha | ≥ 90 % |
| Reclamos reabiertos | ≤ 10 % |
| Conflictos en asamblea por falta de información | Reducción cualitativa (evaluación con la comisión) |

**Línea de base:** hay que medirla antes de lanzar. Hoy no existe. Ver preguntas abiertas.

---

## 11. Riesgos y supuestos

| # | Supuesto / riesgo | Impacto | Mitigación |
|---|---|---|---|
| A1 | **El encargado tiene smartphone y sabe usarlo** | Crítico — sin esto el v1 no funciona | Validar antes de construir. Si falla: tablet en portería + carga asistida |
| A2 | **Hay conectividad razonable en el edificio** | Alto | PWA offline-first con cola de sincronización. Ya mitigado por diseño |
| A3 | **La comisión acepta que el sistema sea la fuente de verdad** | Alto | El administrador actual usa Excel, no hay sistema que defender. Presentar el v1 como reemplazo del papel, no como control |
| A4 | El encargado percibe el sistema como vigilancia y no como respaldo | Alto | Encuadrarlo como respaldo de su trabajo frente al régimen de faltas. Involucrarlo en el diseño de las planillas |
| A5 | Los propietarios ausentes no entran al portal | Medio | Notificaciones por correo con resumen mensual que empujen al portal |
| A6 | Datos personales de residentes e imágenes de cámaras | Medio — legal | Uruguay: Ley N.º 18.331 de Protección de Datos Personales (URCDP). Definir base legal, retención y acceso. Ver preguntas abiertas |
| A7 | El v2 financiero obliga a rediseñar el modelo | Medio | Mitigado: monto, rubro y autorización presentes desde el v1 |
| A8 | Sobredimensionamiento del v1 (tres superficies) | Medio | Entrega por fases (ver sección 12); cada fase es usable por sí sola |

---

## 12. Fases de entrega

El v1 se entrega en cuatro fases. **Cada fase es usable por sí sola** y se pone en producción al terminar.

| Fase | Contenido | Resultado observable |
|---|---|---|
| **F1 — Cimientos + Encargado** | Estructura, personas, auth, RBAC, auditoría, expediente, tickets, PWA offline, planillas y checklists | El encargado deja el papel. Hay datos reales en el sistema |
| **F2 — Administración** | Bandeja de tickets, activos y preventivo, proveedores, presupuestos, aprobaciones, órdenes de trabajo, documentos | El administrador gestiona desde el sistema. Los expedientes se cierran punta a punta |
| **F3 — Informe, tablero y cumplimiento** | Informe mensual autogenerado con resumen de control, tablero operativo/riesgos/gobernanza, **cumplimiento y análisis operativo (E12)**, exportaciones | La comisión ve el estado del edificio y si el plan se cumple. Se elimina el armado manual |
| **F4 — Propietarios** | Portal del propietario, reclamos desde el portal, documentos publicados, notificaciones | Los propietarios ausentes tienen visibilidad. Sponsor político asegurado |

**Recomendación de secuencia:** no adelantar F4. El portal sin datos adentro genera una mala primera impresión difícil de revertir con propietarios que entran una vez cada tres meses.

---

## 13. Preguntas abiertas

| # | Pregunta | Quién responde | ¿Bloquea? |
|---|---|---|---|
| Q1 | ¿El encargado tiene smartphone propio y conectividad? ¿El edificio le provee línea de datos? | Administración | **Sí** — define la superficie de captura |
| Q2 | ¿Cuál es el umbral de monto que dispara la exigencia de tres presupuestos y aprobación de la comisión? | Comisión directiva | **Sí** — es una regla de gobernanza del v1 |
| Q3 | ¿Quién aprueba qué? ¿La comisión completa o un miembro delegado? ¿Hay montos que aprueba el administrador solo? | Comisión directiva | **Sí** |
| Q4 | ¿Qué dice el Reglamento de Copropiedad sobre facultades del administrador y de la comisión? | Administración / Comisión | **Sí** — las reglas de gobernanza deben reflejarlo |
| Q5 | ¿Existe padrón actualizado de unidades, coeficientes, propietarios e inquilinos? ¿En qué formato? | Administración | **Sí** — es la carga inicial |
| Q6 | ¿Cuál es la línea de base actual (tiempo de resolución de reclamos, cantidad mensual)? | Administración | No — pero hay que medirla antes de F1 |
| Q7 | ¿Qué activos existen y cuál es su estado, garantía y proveedor actual? | Encargado / Administración | No — se carga en F2 |
| Q8 | Tratamiento de datos personales e imágenes de cámaras: base legal, retención y quién accede (Ley 18.331) | Asesor legal | No — pero antes de F4 |
| Q9 | ¿Los inquilinos tienen acceso al portal, y con qué alcance frente al propietario? | Comisión directiva | No — afecta F4 |
| Q10 | ¿Se migra el histórico de Excel o se arranca de cero? | Administración | No — decisión de F1 |

---

## 14. Dependencias

- **Documentación existente del edificio** (insumo directo del sistema): Descripción del Puesto v1.5, Manual de Trabajo del Encargado v1.5 (cronograma y Anexos A–H), Contrato de Trabajo. Las planillas del sistema deben replicar exactamente esos anexos.
- **Reglamento de Copropiedad** y resoluciones de la Comisión Directiva: definen las reglas de gobernanza configurables.
- **Reglamento Interno de Trabajo**: en elaboración; afecta el módulo de decisiones y el régimen disciplinario.

---

## 15. Anexo — Trazabilidad con el modelo conceptual original

| Módulo original | Épica del PRD | Estado v1 |
|---|---|---|
| 1. Estructura del edificio | E1 | Completo |
| 2. Personas, unidades y responsabilidades | E1 | Completo |
| 3. Administración financiera | — (R15, R22) | Parcial / diferido |
| 4. Mantenimiento y activos | E4 | Completo |
| 5. Reclamos, solicitudes y tickets | E3 | Completo |
| 6. Gobernanza y toma de decisiones | E2, R19 | Parcial |
| 7. Documentación | E7 | Completo |
| 8. Proveedores y contrataciones | E6 | Completo sin pagos |
| 9. Roles, permisos y auditoría | E8 | Completo |
| 10. Tablero de gobernanza | E9 | Versión operativa |
| 11. Trazabilidad | E2 | Completo (spine) |
| 12. Principio rector | Transversal | Restricción de diseño |
| *(agregado)* Planillas del encargado | E5 | Completo |
| *(agregado)* Cumplimiento y análisis operativo | E12 | Completo |
