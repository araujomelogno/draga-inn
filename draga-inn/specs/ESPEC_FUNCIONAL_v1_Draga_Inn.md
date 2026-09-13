# Especificación Funcional — v1

**Producto:** Sistema de Gestión y Gobernanza — Edificio Draga Inn
**Versión:** 1.0 — 13/09/2026
**Documentos relacionados:** `PRD_Sistema_Gestion_Gobernanza_Draga_Inn.md` (qué y por qué) · `HANDOFF_TECNICO_Draga_Inn.md` (cómo)

---

## 0. Propósito de este documento

El PRD define el alcance y el hand-off define la arquitectura. **Este documento define el comportamiento**: qué ve cada rol en cada pantalla, qué puede hacer, qué pasa cuando algo sale mal y qué reglas de negocio se aplican en cada punto.

Es el documento contra el que se escriben los tests de aceptación. Si una conducta no está acá, no está definida.

**Convenciones**

- `RN-xx` = regla de negocio (sección 6). Las pantallas las referencian por número.
- Toda pantalla especifica: **objetivo · acceso · contenido · acciones · validaciones · estados**.
- Los cuatro estados de toda vista son: **carga**, **vacío**, **error**, **contenido**. Si no se especifica, el estado vacío usa el patrón por defecto de §9.

---

## 1. Principios de interfaz

| # | Principio | Implicancia concreta |
|---|---|---|
| P1 | **El encargado primero, en el celular** | Toda acción frecuente del encargado se resuelve en ≤ 3 toques. Botones ≥ 44 px. Uso con una mano |
| P2 | **Nunca mentir sobre el estado del dato** | Si algo está encolado y no enviado, dice *"guardado en el teléfono, pendiente de enviar"*. Nunca "guardado" a secas |
| P3 | **El rol define la pantalla, no el menú** | Un propietario no ve opciones deshabilitadas: no las ve |
| P4 | **Todo dato tiene origen visible** | Quién lo cargó y cuándo, siempre visible en el detalle |
| P5 | **Español rioplatense** | Fechas `dd/mm/aaaa`, montos `$ 1.234,56`, hora 24 h, zona `America/Montevideo` |
| P6 | **El error explica qué hacer** | "Faltan 2 presupuestos para emitir la orden" — no "Error de validación" |

---

## 2. Superficies y navegación

### 2.1. PWA del Encargado *(móvil, instalable, offline)*

Barra inferior de 4 ítems fijos:

```
[ Hoy ]   [ Registrar + ]   [ Tickets ]   [ Informe ]
```

`Registrar +` abre una hoja de acciones: **Ticket · Piscina · Tarea aprobada · Incidente · Stock**.

Barra superior persistente con estado de conexión y pendientes (RN-30).

### 2.2. Consola de Administración *(escritorio)*

```
Tablero
Operación    → Tickets · Expedientes · Tareas de mantenimiento
Edificio     → Unidades · Personas · Activos · Áreas comunes
Contrataciones → Proveedores · Presupuestos · Aprobaciones · Órdenes de trabajo · Facturas
Registros    → Planillas del encargado · Informes mensuales · Documentos · Decisiones
Control      → Auditoría
Configuración → Reglas de gobernanza · Plantillas de checklist · Usuarios y roles · Rubros
```

### 2.3. Portal del Propietario *(responsive)*

```
[ Inicio ]  [ Mi unidad ]  [ Mis reclamos ]  [ Documentos ]  [ Perfil ]
```

---

## 3. Máquinas de estado

### 3.1. Ticket

```
new ──▶ triage ──▶ assigned ──▶ in_progress ──▶ resolved ──▶ closed
          │            │             │              ▲
          │            │             └──▶ waiting_owner ──┘
          └────────────┴──────────────────────▶ closed (descartado, exige motivo)
```

| Transición | Quién | Condición |
|---|---|---|
| `new → triage` | administrador, encargado | — |
| `triage → assigned` | administrador | Requiere responsable asignado |
| `assigned → in_progress` | responsable | — |
| `* → waiting_owner` | administrador, encargado | Requiere comentario visible al propietario |
| `in_progress → resolved` | responsable | Requiere nota de resolución |
| `resolved → closed` | administrador; automático a los 7 días (RN-11) | — |
| `resolved → in_progress` | administrador, propietario (reapertura, RN-12) | Dentro de los 7 días |

**Retroceso de estado:** permitido solo a `administrador`, exige motivo y genera `case_event`.

### 3.2. Expediente (`case`)

`open → in_progress → waiting → resolved → closed` · `cancelled` desde cualquiera.
**RN-01:** un expediente no puede cerrarse con tickets, órdenes de trabajo o aprobaciones pendientes.

### 3.3. Contratación

```
Necesidad (case) ──▶ Presupuestos (≥ N según RN-20) ──▶ Aprobación ──▶
Orden de trabajo ──▶ Ejecución ──▶ Conformidad ──▶ Factura ──▶ (v2: pago)
```

### 3.4. Tarea de mantenimiento

`pending → done` · `pending → overdue` (automático, RN-24) · `pending → skipped` (exige motivo).

### 3.5. Checklist diario

`pending → partial → complete`. No se puede completar con ítems requeridos sin marcar (RN-31).

### 3.6. Informe mensual

`draft (generado) → submitted`. Una vez enviado no se edita; una corrección genera una versión nueva (RN-42).

---

## 4. PWA del Encargado — pantallas

### 4.1. Hoy

- **Objetivo:** que el encargado sepa en 5 segundos qué tiene que hacer hoy.
- **Acceso:** `encargado`, `administrador`.
- **Contenido**, en este orden:
  1. Saludo + fecha + indicador de temporada (RN-40)
  2. **Checklist del día** — progreso `7/12`, ítems agrupados por sección del Manual
  3. **Tareas de mantenimiento** que vencen hoy o están vencidas (vencidas primero, en rojo)
  4. **Tickets asignados** abiertos, ordenados por prioridad
  5. **Pendientes de sincronizar**, si hay
- **Acciones:** marcar ítem de checklist · completar tarea · abrir ticket · `Registrar +`
- **Offline:** totalmente disponible. Marcar ítems funciona sin conexión.
- **Estado vacío:** "No hay tareas para hoy. Podés registrar novedades con el botón +."

**Criterios de aceptación**
- [ ] Marcar un ítem responde en < 200 ms sin esperar red
- [ ] Una tarea vencida se muestra antes que cualquier tarea del día
- [ ] El progreso del checklist refleja los ítems marcados offline
- [ ] Al recuperar conexión, lo marcado offline no se pierde ni se duplica

### 4.2. Nuevo ticket *(meta: ≤ 30 segundos)*

- **Acceso:** `encargado`, `administrador`.
- **Flujo:** Foto (cámara, opcional) → Categoría (grilla de íconos) → Descripción (texto o dictado) → *opcional:* unidad / área común / activo, prioridad → **Enviar**.
- **Valores por defecto:** prioridad `normal`; ubicación vacía; reportante = usuario actual.
- **Validaciones:** categoría obligatoria · descripción ≥ 10 caracteres · máx. 5 fotos · cada foto ≤ 25 MB, redimensionada a 1920 px antes de subir.
- **Offline:** la foto se guarda como blob local; el ticket se encola; la subida de la foto ocurre al reconectar (RN-32).
- **Post-envío:** confirmación con el número de ticket si hubo red, o *"Guardado en el teléfono. Se enviará al recuperar señal."*

**Criterios de aceptación**
- [ ] En modo avión el ticket se crea y aparece en la lista local con indicador de pendiente
- [ ] Al reconectar se sincroniza una sola vez (idempotencia por `client_uuid`)
- [ ] Reintentar manualmente no genera duplicados
- [ ] La foto queda vinculada al ticket correcto tras la sincronización
- [ ] Si la descripción tiene menos de 10 caracteres, el botón Enviar está deshabilitado con mensaje

### 4.3. Piscina *(Anexo A del Manual)*

- **Acceso:** `encargado`.
- **Campos:** fecha (hoy por defecto) · hora · cloro libre · pH · alcalinidad total · dureza cálcica · desnatado (sí/no) · cestas vaciadas (sí/no) · productos aplicados · observaciones.
- **Rangos de referencia visibles en pantalla:** cloro 1–3 ppm · pH 7,2–7,6 · alcalinidad 80–120 ppm.
- **Validaciones:** al menos cloro y pH obligatorios · valores numéricos con 1–2 decimales · fuera de rango ⇒ observación obligatoria (RN-21) · fuera de rango crítico ⇒ ticket automático (RN-22).
- **Offline:** completo.
- **Extra:** la pantalla muestra las últimas 3 mediciones para dar contexto.

**Criterios de aceptación**
- [ ] Un pH de 8,4 marca el campo en ámbar y exige observación
- [ ] Un cloro de 0,2 ppm (crítico) crea un ticket de prioridad `critical` con categoría piscina
- [ ] El ticket automático queda vinculado al registro de piscina que lo originó
- [ ] Un registro duplicado para la misma fecha y hora se rechaza con mensaje claro
- [ ] La planilla mensual se exporta en PDF con el formato del Anexo A

### 4.4. Tarea aprobada *(Anexo B del Manual)*

- **Campos:** fecha · rubro (albañilería ligera / electricidad / carpintería ligera / sanitaria / pintura / otros) · descripción · materiales · tiempo (minutos) · estado · **¿requirió derivación a técnico?** (sí/no + motivo).
- **RN-23:** si se marca derivación, el sistema ofrece crear un ticket vinculado en el mismo paso.
- **Costo:** campo opcional de monto + rubro presupuestal (visible solo si el administrador lo habilitó).

### 4.5. Incidente *(Anexo F)*

- **Campos:** fecha y hora · tipo (corte de servicio, fuga, principio de incendio, accidente, ingreso no autorizado, daño, otro) · descripción · acción tomada · a quién se avisó · estado.
- **RN-25:** un incidente de tipo `accidente` o `principio de incendio` notifica al administrador de inmediato por todos los canales disponibles.

### 4.6. Stock *(Anexo E)*

- Lista de insumos con cantidad actual y mínimo; los que están por debajo del mínimo aparecen primero y en ámbar.
- **Acción:** registrar movimiento (entrada / salida / ajuste) con cantidad y motivo.
- **RN-26:** al caer por debajo del mínimo se notifica al administrador (una sola vez por artículo hasta que se reponga).

### 4.7. Mi informe

- Vista previa en construcción del informe del mes en curso, con lo registrado hasta el momento.
- Bloque editable de **narrativa** (recomendaciones y observaciones del encargado).
- **Resumen de control del mes** (RN-50): tareas previstas, completadas, pendientes y % de cumplimiento, con campo de justificación de los pendientes — replica el bloque del checklist en papel.
- Botón **Enviar al Administrador**, habilitado solo desde el día 1 del mes siguiente (RN-41).

### 4.8. Mi cumplimiento *(del encargado, y primero para él)*

- **Objetivo:** que el encargado vea cómo viene el cumplimiento del plan y pueda corregir antes de que se lo señalen.
- **Acceso:** `encargado` (su propio indicador), `administrador`, `comision`.
- **Contenido**
  1. **% de cumplimiento** del período en curso (día, semana, mes) sobre ítems requeridos
  2. **Racha**: días consecutivos con el plan completo, o días sin registro si la racha es negativa
  3. **Pendientes de hoy y de la semana**, con acceso directo para completarlos
  4. **Tendencia de piscina**: serie de cloro, pH y alcalinidad con las bandas de rango dibujadas
  5. **Historial** de los últimos 30 días en formato calendario (verde / ámbar / rojo por día)
- **Offline:** lectura desde caché; el cálculo se recibe del servidor y se cachea.
- **RN-49:** el encargado accede a esta pantalla sin permiso de nadie, y ve exactamente el mismo detalle que ve la administración.
- **Encuadre obligatorio en pantalla:** el título es **"Cumplimiento del plan del edificio"**, nunca "tu desempeño". Al pie, la leyenda de RN-51.

**Criterios de aceptación**
- [ ] El % se calcula solo sobre ítems requeridos; los opcionales no penalizan (RN-48)
- [ ] Un día sin registro se ve en rojo en el calendario y suma a la racha negativa
- [ ] La tendencia muestra aviso cuando hay tres mediciones consecutivas desviándose en la misma dirección, aun dentro de rango (RN-47)
- [ ] La pantalla es accesible desde la PWA sin pasar por la consola de administración

---

## 5. Consola de Administración — pantallas

### 5.1. Tablero

Cuatro bloques; cada tarjeta es clickeable y navega al listado filtrado.

| Bloque | Indicadores |
|---|---|
| **Operación** | Tickets abiertos · críticos · vencidos · sin asignar · tareas de mantenimiento vencidas |
| **Gobernanza** | Aprobaciones pendientes · decisiones pendientes de ejecución · excepciones de gobernanza del mes |
| **Riesgos** | Documentos, seguros, garantías y contratos que vencen en 30 días · activos críticos con preventivo vencido |
| **Proveedores** | Contratos por vencer · trabajos en curso · facturas sin validar |
| **Cumplimiento** | % de cumplimiento del plan operativo del período · días sin registro (racha actual) · planillas pendientes · ítems sistemáticamente omitidos · tasa de derivación de tareas aprobadas · miniatura de tendencia de piscina |
| **Gasto del mes** | Total acumulado por rubro (sin saldos ni morosidad — eso es v2) |

- **RN-27:** "sin asignar" y "vencidos" en rojo si > 0. El resto, neutro.
- **Estado vacío:** "Todo al día" con marca de verificación, no una tarjeta en blanco.

### 5.2. Tickets — bandeja

- **Columnas:** N.º · título · unidad/área · categoría · prioridad · estado · responsable · antigüedad · última actualización.
- **Filtros:** estado (multi) · prioridad · categoría · unidad · responsable · origen · rango de fechas · solo vencidos · solo sin asignar.
- **Orden por defecto:** vencidos primero, luego prioridad descendente, luego antigüedad.
- **Acciones masivas:** asignar responsable · cambiar prioridad. (No cambio masivo de estado: RN-13.)
- **Guardado de filtros:** el último filtro usado persiste por usuario.

### 5.3. Ticket — detalle

- **Encabezado:** N.º, título, estado (editable según §3.1), prioridad, responsable, unidad, activo, vencimiento.
- **Cuerpo:** descripción, fotos, línea de tiempo del **expediente** (no solo del ticket), comentarios.
- **Comentarios:** selector *Visible al propietario* / *Interno*. **RN-14:** el interno nunca se muestra en el portal, ni en notificaciones, ni en exportaciones al propietario.
- **Panel lateral:** expediente vinculado, presupuestos, órdenes de trabajo, facturas, documentos.
- **Acciones:** cambiar estado · asignar · vincular a activo o unidad · adjuntar documento · **generar necesidad de contratación** (crea el flujo de presupuestos).

**Criterios de aceptación**
- [ ] Cambiar el estado sin el requisito de la transición muestra qué falta y no cambia nada
- [ ] Todo cambio queda en la línea de tiempo con autor y fecha
- [ ] Un comentario interno no aparece en el portal del propietario (test negativo obligatorio)

### 5.4. Expediente — detalle

- **Línea de tiempo unificada** en orden cronológico: creación, tickets, presupuestos, aprobaciones, órdenes, ejecuciones, facturas, documentos, decisiones y excepciones.
- Cada evento muestra: ícono de tipo, **quién**, **cuándo**, resumen, **monto** si aplica y enlace a la entidad.
- **Encabezado con el resumen que responde el principio rector:** quién lo abrió, qué es, cuándo, por qué, cuánto lleva gastado y con qué autorización.
- **RN-02:** las excepciones de gobernanza se muestran destacadas en ámbar, nunca ocultas.

### 5.5. Unidades y ficha de unidad

- **Listado:** código, tipo, piso, coeficiente, propietario vigente, inquilino vigente, reclamos abiertos.
- **Ficha (replica el ejemplo del modelo conceptual):** propietario · inquilino · coeficiente · cochera · baulera · reclamos abiertos · pendientes · histórico de titularidad · documentos · expedientes.
- **RN-03:** al cambiar de propietario se cierra el período anterior con la fecha indicada y se abre uno nuevo. **Nunca se sobrescribe.**
- **Consulta histórica:** selector "ver a fecha" que muestra quién era propietario e inquilino en esa fecha.

### 5.6. Activos y mantenimiento

- **Ficha de activo:** datos, instalación, proveedor, garantía, criticidad, plan preventivo, historial de fallas y reparaciones, costo acumulado, documentos.
- **Planes:** frecuencia, intervalo, fecha de inicio, responsable por defecto, lista de tareas.
- **Calendario de tareas:** vista mensual con vencidas, de hoy y próximas.
- **RN-24:** una tarea pasa a `overdue` a las 00:00 del día siguiente a su vencimiento.
- **RN-28:** no se puede desactivar un plan con tareas pendientes sin decidir qué hacer con ellas (cancelarlas o dejarlas).

### 5.7. Contrataciones

**Presupuestos — comparador:** tabla lado a lado con proveedor, monto, plazo, alcance, validez y adjunto. Marca el más bajo, pero **no lo recomienda automáticamente** (RN-29: la decisión es humana y se fundamenta).

**Aprobación:** modal con monto, regla aplicable, quién debe aprobar, campo de fundamento obligatorio. Si el usuario no tiene nivel suficiente, el botón no está disponible y se indica quién debe hacerlo.

**Orden de trabajo:** se emite desde un presupuesto aprobado. **RN-20** se valida acá; si no se cumple, se bloquea con el detalle de lo que falta y se ofrece la vía de excepción a quien corresponda.

**Conformidad:** al completar, se registra quién dio conformidad, fecha, observaciones y fotos. **RN-15:** no se puede cargar una factura sin conformidad previa, salvo excepción auditada.

**Factura:** número, fecha, monto, rubro, adjunto. **RN-16:** si el monto supera el aprobado más la tolerancia configurada, se exige nueva aprobación antes de validar.

### 5.8. Documentos

- **Listado** con filtros por tipo, entidad vinculada, visibilidad y vencimiento.
- **Carga:** archivo → tipo → fecha de emisión → vencimiento (opcional) → visibilidad → vínculos (uno o varios).
- **RN-17:** la visibilidad por defecto es `internal`. Publicar a propietarios es un acto explícito.
- **RN-18:** un documento con vencimiento aparece en Riesgos a los 30, 15 y 7 días.

### 5.9. Auditoría

- **Tabla:** fecha y hora · usuario · rol · entidad · acción · campos modificados.
- **Detalle:** valor anterior y valor nuevo, campo por campo.
- **Filtros:** usuario, entidad, tipo de acción, rango de fechas.
- **RN-19:** la auditoría es de solo lectura para todos los roles, sin excepción. No hay borrado ni edición desde ninguna pantalla.
- **Exportación:** CSV, solo `administrador`, `comision` y `auditor`.

### 5.10. Configuración

- **Reglas de gobernanza:** umbral, moneda, mínimo de presupuestos, rol aprobador. Se puede tener más de una regla escalonada.
- **Plantillas de checklist:** editor de ítems por frecuencia; precargadas con el cronograma del Manual v1.5.
- **Usuarios y roles:** invitar por email, asignar roles, desactivar. **RN-04:** no se puede quedar sin ningún `administrador` activo.
- **Rubros presupuestales.**

### 5.11. Cumplimiento y análisis operativo

- **Acceso:** `administrador`, `comision`. El encargado ve su propia versión en §4.8.
- **Pestañas:**

**a) Cumplimiento** — % por período (día, semana, mes, temporada) con desglose por plantilla de checklist; calendario de 90 días; racha actual; listado de días incompletos con el detalle de qué faltó.

**b) Piscina** — series de cloro, pH, alcalinidad y dureza con bandas de rango; marcado de días sin registro como huecos visibles (no interpolados); avisos de tendencia; exportación de la planilla del período en PDF con formato del Anexo A.

**c) Ítems omitidos** — ranking de ítems del checklist no marcados en ≥ 80 % de las instancias de los últimos 30 días, con acceso a editar la plantilla o abrir un ticket de revisión (RN-46).

**d) Tareas aprobadas** — volumen por rubro, tiempo promedio, costo acumulado y **tasa de derivación a técnico**, con comparativo contra el período anterior.

**e) Temporada** — comparativo alta vs. baja de todos los indicadores anteriores.

- **RN-51 visible:** al pie de la pestaña Cumplimiento, la leyenda sobre uso disciplinario.

**Criterios de aceptación**
- [ ] Un día sin registro se distingue visualmente de un día con registro fuera de rango: son cosas distintas
- [ ] Las series de piscina no interpolan los huecos: un día sin dato se ve como hueco
- [ ] Cada indicador es clickeable y navega al registro subyacente
- [ ] El comparativo de temporada usa los rangos de fechas de RN-40

---

## 6. Reglas de negocio

| # | Regla |
|---|---|
| **RN-01** | Un expediente no cierra con tickets, órdenes de trabajo o aprobaciones pendientes |
| **RN-02** | Toda excepción a una regla de gobernanza se muestra destacada en la línea de tiempo y en el tablero del mes |
| **RN-03** | La titularidad nunca se sobrescribe: se cierra un período y se abre otro |
| **RN-04** | El edificio debe tener siempre al menos un `administrador` activo |
| **RN-11** | Un ticket `resolved` se cierra automáticamente a los 7 días sin objeción |
| **RN-12** | El propietario puede reabrir su reclamo dentro de los 7 días de resuelto; después debe abrir uno nuevo |
| **RN-13** | El cambio de estado es individual y con contexto: no hay cambio masivo de estado |
| **RN-14** | Un comentario marcado como interno nunca llega al propietario por ninguna vía |
| **RN-15** | No se carga factura sin conformidad de la orden de trabajo, salvo excepción auditada |
| **RN-16** | Factura que excede el monto aprobado + tolerancia exige nueva aprobación |
| **RN-17** | Todo documento nace `internal`; publicarlo es un acto explícito y auditado |
| **RN-18** | Vencimientos alertan a 30, 15 y 7 días |
| **RN-19** | La auditoría es inmutable y de solo lectura para todos |
| **RN-20** | Antes de emitir una orden de trabajo se valida: N presupuestos y aprobación del rol requerido según el monto |
| **RN-21** | Valor de piscina fuera de rango exige observación |
| **RN-22** | Valor de piscina fuera de rango crítico genera ticket `critical` automático vinculado al registro |
| **RN-23** | Tarea aprobada marcada como derivada ofrece crear ticket vinculado |
| **RN-24** | Una tarea vence a las 00:00 del día siguiente a su fecha prevista |
| **RN-25** | Incidente de accidente o principio de incendio notifica al administrador de inmediato |
| **RN-26** | Stock bajo mínimo notifica una vez por artículo hasta su reposición |
| **RN-27** | Indicadores de "sin asignar" y "vencidos" se destacan en rojo solo si son > 0 |
| **RN-28** | No se desactiva un plan de mantenimiento sin resolver sus tareas pendientes |
| **RN-29** | El sistema marca el presupuesto más bajo pero no recomienda: la decisión se fundamenta |
| **RN-30** | El estado de sincronización es visible de forma permanente en la PWA |
| **RN-31** | Un checklist no se completa con ítems requeridos sin marcar |
| **RN-32** | Las fotos se suben por separado del registro; el registro no espera a la foto |
| **RN-40** | Entre el 1/12 y el 31/3, y en Semana de Turismo, la interfaz indica **temporada alta** y refuerza las frecuencias de las plantillas marcadas como estacionales |
| **RN-41** | El informe mensual se envía a partir del día 1 del mes siguiente |
| **RN-42** | Un informe enviado no se edita: se genera una versión nueva que referencia la anterior |
| **RN-43** | El sistema distingue tres estados por registro: **presente y correcto**, **presente fuera de rango** y **faltante**. Los tres se computan distinto |
| **RN-44** | Checklist diario sin completar al cierre del día (20:00 local) ⇒ el día se marca incompleto y se notifica **solo al encargado** |
| **RN-45** | Dos días consecutivos incompletos ⇒ notificación al administrador. Siete días consecutivos sin ningún registro ⇒ alerta en tablero de riesgos y notificación a administrador y comisión |
| **RN-46** | Un ítem no marcado en ≥ 80 % de las instancias de los últimos 30 días se señala como **sistemáticamente omitido** para revisión de la plantilla |
| **RN-47** | Tres mediciones consecutivas de un mismo parámetro de piscina desviándose en la misma dirección generan **aviso de tendencia**, aunque cada valor esté dentro de rango |
| **RN-48** | El cumplimiento se calcula **solo sobre ítems requeridos**. Los ítems opcionales no penalizan |
| **RN-49** | El encargado ve su propio indicador de cumplimiento en la PWA, con el mismo detalle que la administración y sin requerir permiso |
| **RN-50** | El informe mensual incluye el **resumen de control**: previstas, completadas, pendientes, % de cumplimiento y justificación de los pendientes |
| **RN-51** | Los indicadores de cumplimiento se presentan como **cumplimiento del plan del edificio**. Ninguna pantalla los rotula como desempeño de una persona, y toda vista de cumplimiento lleva al pie la leyenda de que su uso disciplinario requiere el procedimiento del régimen de faltas y sanciones |
| **RN-52** | En temporada de piscina, un día sin registro de piscina cuenta como faltante en el cumplimiento; fuera de temporada, no |

---

## 7. Permisos por acción

| Acción | Propietario | Inquilino | Encargado | Administrador | Comisión | Contador |
|---|---|---|---|---|---|---|
| Ver su unidad | ✅ | ✅ (sin datos del propietario) | ✅ | ✅ | ✅ | ❌ |
| Ver otras unidades | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Crear reclamo | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Ver comentarios internos | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Cambiar estado de ticket | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Asignar responsable | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Registrar planillas | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ |
| Ver su propio cumplimiento | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Ver cumplimiento y análisis del edificio | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ |
| Cargar presupuesto | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Aprobar bajo umbral** | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Aprobar sobre umbral** | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Registrar excepción de gobernanza | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Emitir orden de trabajo | ❌ | ❌ | ❌ | ✅ | ❌ | ❌ |
| Validar factura | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Publicar documento a propietarios | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Ver auditoría | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Exportar contable | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Configurar reglas de gobernanza | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Gestionar usuarios y roles | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |

> **Test obligatorio:** por cada fila con ❌ debe existir un test negativo que verifique el rechazo a nivel de API, no solo de interfaz.

---

## 8. Notificaciones

| Evento | Destinatario | Canal v1 | Inmediatez |
|---|---|---|---|
| Reclamo creado desde el portal | Administrador, encargado | Email + in-app | Inmediata |
| Cambio de estado de un ticket | Reportante | Email + in-app | Inmediata |
| Ticket pasa a `waiting_owner` | Propietario de la unidad | Email | Inmediata |
| Ticket crítico creado | Administrador, comisión | Email | Inmediata |
| Incidente grave (RN-25) | Administrador | Email | Inmediata |
| Aprobación pendiente | Rol aprobador requerido | Email | Inmediata |
| Excepción de gobernanza registrada | Comisión | Email | Inmediata |
| Checklist del día incompleto al cierre (RN-44) | **Solo el encargado** | In-app + email | Diaria, 20:00 |
| Dos días consecutivos incompletos (RN-45) | Administrador | Email | Diaria |
| Siete días sin ningún registro (RN-45) | Administrador, comisión | Email | Inmediata |
| Aviso de tendencia de piscina (RN-47) | Encargado, administrador | Email | Diaria (agrupada) |
| Ítem sistemáticamente omitido detectado (RN-46) | Administrador | Email | Mensual |
| Stock bajo mínimo | Administrador | Email | Diaria (agrupada) |
| Tarea de mantenimiento vencida | Responsable, administrador | Email | Diaria (agrupada) |
| Documento o seguro por vencer | Administrador | Email | Diaria (agrupada) |
| Informe mensual disponible | Administrador, comisión | Email | Mensual |
| Resumen mensual del edificio | Propietarios | Email | Mensual |

- **RN-33:** las notificaciones agrupadas se envían una vez al día, a las 08:00 hora local, en un solo correo.
- **RN-34:** el usuario puede desactivar las notificaciones no críticas. Las inmediatas de seguridad (incidente grave) no se pueden desactivar.
- **Plantillas:** asunto en español, con el nombre del edificio como prefijo: `[Draga Inn] Reclamo #453 — Resuelto`.

---

## 9. Estados vacíos, carga y error

| Situación | Mensaje |
|---|---|
| Lista vacía por filtros | "No hay resultados con estos filtros." + *Limpiar filtros* |
| Lista vacía sin datos | Mensaje contextual + acción primaria. Ej.: "Todavía no hay activos cargados." + *Cargar activo* |
| Carga | Esqueleto de contenido (no spinner de pantalla completa) |
| Error de red con caché | Mostrar dato cacheado + aviso "Mostrando información guardada del <fecha y hora>" |
| Error de red sin caché | "No pudimos cargar la información. Revisá tu conexión." + *Reintentar* |
| Error de permisos | "No tenés permiso para ver esta información." Sin filtrar detalles de lo que existe |
| Error de validación | Mensaje al pie del campo, en español, indicando qué corregir |
| Error de gobernanza | Explicación de qué falta + quién puede resolverlo + acción sugerida |
| Error del servidor | "Algo salió mal de nuestro lado. Ya lo registramos." + código de referencia |

---

## 10. Casos borde y caminos no felices

| # | Caso | Comportamiento esperado |
|---|---|---|
| CB-01 | Dos usuarios editan el mismo ticket a la vez | Última escritura gana a nivel de campo; si cambió el estado, se avisa y se pide recargar |
| CB-02 | El encargado registra piscina con fecha de ayer | Permitido hasta 7 días hacia atrás; más allá exige justificación |
| CB-03 | La cola offline acumula más de 200 mutaciones | Se sigue aceptando, se avisa y se prioriza el envío de tickets críticos |
| CB-04 | La app se reinstala con mutaciones pendientes | Se pierden. **Advertencia explícita antes de borrar datos del sitio** |
| CB-05 | Un propietario vende su unidad con reclamos abiertos | Los reclamos quedan vinculados a la unidad y al período; el nuevo propietario ve los abiertos, no el histórico del anterior |
| CB-06 | Un proveedor se elimina teniendo trabajos | No se elimina: se desactiva. El histórico se conserva |
| CB-07 | Se aprueba un presupuesto vencido | Bloqueado. Se exige revalidación del proveedor |
| CB-08 | Dos aprobaciones simultáneas del mismo presupuesto | La segunda falla por conflicto de versión; se muestra la aprobación existente |
| CB-09 | Foto que no sube tras 10 intentos | El registro queda guardado sin la foto, marcado como "foto no enviada", con opción de reintento manual |
| CB-10 | El mes cierra sin actividad registrada | El informe se genera igual, indicando explícitamente los bloques sin datos |
| CB-11 | Usuario con dos roles (propietario y comisión) | Ve la unión de permisos; la interfaz ofrece selector de contexto |
| CB-12 | Unidad sin propietario vigente cargado | Permitido, marcado como incompleto en el listado y en el tablero de riesgos |
| CB-13 | Cambio de horario de verano | Todos los cálculos de fecha usan `America/Montevideo`; los jobs son idempotentes ante reejecución |
| CB-14 | Ticket creado offline sobre una unidad borrada mientras tanto | Se acepta, se desvincula la unidad y se avisa al administrador para reasignar |

---

## 11. Definición de terminado del v1

- [ ] Las tres superficies operativas con los roles y permisos de §7, con tests negativos por rol
- [ ] Las reglas de negocio de §6 (RN-01 a RN-52) implementadas y cubiertas por tests
- [ ] Cumplimiento y análisis operativo (§4.8 y §5.11) funcionando, con la distinción de RN-43 entre dato faltante y dato fuera de rango
- [ ] El encargado accede a su indicador desde la PWA y ve el mismo detalle que la administración (RN-49)
- [ ] Toda vista de cumplimiento lleva el encuadre y la leyenda de RN-51
- [ ] Las máquinas de estado de §3 sin transiciones no especificadas posibles vía API
- [ ] Los casos borde CB-01 a CB-14 con comportamiento verificado
- [ ] Matriz de notificaciones de §8 funcionando con entrega verificable
- [ ] Estados vacío, carga y error de §9 en todas las vistas de listado
- [ ] Textos en español rioplatense revisados, sin cadenas en inglés visibles al usuario

---

## 12. Glosario

| Término | Definición |
|---|---|
| **Expediente** (`case`) | Unidad de trazabilidad. Agrupa todos los hechos de un mismo asunto de punta a punta |
| **Ticket** | Reclamo o solicitud concreta. Siempre pertenece a un expediente |
| **Regla de gobernanza** | Condición configurable que, según el monto, exige N presupuestos y aprobación de un rol determinado |
| **Excepción de gobernanza** | Omisión deliberada y fundada de una regla, registrada y visible |
| **Conformidad** | Acto por el cual se declara que un trabajo se completó a satisfacción |
| **Planilla** | Registro operativo periódico del encargado, equivalente a los Anexos A–H del Manual |
| **Coeficiente** | Porcentaje de copropiedad de una unidad. Base del prorrateo (v2) y del peso del voto (v2) |
| **Temporada alta** | 1/12 a 31/3 y Semana de Turismo. Refuerza frecuencias e indicadores |
