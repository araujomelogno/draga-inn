# CLAUDE.md — Proyecto Draga

Sistema de Gestión y Gobernanza del **Edificio Draga Inn** (propiedad horizontal, Punta del Este, Maldonado, Uruguay).

Este archivo define las reglas permanentes del proyecto. **Léelo antes de escribir código y respétalo sin excepción.** Si una instrucción puntual contradice algo de acá, detente y decilo en lugar de resolverlo por tu cuenta.

## Documentos de referencia

| Documento | Para qué |
|---|---|
| `docs/PRD.md` | Qué construimos y por qué. Alcance, épicas, prioridades |
| `docs/ESPEC_FUNCIONAL_v1.md` | Comportamiento: pantallas, estados, reglas de negocio (RN-01 a RN-52), permisos, casos borde |
| `docs/HANDOFF_TECNICO.md` | Arquitectura, modelo de datos, plan de PRs |
| `docs/ESPEC_v2.md` | Alcance diferido. **No implementar nada de acá sin pedido explícito** |

Cuando implementes una funcionalidad, la fuente de verdad del comportamiento es `ESPEC_FUNCIONAL_v1.md`. Si algo no está especificado ahí, **no lo inventes: preguntá.**

---

## Las cinco reglas no negociables

Si una decisión de implementación contradice alguna de estas, la decisión está mal.

1. **Todo hecho pertenece a un expediente.** Ninguna entidad de dominio se crea suelta. Si estás creando un ticket, presupuesto, orden de trabajo o factura sin `case_id`, algo está mal.
2. **Todo se audita, y la auditoría vive en la base de datos.** Triggers de Postgres, no código de aplicación. No se puede saltear.
3. **Todo está scopeado a un edificio.** `building_id` en cada tabla de dominio y en cada query. Sin excepción, aunque hoy haya un solo edificio.
4. **Todo hecho económico lleva monto, rubro y autorización** (`cost_amount`, `currency`, `budget_category_id`), aunque el v1 no calcule expensas. Es el seguro contra un rewrite en el v2.
5. **La PWA del encargado funciona sin conexión.** Si una funcionalidad no soporta offline, no va en la PWA.

---

## Stack

- **Next.js 15** (App Router) + TypeScript + React
- **Cloud SQL PostgreSQL 16** — sistema de registro
- **Drizzle ORM** + drizzle-kit para migraciones
- **Firebase Auth** (identidad) · **Cloud Storage** (archivos) · **Firebase Hosting** + **Cloud Run** (deploy)
- **zod** para validación, compartida entre cliente y servidor
- **Vitest** (unit/integración) + **Playwright** (e2e)

**No usar:** Firestore como base de datos (se evaluó y se descartó), RLS de Postgres (la autorización va en la capa de aplicación), ni librerías de pagos o conciliación (eso es v2).

---

## Reglas de código

### Escrituras a la base

**Toda escritura pasa por `withTx()`. Sin excepciones.**

```ts
await withTx(ctx, async (tx) => {
  // ...
});
```

`withTx` ejecuta `SET LOCAL app.user_id`, `app.user_role` y `app.request_id`, que es lo que alimenta los triggers de auditoría. Una escritura que no pase por ahí **genera un registro sin autor** y rompe la regla 2.

- Nunca importes el pool o el cliente de Drizzle directamente en un módulo de dominio.
- Nunca uses `db.insert(...)` fuera de un `withTx`.
- Si ves código que lo hace, corregilo aunque no sea parte de tu tarea.

### Consultas

- Todo repositorio recibe `buildingId` y filtra por él. No hay queries "globales".
- Nada de SQL crudo en componentes o route handlers: va en `src/modules/<dominio>/`.
- Paginación siempre por cursor o por `limit/offset` explícito. Nunca traer una tabla entera.

### Autorización

- Toda ruta de API llama a `can(ctx, action, subject, resource)` antes de hacer nada.
- La interfaz **oculta** lo que el rol no puede hacer; no lo muestra deshabilitado.
- **Por cada permiso denegado en la matriz de `ESPEC_FUNCIONAL_v1.md` §7 tiene que existir un test negativo a nivel de API.** No alcanza con ocultarlo en el front.

### Entidades append-only

Estas no se actualizan ni se borran nunca. Una corrección genera un registro nuevo que referencia al anterior:

- `audit_log` — inmutable por regla de Postgres
- `case_events` — la línea de tiempo del expediente
- `approvals` — usar `supersedes_id`
- `monthly_reports` enviados — nueva versión (RN-42)

### Reglas de negocio

- Las reglas de `ESPEC_FUNCIONAL_v1.md` §6 se implementan **con su identificador en el código**: `// RN-20` sobre la función que la aplica, y el mismo identificador en el nombre del test.
- Los parámetros legales o reglamentarios (umbrales, quórum, mayorías, intereses, rangos de piscina) son **configuración en `buildings.settings` o en tablas de reglas**, nunca constantes en el código.

### Offline y sincronización

- Toda mutación que la PWA pueda originar lleva `client_uuid` (UUID v4 generado en el cliente) y la tabla tiene `unique (client_uuid)`.
- El servidor resuelve con `ON CONFLICT (client_uuid) DO NOTHING` y devuelve el registro existente.
- **Reintentar nunca puede duplicar.** Si agregás una tabla que la PWA escribe y no tiene `client_uuid`, está mal.
- Nunca mostrar "guardado" si el dato solo está encolado: decir **"guardado en el teléfono, pendiente de enviar"** (RN-30, P2).

---

## Convenciones

### Base de datos

- `snake_case` para tablas y columnas; plural para tablas.
- PK `uuid` con `gen_random_uuid()`.
- Fechas y horas: `timestamptz`. Fechas sin hora: `date`.
- Montos: `numeric(14,2)` + `currency char(3)`. **Nunca `float` para dinero.**
- Toda tabla de dominio: `building_id`, `created_at`, `updated_at`, `created_by`.
- Migraciones versionadas con drizzle-kit. **Nunca editar una migración ya mergeada**: crear una nueva.

### TypeScript

- `strict: true`. Nada de `any`; si no sabés el tipo, `unknown` y validá con zod.
- Los tipos del dominio se infieren del esquema de Drizzle, no se escriben a mano.
- Errores de dominio como clases tipadas (`GovernanceError`, `ForbiddenError`), nunca strings sueltos.

### Interfaz

- **Todo el texto visible al usuario va en español rioplatense.** Ni una cadena en inglés en la UI.
- Fechas `dd/mm/aaaa`, hora 24 h, montos `$ 1.234,56`, zona horaria `America/Montevideo`.
- Los mensajes de error dicen **qué hacer**, no qué falló: "Faltan 2 presupuestos para emitir la orden", no "Error de validación".
- Toda vista de listado implementa los cuatro estados: carga (esqueleto), vacío, error, contenido.
- Objetivos táctiles ≥ 44 px en la PWA; usable con una mano.

### Nombres

- Código, identificadores, tablas y columnas: **en inglés**.
- Contenido, textos, comentarios de negocio y documentación: **en español**.

---

## Flujo de trabajo

- **Una rama por PR** del plan de `HANDOFF_TECNICO.md` §11. Nunca commits directos a `main`.
- Nombre de rama: `pr-07-pwa-offline-queue`.
- El PR tiene que quedar **desplegable y verde por sí solo**. Nada de "lo arreglo en el próximo".
- Antes de abrir el PR: `pnpm typecheck && pnpm lint && pnpm test`.
- La descripción del PR referencia el PR del plan, las RN implementadas y cómo verificarlo a mano.
- **No empieces un PR nuevo si el anterior no está mergeado**, salvo que te lo pidan explícitamente.

### Al terminar cualquier tarea

1. Tests en verde (incluidos los negativos de autorización)
2. Migraciones aplicables desde cero (`db:migrate` + `db:seed` en base limpia)
3. Sin cadenas en inglés en la UI
4. Las RN tocadas tienen su identificador en código y en tests

---

## Lo que NO hay que hacer

- **No implementar nada del v2** (expensas, prorrateo, asambleas, votaciones, conciliación, pagos) sin pedido explícito. Está especificado para que *no* se cuele por accidente.
- **No agregar dependencias** sin justificarlo. Preferí la biblioteca estándar y lo que ya está en el stack.
- **No crear abstracciones anticipadas.** Si hay un solo caso de uso, escribí el caso de uso.
- **No "mejorar" el esquema por tu cuenta.** Un cambio de modelo se discute antes.
- **No hardcodear** umbrales de gobernanza, rangos de piscina, cuotas ni fechas de temporada.
- **No romper la trazabilidad** creando entidades sin `case_id` para "simplificar".
- **No exponer datos entre unidades.** Un propietario ve su unidad y nada más.
- **No mostrar comentarios internos al propietario** por ninguna vía: ni UI, ni API, ni notificación, ni exportación (RN-14).

---

## Contexto del dominio (para que las decisiones tengan sentido)

- **Los propietarios están mayormente ausentes.** Viven en Montevideo, Buenos Aires o São Paulo y ven el edificio pocas semanas al año. El producto es tanto gestión como **instrumento de confianza a distancia**.
- **La estacionalidad es fuerte.** Verano, Semana de Turismo y fines de semana largos concentran ocupación e incidencias. Del 1/12 al 31/3 rige "temporada alta" (RN-40).
- **El encargado es residente** y vive en el edificio con su familia, en una vivienda de función. Es el usuario de mayor frecuencia y el que genera los datos.
- **Las planillas del encargado ya existen en papel**, obligatorias por su Manual de Trabajo. El sistema las digitaliza: **no agrega trabajo, reemplaza el que ya hace.** Las plantillas del seed replican exactamente los Anexos A–H del Manual.
- **Existe un régimen de faltas y sanciones documentado.** Por eso el sistema también lo protege a él: el registro prueba que hizo las cosas.

### Sobre los indicadores de cumplimiento (E12) — leer antes de tocar esa parte

Los indicadores de cumplimiento son, técnicamente, monitoreo del desempeño de una persona identificable. El producto toma tres decisiones deliberadas que **no se negocian en la implementación**:

1. La métrica mide **cumplimiento del plan del edificio**, no desempeño de una persona. Ninguna pantalla, etiqueta, variable ni correo lo rotula como desempeño individual.
2. El **encargado ve su propio indicador primero**, desde la PWA, sin pedir permiso y con el mismo detalle que la administración (RN-49).
3. Toda vista de cumplimiento lleva al pie la leyenda de que su uso disciplinario requiere el procedimiento del régimen de faltas (RN-51).

Además, el sistema distingue tres cosas distintas y no las mezcla: dato **presente y correcto**, dato **presente fuera de rango**, y dato **faltante** (RN-43). Las series nunca interpolan los huecos.

---

## Privacidad

- Se manejan datos personales de residentes bajo la **Ley N.º 18.331** (Uruguay, URCDP): base legal, finalidad, retención y derechos de acceso hay que respetarlos.
- Nunca loguear datos personales, tokens ni contenido de documentos. Los logs llevan `request_id` y `user_id`, nada más.
- Los buckets de Cloud Storage no son públicos jamás. Acceso solo por signed URL de vida corta, previa verificación de permisos.
- Secretos en Secret Manager. Ni una credencial en el repo ni en el cliente.

---

## Cuándo parar y preguntar

Detenete y consultá en lugar de decidir por tu cuenta si:

- La especificación funcional no cubre el comportamiento que necesitás
- Tenés que cambiar el modelo de datos
- Una regla de negocio parece contradecir otra
- Una tarea requiere hardcodear un parámetro legal o reglamentario
- Encontrás un permiso que la matriz no contempla
- Algo del v2 parece necesario para que el v1 funcione
