# Especificación — v2

**Producto:** Sistema de Gestión y Gobernanza — Edificio Draga Inn
**Versión:** 1.0 — 13/09/2026
**Documentos previos:** `PRD_…`, `HANDOFF_TECNICO_…`, `ESPEC_FUNCIONAL_v1_…`

---

## 1. Contexto y premisas

El v1 dejó operando la **operación diaria** del edificio: expedientes trazables, tickets, activos y preventivos, planillas del encargado, contrataciones con reglas de gobernanza, documentos, auditoría y portal del propietario.

El v2 completa las dos piezas que el v1 dejó deliberadamente afuera y que son las que terminan de convertir al sistema en la **fuente única de verdad** del edificio:

1. **El dinero** — presupuesto, expensas, cobranza y rendición de cuentas.
2. **Las decisiones colectivas** — asambleas, votaciones y actas.

**Premisas heredadas del v1 que el v2 da por hechas:**

- Todo hecho económico ya nace con `cost_amount`, `currency`, `budget_category_id` y su autorización asociada. **El v2 no migra datos: los consume.**
- Los coeficientes de copropiedad ya están cargados y validados por unidad.
- La auditoría por triggers ya cubre toda escritura y se extiende automáticamente a las tablas nuevas.
- El expediente sigue siendo el spine: una expensa extraordinaria, una asamblea o un pago se cuelgan de un expediente.

---

## 2. Problema que resuelve el v2

Después del v1, el edificio tiene trazabilidad de **lo que se hace** pero no de **lo que se cobra y se paga**. El administrador sigue emitiendo expensas por fuera, la morosidad se sigue controlando en planilla y la rendición de cuentas sigue siendo un documento armado a mano que nadie puede auditar contra los hechos.

En paralelo, las decisiones de la asamblea siguen viviendo en actas de papel, desconectadas de su ejecución: se aprueba una obra y seis meses después nadie puede demostrar fácilmente si se hizo, cuánto costó y si se respetó lo votado.

**El costo de no resolverlo:** la promesa central del producto —"todo hecho responde quién, qué, cuándo, por qué, cuánto y con qué autorización"— queda coja justo en el *cuánto* y en el *con qué autorización*.

---

## 3. Objetivos del v2

| # | Objetivo | Métrica | Umbral |
|---|---|---|---|
| G1 | Emitir expensas desde el sistema | % de períodos emitidos sin herramientas externas | 100 % a los 3 meses |
| G2 | Rendición de cuentas auditable contra los hechos | % de líneas de la rendición con expediente asociado | ≥ 95 % |
| G3 | Reducir la morosidad por falta de información | % de unidades con estado de cuenta consultado en el trimestre | ≥ 70 % |
| G4 | Decisiones de asamblea con ejecución verificable | % de decisiones con responsable, plazo y estado de avance | 100 % |
| G5 | Eliminar el armado manual de la rendición | Horas de armado manual | 0 h |
| G6 | Cerrar el ciclo del gasto | % de facturas con pago registrado y conciliado | ≥ 90 % |

---

## 4. No-objetivos del v2 (quedan para v3)

| No-objetivo | Por qué |
|---|---|
| **Contabilidad de partida doble completa** | El sistema registra y rinde; el balance contable formal sigue en manos del contador. Se integra, no se reemplaza |
| **Facturación electrónica ante DGI** | Requiere certificación y un proyecto propio. Evaluar recién si el producto se comercializa |
| **Cobranza automática con débito** | Depende de acuerdos bancarios. v3 |
| **App nativa** | La PWA sigue alcanzando |
| **Gestión de recursos humanos del personal** | Liquidación de sueldos, licencias y aportes exceden el alcance. Se integra con quien lo haga |

---

## 5. Módulos del v2

### M1 — Finanzas y expensas *(núcleo del v2)*

#### M1.1 Presupuesto anual

- **US:** Como comisión, quiero aprobar un presupuesto anual por rubro para poder comparar lo gastado contra lo previsto.
- Presupuesto por ejercicio y por rubro, con versiones y aprobación registrada.
- Comparativo **presupuestado vs. ejecutado** por rubro, mensual y acumulado, alimentado por las facturas y costos del v1.

**Criterios de aceptación**
- [ ] Un presupuesto aprobado no se edita: se crea una nueva versión con referencia a la anterior
- [ ] El ejecutado se calcula exclusivamente desde hechos del sistema (facturas, costos de tareas, eventos de activos)
- [ ] Cada línea del ejecutado es clickeable y navega al expediente que la originó
- [ ] Un rubro que supera el 90 % de lo presupuestado alerta en el tablero

#### M1.2 Prorrateo y emisión de expensas

- **US:** Como administrador, quiero emitir las expensas del mes prorrateando los gastos por coeficiente, sin salir del sistema.
- **Bases de prorrateo configurables:** por coeficiente, por partes iguales, por grupo de unidades (ej.: solo las que usan el ascensor de la torre B), o monto fijo.
- **Tipos de gasto:** común ordinario · común extraordinario · fondo de reserva · individual (cargo directo a una unidad).
- **Cierre de período:** congela los gastos del mes, calcula, genera un documento de expensa por unidad y lo publica en el portal.

**Criterios de aceptación**
- [ ] La suma de los prorrateos por unidad es exactamente igual al total del período (sin descuadre por redondeo — el residuo se asigna con una regla determinística documentada)
- [ ] Un período cerrado no admite cambios; una corrección se emite como ajuste del período siguiente
- [ ] Cada línea de la expensa indica su rubro y, si corresponde, el expediente de origen
- [ ] Se puede reimprimir la expensa de cualquier período pasado tal como fue emitida
- [ ] La emisión genera notificación al propietario con el documento adjunto

#### M1.3 Estado de cuenta, cobranza y morosidad

- **US:** Como propietario, quiero ver mi estado de cuenta y qué debo, sin llamar a nadie.
- Estado de cuenta por unidad: expensas emitidas, pagos, saldos, intereses.
- Registro de pagos (manual en v2; automatizado en v3).
- **Morosidad:** listado por antigüedad de deuda, con acciones de gestión y registro de las gestiones realizadas.
- **Intereses por mora** configurables según el Reglamento de Copropiedad.
- **Convenios de pago:** cuotas, seguimiento, incumplimiento.

**Criterios de aceptación**
- [ ] El saldo de una unidad es la suma verificable de sus movimientos; nunca un valor cargado a mano
- [ ] Un pago parcial se imputa según una regla configurable (primero intereses, luego capital más antiguo)
- [ ] Un convenio vigente suspende el cálculo de intereses según su configuración
- [ ] El propietario solo ve su unidad; nunca la deuda de otros
- [ ] La morosidad publicada a la comisión puede configurarse como nominal o anonimizada

> **RN-v2-01:** El sistema **nunca** publica deuda nominal de una unidad a otros propietarios sin una configuración explícita del edificio y con constancia de quién la habilitó.

#### M1.4 Rendición de cuentas

- **US:** Como comisión, quiero una rendición mensual que se pueda auditar contra los hechos del sistema.
- Rendición generada automáticamente: ingresos, egresos por rubro, comparativo con presupuesto, movimientos del fondo de reserva, morosidad y expedientes cerrados en el período.
- **Cada línea enlaza a su expediente.** Esto es lo que distingue al producto de cualquier sistema de expensas.

---

### M2 — Asambleas y votaciones

> **Marco legal (Uruguay).** El régimen de propiedad horizontal se rige por la **Ley N.º 10.751** (1946) y sus modificativas, entre ellas el **Decreto-Ley N.º 14.560** (1976), la **Ley N.º 19.604** (2018, deuda por gastos comunes) y la **Ley N.º 20.058** (2022), que **habilita las asambleas virtuales**. Las reglas de quórum y mayorías que se detallan abajo provienen de fuentes secundarias y **deben validarse con asesor legal y contra el Reglamento de Copropiedad del edificio antes de implementarse** (ver Q1 de §8). El sistema las trata como **parámetros configurables**, nunca como constantes en el código.

#### M2.1 Convocatoria y quórum

- Convocatoria con orden del día, fecha, modalidad (presencial, virtual o mixta) y plazo de antelación.
- Registro de asistencia con **cómputo por coeficiente**, no por unidad.
- **Quórum configurable por convocatoria:** por defecto, primera convocatoria 3/4 del valor del edificio; segunda convocatoria sin mínimo.
- Poderes y representaciones: quién vota en nombre de quién, con documento respaldatorio.

**Criterios de aceptación**
- [ ] El quórum se calcula sumando coeficientes de los presentes y representados, no contando unidades
- [ ] El sistema indica en tiempo real si hay quórum y cuánto falta
- [ ] Una unidad con deuda se marca según lo que disponga el Reglamento respecto de su derecho a voto (configurable)
- [ ] Sin quórum, la asamblea no puede pasar a votación y el sistema lo impide explícitamente

#### M2.2 Propuestas y votación

- Propuestas asociadas a puntos del orden del día, con documentación adjunta (presupuestos, informes técnicos).
- **Voto ponderado por coeficiente.**
- **Tipos de mayoría configurables por propuesta:** simple de presentes; especial (por ejemplo 2/3 de copropietarios + 3/4 del valor para innovaciones y modificaciones de áreas comunes).
- Modalidad virtual conforme a Ley 20.058: identificación del votante, registro del voto y constancia.

**Criterios de aceptación**
- [ ] El resultado muestra votos a favor, en contra y abstenciones, en cantidad de unidades **y** en coeficiente
- [ ] Una propuesta que requiere mayoría especial no se declara aprobada si no alcanza ambos umbrales
- [ ] Un voto emitido no se puede modificar una vez cerrada la votación
- [ ] Todo voto queda auditado (quién, cuándo, desde dónde) sin exponer el sentido del voto si la votación se configuró como secreta
- [ ] Si la votación es secreta, ni el administrador puede ver el sentido individual del voto

> **RN-v2-02:** El resultado de una votación es inmutable. Una rectificación exige una nueva asamblea o una nueva votación que lo deje sin efecto, con referencia explícita.

#### M2.3 Actas y decisiones

- Acta generada desde la asamblea: asistentes, quórum, propuestas, votaciones, resultados y decisiones.
- Cada decisión aprobada genera automáticamente un registro con **responsable, plazo y estado**, que se sigue en el tablero (ya existe en el v1 como `decisions`).
- **Cierre del círculo:** la decisión queda vinculada al expediente de su ejecución, y desde el acta se puede ver qué se hizo, cuánto costó y quién lo aprobó.

**Criterios de aceptación**
- [ ] Un acta firmada no se edita: se corrige por acta complementaria
- [ ] Toda decisión aprobada aparece en el tablero de gobernanza hasta que se marca ejecutada
- [ ] Desde el acta se navega al gasto real asociado a la decisión
- [ ] El acta se exporta en PDF con formato apto para el libro de actas

---

### M3 — Tesorería

- **Caja y bancos:** cuentas, saldos, movimientos.
- **Órdenes de pago:** desde facturas validadas del v1, con aprobación según reglas de gobernanza.
- **Conciliación bancaria:** importación de extracto (CSV/OFX), conciliación asistida con sugerencias por monto y fecha, y marcado manual.
- **Fondo de reserva:** movimientos, saldo y reglas de uso.

**Criterios de aceptación**
- [ ] Una orden de pago solo se emite desde una factura validada y aprobada
- [ ] La conciliación no permite marcar dos veces el mismo movimiento del extracto
- [ ] El saldo conciliado y el saldo contable se muestran por separado, con la diferencia explicada
- [ ] Todo movimiento del fondo de reserva exige referencia a la decisión que lo autorizó

---

### M4 — Portal de proveedores

- **US:** Como proveedor, quiero cargar mi presupuesto y mi factura sin depender de mails.
- Acceso restringido: ve **solo sus** solicitudes, órdenes y facturas.
- Carga de presupuestos contra una solicitud, adjuntos, seguimiento del estado.
- Vencimiento de documentación (seguros, BPS, habilitaciones) con bloqueo configurable: un proveedor con documentación vencida no puede recibir órdenes nuevas.

**Criterios de aceptación**
- [ ] Un proveedor nunca ve datos de otro proveedor ni montos de presupuestos de terceros
- [ ] Documentación vencida bloquea la emisión de nuevas órdenes si la regla está activa
- [ ] La carga del proveedor genera los mismos registros que la carga manual del administrador

---

### M5 — Accesos del personal *(mucamas y auxiliar de mantenimiento)*

Deliberadamente excluido del v1 por riesgo de adopción. Se incorpora **solo si el v1 demostró que el encargado adoptó el sistema**.

- Vista ultra simplificada: "mis tareas de hoy" y marcar como hecha. Sin navegación, sin listados.
- Acceso por PIN o enlace mágico, sin contraseña.
- **Condición de entrada:** solo se construye si la métrica G2 del v1 (≥ 90 % de registros del encargado) se sostuvo tres meses.

---

### M6 — Reservas de áreas comunes

- Reserva de parrilleros, SUM y otras áreas marcadas como reservables (el campo `bookable` ya existe en el v1).
- Reglas: anticipación mínima y máxima, duración, cupos por unidad y por período, **prioridad en temporada alta**, depósito o cargo asociado (se integra con M1 como gasto individual).
- Calendario visible para propietarios; confirmación y cancelación con política configurable.

**Criterios de aceptación**
- [ ] No se pueden superponer dos reservas del mismo espacio
- [ ] Una unidad con deuda puede quedar bloqueada para reservar, si el edificio lo configura
- [ ] Una cancelación fuera de plazo genera el cargo configurado
- [ ] En temporada alta rigen los cupos reforzados

---

### M7 — Multi-edificio (producto)

El modelo de datos ya está preparado (`building_id` en todo). Lo que falta es el **producto**:

- Organización administradora con varios edificios y usuarios que operan en más de uno.
- Selector de edificio y consolidado por organización.
- Onboarding: alta de edificio, carga de padrón, plantillas iniciales.
- Facturación del servicio y planes.
- Marca blanca básica (logo y colores por edificio).

> **Decisión de negocio previa:** este módulo no se construye hasta validar el piloto en Draga Inn. Es una decisión comercial, no técnica.

---

### M8 — Integraciones

| Integración | Alcance | Prioridad |
|---|---|---|
| **Contador** | Export estructurado periódico (CSV/XLSX) y, si hace falta, API de solo lectura | Alta |
| **WhatsApp (vía n8n)** | Notificaciones salientes y, opcionalmente, alta de reclamos entrantes | Alta |
| **Pasarela de cobranza** | Pago de expensas en línea; conciliación automática | Media (v3) |
| **Firma electrónica de actas** | Validez de actas firmadas digitalmente | Baja — evaluar con asesor legal |

---

## 6. Priorización y fases del v2

| Fase | Módulos | Por qué en este orden |
|---|---|---|
| **F5 — Finanzas** | M1 completo | Sin esto el reemplazo del sistema del administrador queda incompleto. Es el módulo de mayor valor percibido por el propietario |
| **F6 — Tesorería** | M3 | Cierra el ciclo del gasto que M1 abre. Depende de M1 |
| **F7 — Gobernanza** | M2 | Completa la promesa del producto. Requiere definición legal previa, que puede tramitarse en paralelo a F5 |
| **F8 — Extensiones** | M4, M6, M8 | Valor incremental, sin dependencias críticas |
| **F9 — Producto** | M5, M7 | Condicionados: M5 a la adopción del v1; M7 a la decisión comercial |

**Requisitos P0 del v2:** M1.1, M1.2, M1.3, M1.4, M2.1, M2.2, M2.3, M3.
**P1:** M4, M6, M8 (contador y WhatsApp).
**P2:** M5, M7, pasarela de cobranza, firma electrónica.

---

## 7. Impacto en el modelo de datos

Tablas nuevas (sin cambios destructivos sobre el v1):

```
-- M1
budget_periods, budget_lines, budget_versions
expense_periods, expense_items, unit_charges, prorration_rules
payments, account_movements, interest_rules, payment_agreements, agreement_installments
reserve_fund_movements, settlements (rendiciones)

-- M2
assemblies, assembly_attendance, proxies, proposals, votes, assembly_minutes
majority_rules
-- decisions ya existe en el v1: se extiende con assembly_id y proposal_id

-- M3
bank_accounts, cash_movements, payment_orders, bank_statements,
statement_lines, reconciliations

-- M4
vendor_users, vendor_requests

-- M6
bookings, booking_rules

-- M7
organizations, organization_users  (buildings gana organization_id nullable)
```

**Alteraciones sobre el v1:**

- `invoices`: agregar `payment_order_id` y estado `paid` efectivo.
- `decisions`: agregar `assembly_id`, `proposal_id`.
- `units`: agregar `voting_weight` si el Reglamento define un peso distinto del coeficiente de gastos.
- `buildings.settings`: parámetros de quórum, mayorías, intereses y bases de prorrateo.

**Ninguna migración destructiva.** Todos los campos económicos que M1 necesita (`cost_amount`, `currency`, `budget_category_id`) ya existen desde el v1 — ese fue el seguro que se tomó en su momento.

---

## 8. Riesgos y preguntas abiertas

| # | Pregunta / riesgo | Quién responde | ¿Bloquea? |
|---|---|---|---|
| Q1 | Reglas exactas de quórum, mayorías y derecho a voto de unidades con deuda, según el Reglamento de Copropiedad y la ley vigente | **Asesor legal** | **Sí, para M2** |
| Q2 | ¿La asamblea virtual del edificio requiere alguna formalidad adicional (convocatoria, identificación, registro) bajo Ley 20.058? | Asesor legal | **Sí, para M2** |
| Q3 | Base de prorrateo por tipo de gasto: ¿todo por coeficiente, o hay gastos por partes iguales o por grupos? | Comisión + Reglamento | **Sí, para M1.2** |
| Q4 | Tasa y forma de cálculo de intereses por mora | Comisión + Reglamento | **Sí, para M1.3** |
| Q5 | Imputación de pagos parciales: ¿primero intereses o primero capital más antiguo? | Comisión + contador | **Sí, para M1.3** |
| Q6 | ¿Qué gastos comunes se trasladan al inquilino y cuáles quedan en el propietario? | Comisión + asesor legal | Sí, para M1.2 |
| Q7 | ¿La morosidad se publica nominalmente a la comisión o anonimizada? | Comisión | No — configurable |
| Q8 | ¿El contador acepta el formato de exportación propuesto? | Contador | No |
| Q9 | ¿Se emite algún comprobante fiscal por las expensas? | Contador | Sí, para M1.2 |
| Q10 | Retención de datos financieros y de votaciones (Ley 18.331) | Asesor legal | No |

**Riesgo principal del v2:** implementar reglas de quórum, mayorías o intereses **hardcodeadas** y descubrir después que el Reglamento de Copropiedad dice otra cosa. Mitigación: **todo parámetro legal o reglamentario es configuración, nunca código.** Si una regla no se puede expresar como configuración, se documenta como excepción y se revisa con asesor legal antes de implementarla.

---

## 9. Definición de terminado del v2

- [ ] Tres períodos de expensas consecutivos emitidos íntegramente desde el sistema, con prorrateo cuadrado al centavo
- [ ] Rendición mensual generada automáticamente con ≥ 95 % de líneas enlazadas a expediente
- [ ] Una asamblea completa realizada en el sistema: convocatoria, quórum por coeficiente, votaciones, acta y decisiones con seguimiento
- [ ] Conciliación bancaria de un mes completo sin diferencias no explicadas
- [ ] Estado de cuenta consultable por el propietario, con test negativo que verifique que no ve el de otros
- [ ] Parámetros legales validados por asesor legal y cargados como configuración
- [ ] Auditoría cubriendo todas las tablas nuevas

---

## 10. Fuentes consultadas

- [Propiedad horizontal en Uruguay — derechos y deberes (INGAR, 2026)](https://ingar.com.uy/blog/propiedad-horizontal-derechos-y-deberes)
- [Ley N.º 14.560 — Propiedad Horizontal](http://www.veiga.com.uy/ley_14.560.pdf)
- [Ley N.º 20.058 — Parlamento del Uruguay](https://parlamento.gub.uy/documentosyleyes/leyes/ley/20058)

> Las referencias legales de este documento son orientativas y provienen de fuentes secundarias. **Antes de implementar M1.3 (intereses) y M2 (quórum, mayorías y votación) deben validarse con asesor legal** contra el texto vigente de las normas y contra el Reglamento de Copropiedad del Edificio Draga Inn.
