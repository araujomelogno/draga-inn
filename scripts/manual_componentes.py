"""Componentes reutilizables del manual: tablas, avisos, portada y pies."""
from reportlab.lib import colors
from reportlab.lib.units import cm, mm
from reportlab.platypus import (
    Flowable, KeepTogether, Paragraph, Spacer, Table, TableStyle,
)
from manual_estilo import (
    AMBAR, AMBAR_BG, AMBAR_TXT, ANCHO_UTIL, BLANCO, GRIS_BOR, GRIS_SUA, GRIS_TXT,
    MARGEN_IZQ, PAGINA, ROJO, ROJO_BG, ROJO_TXT, VERDE, VERDE_050, VERDE_100,
    VERDE_CLA, VERDE_MED, VERDE_OSC, estilos,
)

E = estilos()


def p(texto, estilo="cuerpo"):
    return Paragraph(texto, E[estilo])


def h1(texto):
    return Paragraph(texto, E["h1"])


def h2(texto):
    return Paragraph(texto, E["h2"])


def h3(texto):
    return Paragraph(texto, E["h3"])


def vs(alto=6):
    return Spacer(1, alto)


def vinetas(items, estilo="lista"):
    return [Paragraph(f"• {i}", E[estilo]) for i in items]


def numerada(items, estilo="lista"):
    return [Paragraph(f"<b>{n}.</b> {i}", E[estilo]) for n, i in enumerate(items, 1)]


def tabla(encabezados, filas, anchos=None, mono_col=None, zebra=True):
    """Tabla con encabezado en verde inglés y filas alternadas."""
    cols = len(encabezados)
    if anchos is None:
        anchos = [ANCHO_UTIL / cols] * cols
    else:
        total = sum(anchos)
        anchos = [ANCHO_UTIL * a / total for a in anchos]

    datos = [[Paragraph(str(h), E["tabla_th"]) for h in encabezados]]
    for fila in filas:
        celdas = []
        for i, c in enumerate(fila):
            est = "tabla_mono" if mono_col is not None and i in mono_col else "tabla_txt"
            celdas.append(Paragraph(str(c), E[est]))
        datos.append(celdas)

    estilo = [
        ("BACKGROUND", (0, 0), (-1, 0), VERDE),
        ("TEXTCOLOR", (0, 0), (-1, 0), BLANCO),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, GRIS_BOR),
        ("LINEBELOW", (0, 0), (-1, 0), 0, VERDE),
        ("BOX", (0, 0), (-1, -1), 0.5, GRIS_BOR),
    ]
    if zebra:
        for i in range(1, len(datos)):
            if i % 2 == 0:
                estilo.append(("BACKGROUND", (0, i), (-1, i), VERDE_050))

    t = Table(datos, colWidths=anchos, repeatRows=1, hAlign="LEFT")
    t.setStyle(TableStyle(estilo))
    return t


def aviso(titulo, cuerpo, tono="info"):
    """Recuadro destacado. `tono`: info | ambar | rojo | verde."""
    paleta = {
        "info": (VERDE_050, VERDE_CLA, VERDE_OSC),
        "verde": (VERDE_050, VERDE_MED, VERDE_OSC),
        "ambar": (AMBAR_BG, AMBAR, AMBAR_TXT),
        "rojo": (ROJO_BG, ROJO, ROJO_TXT),
    }
    fondo, borde, texto = paleta[tono]

    from reportlab.lib.styles import ParagraphStyle
    est_t = ParagraphStyle("av_t", parent=E["cuerpo"], fontName="Helvetica-Bold",
                           fontSize=9.6, leading=13, textColor=texto, spaceAfter=2)
    est_c = ParagraphStyle("av_c", parent=E["cuerpo"], fontSize=9.2, leading=13.4,
                           textColor=texto, spaceAfter=0)

    contenido = [Paragraph(titulo, est_t)] if titulo else []
    contenido.append(Paragraph(cuerpo, est_c))

    t = Table([[contenido]], colWidths=[ANCHO_UTIL], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), fondo),
        ("LINEBEFORE", (0, 0), (0, -1), 2.6, borde),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([vs(3), t, vs(7)])


def codigo(lineas, titulo=None):
    """Bloque de código monoespaciado sobre fondo verde muy claro."""
    from reportlab.lib.styles import ParagraphStyle
    est = ParagraphStyle("cod", parent=E["codigo"], spaceAfter=0, spaceBefore=0)
    cuerpo = [Paragraph(l.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                        .replace(" ", "&nbsp;") or "&nbsp;", est) for l in lineas]

    filas = []
    if titulo:
        est_t = ParagraphStyle("cod_t", parent=E["cuerpo"], fontName="Helvetica-Bold",
                               fontSize=8.4, textColor=VERDE_MED, spaceAfter=3)
        filas.append([Paragraph(titulo, est_t)])
    filas.append([cuerpo])

    t = Table(filas, colWidths=[ANCHO_UTIL], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), VERDE_050),
        ("BOX", (0, 0), (-1, -1), 0.5, VERDE_100),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return KeepTogether([vs(3), t, vs(8)])


class Regla(Flowable):
    """Línea horizontal fina."""
    def __init__(self, ancho=ANCHO_UTIL, grosor=0.7, color=VERDE_100):
        super().__init__()
        self.ancho, self.grosor, self.color = ancho, grosor, color
        self.height = grosor + 6

    def wrap(self, aw, ah):
        return (self.ancho, self.height)

    def draw(self):
        self.canv.setStrokeColor(self.color)
        self.canv.setLineWidth(self.grosor)
        self.canv.line(0, 3, self.ancho, 3)


class Logo(Flowable):
    """Marca del edificio dibujada a mano, sin depender de archivos externos."""
    def __init__(self, lado=34, sobre_verde=False):
        super().__init__()
        self.lado = lado
        self.sobre_verde = sobre_verde
        self.height = lado
        self.width = lado

    def wrap(self, aw, ah):
        return (self.lado, self.lado)

    def draw(self):
        c = self.canv
        L = self.lado
        r = L * 0.18
        c.setFillColor(BLANCO if self.sobre_verde else VERDE)
        c.roundRect(0, 0, L, L, r, stroke=0, fill=1)
        # "D" en contraste
        c.setFillColor(VERDE if self.sobre_verde else BLANCO)
        c.setFont("Helvetica-Bold", L * 0.58)
        c.drawCentredString(L * 0.42, L * 0.28, "D")
        c.setFillColor(VERDE_CLA if self.sobre_verde else VERDE_CLA)
        c.rect(L * 0.68, L * 0.24, L * 0.09, L * 0.52, stroke=0, fill=1)
