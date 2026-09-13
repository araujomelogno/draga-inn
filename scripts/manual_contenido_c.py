# -*- coding: utf-8 -*-
"""Partes V y VI: operación técnica, y anexos de referencia."""
from manual_componentes import aviso, codigo, h1, h2, h3, numerada, p, tabla, vinetas, vs


def parte_5():
    f = []
    f += [h1("17. Poner el sistema a andar")]
    f += [p(
        "Esta parte es para quien administre la infraestructura. El procedimiento completo, con "
        "los comandos listos para copiar, está en <b>DESPLIEGUE.md</b>; acá va el panorama."
    )]
    f += [tabla(
        ["Paso", "Qué se hace"],
        [
            ["1. Provisionar", "Terraform crea la base, el depósito de archivos, las cuentas de servicio y los secretos."],
            ["2. Firebase Auth", "Habilitar correo con contraseña y enlace mágico; autorizar el dominio."],
            ["3. Secretos", "Cargar la cadena de conexión y la clave del proveedor de correo en Secret Manager."],
            ["4. Desplegar", "Cloud Build verifica, construye, migra la base y despliega."],
            ["5. Sembrar", "Una sola vez: edificio, unidades, plantillas del Manual, activos, insumos."],
            ["6. Jobs", "Programar los ocho jobs con sus horarios."],
            ["7. Hosting", "Publicar Firebase Hosting y conectar el dominio."],
            ["8. Primer usuario", "Cargar la invitación del primer administrador a mano."],
        ],
        anchos=[1.0, 4.0],
    )]
    f += [aviso(
        "Nada se despliega sin los tests en verde",
        "El pipeline corre verificación de tipos, análisis estático y los 323 tests <b>antes</b> "
        "de construir la imagen. Si algo falla, no se construye nada.",
    )]
    f += [aviso(
        "Los datos del seed son provisorios",
        "El padrón de unidades, los umbrales de gobernanza y el inventario de activos que trae "
        "el seed son <b>ejemplos</b>, no datos reales. Dependen de preguntas todavía abiertas "
        "del PRD (Q2, Q3, Q5 y Q7). Hay que reemplazarlos antes de abrir el sistema a los "
        "propietarios.",
        "ambar",
    )]

    f += [h1("18. Los ocho jobs programados")]
    f += [p(
        "Corren solos, con la zona horaria del edificio. <b>Todos son idempotentes</b>: si uno "
        "se ejecuta dos veces por un reintento, no duplica nada."
    )]
    f += [tabla(
        ["Job", "Hora", "Qué hace"],
        [
            ["<font face='Courier'>generate-maintenance-tasks</font>", "03:00", "Materializa las tareas de los planes activos para los próximos 60 días."],
            ["<font face='Courier'>flag-overdue</font>", "04:00", "Marca las tareas vencidas y alimenta el tablero."],
            ["<font face='Courier'>expiry-scan</font>", "04:15", "Detecta vencimientos a 30, 15 y 7 días."],
            ["<font face='Courier'>auto-close-tickets</font>", "04:30", "Cierra los tickets resueltos sin objeción tras el plazo configurado."],
            ["<font face='Courier'>compute-compliance</font>", "20:00", "Calcula el cumplimiento del día y dispara los avisos correspondientes."],
            ["<font face='Courier'>detect-trends</font>", "20:15", "Evalúa tendencias de piscina e ítems sistemáticamente omitidos."],
            ["<font face='Courier'>generate-monthly-report</font>", "Día 1, 05:00", "Arma el informe del mes anterior con todos los agregados."],
            ["<font face='Courier'>dispatch-outbox</font>", "cada 5 min", "Despacha los avisos pendientes."],
        ],
        anchos=[1.9, 0.8, 3.3],
    )]
    f += [aviso(
        "El horario de verano no requiere ningún ajuste",
        "El programador recibe la zona <font face='Courier'>America/Montevideo</font> "
        "directamente. Y como los jobs son idempotentes, una eventual reejecución por el cambio "
        "de hora no produce datos duplicados.",
    )]

    f += [h1("19. Operación diaria del sistema")]
    f += [h2("19.1. Consultas de salud")]
    f += [codigo([
        "-- ¿Los avisos están saliendo?",
        "select status, count(*) from outbox group by status;",
        "",
        "-- ¿Corrieron los jobs de hoy?",
        "select job_name, status, started_at from job_runs",
        " where started_at::date = current_date order by started_at desc;",
        "",
        "-- ¿Hay escrituras sin autor? (señal de código que saltea la auditoría)",
        "select entity_type, count(*) from audit_log",
        " where actor_user_id is null and occurred_at > now() - interval '7 days'",
        " group by entity_type;",
    ], "Para pegar en la consola de la base")]

    f += [h2("19.2. Qué mirar cuando algo no anda")]
    f += [tabla(
        ["Síntoma", "Causa probable", "Qué hacer"],
        [
            ["«Tu sesión venció» en bucle", "El dominio no está autorizado en Firebase Auth", "Agregarlo en Authentication → Settings → Authorized domains"],
            ["«No tenés acceso a este edificio»", "Falta la invitación o el rol", "Revisar la tabla de invitaciones y la de roles"],
            ["Las descargas fallan", "Falta el permiso de firma sobre la propia cuenta de servicio", "Revisar el binding descrito en DESPLIEGUE.md §4"],
            ["Los jobs no se disparan", "La cuenta del programador no puede invocarlos", "Otorgarle el rol de invocador"],
            ["No sale ningún correo", "Los avisos están apagados o falta la clave", "Revisar las variables del servicio"],
            ["Fechas corridas un día", "Se usó la hora del servidor en vez de la del edificio", "Todo cálculo de fecha usa la zona del edificio"],
            ["La migración falla por checksum", "Se editó una migración ya aplicada", "Revertir el archivo y crear una migración nueva"],
        ],
        anchos=[1.5, 1.7, 1.8],
    )]

    f += [h2("19.3. Copias de seguridad")]
    f += [p(
        "La base hace copias diarias con 30 de retención y permite volver a cualquier punto de "
        "los últimos 7 días. Eso no sirve de nada si nunca se probó restaurar."
    )]
    f += [aviso(
        "Probá la restauración antes de abrir el sistema",
        "Restaurar a una instancia <b>nueva</b> —nunca encima de producción—, verificar que la "
        "auditoría y la línea de tiempo estén completas, y borrar la instancia de prueba. Es uno "
        "de los puntos de la definición de terminado del v1.",
        "ambar",
    )]

    f += [h1("20. Privacidad y datos personales")]
    f += [p(
        "El sistema maneja datos personales de residentes, alcanzados por la <b>Ley N.º 18.331</b> "
        "de Uruguay. Las decisiones técnicas que se tomaron en consecuencia:"
    )]
    f += vinetas([
        "Los registros técnicos llevan un identificador de pedido y de usuario, <b>nada más</b>. "
        "Ni nombres, ni correos, ni contenido de documentos.",
        "El depósito de archivos <b>nunca</b> es público. El acceso es por dirección firmada de "
        "vida corta, emitida después de verificar permisos.",
        "Las credenciales viven en el gestor de secretos. Ninguna en el repositorio ni en el "
        "navegador.",
        "El portal informa a cada residente sus derechos de acceso y rectificación.",
        "La auditoría y la línea de tiempo del expediente <b>no se borran</b>, porque son la "
        "prueba de lo que pasó.",
    ])
    f += [aviso(
        "Lo que todavía falta",
        "Está pendiente el documento formal de tratamiento de datos: base legal, finalidad, "
        "plazo de retención y procedimiento de acceso y rectificación. <b>Eso bloquea la "
        "apertura del portal a los propietarios</b>, no por una limitación técnica sino por una "
        "obligación legal.",
        "ambar",
    )]
    return f


def parte_6():
    f = []
    f += [h1("Anexo A · Las 52 reglas de negocio")]
    f += [p(
        "Cada regla está implementada con su identificador escrito en el código, sobre la función "
        "que la aplica, y el mismo identificador en el nombre de su test."
    )]

    f += [h2("Expediente y gobernanza")]
    f += [tabla(
        ["#", "Regla"],
        [
            ["RN-01", "Un expediente no cierra con tickets, órdenes de trabajo o aprobaciones pendientes."],
            ["RN-02", "Toda excepción a una regla de gobernanza se muestra destacada en la línea de tiempo y en el tablero del mes."],
            ["RN-03", "La titularidad nunca se sobrescribe: se cierra un período y se abre otro."],
            ["RN-04", "El edificio debe tener siempre al menos un administrador activo."],
        ],
        anchos=[0.5, 4.5], mono_col=[0],
    )]

    f += [h2("Tickets")]
    f += [tabla(
        ["#", "Regla"],
        [
            ["RN-11", "Un ticket resuelto se cierra automáticamente a los 7 días sin objeción."],
            ["RN-12", "El propietario puede reabrir su reclamo dentro de los 7 días de resuelto; después debe abrir uno nuevo."],
            ["RN-13", "El cambio de estado es individual y con contexto: no hay cambio masivo de estado."],
            ["RN-14", "Un comentario marcado como interno nunca llega al propietario por ninguna vía."],
            ["RN-15", "No se carga factura sin conformidad de la orden de trabajo, salvo excepción auditada."],
            ["RN-16", "Factura que excede el monto aprobado más la tolerancia exige nueva aprobación."],
            ["RN-17", "Todo documento nace interno; publicarlo es un acto explícito y auditado."],
            ["RN-18", "Los vencimientos alertan a 30, 15 y 7 días."],
            ["RN-19", "La auditoría es inmutable y de sólo lectura para todos."],
            ["RN-20", "Antes de emitir una orden de trabajo se valida: N presupuestos y aprobación del rol requerido según el monto."],
        ],
        anchos=[0.5, 4.5], mono_col=[0],
    )]

    f += [h2("Planillas y operación")]
    f += [tabla(
        ["#", "Regla"],
        [
            ["RN-21", "Valor de piscina fuera de rango exige observación."],
            ["RN-22", "Valor de piscina fuera de rango crítico genera ticket crítico automático vinculado al registro."],
            ["RN-23", "Tarea aprobada marcada como derivada ofrece crear un ticket vinculado."],
            ["RN-24", "Una tarea vence a las 00:00 del día siguiente a su fecha prevista."],
            ["RN-25", "Incidente de accidente o principio de incendio notifica al administrador de inmediato."],
            ["RN-26", "Stock bajo mínimo notifica una vez por artículo hasta su reposición."],
            ["RN-27", "Los indicadores de «sin asignar» y «vencidos» se destacan en rojo sólo si son mayores que cero."],
            ["RN-28", "No se desactiva un plan de mantenimiento sin resolver sus tareas pendientes."],
            ["RN-29", "El sistema marca el presupuesto más bajo pero no recomienda: la decisión se fundamenta."],
            ["RN-30", "El estado de sincronización es visible de forma permanente en la aplicación del encargado."],
            ["RN-31", "Un checklist no se completa con ítems requeridos sin marcar."],
            ["RN-32", "Las fotos se suben por separado del registro; el registro no espera a la foto."],
            ["RN-33", "Las notificaciones agrupadas se envían una vez al día, a las 08:00, en un solo correo."],
            ["RN-34", "El usuario puede desactivar las notificaciones no críticas. Las de seguridad, no."],
        ],
        anchos=[0.5, 4.5], mono_col=[0],
    )]

    f += [h2("Temporada e informe")]
    f += [tabla(
        ["#", "Regla"],
        [
            ["RN-40", "Entre el 1/12 y el 31/3, y en Semana de Turismo, la interfaz indica temporada alta y refuerza las frecuencias estacionales."],
            ["RN-41", "El informe mensual se envía a partir del día 1 del mes siguiente."],
            ["RN-42", "Un informe enviado no se edita: se genera una versión nueva que referencia a la anterior."],
        ],
        anchos=[0.5, 4.5], mono_col=[0],
    )]

    f += [h2("Cumplimiento")]
    f += [tabla(
        ["#", "Regla"],
        [
            ["RN-43", "El sistema distingue tres estados por registro: presente y correcto, presente fuera de rango, y faltante. Los tres se computan distinto."],
            ["RN-44", "Checklist diario sin completar al cierre del día (20:00 local) ⇒ el día se marca incompleto y se notifica <b>sólo al encargado</b>."],
            ["RN-45", "Dos días consecutivos incompletos ⇒ notificación al administrador. Siete días sin ningún registro ⇒ alerta en el tablero de riesgos y aviso a administrador y comisión."],
            ["RN-46", "Un ítem no marcado en el 80 % o más de las instancias de los últimos 30 días se señala como sistemáticamente omitido, para revisar la plantilla."],
            ["RN-47", "Tres mediciones consecutivas de un mismo parámetro desviándose en la misma dirección generan aviso de tendencia, aunque cada valor esté dentro de rango."],
            ["RN-48", "El cumplimiento se calcula <b>sólo sobre ítems requeridos</b>. Los opcionales no penalizan."],
            ["RN-49", "El encargado ve su propio indicador en su aplicación, con el mismo detalle que la administración y sin requerir permiso."],
            ["RN-50", "El informe mensual incluye el resumen de control: previstas, completadas, pendientes, porcentaje y justificación de lo pendiente."],
            ["RN-51", "Los indicadores se presentan como cumplimiento del plan del edificio. Ninguna pantalla los rotula como desempeño de una persona, y toda vista lleva al pie la leyenda sobre uso disciplinario."],
            ["RN-52", "En temporada de piscina, un día sin registro cuenta como faltante en el cumplimiento; fuera de temporada, no."],
        ],
        anchos=[0.5, 4.5], mono_col=[0],
    )]

    f += [h1("Anexo B · Matriz de permisos")]
    f += [p(
        "Por cada celda denegada de esta matriz existe un <b>test negativo</b> que verifica el "
        "rechazo en el servidor, no sólo en la pantalla. Son 182 tests."
    )]
    f += [p("<font size='8'>P = propietario · I = inquilino · E = encargado · A = administrador · "
            "C = comisión · Ct = contador · Au = auditor</font>")]
    filas = [
        ["Ver su unidad", "✓", "✓", "✓", "✓", "✓", "—", "✓"],
        ["Ver otras unidades", "—", "—", "✓", "✓", "✓", "—", "✓"],
        ["Crear reclamo", "✓", "✓", "✓", "✓", "✓", "—", "—"],
        ["Ver comentarios internos", "—", "—", "✓", "✓", "✓", "—", "—"],
        ["Cambiar estado de ticket", "—", "—", "✓", "✓", "—", "—", "—"],
        ["Asignar responsable", "—", "—", "—", "✓", "—", "—", "—"],
        ["Registrar planillas", "—", "—", "✓", "✓", "—", "—", "—"],
        ["Ver su propio cumplimiento", "—", "—", "✓", "✓", "✓", "—", "—"],
        ["Ver cumplimiento del edificio", "—", "—", "✓", "✓", "✓", "—", "—"],
        ["Cargar presupuesto", "—", "—", "—", "✓", "✓", "—", "—"],
        ["Aprobar bajo umbral", "—", "—", "—", "✓", "✓", "—", "—"],
        ["Aprobar sobre umbral", "—", "—", "—", "—", "✓", "—", "—"],
        ["Registrar excepción de gobernanza", "—", "—", "—", "✓", "✓", "—", "—"],
        ["Emitir orden de trabajo", "—", "—", "—", "✓", "—", "—", "—"],
        ["Validar factura", "—", "—", "—", "✓", "✓", "—", "—"],
        ["Publicar documento a propietarios", "—", "—", "—", "✓", "✓", "—", "—"],
        ["Ver auditoría", "—", "—", "—", "✓", "✓", "—", "✓"],
        ["Exportar contable", "—", "—", "—", "✓", "✓", "✓", "—"],
        ["Configurar reglas de gobernanza", "—", "—", "—", "—", "✓", "—", "—"],
        ["Gestionar usuarios y roles", "—", "—", "—", "✓", "✓", "—", "—"],
    ]
    f += [tabla(["Acción", "P", "I", "E", "A", "C", "Ct", "Au"], filas,
                anchos=[2.6, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34, 0.34])]

    f += [h1("Anexo C · Casos borde")]
    f += [p("Situaciones que no son el camino feliz, y qué hace el sistema en cada una.")]
    f += [tabla(
        ["#", "Caso", "Comportamiento"],
        [
            ["CB-01", "Dos usuarios editan el mismo ticket a la vez", "Gana la última escritura campo por campo; si cambió el estado, se avisa y se pide recargar."],
            ["CB-02", "Se registra piscina con fecha de días atrás", "Permitido hasta 7 días; más allá exige justificación escrita."],
            ["CB-03", "La cola sin conexión acumula más de 200 registros", "Se sigue aceptando, se avisa, y se priorizan los tickets críticos al enviar."],
            ["CB-04", "Se reinstala la aplicación con registros pendientes", "Se pierden. Hay advertencia explícita antes de borrar los datos del sitio."],
            ["CB-05", "Un propietario vende su unidad con reclamos abiertos", "Los reclamos quedan en la unidad. El nuevo propietario ve los abiertos, no el histórico del anterior."],
            ["CB-06", "Se intenta eliminar un proveedor con trabajos", "No se elimina: se desactiva. El histórico se conserva."],
            ["CB-07", "Se intenta aprobar un presupuesto vencido", "Bloqueado. Se exige revalidación del proveedor."],
            ["CB-08", "Dos aprobaciones simultáneas del mismo presupuesto", "La segunda falla por conflicto y se muestra la aprobación vigente."],
            ["CB-09", "Una foto no sube tras diez intentos", "El registro queda guardado sin la foto, marcado como «foto no enviada», con reintento manual."],
            ["CB-10", "El mes cierra sin actividad registrada", "El informe se genera igual, indicando explícitamente qué bloques quedaron sin datos."],
            ["CB-11", "Un usuario tiene dos roles", "Ve la unión de permisos; la interfaz ofrece selector de contexto."],
            ["CB-12", "Una unidad no tiene propietario vigente", "Permitido, pero marcada como incompleta en el listado y en el tablero de riesgos."],
            ["CB-13", "Cambio de horario de verano", "Todos los cálculos usan la zona del edificio y los jobs son idempotentes ante reejecución."],
            ["CB-14", "Ticket creado sin conexión sobre una unidad borrada mientras tanto", "Se acepta, se desvincula la unidad y se avisa al administrador para reasignar."],
        ],
        anchos=[0.45, 1.75, 2.8], mono_col=[0],
    )]

    f += [h1("Anexo D · Glosario")]
    f += [tabla(
        ["Término", "Qué significa"],
        [
            ["<b>Expediente</b>", "Unidad de trazabilidad. Agrupa todos los hechos de un mismo asunto de punta a punta."],
            ["<b>Ticket</b>", "Reclamo o solicitud concreta. Siempre pertenece a un expediente."],
            ["<b>Regla de gobernanza</b>", "Condición configurable que, según el monto, exige N presupuestos y la aprobación de un rol determinado."],
            ["<b>Excepción de gobernanza</b>", "Omisión deliberada y fundada de una regla, registrada y visible."],
            ["<b>Conformidad</b>", "Acto por el cual se declara que un trabajo se completó a satisfacción."],
            ["<b>Planilla</b>", "Registro operativo periódico del encargado, equivalente a los Anexos A–H del Manual de Trabajo."],
            ["<b>Coeficiente</b>", "Porcentaje de copropiedad de una unidad. Base del prorrateo y del peso del voto en el v2."],
            ["<b>Temporada alta</b>", "Del 1/12 al 31/3 y Semana de Turismo. Refuerza frecuencias e indicadores."],
            ["<b>Ítem requerido</b>", "Ítem del checklist que cuenta para el cumplimiento. Los opcionales no penalizan."],
            ["<b>Día faltante</b>", "Día sin ningún registro. Distinto de un día con un dato fuera de rango."],
            ["<b>Outbox</b>", "Cola de avisos pendientes. Desacopla el hecho de su notificación."],
            ["<b>Idempotente</b>", "Que puede ejecutarse varias veces produciendo el mismo resultado, sin duplicar."],
        ],
        anchos=[1.1, 3.9],
    )]

    f += [h1("Anexo E · Lo que no está en el v1")]
    f += [p(
        "Esto está documentado para que no se cuele por accidente y para que nadie lo espere."
    )]
    f += [h2("Diferido al v2, por decisión de producto")]
    f += vinetas([
        "Expensas, prorrateo por coeficiente y cálculo de cuotas.",
        "Asambleas, convocatorias, quórum y votaciones.",
        "Conciliación bancaria, pagos y pasarelas.",
        "Morosidad, intereses y saldos por unidad.",
        "Reservas de áreas comunes.",
    ])
    f += [h2("Implementado pero sin verificación automatizada")]
    f += vinetas([
        "Los tres recorridos de punta a punta en navegador. La configuración de la herramienta "
        "está lista; los recorridos requieren el emulador de identidad con usuarios sembrados.",
        "Tres de los catorce casos borde (CB-04, CB-11 y CB-14): están implementados, pero "
        "verificarlos requiere el navegador.",
    ])
    f += [h2("Pendiente de decisión externa")]
    f += [tabla(
        ["#", "Qué falta", "Qué bloquea"],
        [
            ["Q2 · Q3", "Umbrales reales de gobernanza y quién aprueba cada tramo", "Los del seed son de ejemplo. Se cambian sin tocar código."],
            ["Q5", "Padrón real de unidades con sus coeficientes", "El seed genera un padrón de ejemplo. Reemplazarlo antes de producción."],
            ["Q7", "Inventario real de activos y sus criticidades", "El seed lista activos típicos de un edificio."],
            ["Q8", "Documento de tratamiento de datos personales", "<b>Bloquea la apertura del portal a propietarios.</b>"],
        ],
        anchos=[0.6, 2.0, 2.4], mono_col=[0],
    )]

    f += [h1("Anexo F · Documentos del proyecto")]
    f += [tabla(
        ["Documento", "Para qué"],
        [
            ["<font face='Courier'>PRD…md</font>", "Qué construimos y por qué. Alcance, épicas, prioridades."],
            ["<font face='Courier'>ESPEC_FUNCIONAL_v1…md</font>", "Comportamiento: pantallas, estados, reglas RN-01 a RN-52, permisos, casos borde. <b>Fuente de verdad del comportamiento.</b>"],
            ["<font face='Courier'>HANDOFF_TECNICO…md</font>", "Arquitectura, modelo de datos, plan de trabajo."],
            ["<font face='Courier'>DECISIONES_DE_DISENO.md</font>", "Qué se decidió al construirlo y por qué esa opción y no otra."],
            ["<font face='Courier'>DESPLIEGUE.md</font>", "De un proyecto vacío a producción, con los comandos."],
            ["<font face='Courier'>ESPEC_v2…md</font>", "Alcance diferido. No implementar sin pedido explícito."],
            ["<font face='Courier'>CLAUDE.md</font>", "Reglas permanentes del proyecto para quien escriba código."],
        ],
        anchos=[1.5, 3.5],
    )]
    return f
