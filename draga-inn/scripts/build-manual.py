# -*- coding: utf-8 -*-
"""
Genera el manual completo del Sistema de Gestión y Gobernanza del Edificio
Draga Inn, en PDF, con portada, índice, encabezados y pies numerados.

    python3 scripts/build-manual.py
"""
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from reportlab.lib.units import cm
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    BaseDocTemplate, Frame, NextPageTemplate, PageBreak, PageTemplate,
    Paragraph, Spacer, Table, TableStyle,
)
from reportlab.platypus.tableofcontents import TableOfContents

from manual_estilo import (
    ANCHO_UTIL, BLANCO, GRIS_SUA, MARGEN_DER, MARGEN_INF, MARGEN_IZQ, MARGEN_SUP,
    PAGINA, VERDE, VERDE_100, VERDE_CLA, VERDE_MED, VERDE_OSC, estilos,
)
from manual_componentes import Logo, p, vs
from manual_contenido_a import parte_1, parte_2
from manual_contenido_b import parte_3, parte_4
from manual_contenido_c import parte_5, parte_6

E = estilos()
ANCHO, ALTO = PAGINA

TITULO = "Manual del Sistema de Gestión y Gobernanza"
EDIFICIO = "Edificio Draga Inn"
VERSION = "Versión 1.0"
FECHA = "13 de septiembre de 2026"

PARTES = [
    ("Parte I", "El sistema",
     "Qué resuelve, para quién, y cómo está construido.", parte_1),
    ("Parte II", "El día a día del encargado",
     "La aplicación del teléfono: planillas, tickets y cumplimiento, con y sin señal.", parte_2),
    ("Parte III", "La consola de administración",
     "Tablero, expedientes, contrataciones, documentos y auditoría.", parte_3),
    ("Parte IV", "El portal del propietario",
     "Qué ve quien no está, y qué avisos recibe.", parte_4),
    ("Parte V", "Operación del sistema",
     "Puesta en marcha, jobs programados, salud y privacidad.", parte_5),
    ("Parte VI", "Referencia",
     "Reglas de negocio, permisos, casos borde y glosario.", parte_6),
]


class Documento(BaseDocTemplate):
    """Lleva el registro de en qué parte y en qué capítulo va cada página."""

    def __init__(self, ruta, **kw):
        super().__init__(ruta, **kw)
        self.parte_actual = ""
        self.capitulo_actual = ""
        self.indice = []          # (nivel, texto, página)
        self.paginas_parte = {}   # nombre de parte → página donde arranca

    def handle_documentBegin(self):
        # multiBuild corre el documento varias veces; sin este reinicio, la
        # primera página de la segunda pasada hereda el encabezado de la última
        # página de la primera.
        super().handle_documentBegin()
        self.parte_actual = ""
        self.capitulo_actual = ""
        self.indice = []

    def afterFlowable(self, flowable):
        if not isinstance(flowable, Paragraph):
            return
        nombre = flowable.style.name
        texto = flowable.getPlainText()

        if nombre == "parte":
            self.parte_actual = texto
            self.capitulo_actual = ""
            self.indice.append((0, texto, self.page))
            self.notify("TOCEntry", (0, texto, self.page))
        elif nombre == "h1":
            self.capitulo_actual = texto
            self.indice.append((1, texto, self.page))
            self.notify("TOCEntry", (1, texto, self.page))
        elif nombre == "h2":
            self.indice.append((2, texto, self.page))
            self.notify("TOCEntry", (2, texto, self.page))


def _pie(canvas, doc):
    """Encabezado fino y pie con numeración. No se dibuja en portada ni portadillas."""
    canvas.saveState()

    # Encabezado: parte a la izquierda, capítulo a la derecha
    if doc.parte_actual:
        canvas.setFont("Helvetica", 7.6)
        canvas.setFillColor(GRIS_SUA)
        canvas.drawString(MARGEN_IZQ, ALTO - MARGEN_SUP + 0.62 * cm, doc.parte_actual.upper())
        if doc.capitulo_actual:
            texto = doc.capitulo_actual
            if len(texto) > 58:
                texto = texto[:55] + "…"
            canvas.drawRightString(ANCHO - MARGEN_DER, ALTO - MARGEN_SUP + 0.62 * cm, texto)
        canvas.setStrokeColor(VERDE_100)
        canvas.setLineWidth(0.5)
        canvas.line(MARGEN_IZQ, ALTO - MARGEN_SUP + 0.42 * cm,
                    ANCHO - MARGEN_DER, ALTO - MARGEN_SUP + 0.42 * cm)

    # Pie
    canvas.setStrokeColor(VERDE_100)
    canvas.setLineWidth(0.5)
    canvas.line(MARGEN_IZQ, MARGEN_INF - 0.55 * cm, ANCHO - MARGEN_DER, MARGEN_INF - 0.55 * cm)

    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(GRIS_SUA)
    canvas.drawString(MARGEN_IZQ, MARGEN_INF - 1.05 * cm, f"{EDIFICIO} · {VERSION}")

    canvas.setFont("Helvetica-Bold", 8.6)
    canvas.setFillColor(VERDE)
    canvas.drawRightString(ANCHO - MARGEN_DER, MARGEN_INF - 1.05 * cm, str(doc.page))

    canvas.restoreState()


def _portada(canvas, doc):
    """Portada a sangre, en verde inglés."""
    canvas.saveState()
    canvas.setFillColor(VERDE)
    canvas.rect(0, 0, ANCHO, ALTO, stroke=0, fill=1)

    # Banda inferior más oscura
    canvas.setFillColor(VERDE_OSC)
    canvas.rect(0, 0, ANCHO, 3.6 * cm, stroke=0, fill=1)

    # Filete decorativo
    canvas.setStrokeColor(VERDE_CLA)
    canvas.setLineWidth(1.2)
    canvas.line(MARGEN_IZQ, ALTO - 9.4 * cm, ANCHO - MARGEN_DER, ALTO - 9.4 * cm)
    canvas.restoreState()


def _banda_portadilla(canvas, doc):
    """Banda verde de la portadilla. Va al ABRIR la página, detrás del texto."""
    canvas.saveState()
    canvas.setFillColor(VERDE)
    canvas.rect(0, ALTO - 11.5 * cm, ANCHO, 11.5 * cm, stroke=0, fill=1)
    canvas.setStrokeColor(VERDE_CLA)
    canvas.setLineWidth(1.0)
    canvas.line(MARGEN_IZQ, ALTO - 7.35 * cm, MARGEN_IZQ + 4.2 * cm, ALTO - 7.35 * cm)
    canvas.restoreState()


def _portadilla(canvas, doc):
    """Numeración de la portadilla. Va al CERRAR la página."""
    _pie(canvas, doc)


def construir(destino):
    doc = Documento(
        destino, pagesize=PAGINA,
        leftMargin=MARGEN_IZQ, rightMargin=MARGEN_DER,
        topMargin=MARGEN_SUP, bottomMargin=MARGEN_INF,
        title=f"{TITULO} — {EDIFICIO}",
        author="Edificio Draga Inn",
        subject="Manual técnico y de usuario, versión 1",
        creator="Sistema de Gestión y Gobernanza — Draga Inn",
    )

    marco = Frame(MARGEN_IZQ, MARGEN_INF, ANCHO_UTIL,
                  ALTO - MARGEN_SUP - MARGEN_INF, id="cuerpo")
    marco_portada = Frame(MARGEN_IZQ, MARGEN_INF + 3.8 * cm, ANCHO_UTIL,
                          ALTO - MARGEN_SUP - MARGEN_INF - 4.2 * cm, id="portada")
    marco_portadilla = Frame(MARGEN_IZQ, MARGEN_INF, ANCHO_UTIL,
                             ALTO - MARGEN_SUP - MARGEN_INF, id="portadilla")

    doc.addPageTemplates([
        PageTemplate(id="portada", frames=[marco_portada], onPage=_portada),
        PageTemplate(id="cuerpo", frames=[marco], onPageEnd=_pie),
        PageTemplate(id="portadilla", frames=[marco_portadilla],
                     onPage=_banda_portadilla, onPageEnd=_portadilla),
    ])

    h = []

    # ── Portada ──────────────────────────────────────────────────────────────
    h += [Spacer(1, 3.2 * cm), Logo(lado=54, sobre_verde=True), Spacer(1, 1.5 * cm)]
    h += [Paragraph(TITULO, E["portada_titulo"])]
    h += [Spacer(1, 0.5 * cm)]
    h += [Paragraph(EDIFICIO, E["portada_sub"])]
    h += [Paragraph("Punta del Este · Maldonado · Uruguay", E["portada_sub"])]
    h += [Spacer(1, 5.2 * cm)]
    h += [Paragraph(
        "Manual técnico y de usuario<br/>"
        f"{VERSION} · {FECHA}",
        E["portada_pie"])]
    h += [Spacer(1, 0.8 * cm)]
    h += [Paragraph(
        "Documento de referencia del v1. Complementa la especificación funcional, "
        "el hand-off técnico y el registro de decisiones de diseño.",
        E["portada_pie"])]
    h += [NextPageTemplate("cuerpo"), PageBreak()]

    # ── Nota preliminar ──────────────────────────────────────────────────────
    h += [Paragraph("Sobre este manual", E["h1"])]
    h += [p(
        "Este manual reúne en un solo lugar todo lo necesario para usar, administrar y mantener "
        "el sistema. Está organizado en seis partes que se pueden leer por separado."
    )]
    h += [_tabla_partes()]
    h += [vs(10)]
    h += [p(
        "Las <b>partes I y II</b> alcanzan para el encargado. Las <b>partes I, III y IV</b>, para "
        "la administración y la comisión. Las <b>partes V y VI</b> son para quien mantenga el "
        "sistema."
    )]
    h += [p(
        "Todo el texto está en español rioplatense. Las fechas van en formato "
        "<font face='Courier'>dd/mm/aaaa</font>, los montos como "
        "<font face='Courier'>$ 1.234,56</font>, la hora en formato de 24 horas, y todos los "
        "cálculos usan la zona horaria <font face='Courier'>America/Montevideo</font>."
    )]
    h += [vs(6)]
    h += [p(
        "<b>Dónde está la verdad.</b> Si algo de este manual contradice a la especificación "
        "funcional, manda la especificación: ese documento es la fuente de verdad del "
        "comportamiento del sistema. Este manual lo explica; no lo reemplaza.", "nota"
    )]
    h += [PageBreak()]

    # ── Índice (se rellena en la segunda pasada) ─────────────────────────────
    h += [Paragraph("Índice", E["h1"])]
    h += [_indice()]
    # Sin PageBreak: cada parte abre con el suyo, y uno acá dejaría una página en blanco.

    # ── Las seis partes ──────────────────────────────────────────────────────
    for etiqueta, titulo, bajada, generador in PARTES:
        # Una sola portadilla y después el cuerpo. Pasar una LISTA a
        # NextPageTemplate crea un ciclo que vuelve a la portadilla cada dos
        # páginas, y la banda verde termina tapando el contenido.
        h += [NextPageTemplate("portadilla"), PageBreak()]
        h += [Spacer(1, 1.6 * cm)]
        h += [Paragraph(etiqueta, E["parte_sub"])]
        h += [Spacer(1, 0.25 * cm)]
        h += [Paragraph(titulo, E["parte"])]
        h += [Spacer(1, 0.9 * cm)]
        h += [Paragraph(bajada, E["parte_sub"])]
        h += [NextPageTemplate("cuerpo"), PageBreak()]
        h += generador()

    # Se construye dos veces: la primera junta el índice, la segunda lo imprime.
    doc.multiBuild(h)
    return doc


def _tabla_partes():
    filas = [[f"<b>{e}</b>", f"<b>{t}</b><br/>{b}"] for e, t, b, _ in PARTES]
    datos = [[Paragraph(c, E["tabla_txt"]) for c in fila] for fila in filas]
    t = Table(datos, colWidths=[ANCHO_UTIL * 0.16, ANCHO_UTIL * 0.84], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, VERDE_100),
        ("TEXTCOLOR", (0, 0), (0, -1), VERDE_MED),
    ]))
    return t


def _indice():
    """Índice con puntos guía. ReportLab lo completa en la segunda pasada."""
    toc = TableOfContents()
    toc.dotsMinLevel = 0
    toc.levelStyles = [
        ParagraphStyle(
            "toc0", fontName="Helvetica-Bold", fontSize=10.6, leading=20,
            textColor=VERDE, spaceBefore=10, leftIndent=0, firstLineIndent=0,
        ),
        ParagraphStyle(
            "toc1", fontName="Helvetica", fontSize=9.6, leading=15.5,
            textColor=VERDE_OSC, leftIndent=12, firstLineIndent=-2,
        ),
        ParagraphStyle(
            "toc2", fontName="Helvetica", fontSize=8.8, leading=13.5,
            textColor=GRIS_SUA, leftIndent=28, firstLineIndent=-2,
        ),
    ]
    return toc


if __name__ == "__main__":
    salida = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "draga-inn", "docs", "manual", "Manual_Draga_Inn_v1.pdf",
    )
    os.makedirs(os.path.dirname(salida), exist_ok=True)
    doc = construir(salida)
    tam = os.path.getsize(salida) / 1024
    print(f"✔ {salida}")
    print(f"  {doc.page} páginas · {tam:.0f} KB · {len(doc.indice)} entradas de índice")
