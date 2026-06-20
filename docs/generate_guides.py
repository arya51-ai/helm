from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
from reportlab.lib.enums import TA_LEFT, TA_CENTER

W, H = letter

DARK = colors.HexColor("#1a1a1a")
GREEN = colors.HexColor("#2e7d32")
LIGHT_GREEN = colors.HexColor("#e8f5e9")
MID_GRAY = colors.HexColor("#757575")
LIGHT_GRAY = colors.HexColor("#f5f5f5")
WHITE = colors.white

def base_styles():
    s = getSampleStyleSheet()
    s.add(ParagraphStyle("DocTitle",
        fontName="Helvetica-Bold", fontSize=22, textColor=WHITE,
        spaceAfter=4, alignment=TA_CENTER))
    s.add(ParagraphStyle("DocSubtitle",
        fontName="Helvetica", fontSize=11, textColor=colors.HexColor("#c8e6c9"),
        spaceAfter=0, alignment=TA_CENTER))
    s.add(ParagraphStyle("SectionHead",
        fontName="Helvetica-Bold", fontSize=13, textColor=GREEN,
        spaceBefore=18, spaceAfter=6))
    s.add(ParagraphStyle("StepNum",
        fontName="Helvetica-Bold", fontSize=12, textColor=WHITE))
    s.add(ParagraphStyle("StepText",
        fontName="Helvetica", fontSize=11, textColor=DARK,
        leading=16))
    s.add(ParagraphStyle("Note",
        fontName="Helvetica-Oblique", fontSize=10, textColor=MID_GRAY,
        spaceBefore=12))
    s.add(ParagraphStyle("ReportName",
        fontName="Helvetica-Bold", fontSize=11, textColor=DARK))
    s.add(ParagraphStyle("ReportDesc",
        fontName="Helvetica", fontSize=10, textColor=MID_GRAY, leading=14))
    return s

def header_block(title, subtitle):
    tbl = Table([[Paragraph(title, base_styles()["DocTitle"]),],
                 [Paragraph(subtitle, base_styles()["DocSubtitle"]),]],
                colWidths=[6.5*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), GREEN),
        ("ROWPADDING", (0,0), (-1,-1), 10),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("TOPPADDING", (0,0), (-1,0), 20),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 20),
        ("ROUNDEDCORNERS", [8, 8, 8, 8]),
    ]))
    return tbl

def step_row(num, text):
    s = base_styles()
    num_cell = Table([[Paragraph(str(num), s["StepNum"])]], colWidths=[0.45*inch])
    num_cell.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), GREEN),
        ("ALIGN", (0,0), (-1,-1), "CENTER"),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    row = Table([[num_cell, Paragraph(text, s["StepText"])]], colWidths=[0.6*inch, 5.9*inch])
    row.setStyle(TableStyle([
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (1,0), (1,0), 12),
        ("TOPPADDING", (0,0), (-1,-1), 4),
        ("BOTTOMPADDING", (0,0), (-1,-1), 4),
    ]))
    return row

def report_card(name, desc, tag=None):
    s = base_styles()
    tag_text = f'  <font color="#2e7d32"><b>[{tag}]</b></font>' if tag else ""
    name_para = Paragraph(name + tag_text, s["ReportName"])
    desc_para = Paragraph(desc, s["ReportDesc"])
    card = Table([[name_para], [desc_para]], colWidths=[6.3*inch])
    card.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LIGHT_GREEN),
        ("TOPPADDING", (0,0), (-1,0), 10),
        ("BOTTOMPADDING", (0,-1), (-1,-1), 10),
        ("LEFTPADDING", (0,0), (-1,-1), 14),
        ("RIGHTPADDING", (0,0), (-1,-1), 14),
        ("ROUNDEDCORNERS", [6, 6, 6, 6]),
    ]))
    return card


# ─── LIVEIQ GUIDE ────────────────────────────────────────────────────────────

def build_liveiq(path):
    s = base_styles()
    doc = SimpleDocTemplate(path, pagesize=letter,
                            leftMargin=inch, rightMargin=inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)
    story = []

    story.append(header_block("LiveIQ — SubwayIQ Report Export", "Helm Demo Setup Guide"))
    story.append(Spacer(1, 20))

    story.append(Paragraph("How to Export a Report", s["SectionHead"]))
    story.append(HRFlowable(width="100%", thickness=1, color=LIGHT_GREEN, spaceAfter=10))

    steps = [
        "Open <b>LiveIQ</b> on your device.",
        "Tap the <b>three lines (☰) in the top-left corner</b> to open the menu.",
        "Scroll down to <b>SubwayIQ Reports</b> under the <b>Reports</b> section.",
        "Click the <b>report you want</b> — it will open in a new browser window.",
        "Click <b>Export</b>, then select <b>CSV</b>.",
        "The file is now <b>downloaded to your device</b>.",
    ]
    for i, step in enumerate(steps, 1):
        story.append(step_row(i, step))
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Available Reports", s["SectionHead"]))
    story.append(HRFlowable(width="100%", thickness=1, color=LIGHT_GREEN, spaceAfter=10))

    reports = [
        ("Add On Sales Comparison", "Addon Sales Comparison Report"),
        ("Cash Card Usage", "SubwayIQ Cash Card Usage Report"),
        ("Combo Report", "Subway IQ Combo Report"),
        ("Compliance Overview", "SubwayIQ Compliance Overview Report"),
        ("Customer Care Offer Report", "Customer Care Offer Report"),
        ("Deluxe Meat Sandwich Report", "Deluxe Meat Sandwich Report"),
        ("Drive Thru/Non Drive Thru Hourly Report", "Drive Thru/Non Drive Thru Hourly Report"),
        ("Financial Strength", "SubwayIQ Financial Strength Report"),
        ("Individual Store History", "SubwayIQ Individual Store History Report"),
        ("Invoice Statement Export", "Invoice Statement Export Report"),
        ("Loyalty Fee", "Loyalty Fee Report"),
        ("Loyalty Report", "Loyalty Report"),
        ("Monthly Average AUV / Units / Store Counts Summary", "SubwayIQ Monthly Average AUV / Units / Store Counts Summary Report"),
        ("Morning Daypart Hourly Sales", "SubwayIQ Morning Daypart Hourly Sales Report"),
        ("PLU Sales by Restaurant", "SubwayIQ PLU Sales by Restaurant Report"),
        ("Redemption Reimbursements", "Redemption Reimbursements Report"),
        ("Reported Sales Confirmation", "Reported Sales Confirmation"),
        ("Restaurant Daily Sales Volume", "SubwayIQ Restaurant Daily Sales Volume Report"),
        ("Restaurant Offers Summary", "SubwayIQ Restaurant Offers Summary Report"),
        ("Sales Data Download Report", "SubwayIQ Sales Data Download Report"),
        ("Sales History Comparison", "SubwayIQ Sales History Comparison Report"),
        ("Top 3 All-Time Sales Weeks By Restaurant", "SubwayIQ Top 3 All-Time Sales Weeks By Restaurant Report"),
        ("Units EARLY WARNING Report", "SubwayIQ Units Early Warning Report"),
        ("Waiver Report", "SubwayIQ Waiver Report"),
    ]

    table_data = [
        [Paragraph("<b>Report Name</b>", s["ReportName"]),
         Paragraph("<b>Description</b>", s["ReportName"])]
    ]
    for name, desc in reports:
        table_data.append([Paragraph(name, s["StepText"]), Paragraph(desc, s["ReportDesc"])])

    tbl = Table(table_data, colWidths=[2.8*inch, 3.7*inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), GREEN),
        ("TEXTCOLOR", (0,0), (-1,0), WHITE),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [WHITE, LIGHT_GRAY]),
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#e0e0e0")),
        ("TOPPADDING", (0,0), (-1,-1), 7),
        ("BOTTOMPADDING", (0,0), (-1,-1), 7),
        ("LEFTPADDING", (0,0), (-1,-1), 8),
        ("RIGHTPADDING", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story.append(tbl)

    story.append(Paragraph(
        "Note: Reports open in a new browser window before the export option appears.",
        s["Note"]))

    doc.build(story)
    print(f"Created: {path}")


# ─── RETAILZ GUIDE ───────────────────────────────────────────────────────────

def build_retailz(path):
    s = base_styles()
    doc = SimpleDocTemplate(path, pagesize=letter,
                            leftMargin=inch, rightMargin=inch,
                            topMargin=0.75*inch, bottomMargin=0.75*inch)
    story = []

    story.append(header_block("Retailz POS — Report Export", "Helm Demo Setup Guide"))
    story.append(Spacer(1, 20))

    story.append(Paragraph("How to Export a Report", s["SectionHead"]))
    story.append(HRFlowable(width="100%", thickness=1, color=LIGHT_GREEN, spaceAfter=10))

    steps = [
        "Open <b>Retailz POS</b> and go to the <b>main menu</b>.",
        "Move your cursor to the <b>left side of the screen</b> to open the side panel.",
        "Click on the <b>Reports</b> section.",
        "Select the <b>report you want</b> from the list below.",
        "Set the date range to <b>Current Year</b>.",
        "Click <b>Export</b> and download as <b>XLSX</b>.",
        "The file is now <b>saved to your device</b>.",
    ]
    for i, step in enumerate(steps, 1):
        story.append(step_row(i, step))
        story.append(Spacer(1, 8))

    story.append(Spacer(1, 10))
    story.append(Paragraph("Reports to Download for Helm", s["SectionHead"]))
    story.append(HRFlowable(width="100%", thickness=1, color=LIGHT_GREEN, spaceAfter=10))

    key_reports = [
        ("Day Sales Summary", "Your daily revenue number — the core metric Helm uses to track store performance.", "Core Metric"),
        ("Sales By Hour", "Shows when customers come in throughout the day — critical for staffing decisions.", "Staffing"),
        ("Top Selling Items", "What's actually driving your revenue — your highest-performing products.", "Revenue"),
    ]
    for name, desc, tag in key_reports:
        story.append(report_card(name, desc, tag))
        story.append(Spacer(1, 10))

    story.append(Paragraph(
        "Tip: Download all three reports in one sitting — Helm uses them together to give you the full picture of your store.",
        s["Note"]))

    doc.build(story)
    print(f"Created: {path}")


if __name__ == "__main__":
    build_liveiq("/Users/arya/helm-dashboard/docs/LiveIQ_Export_Guide.pdf")
    build_retailz("/Users/arya/helm-dashboard/docs/Retailz_Export_Guide.pdf")
