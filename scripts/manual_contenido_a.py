# -*- coding: utf-8 -*-
"""Partes I y II del manual: el sistema, y el uso diario del encargado."""
from manual_componentes import (
    aviso, codigo, h1, h2, h3, numerada, p, Regla, tabla, vinetas, vs,
)


def parte_1():
    f = []
    f += [h1("1. Qué es este sistema")]
    f += [p(
        "El Edificio Draga Inn es un edificio de propiedad horizontal en Punta del Este. "
        "Sus propietarios viven mayormente en otra ciudad —Montevideo, Buenos Aires, São Paulo— "
        "y visitan el edificio pocas semanas al año. Su encargado, en cambio, vive ahí con su "
        "familia en una vivienda de función y sostiene la operación todos los días."
    )]
    f += [p(
        "Esa asimetría es el problema que el sistema resuelve. Quien está presente genera "
        "información todo el tiempo, y quien decide no la ve. Cuando aparece un conflicto, "
        "nadie tiene cómo reconstruir qué pasó."
    )]
    f += [aviso(
        "El principio rector",
        "Sobre cualquier hecho del edificio, cualquier persona con permiso puede responder: "
        "<b>quién lo hizo, cuándo, por qué, cuánto costó y con qué autorización</b>. "
        "Si una función del sistema no contribuye a eso, sobra.",
        "verde",
    )]

    f += [h2("1.1. Lo que el sistema no hace")]
    f += [p(
        "El sistema <b>no agrega trabajo</b>. El encargado ya está obligado por su Manual de "
        "Trabajo a llevar planillas en papel: control de piscina, tareas aprobadas, incidentes, "
        "stock de insumos. Lo que hace el sistema es que esas mismas planillas se llenen desde "
        "el teléfono, y que de ahí salgan solos el informe mensual y el tablero de la "
        "administración."
    )]
    f += [p(
        "Tampoco reemplaza a nadie ni vigila a nadie. El registro que prueba que las cosas se "
        "hicieron es, sobre todo, una protección para quien las hizo."
    )]

    f += [h2("1.2. Las tres superficies")]
    f += [p("El sistema es uno solo, pero se presenta de tres maneras según quién lo use.")]
    f += [tabla(
        ["Superficie", "Quién la usa", "Dónde", "Característica principal"],
        [
            ["PWA del encargado", "Encargado", "Teléfono, instalable",
             "Funciona <b>sin conexión</b>. Es la que más se usa y la que genera los datos."],
            ["Consola de administración", "Administrador, comisión, contador, auditor", "Escritorio",
             "Tablero, expedientes, contrataciones y auditoría."],
            ["Portal del propietario", "Propietarios e inquilinos", "Cualquier dispositivo",
             "Su unidad, sus reclamos y los documentos publicados. Nada más."],
        ],
        anchos=[1.3, 1.5, 1.1, 2.6],
    )]

    f += [h2("1.3. Los roles")]
    f += [p(
        "Cada persona tiene uno o más roles en el edificio, y el rol define qué ve y qué puede "
        "hacer. La interfaz <b>oculta</b> lo que el rol no puede hacer: no lo muestra "
        "deshabilitado. Y el rechazo real ocurre en el servidor, no en la pantalla."
    )]
    f += [tabla(
        ["Rol", "Qué hace"],
        [
            ["<b>Encargado</b>", "Registra la operación diaria: checklist, piscina, tareas, incidentes, stock, tickets. "
             "Ve su propio indicador de cumplimiento. Nunca aprueba gastos."],
            ["<b>Administrador</b>", "Conduce la operación: asigna, prioriza, emite órdenes de trabajo, valida facturas, "
             "publica documentos, gestiona usuarios. Aprueba gastos por debajo del umbral."],
            ["<b>Comisión</b>", "Órgano de gobierno. Configura las reglas de gobernanza y aprueba los gastos "
             "por encima del umbral. Ve todo."],
            ["<b>Propietario</b>", "Ve su unidad y sus reclamos. Abre reclamos nuevos."],
            ["<b>Inquilino</b>", "Como el propietario, pero sin los datos de titularidad ni los financieros."],
            ["<b>Contador</b>", "Lectura financiera y exportación contable. Sin escritura."],
            ["<b>Auditor</b>", "Lectura amplia, incluida la auditoría. Sin escritura."],
        ],
        anchos=[0.9, 4.1],
    )]
    f += [aviso(
        "Una persona puede tener dos roles",
        "Un propietario que además integra la comisión ve la <b>unión</b> de ambos permisos, y "
        "la interfaz le ofrece un selector de contexto para que sepa desde dónde está actuando.",
    )]

    f += [h1("2. Los conceptos que hay que entender")]
    f += [p(
        "Hay cinco palabras que el sistema usa con un significado preciso. Vale la pena "
        "leerlas antes de seguir."
    )]

    f += [h2("2.1. Expediente")]
    f += [p(
        "El <b>expediente</b> es la unidad de trazabilidad: agrupa todos los hechos de un mismo "
        "asunto de punta a punta. Una filtración en el subsuelo empieza como un ticket, sigue "
        "con tres presupuestos, una aprobación, una orden de trabajo, la conformidad y la "
        "factura. Todo eso es <b>un</b> expediente."
    )]
    f += [aviso(
        "Ningún hecho existe suelto",
        "Si el encargado registra una tarea con costo, el expediente se abre solo. No hay forma "
        "de crear un ticket, un presupuesto, una orden o una factura sin que pertenezcan a uno.",
    )]

    f += [h2("2.2. Ticket")]
    f += [p(
        "Un <b>ticket</b> es un reclamo o una solicitud concreta. Siempre pertenece a un "
        "expediente. Tiene estado, prioridad, responsable y una línea de tiempo propia."
    )]

    f += [h2("2.3. Regla de gobernanza")]
    f += [p(
        "Una <b>regla de gobernanza</b> dice: a partir de tal monto hacen falta tantos "
        "presupuestos y la aprobación de tal rol. Son configurables y pueden escalonarse. "
        "El sistema las aplica antes de emitir una orden de trabajo."
    )]

    f += [h2("2.4. Excepción de gobernanza")]
    f += [p(
        "A veces hay que saltarse una regla: se inunda el subsuelo un sábado y no hay tiempo de "
        "pedir tres presupuestos. El sistema lo permite, pero exige un fundamento escrito, lo "
        "registra como <b>excepción</b>, lo muestra destacado en ámbar en la línea de tiempo y "
        "en el tablero del mes, y le avisa a la comisión."
    )]
    f += [aviso(
        "La excepción se registra, nunca se esconde",
        "Es la diferencia entre una administración que resuelve rápido y una que no rinde "
        "cuentas. El sistema deja hacer lo primero sin que se convierta en lo segundo.",
        "ambar",
    )]

    f += [h2("2.5. Planilla")]
    f += [p(
        "Una <b>planilla</b> es un registro operativo periódico del encargado, equivalente a "
        "los Anexos A a H de su Manual de Trabajo. Las planillas son el corazón del sistema: "
        "de ahí sale casi todo lo demás."
    )]

    f += [h1("3. Cómo está construido")]
    f += [p(
        "Esta sección es para quien tenga que mantener el sistema. Si sólo va a usarlo, puede "
        "saltar a la Parte II."
    )]
    f += [codigo([
        "Firebase Hosting  ──▶  Cloud Run (Next.js 15)  ──┬──▶  Cloud SQL PostgreSQL 16",
        "  CDN · TLS · dominio    API + las 3 superficies │        sistema de registro",
        "                                                ├──▶  Cloud Storage",
        "                                                │        signed URLs v4",
        "                                                └──▶  Firebase Auth",
        "                              ▲                          identidad",
        "       Cloud Scheduler ───────┴──▶  Cloud Run Jobs  (8 jobs programados)",
    ], "Arquitectura desplegada")]

    f += [tabla(
        ["Pieza", "Elección", "Por qué"],
        [
            ["Framework", "Next.js 15, App Router", "Una sola base para las tres superficies."],
            ["Base de datos", "Cloud SQL PostgreSQL 16",
             "El dominio es relacional y auditable. Firestore obligaría a desnormalizar el "
             "expediente y a poner la auditoría en código que se puede saltear."],
            ["ORM", "Drizzle, con SQL a mano para triggers y vistas",
             "Tipos inferidos del esquema, control total del DDL."],
            ["Identidad", "Firebase Auth", "Correo con contraseña y enlace mágico, verificado en el servidor."],
            ["Archivos", "Cloud Storage", "El bucket nunca es público: se accede por URL firmada de vida corta."],
            ["Estilos", "CSS con variables nativas", "Sin dependencias. La PWA carga 154 kB de JavaScript."],
            ["Validación", "zod, compartida cliente y servidor", "Cada regla vive en un solo lugar."],
            ["Tests", "Vitest contra Postgres real", "323 tests, incluidos los negativos de autorización."],
        ],
        anchos=[0.9, 1.5, 3.1],
    )]

    f += [h2("3.1. Las cinco reglas que no se negocian")]
    f += [p(
        "No son buenas intenciones: están puestas donde no se pueden saltear."
    )]
    f += numerada([
        "<b>Todo hecho pertenece a un expediente.</b> Ninguna entidad de dominio se crea suelta.",
        "<b>Todo se audita, y la auditoría vive en la base de datos.</b> En <i>triggers</i> de "
        "PostgreSQL, no en código de aplicación. Un <font face='Courier'>INSERT</font> desde "
        "cualquier lado —incluida una consola de SQL— queda registrado con su antes y su después.",
        "<b>Todo está scopeado a un edificio.</b> Cada tabla y cada consulta filtran por edificio, "
        "aunque hoy haya uno solo.",
        "<b>Todo hecho económico lleva monto, rubro y autorización</b>, aunque el v1 no calcule "
        "expensas. Es el seguro contra reescribir todo en el v2.",
        "<b>La PWA del encargado funciona sin conexión</b>, y reintentar nunca duplica.",
    ])

    f += [h2("3.2. Por qué la auditoría está en la base")]
    f += [p(
        "Si la auditoría fuera código de aplicación, cualquier ruta nueva que se olvidara de "
        "llamarla generaría un hecho sin rastro. Poniéndola en la base, el olvido es imposible."
    )]
    f += [p("Son tres mecanismos que se complementan:")]
    f += vinetas([
        "<b>Trigger de auditoría en 36 tablas.</b> Registra altas, modificaciones y bajas con el "
        "valor anterior, el nuevo y los campos que efectivamente cambiaron.",
        "<b>Reglas de inmutabilidad sobre el registro de auditoría.</b> Un intento de modificarlo "
        "o borrarlo no falla ruidosamente: simplemente <b>no hace nada</b>. Verificado en los "
        "tests, incluso ejecutado como superusuario de la base.",
        "<b>Trigger de sólo-agregado</b> sobre la línea de tiempo del expediente y sobre las "
        "aprobaciones. Ahí sí lanza excepción, porque la aplicación nunca debería intentarlo.",
    ])
    f += [aviso(
        "Cómo detectar código que saltea la auditoría",
        "Toda escritura pasa por una única función que declara quién está actuando. Una "
        "escritura que la evite queda registrada igual, pero <b>sin autor</b>. Esta consulta lo "
        "encuentra:<br/><br/>"
        "<font face='Courier' size='8'>select entity_type, count(*) from audit_log<br/>"
        " where actor_user_id is null and occurred_at &gt; now() - interval '7 days'<br/>"
        " group by entity_type;</font>",
    )]
    return f


def parte_2():
    f = []
    f += [h1("4. La aplicación del encargado")]
    f += [p(
        "Esta es la parte del sistema que más se usa. Está pensada para el teléfono, para usarse "
        "con una mano, y para funcionar <b>sin señal</b>: el subsuelo del edificio no tiene "
        "cobertura y la piscina tampoco siempre."
    )]

    f += [h2("4.1. Instalarla")]
    f += numerada([
        "Abrir la dirección del edificio en el navegador del teléfono.",
        "Iniciar sesión con el correo. Si no hay contraseña, pedir un <b>enlace por correo</b> "
        "y abrirlo desde el mismo teléfono.",
        "En el menú del navegador, elegir <b>Instalar aplicación</b> o <b>Agregar a la pantalla "
        "de inicio</b>.",
        "A partir de ahí queda como una aplicación más. No hay que volver a iniciar sesión todos "
        "los días.",
    ])
    f += [aviso(
        "Antes de borrar los datos del sitio o reinstalar",
        "Si hay registros pendientes de enviar, <b>se pierden</b>. La aplicación avisa antes, "
        "pero conviene saberlo: esperá a que el contador de pendientes llegue a cero.",
        "rojo",
    )]

    f += [h2("4.2. La pantalla «Hoy»")]
    f += [p(
        "Es la pantalla de inicio y responde una sola pregunta: <b>qué hay que hacer hoy</b>. "
        "Se lee en cinco segundos."
    )]
    f += [p("De arriba hacia abajo:")]
    f += numerada([
        "<b>Saludo, fecha e indicador de temporada.</b> En temporada alta lo dice con una "
        "etiqueta ámbar, porque cambian las frecuencias.",
        "<b>Checklist del día</b>, con el progreso a la vista (por ejemplo <font face='Courier'>7/12</font>) "
        "y los ítems agrupados por sección del Manual.",
        "<b>Tareas de mantenimiento</b> que vencen hoy o ya vencieron. Las vencidas van primero "
        "y en rojo.",
        "<b>Tickets asignados</b> que siguen abiertos, ordenados por prioridad.",
        "<b>Pendientes de sincronizar</b>, si hay algo esperando señal.",
    ])
    f += [aviso(
        "Marcar un ítem no espera a la red",
        "El tic aparece al instante. Si no hay señal, el registro queda guardado en el teléfono "
        "y se envía solo cuando vuelve. Lo marcado sin conexión <b>no se pierde ni se duplica</b>.",
    )]

    f += [h3("Ítems opcionales")]
    f += [p(
        "Algunos ítems del checklist están marcados como <b>opcionales</b>. Se pueden marcar, "
        "pero <b>no cuentan para el cumplimiento</b>: dejarlos sin marcar no baja el porcentaje. "
        "La aplicación los señala con la palabra «opcional» al lado."
    )]

    f += [h2("4.3. El botón «Registrar +»")]
    f += [p(
        "El botón del centro de la barra inferior abre las cinco cosas que el encargado registra "
        "a diario."
    )]
    f += [tabla(
        ["Qué", "Para qué", "Equivale a"],
        [
            ["<b>Ticket</b>", "Un reclamo o una solicitud concreta", "—"],
            ["<b>Piscina</b>", "La medición diaria de cloro, pH y alcalinidad", "Anexo A"],
            ["<b>Tarea aprobada</b>", "Un trabajo hecho por el encargado", "Anexo B"],
            ["<b>Incidente</b>", "Corte de servicio, fuga, accidente", "Anexo F"],
            ["<b>Stock</b>", "Entrada, salida o ajuste de insumos", "Anexo E"],
        ],
        anchos=[1.1, 2.6, 0.8],
    )]

    f += [h2("4.4. Cargar un ticket")]
    f += [p("La meta es que lleve <b>menos de 30 segundos</b>. El flujo es:")]
    f += numerada([
        "<b>Foto</b> (opcional). Se puede sacar en el momento. La aplicación la achica antes de "
        "enviarla para no gastar datos.",
        "<b>Categoría</b>, de una grilla de botones grandes.",
        "<b>Descripción.</b> Se puede dictar con el teclado del teléfono. Mínimo 10 caracteres: "
        "el botón de enviar queda deshabilitado hasta llegar, y dice cuántos faltan.",
        "<b>Enviar.</b>",
    ])
    f += [aviso(
        "Qué pasa con la foto si no hay señal",
        "El ticket se guarda igual. La foto queda en cola y se sube aparte cuando vuelve la "
        "conexión: <b>el registro no espera a la foto</b>. Si tras diez intentos la foto no "
        "sube, el ticket queda marcado como «foto no enviada» y se puede reintentar a mano — "
        "pero el ticket ya está.",
    )]

    f += [h2("4.5. La planilla de piscina")]
    f += [p(
        "Es la planilla más delicada, porque de ella depende la salud de la piscina y la "
        "seguridad de quien la usa. La pantalla muestra <b>los rangos de referencia</b> al lado "
        "de cada campo y las últimas tres mediciones, para dar contexto."
    )]
    f += [tabla(
        ["Parámetro", "Rango de referencia", "Obligatorio"],
        [
            ["Cloro libre", "1 – 3 ppm", "Sí"],
            ["pH", "7,2 – 7,6", "Sí"],
            ["Alcalinidad total", "80 – 120 ppm", "No"],
            ["Dureza cálcica", "200 – 400 ppm", "No"],
        ],
        anchos=[1.4, 1.4, 0.8],
    )]
    f += [p("Además se registra: desnatado, cestas vaciadas, productos aplicados y observaciones.")]

    f += [h3("Qué pasa si un valor sale de rango")]
    f += [p("El sistema distingue dos niveles, y reacciona distinto en cada uno.")]
    f += [tabla(
        ["Situación", "Qué hace el sistema"],
        [
            ["<b>Fuera de rango</b><br/>(por ejemplo pH 8,4)",
             "Marca el campo en ámbar y <b>exige una observación</b> explicando qué se hizo. "
             "Sin la observación no deja guardar."],
            ["<b>Fuera de rango crítico</b><br/>(por ejemplo cloro 0,2 ppm)",
             "Además de lo anterior, <b>abre automáticamente un ticket de prioridad crítica</b>, "
             "vinculado a esa medición, y avisa a la administración y a la comisión."],
        ],
        anchos=[1.3, 3.7],
    )]
    f += [aviso(
        "Aviso de tendencia",
        "Aunque cada valor esté dentro de rango, si <b>tres mediciones seguidas</b> se desvían en "
        "la misma dirección, el sistema avisa. Es para corregir antes de que se salga, no después. "
        "Un día sin medición <b>corta la secuencia</b>: tres mediciones con un hueco en el medio "
        "no son tres mediciones seguidas.",
    )]

    f += [h3("Cargar una medición de un día anterior")]
    f += [p(
        "Se puede cargar hasta <b>siete días hacia atrás</b> sin explicaciones. Más allá de eso, "
        "el sistema pide un motivo escrito. No es un castigo: es para que el dato tenga contexto "
        "cuando alguien lo lea dentro de seis meses."
    )]

    f += [h2("4.6. Tarea aprobada")]
    f += [p(
        "Es el registro del Anexo B: los trabajos que el encargado hace por sí mismo con "
        "autorización de la administración. Se anota el rubro, qué se hizo, los materiales, el "
        "tiempo y —si la administración lo habilitó— el costo."
    )]
    f += [aviso(
        "Si hubo que llamar a un técnico",
        "Al marcar <b>«requirió derivación a técnico»</b>, el sistema pide el motivo y ofrece "
        "crear un ticket vinculado en el mismo paso. Así la derivación no se pierde: queda "
        "enganchada al expediente y se le puede seguir el rastro.",
    )]

    f += [h2("4.7. Incidente")]
    f += [p(
        "Es el registro del Anexo F: corte de servicio, fuga, principio de incendio, accidente, "
        "ingreso no autorizado, daño. Se anota qué pasó, qué se hizo y a quién se avisó."
    )]
    f += [aviso(
        "Accidente y principio de incendio avisan de inmediato",
        "Estos dos tipos notifican al administrador al instante por todos los canales "
        "disponibles, y <b>ese aviso no se puede desactivar</b>. Si hay riesgo para personas, "
        "primero llamá al 911 y después registralo acá.",
        "rojo",
    )]

    f += [h2("4.8. Stock")]
    f += [p(
        "Lista los insumos críticos con su cantidad actual y su mínimo. Los que están por debajo "
        "del mínimo aparecen <b>primero y en ámbar</b>. Se registra entrada, salida o ajuste por "
        "recuento."
    )]
    f += [p(
        "Cuando un insumo cae por debajo del mínimo, la administración recibe un aviso. "
        "<b>Una sola vez por artículo</b>, hasta que se reponga: si no, el aviso diario se "
        "vuelve ruido y se deja de leer."
    )]

    f += [h2("4.9. Trabajar sin conexión")]
    f += [p(
        "Esta es la parte que más importa que funcione bien, así que conviene entender cómo se "
        "comporta."
    )]
    f += [tabla(
        ["Lo que ves", "Qué significa"],
        [
            ["<b>Al día</b> (verde)", "No hay nada pendiente. Todo llegó al servidor."],
            ["<b>Sin conexión</b> (ámbar)", "No hay señal. Podés seguir trabajando igual: todo se guarda en el teléfono."],
            ["<b>N registros pendientes</b>", "Hay señal, pero todavía no se enviaron. Se están mandando solos."],
            ["<b>Enviando…</b>", "Está sincronizando en este momento."],
        ],
        anchos=[1.2, 3.8],
    )]
    f += [aviso(
        "La aplicación nunca dice «guardado» a secas",
        "Si el registro sólo está en el teléfono, dice exactamente eso: <b>«Guardado en el "
        "teléfono, pendiente de enviar»</b>. Nunca te va a hacer creer que algo llegó al "
        "servidor cuando no llegó.",
        "verde",
    )]
    f += [h3("Y si mando lo mismo dos veces")]
    f += [p(
        "No pasa nada. Cada registro lleva un identificador único que genera el teléfono; el "
        "servidor lo usa para reconocer el reintento y devolver el registro que ya existía. "
        "<b>Reintentar nunca duplica.</b>"
    )]

    f += [h2("4.10. Mi cumplimiento")]
    f += [p(
        "Esta pantalla merece una explicación honesta, porque es la más delicada del sistema."
    )]
    f += [aviso(
        "Qué mide, y qué no",
        "Mide el <b>cumplimiento del plan operativo del edificio</b>: cuántos de los ítems "
        "requeridos del plan se completaron. <b>No</b> es una evaluación de desempeño de una "
        "persona, y el sistema no la rotula así en ninguna pantalla, etiqueta ni correo.<br/><br/>"
        "Su uso con fines disciplinarios requiere el procedimiento previsto en el régimen de "
        "faltas y sanciones. Esa leyenda aparece al pie de todas las vistas de cumplimiento.",
        "verde",
    )]
    f += [p("La pantalla muestra:")]
    f += vinetas([
        "El <b>porcentaje del plan cumplido</b> del día, la semana y el mes, calculado sólo "
        "sobre los ítems requeridos.",
        "La <b>racha</b>: días seguidos con el plan completo, o días seguidos sin registro.",
        "<b>Lo que falta hoy</b>, con acceso directo para completarlo.",
        "La <b>tendencia de la piscina</b>, con aviso si algo viene desviándose.",
        "Un <b>calendario de 30 días</b> con el estado de cada uno.",
    ])
    f += [aviso(
        "El encargado lo ve primero, y ve lo mismo",
        "Esta pantalla está en la aplicación del encargado, accesible <b>sin pedirle permiso a "
        "nadie</b>, y muestra <b>exactamente el mismo detalle</b> que ve la administración. No "
        "hay una versión recortada. La idea es que pueda corregir antes de que se lo señalen.",
    )]

    f += [h3("Los cuatro colores del calendario")]
    f += [tabla(
        ["Color", "Significa"],
        [
            ["<b>Verde</b>", "El plan del día se completó."],
            ["<b>Ámbar</b>", "Se completó en parte."],
            ["<b>Rojo</b>", "No hay ningún registro de ese día."],
            ["<b>Rayado</b>", "El sistema todavía no calculó ese día. <b>No</b> es lo mismo que un día sin registro."],
        ],
        anchos=[0.8, 4.2],
    )]
    f += [p(
        "Esa última distinción importa: pintar de rojo un día que el sistema no procesó sería "
        "mentir sobre el encargado."
    )]

    f += [h2("4.11. Mi informe")]
    f += [p(
        "Es la vista previa del informe mensual, armada con lo registrado hasta el momento. "
        "Se va llenando solo: el encargado no lo escribe, lo <b>revisa</b>."
    )]
    f += [p("Lo que sí escribe él son dos cosas:")]
    f += vinetas([
        "La <b>justificación de lo pendiente</b>, dentro del resumen de control.",
        "Las <b>recomendaciones y observaciones</b>, un texto libre para la administración.",
    ])
    f += [aviso(
        "Cuándo se puede enviar",
        "El botón <b>Enviar al Administrador</b> se habilita <b>a partir del día 1 del mes "
        "siguiente</b>, cuando el mes ya cerró. Antes de eso la pantalla dice desde qué fecha "
        "va a poder enviarse.<br/><br/>"
        "Una vez enviado, <b>el informe no se edita</b>. Si hace falta corregirlo, se genera una "
        "versión nueva que referencia a la anterior: así queda claro qué se corrigió y cuándo.",
    )]
    return f
