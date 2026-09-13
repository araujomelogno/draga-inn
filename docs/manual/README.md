# Manual del sistema

**[`Manual_Draga_Inn_v1.pdf`](Manual_Draga_Inn_v1.pdf)** — 38 páginas, en español rioplatense.

Reúne en un solo documento todo lo necesario para usar, administrar y mantener el
sistema. Está organizado en seis partes que se pueden leer por separado:

| Parte | Contenido | Para quién |
|---|---|---|
| **I** · El sistema | Qué resuelve, los conceptos, cómo está construido | Todos |
| **II** · El día a día del encargado | La aplicación del teléfono, con y sin señal | Encargado |
| **III** · La consola de administración | Tablero, expedientes, contrataciones, auditoría | Administración y comisión |
| **IV** · El portal del propietario | Qué ve quien no está, y qué avisos recibe | Propietarios |
| **V** · Operación del sistema | Puesta en marcha, jobs, salud, privacidad | Quien mantenga el sistema |
| **VI** · Referencia | Las 52 reglas, permisos, casos borde, glosario | Consulta |

## Regenerarlo

```bash
pip install -r scripts/requirements.txt
pnpm docs:manual
```

El PDF se arma desde `scripts/`:

| Archivo | Qué tiene |
|---|---|
| `manual_estilo.py` | Paleta (verde inglés `#004225`) y estilos tipográficos |
| `manual_componentes.py` | Tablas, avisos, bloques de código, marca |
| `manual_contenido_a.py` | Partes I y II |
| `manual_contenido_b.py` | Partes III y IV |
| `manual_contenido_c.py` | Partes V y VI |
| `build-manual.py` | Portada, índice, encabezados y ensamblado |

> Si el manual contradice a `ESPEC_FUNCIONAL_v1_Draga_Inn.md`, manda la
> especificación: ese documento es la fuente de verdad del comportamiento.
