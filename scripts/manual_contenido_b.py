# -*- coding: utf-8 -*-
"""Partes III y IV: la consola de administración y el portal del propietario."""
from manual_componentes import aviso, codigo, h1, h2, h3, numerada, p, tabla, vinetas, vs


def parte_3():
    f = []
    f += [h1("5. El tablero")]
    f += [p(
        "Es la pantalla de inicio de la consola y responde en un vistazo qué está pendiente, qué "
        "venció y qué requiere una decisión. Cada tarjeta es clickeable y lleva al listado ya "
        "filtrado: no hay que buscar de nuevo."
    )]
    f += [tabla(
        ["Bloque", "Qué muestra"],
        [
            ["<b>Operación</b>", "Tickets abiertos, críticos, vencidos y sin asignar; tareas de mantenimiento vencidas."],
            ["<b>Gobernanza</b>", "Aprobaciones pendientes, decisiones sin ejecutar y excepciones del mes."],
            ["<b>Riesgos</b>", "Documentos, seguros, garantías y contratos que vencen en 30 días; activos críticos con preventivo vencido; unidades sin titular; días sin registro."],
            ["<b>Proveedores</b>", "Contratos por vencer, trabajos en curso y facturas sin validar."],
            ["<b>Cumplimiento</b>", "Porcentaje del plan cumplido, racha, planillas pendientes, ítems sistemáticamente omitidos y una miniatura de la tendencia de piscina."],
            ["<b>Gasto del mes</b>", "Total acumulado por rubro. Sin saldos ni morosidad: eso es del v2."],
        ],
        anchos=[1.0, 4.0],
    )]
    f += [aviso(
        "El color significa algo",
        "«Sin asignar» y «vencidos» se destacan en rojo <b>sólo si son mayores que cero</b>. El "
        "resto va en neutro. Un tablero sin problemas se ve tranquilo, no festivo: si todo "
        "estuviera coloreado siempre, el color dejaría de avisar.<br/><br/>"
        "Cuando un bloque no tiene nada pendiente, muestra <b>«Todo al día»</b> con una marca de "
        "verificación. No una tarjeta en blanco, que parecería un error.",
    )]

    f += [h1("6. Tickets")]
    f += [h2("6.1. La bandeja")]
    f += [p(
        "Ordenada por defecto de la manera que importa: <b>vencidos primero</b>, después por "
        "prioridad descendente, después por antigüedad."
    )]
    f += [p(
        "Los filtros se pueden combinar y <b>el último filtro usado se recuerda</b> por usuario: "
        "quien siempre mira los críticos sin asignar no tiene que rearmarlo cada mañana."
    )]
    f += [aviso(
        "Acciones masivas: sí para asignar, no para cambiar estado",
        "Se puede asignar responsable o cambiar prioridad a muchos tickets a la vez. <b>No</b> se "
        "puede cambiar el estado en masa. Un cambio de estado necesita contexto: una nota de "
        "resolución, un motivo, un comentario al propietario. Hacerlo de a cientos lo vaciaría "
        "de sentido.",
    )]

    f += [h2("6.2. El detalle")]
    f += [p("Muestra el ticket, la línea de tiempo del <b>expediente</b> completo (no sólo del ticket) y los comentarios.")]

    f += [h3("Comentarios internos y visibles")]
    f += [aviso(
        "Un comentario interno nunca llega al propietario",
        "Ni por pantalla, ni por la API, ni por correo, ni en una exportación. Para un usuario "
        "que no es del equipo, el comentario interno <b>no se consulta</b>: no se devuelve "
        "recortado ni enmascarado, directamente no se pide a la base.<br/><br/>"
        "Hay un test que verifica que el texto de un comentario interno no aparezca en la "
        "respuesta que recibe un propietario.",
        "ambar",
    )]

    f += [h2("6.3. Los estados del ticket")]
    f += [codigo([
        "nuevo ──▶ triaje ──▶ asignado ──▶ en curso ──▶ resuelto ──▶ cerrado",
        "           │           │             │            ▲",
        "           │           │             └──▶ esperando al propietario ──┘",
        "           └───────────┴──────────────────────▶ cerrado (descartado)",
    ], "Máquina de estados")]
    f += [tabla(
        ["Transición", "Quién", "Qué exige"],
        [
            ["nuevo → triaje", "Administrador, encargado", "—"],
            ["triaje → asignado", "Administrador", "Un responsable asignado"],
            ["asignado → en curso", "El responsable", "—"],
            ["cualquiera → esperando al propietario", "Administrador, encargado", "Un comentario <b>visible al propietario</b>"],
            ["en curso → resuelto", "El responsable", "Una nota de resolución"],
            ["resuelto → cerrado", "Administrador; o automático a los 7 días", "—"],
            ["resuelto → en curso", "Administrador, o el propietario dentro de la ventana", "—"],
            ["descartar (a cerrado)", "Administrador, encargado", "Un motivo escrito"],
        ],
        anchos=[1.7, 1.7, 1.6],
    )]
    f += [aviso(
        "Volver atrás se puede, pero deja rastro",
        "Retroceder un estado está permitido <b>sólo al administrador</b>, exige un motivo "
        "escrito y genera un evento en la línea de tiempo del expediente.",
    )]
    f += [aviso(
        "El error dice qué falta, no «error de validación»",
        "Si se intenta marcar un ticket como resuelto sin nota, el sistema responde: "
        "<i>«Escribí la nota de resolución antes de marcar el ticket como Resuelto»</i>, y "
        "<b>no cambia nada</b>. La interfaz, además, sólo ofrece las transiciones que ese "
        "usuario puede hacer: las demás no aparecen.",
    )]

    f += [h1("7. El expediente")]
    f += [p(
        "Es la pantalla que responde el principio rector. El encabezado dice quién lo abrió, qué "
        "es, cuándo, cuánto lleva gastado y con qué autorizaciones. Abajo, la <b>línea de tiempo "
        "unificada</b>: creación, tickets, presupuestos, aprobaciones, órdenes, ejecuciones, "
        "conformidades, facturas, documentos y decisiones, todo en orden cronológico."
    )]
    f += [p("Cada evento muestra el tipo, quién, cuándo, un resumen, el monto si aplica y un enlace a la entidad.")]
    f += [aviso(
        "Las excepciones de gobernanza van destacadas en ámbar",
        "No se mezclan con el resto de los eventos ni se ocultan. Si el expediente tiene "
        "excepciones, además aparecen resumidas arriba de todo.",
        "ambar",
    )]
    f += [aviso(
        "Un expediente no cierra con pendientes",
        "Si quedan tickets abiertos, órdenes de trabajo sin conformidad o presupuestos sin "
        "resolver, el cierre se bloquea y el sistema <b>dice exactamente qué falta</b>, con el "
        "número de cada cosa.",
    )]

    f += [h1("8. Unidades y personas")]
    f += [p(
        "El listado muestra código, tipo, piso, coeficiente, propietario e inquilino vigentes, y "
        "reclamos abiertos. Las unidades sin titular vigente quedan marcadas: aparecen en ámbar "
        "acá y en el tablero de riesgos."
    )]

    f += [h2("8.1. La titularidad nunca se sobrescribe")]
    f += [aviso(
        "Se cierra un período y se abre otro",
        "Cuando una unidad cambia de dueño, el sistema <b>no pisa</b> el dato anterior: cierra el "
        "período del propietario saliente con la fecha indicada y abre uno nuevo. El histórico "
        "completo queda disponible.<br/><br/>"
        "Además, la base de datos <b>impide físicamente</b> que existan dos titulares principales "
        "solapados en la misma unidad. No es una validación de la aplicación que se pueda "
        "saltear: es una restricción del motor.",
        "verde",
    )]
    f += [p(
        "La ficha tiene un selector <b>«ver a fecha»</b>: elegís un día y te dice quién era "
        "propietario e inquilino ese día. Sirve para resolver discusiones sobre quién era "
        "responsable de qué y cuándo."
    )]
    f += [aviso(
        "Qué ve el nuevo propietario",
        "Si una unidad se vende con reclamos abiertos, los reclamos quedan vinculados a la "
        "unidad. El nuevo propietario <b>ve los abiertos</b> —le afectan— pero <b>no el "
        "histórico del anterior</b>.",
    )]

    f += [h1("9. Activos y mantenimiento")]
    f += [p(
        "Cada activo —ascensor, bomba, tablero, portón, piscina, red de incendio— tiene ficha "
        "con sus datos, instalación, proveedor, garantía, criticidad, plan preventivo, historial "
        "de fallas y reparaciones, costo acumulado y documentos."
    )]
    f += [p(
        "Los <b>planes preventivos</b> definen frecuencia, intervalo, fecha de inicio y "
        "responsable por defecto. Un job diario materializa las tareas de los próximos 60 días. "
        "Ese job es idempotente: si corre dos veces, no duplica nada."
    )]
    f += [aviso(
        "Una tarea vence a las 00:00 del día siguiente",
        "No al final del día: el día siguiente a la fecha prevista, a la medianoche, pasa a "
        "«vencida» y aparece en el tablero.",
    )]
    f += [aviso(
        "No se desactiva un plan dejando tareas colgadas",
        "Si el plan tiene tareas pendientes, el sistema no deja desactivarlo sin decidir qué "
        "hacer con ellas: cancelarlas o dejarlas abiertas. La decisión es explícita.",
    )]

    f += [h1("10. Contrataciones")]
    f += [p(
        "Es el circuito que va de la necesidad al pago, y donde viven las reglas de gobernanza."
    )]
    f += [codigo([
        "Necesidad (expediente)  ──▶  Presupuestos  ──▶  Aprobación  ──▶",
        "Orden de trabajo  ──▶  Ejecución  ──▶  Conformidad  ──▶  Factura",
    ], "El circuito completo")]

    f += [h2("10.1. Comparar presupuestos")]
    f += [p(
        "El comparador muestra los presupuestos lado a lado: proveedor, monto, plazo, alcance, "
        "validez y adjunto. Marca el más bajo."
    )]
    f += [aviso(
        "Marca el más bajo, pero no recomienda",
        "El sistema no elige por nadie. La decisión es humana y <b>se fundamenta</b>: el campo "
        "de fundamento es obligatorio al aprobar. El más barato no siempre es el mejor, y quien "
        "decide tiene que poder explicar por qué.",
        "verde",
    )]
    f += [p("Un presupuesto <b>vencido</b> no cuenta para el mínimo requerido y no se puede aprobar: hay que pedirle al proveedor que lo revalide.")]

    f += [h2("10.2. Aprobar")]
    f += [p(
        "El modal muestra el monto, la regla aplicable, quién debe aprobar y el campo de "
        "fundamento. Si el usuario no tiene nivel suficiente, <b>el botón no está</b>, y el "
        "sistema indica a quién pedírselo."
    )]
    f += [tabla(
        ["Monto", "Presupuestos mínimos", "Quién aprueba"],
        [
            ["Desde $ 0", "1", "Administrador"],
            ["Desde $ 30.000", "2", "Administrador"],
            ["Desde $ 150.000", "3", "Comisión"],
        ],
        anchos=[1.4, 1.6, 1.6],
    )]
    f += [aviso(
        "Estos umbrales son configurables, no están en el código",
        "Los valores de la tabla son los del ejemplo inicial. Los reales los define la comisión "
        "y se cambian desde la configuración, sin tocar código ni redesplegar nada. "
        "<b>Confirmalos antes de abrir el sistema a uso real.</b>",
        "ambar",
    )]

    f += [h2("10.3. Emitir la orden de trabajo")]
    f += [p("Acá se valida la regla de gobernanza. Si no se cumple, el sistema bloquea y explica qué falta:")]
    f += [aviso(
        "",
        "<i>«Faltan 2 presupuestos vigentes y falta la aprobación de Comisión para emitir la "
        "orden. Por $ 200.000,00 rige «Gasto mayor»: 3 presupuestos y aprobación de Comisión.»</i>",
        "rojo",
    )]
    f += [p(
        "Y ofrece la vía de excepción a quien corresponda. Al usarla, exige un fundamento, la "
        "registra como excepción, la destaca en ámbar en la línea de tiempo y le avisa a la "
        "comisión."
    )]

    f += [h2("10.4. Conformidad y factura")]
    f += [p(
        "Al completar el trabajo se registra <b>quién dio conformidad</b>, cuándo, con qué "
        "observaciones y con qué fotos."
    )]
    f += [aviso(
        "Sin conformidad no se carga factura",
        "Salvo excepción fundada y auditada. Es lo que impide pagar un trabajo que nadie "
        "verificó.<br/><br/>"
        "Y si la factura <b>supera el monto aprobado más la tolerancia configurada</b>, el "
        "sistema exige una nueva aprobación antes de validarla. El presupuesto aprobado no es "
        "un número decorativo.",
    )]

    f += [h1("11. Documentos")]
    f += [p(
        "Actas, reglamentos, contratos, facturas, seguros, certificados, planos, permisos, "
        "informes y garantías. Un documento puede colgar de varias entidades a la vez: un "
        "certificado de ascensor cuelga del activo y del proveedor, y aparece en ambas fichas."
    )]
    f += [aviso(
        "Todo documento nace interno",
        "Publicarlo a los propietarios es un <b>acto explícito</b>, con su propio permiso, y "
        "queda auditado: se sabe quién lo publicó y cuándo. No hay forma de que algo se "
        "publique por descuido.",
        "verde",
    )]
    f += [p(
        "Un documento con fecha de vencimiento aparece en el tablero de riesgos a los <b>30, 15 "
        "y 7 días</b>, y dispara un aviso por correo."
    )]
    f += [aviso(
        "Los archivos nunca son públicos",
        "El depósito de archivos no tiene acceso público, en ningún caso. Cada descarga genera "
        "una <b>dirección firmada que vive 5 minutos</b>, emitida después de verificar que esa "
        "persona puede ver ese documento. Un enlace filtrado deja de servir casi de inmediato.",
    )]

    f += [h1("12. Auditoría")]
    f += [p(
        "La tabla muestra fecha y hora, usuario, rol, entidad, acción y campos modificados. El "
        "detalle muestra el <b>valor anterior y el nuevo, campo por campo</b>."
    )]
    f += [aviso(
        "De sólo lectura para todos, sin excepción",
        "No hay ninguna pantalla que permita editar o borrar la auditoría, y tampoco hay forma de "
        "hacerlo desde la base: las reglas de PostgreSQL descartan silenciosamente cualquier "
        "intento. Ni el administrador, ni la comisión, ni quien tenga acceso directo al motor.",
        "verde",
    )]
    f += [p("La exportación a CSV está disponible para administrador, comisión y auditor.")]

    f += [h1("13. Cumplimiento y análisis operativo")]
    f += [p(
        "Cinco pestañas con el análisis de la operación. El encargado ve su propia versión desde "
        "su teléfono, <b>con el mismo detalle</b>."
    )]
    f += [tabla(
        ["Pestaña", "Qué muestra"],
        [
            ["<b>Cumplimiento</b>", "Porcentaje por período, con calendario de 90 días, racha actual y listado de días incompletos con el detalle de qué faltó."],
            ["<b>Piscina</b>", "Series de cloro, pH, alcalinidad y dureza con las bandas de rango dibujadas, avisos de tendencia y los días sin registro marcados como huecos."],
            ["<b>Ítems omitidos</b>", "Ranking de ítems del checklist no marcados en el 80 % o más de los últimos 30 días."],
            ["<b>Tareas aprobadas</b>", "Volumen por rubro, tiempo promedio, costo acumulado y tasa de derivación a técnico."],
            ["<b>Temporada</b>", "Comparativo de temporada alta contra el período en curso."],
        ],
        anchos=[1.1, 3.9],
    )]

    f += [h2("13.1. Tres cosas distintas que no se mezclan")]
    f += [p("El sistema distingue —y computa distinto— tres situaciones que se parecen pero no son lo mismo:")]
    f += [tabla(
        ["Situación", "Qué significa", "Cómo se ve"],
        [
            ["<b>Presente y correcto</b>", "El dato se registró y está dentro de rango.", "Verde"],
            ["<b>Presente fuera de rango</b>", "El dato se registró, pero el valor está mal. <b>El encargado hizo su trabajo.</b>", "Ámbar"],
            ["<b>Faltante</b>", "No hay dato de ese día.", "Rojo, o hueco en la serie"],
        ],
        anchos=[1.2, 2.8, 1.0],
    )]
    f += [aviso(
        "Las series no interpolan los huecos",
        "Un día sin medición se dibuja como <b>hueco</b>, con línea punteada. No se une el punto "
        "anterior con el siguiente como si el dato existiera. Un gráfico que interpola inventa "
        "información que nadie registró.",
        "verde",
    )]

    f += [h2("13.2. Ítems sistemáticamente omitidos")]
    f += [p(
        "Si un ítem del checklist no se marca en el 80 % o más de los días, el sistema lo "
        "señala. <b>No como una falta</b>, sino como una señal de que la plantilla puede "
        "necesitar revisión: quizá ese ítem ya no aplica, o está mal redactado, o se hace de "
        "otra manera."
    )]

    f += [h2("13.3. La leyenda al pie")]
    f += [aviso(
        "Presente en todas las vistas de cumplimiento",
        "<i>«Estos indicadores miden el cumplimiento del plan operativo del edificio, no el "
        "desempeño de una persona. Su uso con fines disciplinarios requiere el procedimiento "
        "previsto en el régimen de faltas y sanciones.»</i><br/><br/>"
        "Esta leyenda viaja en la respuesta del servidor junto con el dato, no en cada pantalla. "
        "Una pantalla nueva la recibe sin pedirla: para mostrar el número sin el encuadre habría "
        "que descartarla a propósito.",
        "verde",
    )]

    f += [h1("14. Configuración")]
    f += [p("Lo que se puede ajustar sin tocar código:")]
    f += [tabla(
        ["Qué", "Quién lo cambia"],
        [
            ["Reglas de gobernanza: umbral, moneda, mínimo de presupuestos, rol aprobador", "Comisión"],
            ["Plantillas de checklist: ítems por frecuencia, cuáles son requeridos", "Administrador"],
            ["Usuarios y roles: invitar por correo, asignar, desactivar", "Administrador, comisión"],
            ["Rubros presupuestales", "Administrador"],
            ["Rangos de piscina, fechas de temporada, tolerancias y plazos", "Administrador (en la configuración del edificio)"],
        ],
        anchos=[3.2, 1.8],
    )]
    f += [aviso(
        "El edificio no se queda sin administrador",
        "La base de datos impide desactivar al último administrador activo. El intento falla con "
        "un mensaje claro: hay que designar otro antes.",
    )]
    return f


def parte_4():
    f = []
    f += [h1("15. El portal del propietario")]
    f += [p(
        "Es la cara del sistema hacia quien no está. Deliberadamente simple: cinco secciones, "
        "sin jerga y sin nada que no le corresponda ver."
    )]
    f += [tabla(
        ["Sección", "Qué hay"],
        [
            ["<b>Inicio</b>", "Sus reclamos abiertos y accesos rápidos."],
            ["<b>Mi unidad</b>", "Datos de la unidad, coeficiente, cochera y baulera, quién figura, reclamos abiertos."],
            ["<b>Mis reclamos</b>", "Todos sus reclamos con su estado, y el botón para abrir uno nuevo."],
            ["<b>Documentos</b>", "Sólo los documentos publicados a propietarios."],
            ["<b>Perfil</b>", "Sus datos, sus preferencias de aviso y sus derechos sobre sus datos personales."],
        ],
        anchos=[1.0, 4.0],
    )]

    f += [h2("15.1. Lo que un propietario no ve")]
    f += vinetas([
        "<b>Otras unidades.</b> Ni sus datos, ni sus reclamos, ni quién vive en ellas.",
        "<b>Comentarios internos.</b> Por ninguna vía.",
        "<b>Documentos internos.</b> No sólo no los puede abrir: no aparecen listados.",
        "<b>Indicadores de cumplimiento del encargado.</b>",
        "<b>El histórico de titularidad</b> de propietarios anteriores a él.",
    ])
    f += [aviso(
        "El inquilino ve todavía menos",
        "No ve los datos del propietario ni la información financiera de la unidad. Ve lo que "
        "necesita para vivir ahí y reclamar lo que corresponda.",
    )]

    f += [h2("15.2. Abrir un reclamo")]
    f += [p(
        "Tres pasos: dónde es (su unidad o un área común), de qué se trata, y contarlo. "
        "El sistema avisa por correo cada vez que el reclamo cambia de estado."
    )]

    f += [h2("15.3. Reabrir un reclamo resuelto")]
    f += [aviso(
        "Hay una ventana, y después hay que abrir uno nuevo",
        "Si la administración marcó un reclamo como resuelto y el propietario no está de acuerdo, "
        "puede <b>reabrirlo dentro de la ventana configurada</b> —siete días por defecto—. "
        "Pasado ese plazo el botón no aparece, y el sistema le dice que abra un reclamo nuevo "
        "mencionando el número del anterior.",
    )]

    f += [h1("16. Avisos por correo")]
    f += [p("Qué se avisa, a quién y con qué urgencia.")]
    f += [tabla(
        ["Evento", "A quién", "Cuándo"],
        [
            ["Reclamo creado desde el portal", "Administrador, encargado", "Inmediato"],
            ["Cambio de estado de un reclamo", "Quien lo reportó", "Inmediato"],
            ["Reclamo esperando al propietario", "Propietario de la unidad", "Inmediato"],
            ["Reclamo crítico creado", "Administrador, comisión", "Inmediato"],
            ["Incidente grave", "Administrador", "Inmediato"],
            ["Aprobación pendiente", "Quien deba aprobar", "Inmediato"],
            ["Excepción de gobernanza registrada", "Comisión", "Inmediato"],
            ["Checklist del día incompleto", "<b>Sólo el encargado</b>", "20:00"],
            ["Dos días seguidos incompletos", "Administrador", "Diario"],
            ["Siete días sin ningún registro", "Administrador, comisión", "Inmediato"],
            ["Aviso de tendencia de piscina", "Encargado, administrador", "Agrupado, 08:00"],
            ["Ítem sistemáticamente omitido", "Administrador", "Mensual"],
            ["Insumo bajo mínimo", "Administrador", "Agrupado, 08:00"],
            ["Tarea de mantenimiento vencida", "Responsable, administrador", "Agrupado, 08:00"],
            ["Documento o seguro por vencer", "Administrador", "Agrupado, 08:00"],
            ["Informe mensual disponible", "Administrador, comisión", "Mensual"],
            ["Resumen mensual del edificio", "Propietarios", "Mensual"],
        ],
        anchos=[2.2, 1.6, 1.2],
    )]
    f += [aviso(
        "El primer aviso de checklist incompleto es sólo para el encargado",
        "No escala a nadie más el primer día. La idea es darle la oportunidad de corregirlo "
        "antes de que se convierta en un tema. Recién a los <b>dos días seguidos</b> el aviso "
        "llega al administrador.",
        "verde",
    )]
    f += [aviso(
        "Qué se puede silenciar y qué no",
        "Cada usuario puede desactivar los avisos no críticos desde su perfil. Los avisos de "
        "seguridad —incidente grave, reclamo crítico, siete días sin registro— <b>no se pueden "
        "desactivar</b>, y el sistema rechaza el intento con un mensaje explícito.",
    )]
    f += [p(
        "Los avisos agrupados salen <b>una sola vez por día, a las 08:00</b>, en un único correo. "
        "El asunto siempre lleva el nombre del edificio adelante: "
        "<font face='Courier' size='8'>[Draga Inn] Reclamo #453 — Resuelto</font>."
    )]
    return f
