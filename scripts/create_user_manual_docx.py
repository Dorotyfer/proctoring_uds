from pathlib import Path

from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "manuals" / "Manual_de_implementacion_y_uso_Proctoring_UDS.docx"

NAVY = "17365D"
BLUE = "2E74B5"
DARK_BLUE = "1F4D78"
LIGHT_BLUE = "E8EEF5"
LIGHT_GRAY = "F2F4F7"
PALE_YELLOW = "FFF4CE"
PALE_RED = "FDE9E7"
MUTED = "5D6675"
INK = "172033"


def set_font(run, name="Calibri", size=None, bold=None, italic=None, color=None):
  run.font.name = name
  properties = run._element.get_or_add_rPr()
  properties.rFonts.set(qn("w:ascii"), name)
  properties.rFonts.set(qn("w:hAnsi"), name)
  if size is not None:
    run.font.size = Pt(size)
  if bold is not None:
    run.bold = bold
  if italic is not None:
    run.italic = italic
  if color is not None:
    run.font.color.rgb = RGBColor.from_string(color)


def set_cell_margins(cell):
  properties = cell._tc.get_or_add_tcPr()
  margins = properties.find(qn("w:tcMar"))
  if margins is None:
    margins = OxmlElement("w:tcMar")
    properties.append(margins)
  for name, value in (("top", 80), ("bottom", 80), ("start", 120), ("end", 120)):
    node = margins.find(qn(f"w:{name}"))
    if node is None:
      node = OxmlElement(f"w:{name}")
      margins.append(node)
    node.set(qn("w:w"), str(value))
    node.set(qn("w:type"), "dxa")


def shade_cell(cell, fill):
  properties = cell._tc.get_or_add_tcPr()
  shading = properties.find(qn("w:shd"))
  if shading is None:
    shading = OxmlElement("w:shd")
    properties.append(shading)
  shading.set(qn("w:fill"), fill)


def shade_paragraph(paragraph, fill):
  properties = paragraph._p.get_or_add_pPr()
  shading = properties.find(qn("w:shd"))
  if shading is None:
    shading = OxmlElement("w:shd")
    properties.append(shading)
  shading.set(qn("w:fill"), fill)


def set_table_geometry(table, widths):
  table.alignment = WD_TABLE_ALIGNMENT.LEFT
  table.autofit = False
  properties = table._tbl.tblPr
  width = properties.find(qn("w:tblW"))
  if width is None:
    width = OxmlElement("w:tblW")
    properties.append(width)
  width.set(qn("w:w"), str(sum(widths)))
  width.set(qn("w:type"), "dxa")
  indent = properties.find(qn("w:tblInd"))
  if indent is None:
    indent = OxmlElement("w:tblInd")
    properties.append(indent)
  indent.set(qn("w:w"), "120")
  indent.set(qn("w:type"), "dxa")
  grid = table._tbl.tblGrid
  for child in list(grid):
    grid.remove(child)
  for value in widths:
    column = OxmlElement("w:gridCol")
    column.set(qn("w:w"), str(value))
    grid.append(column)
  for row in table.rows:
    for index, cell in enumerate(row.cells):
      cell.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
      set_cell_margins(cell)
      cell_width = cell._tc.get_or_add_tcPr().find(qn("w:tcW"))
      if cell_width is None:
        cell_width = OxmlElement("w:tcW")
        cell._tc.get_or_add_tcPr().append(cell_width)
      cell_width.set(qn("w:w"), str(widths[index]))
      cell_width.set(qn("w:type"), "dxa")


def configure_styles(document):
  normal = document.styles["Normal"]
  normal.font.name = "Calibri"
  normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
  normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
  normal.font.size = Pt(11)
  normal.font.color.rgb = RGBColor.from_string(INK)
  normal.paragraph_format.space_before = Pt(0)
  normal.paragraph_format.space_after = Pt(6)
  normal.paragraph_format.line_spacing = 1.25
  for name, size, color, before, after in (
    ("Heading 1", 16, BLUE, 18, 10),
    ("Heading 2", 13, BLUE, 14, 7),
    ("Heading 3", 12, DARK_BLUE, 10, 5),
  ):
    style = document.styles[name]
    style.font.name = "Calibri"
    style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    style.font.size = Pt(size)
    style.font.bold = True
    style.font.color.rgb = RGBColor.from_string(color)
    style.paragraph_format.space_before = Pt(before)
    style.paragraph_format.space_after = Pt(after)
    style.paragraph_format.keep_with_next = True
  for name in ("List Bullet", "List Number"):
    style = document.styles[name]
    style.font.name = "Calibri"
    style.font.size = Pt(11)
    style.paragraph_format.left_indent = Inches(0.375)
    style.paragraph_format.first_line_indent = Inches(-0.188)
    style.paragraph_format.space_after = Pt(4)
    style.paragraph_format.line_spacing = 1.25
  code = document.styles.add_style("Code Block", 1)
  code.font.name = "Consolas"
  code._element.rPr.rFonts.set(qn("w:ascii"), "Consolas")
  code._element.rPr.rFonts.set(qn("w:hAnsi"), "Consolas")
  code.font.size = Pt(8.5)
  code.paragraph_format.space_after = Pt(2)
  code.paragraph_format.line_spacing = 1.0


def add_page_number(paragraph):
  paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT
  run = paragraph.add_run("Pagina ")
  set_font(run, size=9, color=MUTED)
  begin = OxmlElement("w:fldChar")
  begin.set(qn("w:fldCharType"), "begin")
  instruction = OxmlElement("w:instrText")
  instruction.set(qn("xml:space"), "preserve")
  instruction.text = " PAGE "
  separate = OxmlElement("w:fldChar")
  separate.set(qn("w:fldCharType"), "separate")
  end = OxmlElement("w:fldChar")
  end.set(qn("w:fldCharType"), "end")
  run._r.extend([begin, instruction, separate, end])


def configure_sections(document):
  for section in document.sections:
    section.page_width = Inches(8.5)
    section.page_height = Inches(11)
    section.top_margin = Inches(1)
    section.right_margin = Inches(1)
    section.bottom_margin = Inches(1)
    section.left_margin = Inches(1)
    section.header_distance = Inches(0.492)
    section.footer_distance = Inches(0.492)
    header = section.header.paragraphs[0]
    set_font(header.add_run("PROCTORING UDS  |  GUIA DE IMPLEMENTACION Y OPERACION"), size=8.5, bold=True, color=MUTED)
    add_page_number(section.footer.paragraphs[0])


def add_cover(document):
  for _ in range(6):
    document.add_paragraph()
  kicker = document.add_paragraph()
  kicker.alignment = WD_ALIGN_PARAGRAPH.CENTER
  kicker.paragraph_format.space_after = Pt(18)
  set_font(kicker.add_run("GUIA OPERATIVA"), size=10, bold=True, color=BLUE)
  title = document.add_paragraph()
  title.alignment = WD_ALIGN_PARAGRAPH.CENTER
  title.paragraph_format.space_after = Pt(10)
  set_font(title.add_run("Proctoring UDS"), size=30, bold=True, color=NAVY)
  subtitle = document.add_paragraph()
  subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
  subtitle.paragraph_format.space_after = Pt(28)
  set_font(subtitle.add_run("FastAPI, Moodle SSO y vision artificial en servidor"), size=15, color=DARK_BLUE)
  summary = document.add_paragraph()
  summary.alignment = WD_ALIGN_PARAGRAPH.CENTER
  set_font(summary.add_run("Instalacion, seguridad, uso academico, operacion y aceptacion"), size=11, italic=True, color=MUTED)
  for _ in range(7):
    document.add_paragraph()
  version = document.add_paragraph()
  version.alignment = WD_ALIGN_PARAGRAPH.CENTER
  set_font(version.add_run("Version 2.0 | Python 3.12 | Ubuntu"), size=10, bold=True, color=NAVY)
  document.add_page_break()


def paragraph(document, text):
  item = document.add_paragraph()
  set_font(item.add_run(text))


def bullets(document, items):
  for text in items:
    item = document.add_paragraph(style="List Bullet")
    set_font(item.add_run(text))


def create_numbering_instance(document, style_name):
  numbering = document.part.numbering_part.element
  style = document.styles[style_name]
  source_id = str(style._element.pPr.numPr.numId.val)
  source = next(
    node for node in numbering.findall(qn("w:num"))
    if node.get(qn("w:numId")) == source_id
  )
  abstract_id = source.find(qn("w:abstractNumId")).get(qn("w:val"))
  existing = [int(node.get(qn("w:numId"))) for node in numbering.findall(qn("w:num"))]
  new_id = max(existing, default=0) + 1
  instance = OxmlElement("w:num")
  instance.set(qn("w:numId"), str(new_id))
  abstract = OxmlElement("w:abstractNumId")
  abstract.set(qn("w:val"), abstract_id)
  instance.append(abstract)
  level_override = OxmlElement("w:lvlOverride")
  level_override.set(qn("w:ilvl"), "0")
  start_override = OxmlElement("w:startOverride")
  start_override.set(qn("w:val"), "1")
  level_override.append(start_override)
  instance.append(level_override)
  numbering.append(instance)
  return new_id


def steps(document, items):
  numbering_id = create_numbering_instance(document, "List Number")
  for text in items:
    item = document.add_paragraph(style="List Number")
    properties = item._p.get_or_add_pPr()
    numbering = properties.get_or_add_numPr()
    numbering.get_or_add_ilvl().val = 0
    numbering.get_or_add_numId().val = numbering_id
    set_font(item.add_run(text))


def code_block(document, text):
  target = document.add_paragraph()
  target.style = document.styles["Code Block"]
  target.paragraph_format.left_indent = Inches(0.08)
  target.paragraph_format.right_indent = Inches(0.08)
  target.paragraph_format.space_before = Pt(4)
  target.paragraph_format.space_after = Pt(8)
  target.paragraph_format.keep_together = True
  shade_paragraph(target, LIGHT_GRAY)
  for index, line in enumerate(text.strip().splitlines()):
    if index:
      target.add_run().add_break()
    set_font(target.add_run(line), name="Consolas", size=8.5, color=INK)


def callout(document, label, text, kind="info"):
  fill = {"info": LIGHT_BLUE, "warning": PALE_YELLOW, "danger": PALE_RED}[kind]
  body = document.add_paragraph()
  body.paragraph_format.left_indent = Inches(0.08)
  body.paragraph_format.right_indent = Inches(0.08)
  body.paragraph_format.space_before = Pt(4)
  body.paragraph_format.space_after = Pt(8)
  body.paragraph_format.keep_together = True
  shade_paragraph(body, fill)
  set_font(body.add_run(f"{label}: "), bold=True, color=NAVY)
  set_font(body.add_run(text), color=INK)


def data_table(document, headers, rows, widths):
  table = document.add_table(rows=1, cols=len(headers))
  marker = OxmlElement("w:tblHeader")
  marker.set(qn("w:val"), "1")
  table.rows[0]._tr.get_or_add_trPr().append(marker)
  for index, header in enumerate(headers):
    cell = table.rows[0].cells[index]
    shade_cell(cell, LIGHT_BLUE)
    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
    set_font(cell.paragraphs[0].add_run(header), size=9.5, bold=True, color=NAVY)
  for row in rows:
    cells = table.add_row().cells
    for index, value in enumerate(row):
      cells[index].paragraphs[0].paragraph_format.space_after = Pt(0)
      set_font(cells[index].paragraphs[0].add_run(str(value)), size=9.5)
  set_table_geometry(table, widths)
  document.add_paragraph().paragraph_format.space_after = Pt(2)


def section(document, title, intro, items=None, commands=None, table=None, note=None):
  document.add_heading(title, level=1)
  paragraph(document, intro)
  if items:
    bullets(document, items)
  if commands:
    code_block(document, commands)
  if table:
    data_table(document, *table)
  if note:
    callout(document, *note)


def build_document():
  document = Document()
  configure_styles(document)
  configure_sections(document)
  add_cover(document)

  document.add_heading("Control del documento", level=1)
  data_table(document, ["Campo", "Valor"], [
    ("Version", "2.0"),
    ("Audiencia", "Administradores Ubuntu y Moodle, docentes, gestores, revisores y soporte"),
    ("Plataforma", "Python 3.12, FastAPI, MariaDB, S3/MinIO, Moodle y Apache"),
    ("Procesamiento", "SFace/YuNet/FasNet y SSDLite en workers del servidor"),
    ("Despliegue", "Ubuntu sin Docker y sin toolchain Node"),
  ], [2700, 6660])
  callout(document, "Separacion", "Moodle conserva identidad, cursos, intentos y calificaciones. Proctoring conserva sesiones, trabajos, perfiles, alertas y evidencia. Ninguna inferencia modifica el intento ni la nota.")

  document.add_heading("Contenido", level=1)
  bullets(document, [
    "1. Alcance y limites", "2. Arquitectura", "3. Requisitos y capacidad", "4. Instalacion Ubuntu",
    "5. Configuracion segura", "6. Modelos e inferencia", "7. Apache y servicios", "8. Moodle",
    "9. Estudiante", "10. Panel", "11. Evidencia y retencion", "12. Operacion y rollback",
    "13. Pruebas y aceptacion", "14. Diagnostico", "15. Puesta en marcha",
  ])
  document.add_page_break()

  section(document, "1. Alcance y limites",
    "FastAPI sirve la API, la preparacion y el panel. Workers Python procesan capturas cifradas en S3/MinIO y coordinadas por una cola durable MariaDB.", [
      "No se graba video continuo ni se conservan frames normales despues de procesarlos.",
      "No se infieren emociones ni estados psicologicos.",
      "No se ejecuta vision artificial en el navegador.",
      "No se guardan JPEG como BLOB en MariaDB ni en disco local.",
      "No se cambian intentos, respuestas o calificaciones por una alerta.",
      "Panel y evidencia se limitan por capacidades y cursos emitidos desde Moodle SSO.",
    ])

  section(document, "2. Arquitectura", "Apache es el unico punto publico y Uvicorn escucha solo en loopback.", commands="""
Navegador -- HTTPS --> Apache --> /proctoring/ y /proctoring-api/ --> FastAPI
Moodle -- JWT/clave interna --> FastAPI --> MariaDB (sesiones, cola, auditoria)
                                     `--> S3/MinIO privado (AES-256-GCM)
systemd --> proctoring-api
        --> proctoring-worker --> SFace/YuNet/FasNet + SSDLite
        --> timers de infraestructura, staging y retencion
""", table=(["Componente", "Responsabilidad"], [
    ("API", "Contratos Moodle, SSO, paginas, recepcion y polling; sin inferencia pesada."),
    ("Worker", "Leases MariaDB, descifrado en memoria, modelos y efectos."),
    ("MariaDB", "Sesiones, permisos, cola, perfiles cifrados, resultados y auditoria."),
    ("S3/MinIO", "Staging cifrado y evidencia privada."),
    ("Moodle", "Politicas, cursos, permisos, intentos y SSO."),
  ], [2200, 7160]))

  section(document, "3. Requisitos y capacidad", "El benchmark debe ejecutarse en el hardware Ubuntu de destino.", [
    "Python 3.12, Apache 2.4, MariaDB y acceso privado a S3/MinIO.",
    "Moodle institucional compatible con los plugins entregados.",
    "HTTPS valido y DNS para Moodle y proctoring.",
    "Pesos aprobados YuNet, SFace, FasNet y SSDLite con SHA-256 reales.",
    "Cuenta S3 de minimo privilegio y bucket sin acceso publico.",
    "Workers = ceil(15 / rendimiento_mixto_por_worker), reservando 30% de RAM.",
  ], note=("Gate", "Si un nodo no sostiene 10 frames/s mas 50% de margen, agregue otro nodo; no reduzca frecuencia ni precision.", "warning"))

  document.add_heading("4. Instalacion Ubuntu", level=1)
  paragraph(document, "Use releases inmutables. El instalador verifica modelos, crea el venv, aplica migraciones aditivas, comprueba infraestructura y cambia el symlink de forma atomica.")
  steps(document, [
    "Cree una base y usuario MariaDB separados de Moodle.",
    "Prepare un bucket privado y una identidad de servicio exclusiva.",
    "Copie el release Python-only y los pesos aprobados a fuentes locales.",
    "Instale /etc/proctoring/proctoring.env como root:proctoring con modo 0640.",
    "Ejecute el instalador y confirme servicios, timers y readiness.",
  ])
  code_block(document, """
sudo install -d -m 0750 -o root -g proctoring /etc/proctoring
sudo install -m 0640 -o root -g proctoring proctoring.env /etc/proctoring/proctoring.env
sudo bash scripts/install-ubuntu.sh /ruta/release /ruta/modelos-offline
""")
  callout(document, "Minimo privilegio", "No reutilice la base, usuario o secretos de Moodle. MariaDB y S3 deben permanecer fuera de Internet.", "danger")

  section(document, "5. Configuracion segura", "Los secretos permanecen en el EnvironmentFile del servidor, nunca en el repositorio.", [
    "Use claves distintas para integracion Moodle, JWT, SSO, evidencia y biometria.",
    "Mantenga API_HOST=127.0.0.1 y configure origenes exactos sin CORS comodin.",
    "Conserve claves antiguas mientras existan objetos cifrados con ellas.",
    "No habilite INFERENCE_REQUESTED antes de verificar pesos y hashes.",
  ], table=(["Grupo", "Variables"], [
    ("Identidad", "MOODLE_INTEGRATION_KEY, JWT_SECRET, PANEL_SSO_SECRET"),
    ("Cifrado", "EVIDENCE_ENCRYPTION_KEY, BIOMETRIC_ENCRYPTION_KEY"),
    ("Datos", "DATABASE_URL y variables S3"),
    ("Origenes", "WEB_ORIGIN, MOODLE_ORIGIN, API_PUBLIC_URL, PANEL_URL"),
    ("Modelos", "MODEL_MANIFEST_PATH, INFERENCE_REQUESTED y umbrales"),
  ], [2200, 7160]))

  section(document, "6. Modelos e inferencia", "Los modelos se instalan fuera de linea. El arranque verifica archivos y hashes; nunca descarga pesos.", commands="""
sudo -u proctoring /opt/proctoring/current/.venv/bin/proctoring-models verify \
  --manifest /etc/proctoring/model-weights.json
sudo -u proctoring /opt/proctoring/current/.venv/bin/proctoring-benchmark
""", table=(["Analisis", "Regla"], [
    ("Identidad", "SFace con YuNet, coseno y umbral registrado por check."),
    ("Liveness", "FasNet valido en tres capturas y centro-giro-centro en servidor."),
    ("Entorno", "SSDLite para persona, telefono, laptop, tv y libro."),
    ("Confirmacion", "Alerta cuando aparece en al menos dos de tres frames."),
  ], [2200, 7160]))

  section(document, "7. Apache y servicios", "Los archivos de deploy incluyen API, worker y timers separados y endurecidos.", [
    "Apache elimina /proctoring/ y /proctoring-api/ antes de enviar a Uvicorn.",
    "No existe /_next/ ni una aplicacion web separada.",
    "El access log omite query strings y Referer para no registrar tokens.",
    "FastAPI conserva CSP por pagina, frame-ancestors, Permissions-Policy y no-store.",
    "Los timers ejecutan check-infra, purge-staging y purge de evidencia.",
  ], commands="""
sudo install -m 0644 deploy/apache/proctoring.conf /etc/apache2/conf-available/proctoring.conf
sudo apache2ctl configtest
sudo systemctl daemon-reload
sudo systemctl enable --now proctoring-api proctoring-worker
""")

  document.add_heading("8. Integracion Moodle", level=1)
  steps(document, [
    "Instale local_proctoring y despues quizaccess_proctoring desde los ZIP.",
    "Ejecute admin/cli/upgrade.php y purgue caches.",
    "Configure API interna, clave de integracion, URL del panel y secreto SSO.",
    "Asigne capacidades de panel, revision y evidencia por rol.",
    "En cada cuestionario seleccione modalidad y failurePolicy.",
  ])
  data_table(document, ["Politica", "Comportamiento"], [
    ("block", "Mantiene la sesion pendiente; valor seguro por defecto."),
    ("allow_with_alert", "Activa con alerta tecnica si la inferencia no esta disponible."),
  ], [2500, 6860])
  callout(document, "SSO", "FastAPI intercambia el JWT Moodle por cookie HttpOnly, Secure y SameSite=Lax de 30 minutos. Las mutaciones requieren CSRF.")

  document.add_heading("9. Flujo del estudiante", level=1)
  steps(document, [
    "Abra el intento desde Moodle y permita la camara.",
    "Lea y acepte el consentimiento aplicable.",
    "Complete tres capturas: centro, giro indicado y centro.",
    "Espere el analisis; el navegador no decide identidad ni liveness.",
    "Mantenga la pagina abierta durante el intento para frames periodicos y estado.",
    "Ante desconexion, los eventos tecnicos se reintentan; las imagenes no van a IndexedDB.",
  ])
  paragraph(document, "Los frames normales se eliminan al procesarse. Solo se conserva evidencia de intervalo o asociada a alertas segun la retencion.")

  document.add_heading("10. Panel de docentes y gestores", level=1)
  steps(document, [
    "Abra Proctoring review desde Moodle para emitir un SSO con cursos vigentes.",
    "Filtre cursos y sesiones dentro del alcance autorizado.",
    "Revise cronologia, disponibilidad y alertas antes de decidir.",
    "Abra evidencia solo con permiso biometrico; cada acceso queda auditado.",
    "Registre una decision humana objetiva y cierre la sesion del panel.",
  ])
  callout(document, "Aislamiento", "Cambiar UUID, curso o URL no amplia permisos. Toda consulta se autoriza de nuevo contra alcance SQL por curso.", "danger")

  section(document, "11. Evidencia, privacidad y retencion", "JPEG y descriptores se cifran antes de persistir.", [
    "Cada JPEG usa AES-256-GCM antes de subir a S3/MinIO.",
    "Los descriptores SFace float32 se versionan y cifran; no aparecen en respuestas o logs.",
    "Los perfiles Human legacy quedan intactos y revocados para rollback, sin descifrarlos.",
    "La purga de staging elimina solo objetos vencidos sin referencia durable.",
    "La retencion elimina objetos y registra auditoria.",
  ], commands="""
sudo -u proctoring /opt/proctoring/current/.venv/bin/proctoring-purge-staging
sudo -u proctoring /opt/proctoring/current/.venv/bin/proctoring-purge
""")

  section(document, "12. Operacion y rollback", "Revise servicios, readiness, timers, cola y almacenamiento antes de habilitar examenes.", commands="""
systemctl status proctoring-api proctoring-worker
systemctl list-timers 'proctoring-*'
curl -fsS http://127.0.0.1:8000/health/ready
journalctl -u proctoring-worker -n 200 --no-pager
sudo bash scripts/rollback-ubuntu.sh /opt/proctoring/releases/RELEASE_ANTERIOR
""", note=("Rollback", "Las migraciones son aditivas. Conserve el release anterior siete dias y verifique hashes antes de reiniciar workers.", "warning"))

  section(document, "13. Pruebas y aceptacion", "La aceptacion real se ejecuta en Ubuntu con MariaDB, S3 y pesos aprobados.", commands="""
cd /opt/proctoring/current/apps/api
.venv/bin/python -m pytest
proctoring-check-infra
proctoring-fixtures
proctoring-load
""", table=(["Metrica", "Criterio"], [
    ("Capacidad", "10 frames/s mas 50% de margen"),
    ("API", "p95 <= 500 ms"),
    ("Preparacion", "p95 <= 20 s"),
    ("Cola", "p95 <= 15 s y p99 <= 30 s"),
    ("Durabilidad", "cero trabajos perdidos; reintentos < 1%"),
    ("Autorizacion", "cero acceso cruzado entre cursos"),
    ("Moodle", "ninguna mutacion de intento o calificacion"),
  ], [2700, 6660]), note=("Carga", "Use 1.000 perfiles y 100 sesiones concurrentes durante una hora. El CLI por si solo no demuestra el SLA.", "warning"))

  document.add_page_break()
  section(document, "14. Diagnostico", "Use identificadores tecnicos y mensajes sanitizados; no copie secretos o evidencia a tickets.", table=(["Sintoma", "Accion"], [
    ("Readiness 503", "Ejecute proctoring-check-infra y revise MariaDB, S3 y edad de cola."),
    ("Worker no inicia", "Verifique releaseReady, SHA-256, permisos y preload offline."),
    ("Moodle no crea sesion", "Compare URL interna, clave, TLS y failurePolicy."),
    ("Panel rechaza mutacion", "Renueve SSO y confirme Origin, cookie, CSRF y capacidad."),
    ("Preparacion expira", "Revise cola, leases, tres frames y politica de fallo."),
    ("Evidencia ausente", "Revise permiso, curso, retencion y estado privado S3."),
  ], [2800, 6560]), note=("Soporte", "Registre sessionId, analysisId, hora y correlation ID. No solicite capturas, embeddings o claves.", "warning"))

  document.add_page_break()
  section(document, "15. Lista de puesta en marcha", "No habilite examenes reales hasta cerrar todos los gates.", [
    "Release Python-only instalado y migraciones 001-010 aplicadas.",
    "MariaDB y S3 privados, cifrado y retencion verificados.",
    "Pesos aprobados, licencias y SHA-256 comprobados sin red.",
    "Apache y unidades/timers validados en Ubuntu.",
    "Plugins Moodle y failurePolicy probados.",
    "SSO, CSRF, cookie y aislamiento entre cursos verificados.",
    "Preparacion, monitoreo, alertas y revision humana probados.",
    "PHPUnit, pytest, Selenium y pruebas de seguridad aprobadas.",
    "Carga de una hora cumple SLA y reserva 30% de RAM.",
    "Rollback atomico ensayado y responsables asignados.",
  ], note=("Criterio final", "Pesos, infraestructura, seguridad y capacidad deben estar aprobados en el entorno de destino.", "danger"))

  document.core_properties.title = "Manual de implementacion y uso - Proctoring UDS"
  document.core_properties.subject = "FastAPI, Moodle SSO y vision artificial en servidor"
  document.core_properties.author = "Proctoring UDS"
  document.core_properties.keywords = "Moodle, FastAPI, DeepFace, SFace, SSDLite, MariaDB, S3, Ubuntu"
  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  document.save(OUTPUT)
  return OUTPUT


if __name__ == "__main__":
  print(build_document())
