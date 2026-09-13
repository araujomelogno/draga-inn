"""
Estilos del manual del Edificio Draga Inn.
Verde inglés (British racing green) y blanco.
"""
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm

# ── Paleta ───────────────────────────────────────────────────────────────────
VERDE = colors.HexColor("#004225")     # British racing green
VERDE_OSC = colors.HexColor("#002615")
VERDE_MED = colors.HexColor("#0a5733")
VERDE_CLA = colors.HexColor("#7ab394")
VERDE_050 = colors.HexColor("#f0f7f3")
VERDE_100 = colors.HexColor("#dcece3")
BLANCO = colors.white
GRIS_TXT = colors.HexColor("#1b201e")
GRIS_SUA = colors.HexColor("#6d7873")
GRIS_BOR = colors.HexColor("#e3e7e5")
AMBAR = colors.HexColor("#e8a33d")
AMBAR_BG = colors.HexColor("#fff7e6")
AMBAR_TXT = colors.HexColor("#7a4f07")
ROJO = colors.HexColor("#c0392b")
ROJO_BG = colors.HexColor("#fdefee")
ROJO_TXT = colors.HexColor("#8c231a")

PAGINA = A4
MARGEN_IZQ = 2.4 * cm
MARGEN_DER = 2.0 * cm
MARGEN_SUP = 2.4 * cm
MARGEN_INF = 2.2 * cm
ANCHO_UTIL = PAGINA[0] - MARGEN_IZQ - MARGEN_DER


def estilos():
    s = getSampleStyleSheet()
    e = {}

    e["portada_titulo"] = ParagraphStyle(
        "portada_titulo", parent=s["Title"], fontName="Helvetica-Bold",
        fontSize=30, leading=35, textColor=BLANCO, alignment=TA_CENTER, spaceAfter=6,
    )
    e["portada_sub"] = ParagraphStyle(
        "portada_sub", parent=s["Normal"], fontName="Helvetica",
        fontSize=14, leading=20, textColor=VERDE_CLA, alignment=TA_CENTER,
    )
    e["portada_pie"] = ParagraphStyle(
        "portada_pie", parent=s["Normal"], fontName="Helvetica",
        fontSize=9.5, leading=15, textColor=VERDE_100, alignment=TA_CENTER,
    )

    e["parte"] = ParagraphStyle(
        "parte", parent=s["Title"], fontName="Helvetica-Bold",
        fontSize=24, leading=28, textColor=BLANCO, alignment=TA_LEFT,
    )
    e["parte_sub"] = ParagraphStyle(
        "parte_sub", parent=s["Normal"], fontName="Helvetica",
        fontSize=11.5, leading=17, textColor=VERDE_100, alignment=TA_LEFT,
    )

    e["h1"] = ParagraphStyle(
        "h1", parent=s["Heading1"], fontName="Helvetica-Bold",
        fontSize=18, leading=22, textColor=VERDE, spaceBefore=18, spaceAfter=9,
    )
    e["h2"] = ParagraphStyle(
        "h2", parent=s["Heading2"], fontName="Helvetica-Bold",
        fontSize=13.5, leading=17, textColor=VERDE_MED, spaceBefore=14, spaceAfter=6,
    )
    e["h3"] = ParagraphStyle(
        "h3", parent=s["Heading3"], fontName="Helvetica-Bold",
        fontSize=11, leading=14, textColor=VERDE_OSC, spaceBefore=10, spaceAfter=4,
    )

    e["cuerpo"] = ParagraphStyle(
        "cuerpo", parent=s["BodyText"], fontName="Helvetica",
        fontSize=9.7, leading=14.6, textColor=GRIS_TXT,
        alignment=TA_JUSTIFY, spaceAfter=7,
    )
    e["cuerpo_c"] = ParagraphStyle("cuerpo_c", parent=e["cuerpo"], alignment=TA_CENTER)
    e["lista"] = ParagraphStyle(
        "lista", parent=e["cuerpo"], leftIndent=14, bulletIndent=4, spaceAfter=3.5,
    )
    e["nota"] = ParagraphStyle(
        "nota", parent=e["cuerpo"], fontSize=9, leading=13.4,
        textColor=VERDE_OSC, leftIndent=10, rightIndent=8, spaceAfter=4, alignment=TA_LEFT,
    )
    e["codigo"] = ParagraphStyle(
        "codigo", parent=s["Code"], fontName="Courier",
        fontSize=8.1, leading=11.4, textColor=VERDE_OSC,
        leftIndent=8, rightIndent=6, spaceBefore=2, spaceAfter=2,
    )
    e["tabla_txt"] = ParagraphStyle(
        "tabla_txt", parent=s["Normal"], fontName="Helvetica",
        fontSize=8.4, leading=11.6, textColor=GRIS_TXT,
    )
    e["tabla_th"] = ParagraphStyle(
        "tabla_th", parent=s["Normal"], fontName="Helvetica-Bold",
        fontSize=8.4, leading=11.6, textColor=BLANCO,
    )
    e["tabla_mono"] = ParagraphStyle(
        "tabla_mono", parent=s["Normal"], fontName="Courier",
        fontSize=7.8, leading=11, textColor=VERDE_OSC,
    )
    e["indice"] = ParagraphStyle(
        "indice", parent=s["Normal"], fontName="Helvetica",
        fontSize=9.6, leading=16, textColor=GRIS_TXT,
    )
    e["indice_parte"] = ParagraphStyle(
        "indice_parte", parent=s["Normal"], fontName="Helvetica-Bold",
        fontSize=10.4, leading=19, textColor=VERDE, spaceBefore=8,
    )
    return e
