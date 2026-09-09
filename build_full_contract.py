# -*- coding: utf-8 -*-
"""
Full Contract Generator for TikTok Account Management & Automation System MVP
Integrates all details from quote and user information.
"""

import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls
import subprocess
import os

# Colors - Corporate Legal Palette
COLOR_NAVY = RGBColor(27, 54, 93)       # #1B365D - Deep Corporate Navy
COLOR_PRIMARY = RGBColor(26, 26, 26)    # #1A1A1A - Off Black for high contrast text
COLOR_MUTED = RGBColor(107, 114, 128)   # #6B7280 - Subtle Slate Gray
COLOR_WHITE = RGBColor(255, 255, 255)   # #FFFFFF

HEX_NAVY = "1B365D"
HEX_LIGHT_BG = "F8FAFC"
HEX_ROW_ALT = "F1F5F9"
HEX_BORDER = "CBD5E1"
HEX_CALLOUT_BG = "F8FAFC"
HEX_CALLOUT_BORDER = "1B365D"

TOTAL_WIDTH_DXA = 9072  # 160mm (A4 210mm - 30mm left - 20mm right)

def configure_table_pr(table, border_color=HEX_BORDER):
    tblPr = table._tbl.tblPr
    for child in list(tblPr):
        if child.tag.endswith('tblBorders'):
            tblPr.remove(child)
    borders_xml = (
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="single" w:sz="6" w:space="0" w:color="{border_color}"/>'
        f'<w:bottom w:val="single" w:sz="8" w:space="0" w:color="{HEX_NAVY}"/>'
        f'<w:left w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="{border_color}"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(parse_xml(borders_xml))

def configure_borderless_table_pr(table):
    tblPr = table._tbl.tblPr
    for child in list(tblPr):
        if child.tag.endswith('tblBorders'):
            tblPr.remove(child)
    borders_xml = (
        f'<w:tblBorders {nsdecls("w")}>'
        f'<w:top w:val="none"/>'
        f'<w:bottom w:val="none"/>'
        f'<w:left w:val="none"/>'
        f'<w:right w:val="none"/>'
        f'<w:insideH w:val="none"/>'
        f'<w:insideV w:val="none"/>'
        f'</w:tblBorders>'
    )
    tblPr.append(parse_xml(borders_xml))

def format_cell(cell, width_dxa, fill_hex="FFFFFF", top_m=100, bot_m=100, left_m=120, right_m=120, v_align="center"):
    tc = cell._tc
    tcPr_xml = (
        f'<w:tcPr {nsdecls("w")}>'
        f'<w:tcW w:w="{width_dxa}" w:type="dxa"/>'
        f'<w:shd w:fill="{fill_hex}"/>'
        f'<w:tcMar>'
        f'<w:top w:w="{top_m}" w:type="dxa"/>'
        f'<w:bottom w:w="{bot_m}" w:type="dxa"/>'
        f'<w:left w:w="{left_m}" w:type="dxa"/>'
        f'<w:right w:w="{right_m}" w:type="dxa"/>'
        f'</w:tcMar>'
        f'<w:vAlign w:val="{v_align}"/>'
        f'</w:tcPr>'
    )
    old_tcPr = tc.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tcPr')
    if old_tcPr is not None:
        tc.remove(old_tcPr)
    tc.insert(0, parse_xml(tcPr_xml))

def format_callout_cell(cell, width_dxa=TOTAL_WIDTH_DXA):
    tc = cell._tc
    tcPr_xml = (
        f'<w:tcPr {nsdecls("w")}>'
        f'<w:tcW w:w="{width_dxa}" w:type="dxa"/>'
        f'<w:tcBorders>'
        f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
        f'<w:left w:val="single" w:sz="24" w:space="0" w:color="{HEX_CALLOUT_BORDER}"/>'
        f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
        f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{HEX_BORDER}"/>'
        f'</w:tcBorders>'
        f'<w:shd w:fill="{HEX_CALLOUT_BG}"/>'
        f'<w:tcMar>'
        f'<w:top w:w="160" w:type="dxa"/>'
        f'<w:bottom w:w="160" w:type="dxa"/>'
        f'<w:left w:w="200" w:type="dxa"/>'
        f'<w:right w:w="200" w:type="dxa"/>'
        f'</w:tcMar>'
        f'<w:vAlign w:val="center"/>'
        f'</w:tcPr>'
    )
    old_tcPr = tc.find('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}tcPr')
    if old_tcPr is not None:
        tc.remove(old_tcPr)
    tc.insert(0, parse_xml(tcPr_xml))

def make_row_cant_split(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(parse_xml(f'<w:cantSplit {nsdecls("w")}/>'))

def make_row_header(row):
    trPr = row._tr.get_or_add_trPr()
    trPr.append(parse_xml(f'<w:tblHeader {nsdecls("w")}/>'))

def add_field(paragraph, field_name):
    fldSimple = parse_xml(f'<w:fldSimple {nsdecls("w")} w:instr="{field_name}"/>')
    paragraph._p.append(fldSimple)

def add_p(doc, text, align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=4, line_spacing=1.2, bold=False, italic=False, font_size=12, color=COLOR_PRIMARY, keep_with_next=False, is_bullet=False):
    p = doc.add_paragraph()
    p.alignment = align
    p.paragraph_format.space_before = Pt(space_before)
    p.paragraph_format.space_after = Pt(space_after)
    p.paragraph_format.line_spacing = line_spacing
    p.paragraph_format.keep_with_next = keep_with_next
    
    if is_bullet:
        p.paragraph_format.left_indent = Inches(0.25)
        p.paragraph_format.first_line_indent = Inches(-0.25)
        r_dash = p.add_run("– ")
        r_dash.bold = True
        r_dash.font.name = 'Times New Roman'
        r_dash.font.size = Pt(font_size)
        r_dash.font.color.rgb = COLOR_NAVY
        
    r = p.add_run(text)
    r.bold = bold
    r.italic = italic
    r.font.name = 'Times New Roman'
    r.font.size = Pt(font_size)
    r.font.color.rgb = color
    return p

def add_article(doc, number_str, title_str):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.LEFT
    p.paragraph_format.space_before = Pt(12)
    p.paragraph_format.space_after = Pt(3.5)
    p.paragraph_format.keep_with_next = True
    r = p.add_run(f"ĐIỀU {number_str}. {title_str.upper()}")
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(12)
    r.font.color.rgb = COLOR_NAVY
    return p

def add_party_table(doc, party_label, party_data):
    p_header = doc.add_paragraph()
    p_header.paragraph_format.space_before = Pt(12)
    p_header.paragraph_format.space_after = Pt(4)
    p_header.paragraph_format.keep_with_next = True
    r = p_header.add_run(party_label)
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(12)
    r.font.color.rgb = COLOR_NAVY

    table = doc.add_table(rows=len(party_data) + 1, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False
    configure_table_pr(table)
    
    col_widths = [2720, 6352]
    
    r0 = table.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_text in enumerate(["Thông tin", "Nội dung"]):
        format_cell(r0.cells[c_i], width_dxa=col_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_text)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(11)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, (k, v) in enumerate(party_data):
        row = table.rows[r_i + 1]
        make_row_cant_split(row)
        
        format_cell(row.cells[0], width_dxa=col_widths[0], fill_hex=HEX_ROW_ALT)
        p0 = row.cells[0].paragraphs[0]
        p0.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p0.paragraph_format.space_before = Pt(0)
        p0.paragraph_format.space_after = Pt(0)
        r = p0.add_run(k)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_NAVY
        
        fill = "FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG
        format_cell(row.cells[1], width_dxa=col_widths[1], fill_hex=fill)
        p1 = row.cells[1].paragraphs[0]
        p1.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p1.paragraph_format.space_before = Pt(0)
        p1.paragraph_format.space_after = Pt(0)
        p1.paragraph_format.line_spacing = 1.15
        r = p1.add_run(v)
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_PRIMARY
        
    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(4)
    post_p.paragraph_format.space_after = Pt(6)

def add_signature_block(doc, rep_a="[Họ và tên Người đại diện]", rep_b="Nguyễn Tiến Đạt", role_a="[Chức vụ]", role_b="Cá nhân / Bên cung cấp dịch vụ"):
    sig_table = doc.add_table(rows=1, cols=2)
    sig_table.alignment = WD_TABLE_ALIGNMENT.CENTER
    sig_table.autofit = False
    configure_borderless_table_pr(sig_table)
    
    half_dxa = TOTAL_WIDTH_DXA // 2
    row = sig_table.rows[0]
    make_row_cant_split(row)
    
    format_cell(row.cells[0], width_dxa=half_dxa, fill_hex="FFFFFF", top_m=100, bot_m=100, left_m=60, right_m=60)
    format_cell(row.cells[1], width_dxa=half_dxa, fill_hex="FFFFFF", top_m=100, bot_m=100, left_m=60, right_m=60)
    
    # Left: Bên A
    p_a1 = row.cells[0].paragraphs[0]
    p_a1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_a1.paragraph_format.space_before = Pt(14)
    p_a1.paragraph_format.space_after = Pt(2)
    p_a1.paragraph_format.keep_with_next = True
    r = p_a1.add_run("ĐẠI DIỆN BÊN A")
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(12)
    r.font.color.rgb = COLOR_PRIMARY
    
    p_a2 = row.cells[0].add_paragraph()
    p_a2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_a2.paragraph_format.space_before = Pt(0)
    p_a2.paragraph_format.space_after = Pt(65)
    p_a2.paragraph_format.keep_with_next = True
    r = p_a2.add_run("(Ký, ghi rõ họ tên, chức vụ và đóng dấu nếu có)")
    r.italic = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(10)
    r.font.color.rgb = COLOR_MUTED
    
    p_a3 = row.cells[0].add_paragraph()
    p_a3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_a3.paragraph_format.space_before = Pt(0)
    p_a3.paragraph_format.space_after = Pt(6)
    r = p_a3.add_run(f"{rep_a}\n{role_a}" if role_a else rep_a)
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(11)
    r.font.color.rgb = COLOR_MUTED
    
    # Right: Bên B
    p_b1 = row.cells[1].paragraphs[0]
    p_b1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_b1.paragraph_format.space_before = Pt(14)
    p_b1.paragraph_format.space_after = Pt(2)
    p_b1.paragraph_format.keep_with_next = True
    r = p_b1.add_run("ĐẠI DIỆN BÊN B")
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(12)
    r.font.color.rgb = COLOR_PRIMARY
    
    p_b2 = row.cells[1].add_paragraph()
    p_b2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_b2.paragraph_format.space_before = Pt(0)
    p_b2.paragraph_format.space_after = Pt(65)
    p_b2.paragraph_format.keep_with_next = True
    r = p_b2.add_run("(Ký, ghi rõ họ tên, chức vụ và đóng dấu nếu có)")
    r.italic = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(10)
    r.font.color.rgb = COLOR_MUTED
    
    p_b3 = row.cells[1].add_paragraph()
    p_b3.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_b3.paragraph_format.space_before = Pt(0)
    p_b3.paragraph_format.space_after = Pt(6)
    r = p_b3.add_run(f"{rep_b}\n{role_b}")
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(11)
    r.font.color.rgb = COLOR_NAVY

def create_document():
    doc = docx.Document()
    
    # Page setup
    s = doc.sections[0]
    s.page_width = Inches(8.27)
    s.page_height = Inches(11.69)
    s.top_margin = Inches(0.79)
    s.bottom_margin = Inches(0.79)
    s.left_margin = Inches(1.18)
    s.right_margin = Inches(0.79)
    s.different_first_page_header_footer = True
    
    # Default font
    normal_style = doc.styles['Normal']
    normal_font = normal_style.font
    normal_font.name = 'Times New Roman'
    normal_font.size = Pt(12)
    normal_font.color.rgb = COLOR_PRIMARY
    
    # Headers & Footers
    hp = s.header.paragraphs[0]
    hp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    hp.paragraph_format.space_after = Pt(4)
    pPr = hp._p.get_or_add_pPr()
    pBdr = parse_xml(f'<w:pBdr {nsdecls("w")}><w:bottom w:val="single" w:sz="4" w:space="4" w:color="{HEX_BORDER}"/></w:pBdr>')
    pPr.append(pBdr)
    tabs = parse_xml(f'<w:tabs {nsdecls("w")}><w:tab w:val="right" w:pos="{TOTAL_WIDTH_DXA}"/></w:tabs>')
    pPr.append(tabs)
    
    r_hdr_l = hp.add_run("HỢP ĐỒNG PHÁT TRIỂN PHẦN MỀM — TIKTOK ACCOUNT & FLEET MANAGEMENT MVP")
    r_hdr_l.font.name = 'Times New Roman'
    r_hdr_l.font.size = Pt(8.5)
    r_hdr_l.font.italic = True
    r_hdr_l.font.color.rgb = COLOR_MUTED
    
    r_hdr_r = hp.add_run("\tSố: 01/2026/HĐPTPM-TIKTOK")
    r_hdr_r.font.name = 'Times New Roman'
    r_hdr_r.font.size = Pt(8.5)
    r_hdr_r.font.italic = True
    r_hdr_r.font.color.rgb = COLOR_MUTED
    
    # First page footer
    ffp = s.first_page_footer.paragraphs[0]
    ffp.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    ff_run = ffp.add_run("Trang 1 / ")
    ff_run.font.name = 'Times New Roman'
    ff_run.font.size = Pt(9)
    ff_run.font.color.rgb = COLOR_MUTED
    add_field(ffp, "NUMPAGES")
    for r in ffp.runs[1:]:
        r.font.name = 'Times New Roman'
        r.font.size = Pt(9)
        r.font.color.rgb = COLOR_MUTED
        
    # Subsequent pages footer
    fp = s.footer.paragraphs[0]
    fp.alignment = WD_ALIGN_PARAGRAPH.LEFT
    fp.paragraph_format.space_before = Pt(4)
    fp_pPr = fp._p.get_or_add_pPr()
    fp_pBdr = parse_xml(f'<w:pBdr {nsdecls("w")}><w:top w:val="single" w:sz="4" w:space="4" w:color="{HEX_BORDER}"/></w:pBdr>')
    fp_pPr.append(fp_pBdr)
    fp_tabs = parse_xml(f'<w:tabs {nsdecls("w")}><w:tab w:val="right" w:pos="{TOTAL_WIDTH_DXA}"/></w:tabs>')
    fp_pPr.append(fp_tabs)
    
    frun1 = fp.add_run("Hợp đồng Phát triển Phần mềm | Bảo mật thông tin")
    frun1.font.name = 'Times New Roman'
    frun1.font.size = Pt(9)
    frun1.font.italic = True
    frun1.font.color.rgb = COLOR_MUTED
    
    frun2 = fp.add_run("\tTrang ")
    frun2.font.name = 'Times New Roman'
    frun2.font.size = Pt(9)
    frun2.font.color.rgb = COLOR_MUTED
    add_field(fp, "PAGE")
    
    frun3 = fp.add_run(" / ")
    frun3.font.name = 'Times New Roman'
    frun3.font.size = Pt(9)
    frun3.font.color.rgb = COLOR_MUTED
    add_field(fp, "NUMPAGES")
    for r in fp.runs:
        r.font.name = 'Times New Roman'
        r.font.size = Pt(9)
        r.font.color.rgb = COLOR_MUTED

    # 1. QUỐC HIỆU & TIÊU NGỮ
    add_p(doc, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=2, font_size=12, bold=True)
    add_p(doc, "Độc lập - Tự do - Hạnh phúc", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=2, font_size=13, bold=True)
    add_p(doc, "──────────────", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=14, font_size=10, bold=True, color=COLOR_NAVY)

    # 2. TITLE
    add_p(doc, "HỢP ĐỒNG PHÁT TRIỂN PHẦN MỀM", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=4, font_size=16, bold=True, color=COLOR_NAVY, keep_with_next=True)
    add_p(doc, "Số: 01/2026/HĐPTPM-TIKTOK", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=14, font_size=11, italic=True, color=COLOR_MUTED, keep_with_next=True)

    # 3. CĂN CỨ PHÁP LÝ
    add_p(doc, "Căn cứ Bộ luật Dân sự số 91/2015/QH13 được Quốc hội nước Cộng hòa xã hội chủ nghĩa Việt Nam thông qua ngày 24/11/2015 và các văn bản hướng dẫn thi hành;", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=3, line_spacing=1.15, font_size=11, italic=True, color=RGBColor(50, 50, 50))
    add_p(doc, "Căn cứ Luật Thương mại số 36/2005/QH11 được Quốc hội thông qua ngày 14/06/2005 và các văn bản sửa đổi, bổ sung, hướng dẫn thi hành;", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=3, line_spacing=1.15, font_size=11, italic=True, color=RGBColor(50, 50, 50))
    add_p(doc, "Căn cứ Luật Sở hữu trí tuệ số 50/2005/QH11 và Luật sửa đổi, bổ sung một số điều của Luật Sở hữu trí tuệ số 07/2022/QH15 cùng các văn bản hướng dẫn thi hành;", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=3, line_spacing=1.15, font_size=11, italic=True, color=RGBColor(50, 50, 50))
    add_p(doc, "Căn cứ Luật An toàn thông tin mạng số 86/2015/QH13, Luật An ninh mạng số 24/2018/QH14 và các quy định pháp luật hiện hành về bảo vệ dữ liệu cá nhân;", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=3, line_spacing=1.15, font_size=11, italic=True, color=RGBColor(50, 50, 50))
    add_p(doc, "Căn cứ nhu cầu phát triển phần mềm tự động hóa vận hành tài khoản của Bên A và năng lực chuyên môn cung cấp giải pháp công nghệ của Bên B.", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=6, line_spacing=1.15, font_size=11, italic=True, color=RGBColor(50, 50, 50))

    # 4. NGÀY KÝ & ĐẠI DIỆN
    add_p(doc, "Hôm nay, ngày 09 tháng 09 năm 2026, tại Hà Nội, chúng tôi gồm các bên dưới đây:", space_before=6, space_after=6, italic=True)

    party_a_data = [
        ("Tên tổ chức/cá nhân", "[Tên Khách hàng / Tên Công ty Thuê Dịch Vụ]"),
        ("Mã số doanh nghiệp/CCCD", "[●]"),
        ("Địa chỉ", "[Địa chỉ trụ sở / Địa chỉ thường trú của Bên A]"),
        ("Đại diện", "[●] – Chức vụ: [●]"),
        ("Điện thoại / Email", "[●] / [●]"),
        ("Tài khoản ngân hàng", "[Số tài khoản – Tên ngân hàng – Chi nhánh]")
    ]
    add_party_table(doc, "BÊN A - KHÁCH HÀNG / BÊN THUÊ DỊCH VỤ", party_a_data)

    party_b_data = [
        ("Tên tổ chức/cá nhân", "Nguyễn Tiến Đạt"),
        ("Mã số doanh nghiệp/CCCD", "040096021300"),
        ("Địa chỉ", "Thanh Lĩnh, Thanh Chương, Nghệ An"),
        ("Đại diện", "Ông Nguyễn Tiến Đạt – Chức vụ: Cá nhân / Bên cung cấp dịch vụ"),
        ("Điện thoại / Email", "0326119184 / agentfloxceo@gmail.com"),
        ("Tài khoản ngân hàng", "Số tài khoản: 1234567890 – Ngân hàng: Ngân hàng TMCP Ngoại thương Việt Nam (Vietcombank) – Chủ tài khoản: NGUYEN VAN A")
    ]
    add_party_table(doc, "BÊN B - ĐƠN VỊ PHÁT TRIỂN / BÊN CUNG CẤP DỊCH VỤ", party_b_data)

    add_p(doc, "Bên A và Bên B sau đây gọi riêng là “Bên”, gọi chung là “Các Bên”, thống nhất ký kết Hợp đồng phát triển phần mềm này (“Hợp đồng”) với các điều khoản và điều kiện chi tiết sau đây:", space_before=6, space_after=8)

    # ĐIỀU 1
    add_article(doc, "1", "Định nghĩa và giải thích")
    add_p(doc, "“Phần mềm” là Hệ thống Quản lý TikTok Account & Tự động hóa Vận hành (TikTok Account Management & Fleet Automation MVP) được Bên B phát triển theo phạm vi công việc, yêu cầu kỹ thuật và kiến trúc công nghệ đã thống nhất.", is_bullet=True)
    add_p(doc, "“Sản phẩm bàn giao” là toàn bộ mã nguồn hoàn chỉnh (Full Source Code Next.js 16 + React 19 + TypeScript + Prisma), file Database Migrations PostgreSQL, module tự động hóa GPM-Login & Playwright Engine, tài liệu kiến trúc, tài liệu hướng dẫn cài đặt và vận hành hệ thống.", is_bullet=True)
    add_p(doc, "“Yêu cầu thay đổi (Change Request)” là yêu cầu bằng văn bản hoặc email của Bên A làm thay đổi phạm vi chức năng, thiết kế giao diện, logic trích xuất, cấu trúc dữ liệu hoặc thời hạn hoàn thành so với tài liệu đặc tả đã ký.", is_bullet=True)
    add_p(doc, "“Ngày làm việc” là các ngày từ thứ Hai đến thứ Sáu hằng tuần, không bao gồm thứ Bảy, Chủ nhật và các ngày nghỉ lễ, tết theo quy định của pháp luật lao động Việt Nam.", is_bullet=True)

    # ĐIỀU 2
    add_article(doc, "2", "Đối tượng và phạm vi hợp đồng")
    add_p(doc, "Bên A đồng ý thuê và Bên B đồng ý nhận thực hiện phát triển Phần mềm: Hệ thống Quản lý TikTok Account & Tự động hóa Vận hành (TikTok Flow / TikTok Account Management MVP).", is_bullet=True)
    add_p(doc, "Phạm vi chức năng gồm 07 module cốt lõi: (1) Quản lý TikTok Account & Hồ sơ vận hành; (2) Tự động hóa GPM-Login & Playwright trích xuất dữ liệu; (3) Hệ thống Checklist & Chấm công tự động; (4) Quản lý, phân tích & Import doanh thu Excel/CSV; (5) Dashboard điều hành & Bảng xếp hạng Leaderboard; (6) Quản trị đội ngũ, phân quyền RBAC & Bảo mật; (7) Kiểm thử tích hợp, tối ưu hiệu năng & triển khai máy chủ. Chi tiết được quy định tại Phụ lục 01 đính kèm.", is_bullet=True)
    add_p(doc, "Bất kỳ chức năng hoặc tính năng phát sinh nào nằm ngoài phạm vi 07 module nêu trên (như App di động native, AI deep analytics, Render video tự động, lách bản quyền...) không mặc nhiên thuộc nghĩa vụ của Bên B và sẽ được báo giá bổ sung theo thỏa thuận riêng.", is_bullet=True)
    add_p(doc, "Bên B có trách nhiệm thông báo bằng văn bản hoặc phương thức điện tử cho Bên A nếu phát hiện các yêu cầu mới có khả năng làm thay đổi đáng kể chi phí, kiến trúc hoặc tiến độ thực hiện dự án.", is_bullet=True)

    # ĐIỀU 3
    add_article(doc, "3", "Tiến độ và các mốc bàn giao")
    add_p(doc, "Tổng thời gian thực hiện dự kiến là 06 tuần, bắt đầu từ ngày 09/09/2026 đến ngày 21/10/2026.", is_bullet=True)
    add_p(doc, "Kế hoạch tiến độ phân rã theo 06 giai đoạn cụ thể như sau:\n• Giai đoạn 1 (Tuần 1: 09/09/2026 – 16/09/2026): Thiết kế CSDL PostgreSQL, xác thực người dùng NextAuth, phân quyền RBAC và quản lý tài khoản TikTok cơ bản.\n• Giai đoạn 2 (Tuần 2: 17/09/2026 – 23/09/2026): Tích hợp GPM-Login REST API v1, xây dựng Playwright Engine trích xuất số liệu Views, Likes, Creator Rewards USD, RPM và Auto-sync Cron ngầm.\n• Giai đoạn 3 (Tuần 3: 24/09/2026 – 30/09/2026): Xây dựng Checklist công việc theo tài khoản, thuật toán tự động chấm ngày công và cơ chế khóa sổ tự động (Auto Cut-off Lock 23:59).\n• Giai đoạn 4 (Tuần 4: 01/10/2026 – 07/10/2026): Quản lý doanh thu đa kênh, module import đối soát Excel/CSV và Bảng xếp hạng nhân viên (Leaderboard).\n• Giai đoạn 5 (Tuần 5: 08/10/2026 – 14/10/2026): Hoàn thiện Dashboard điều hành trung tâm, hệ thống cảnh báo rủi ro (Risk Alerts) và kiểm thử tích hợp luồng tự động hóa.\n• Giai đoạn 6 (Tuần 6: 15/10/2026 – 21/10/2026): Tối ưu hóa hiệu năng, phối hợp kiểm thử nghiệm thu UAT thực tế, đóng gói triển khai máy chủ và bàn giao hệ thống.", is_bullet=True)
    add_p(doc, "Tiến độ dự án phụ thuộc vào việc Bên A cung cấp kịp thời, chính xác tài khoản TikTok, máy trạm cài đặt GPM-Login, key bản quyền GPM, proxy và phản hồi nghiệp vụ trong vòng 24 – 48 giờ làm việc.", is_bullet=True)
    add_p(doc, "Trường hợp Bên A chậm trễ bàn giao đầu vào hoặc thay đổi yêu cầu chức năng, thời hạn thực hiện của Bên B sẽ được tự động gia hạn tương ứng với số ngày chậm trễ thực tế của Bên A.", is_bullet=True)

    # ĐIỀU 4
    add_article(doc, "4", "Giá trị hợp đồng và phương thức thanh toán")
    add_p(doc, "Tổng giá trị Hợp đồng trọn gói là: 30.000.000 VNĐ (Bằng chữ: Ba mươi triệu đồng chẵn). Giá trị trên là giá trọn gói cho 07 module MVP, chưa bao gồm thuế GTGT (VAT) do Bên B là cá nhân cung cấp dịch vụ.", is_bullet=True)
    add_p(doc, "Lịch thanh toán được chia làm 03 đợt theo Phụ lục 03:\n• Đợt 1 (30%): 9.000.000 VNĐ (Chín triệu đồng) ngay sau khi ký Hợp đồng ngày 09/09/2026 để khởi động dự án.\n• Đợt 2 (40%): 12.000.000 VNĐ (Mười hai triệu đồng) sau khi Bên B hoàn thành Mốc 2 (tích hợp GPM-Login, Playwright engine, checklist chấm công và phân tích doanh thu).\n• Đợt 3 (30%): 9.000.000 VNĐ (Chín triệu đồng) trong vòng 03 ngày làm việc kể từ ngày hoàn thành kiểm thử UAT, triển khai hệ thống và ký Biên bản nghiệm thu bàn giao.", is_bullet=True)
    add_p(doc, "Bên A thanh toán bằng hình thức chuyển khoản ngân hàng vào tài khoản của Bên B được ghi tại phần mở đầu Hợp đồng trong thời hạn tối đa 03 ngày làm việc kể từ ngày nhận được đề nghị thanh toán hợp lệ.", is_bullet=True)
    add_p(doc, "Chi phí dịch vụ bên thứ ba định kỳ (VPS máy chủ, domain tên miền, proxy IP, bản quyền phần mềm GPM-Login) không nằm trong giá trị Hợp đồng này và do Bên A trực tiếp chi trả cho các nhà cung cấp tương ứng.", is_bullet=True)
    add_p(doc, "Việc Bên A thanh toán không làm mất quyền yêu cầu Bên B khắc phục các lỗi kỹ thuật thuộc trách nhiệm bảo hành trong thời hạn bảo hành đã cam kết.", is_bullet=True)

    # ĐIỀU 5
    add_article(doc, "5", "Quy trình kiểm thử và nghiệm thu")
    add_p(doc, "Bên B gửi thông báo bàn giao phiên bản MVP cho Bên A kèm tài liệu hướng dẫn và link truy cập hệ thống triển khai.", is_bullet=True)
    add_p(doc, "Bên A tiến hành kiểm thử nghiệm thu UAT trong thời hạn 05 ngày làm việc kể từ ngày nhận thông báo bàn giao và gửi danh sách phản hồi/lỗi (nếu có) cho Bên B.", is_bullet=True)
    add_p(doc, "Lỗi được phân loại thống nhất: Critical (hệ thống sập, mất dữ liệu, chức năng cốt lõi ngừng hoạt động); Major (chức năng chính bị sai lệch kết quả nhưng có phương án thay thế); Minor (lỗi giao diện hiển thị, sai chính tả, thẩm mỹ).", is_bullet=True)
    add_p(doc, "Bên B có trách nhiệm sửa chữa các lỗi thuộc phạm vi Hợp đồng và bàn giao lại để kiểm tra. Khi hệ thống đáp ứng đầy đủ tiêu chí theo Checklist Phụ lục 04, Các Bên tiến hành ký Biên bản nghiệm thu bàn giao chính thức (Phụ lục 06).", is_bullet=True)
    add_p(doc, "Nếu Bên A không gửi phản hồi hoặc danh sách lỗi trong thời hạn 05 ngày làm việc kể từ ngày nhận bàn giao, sản phẩm được xem như đã được Bên A nghiệm thu toàn bộ mà không có khiếu nại.", is_bullet=True)

    # ĐIỀU 6
    add_article(doc, "6", "Quản lý thay đổi phạm vi (Change Request)")
    add_p(doc, "Mọi yêu cầu thay đổi (CR) phải được Bên A gửi bằng văn bản hoặc email, nêu rõ nội dung thay đổi, lý do và mức độ ưu tiên.", is_bullet=True)
    add_p(doc, "Bên B đánh giá tác động của CR đến kiến trúc, chi phí và thời gian thực hiện trong vòng 02 ngày làm việc. Bên B chỉ tiến hành thực hiện sau khi Các Bên đã thống nhất bằng văn bản hoặc phụ lục bổ sung.", is_bullet=True)
    add_p(doc, "Các thay đổi nhỏ về giao diện không ảnh hưởng đáng kể đến cấu trúc dữ liệu và tiến độ có thể được Các Bên linh hoạt xác nhận qua email/tin nhắn trao đổi dự án.", is_bullet=True)

    # ĐIỀU 7
    add_article(doc, "7", "Quyền và trách nhiệm của Bên A")
    add_p(doc, "Cung cấp đầy đủ, chính xác và kịp thời các tài liệu yêu cầu, tài khoản thử nghiệm, quyền truy cập GPM-Login, proxy và thông tin cần thiết để Bên B thực hiện công việc.", is_bullet=True)
    add_p(doc, "Chỉ định đầu mối có thẩm quyền phụ trách dự án để phối hợp, trao đổi thông tin, kiểm thử UAT và ký biên bản nghiệm thu.", is_bullet=True)
    add_p(doc, "Thanh toán đầy đủ, đúng hạn toàn bộ giá trị Hợp đồng cho Bên B theo đúng các mốc quy định.", is_bullet=True)
    add_p(doc, "Tự chịu trách nhiệm pháp lý đối với nội dung video, bản quyền hình ảnh/âm thanh và tính hợp pháp của các tài khoản TikTok vận hành trên hệ thống.", is_bullet=True)

    # ĐIỀU 8
    add_article(doc, "8", "Quyền và trách nhiệm của Bên B")
    add_p(doc, "Thực hiện công việc đúng phạm vi chức năng, tiêu chuẩn kỹ thuật hiện đại (Next.js 16, TypeScript, Prisma ORM) và tiến độ cam kết.", is_bullet=True)
    add_p(doc, "Trực tiếp phụ trách lập trình, cấu hình tự động hóa, kiểm thử chất lượng và đóng gói triển khai máy chủ cho Bên A.", is_bullet=True)
    add_p(doc, "Bảo mật tuyệt đối thông tin kinh doanh, dữ liệu tài khoản, doanh thu và bí mật thương mại của Bên A.", is_bullet=True)
    add_p(doc, "Thông báo kịp thời cho Bên A các rủi ro kỹ thuật, thay đổi chính sách từ phía TikTok hoặc GPM-Login có thể ảnh hưởng đến hệ thống.", is_bullet=True)
    add_p(doc, "Bảo hành, sửa lỗi kỹ thuật miễn phí cho Bên A trong thời hạn 30 ngày kể từ ngày nghiệm thu bàn giao theo đúng quy định tại Điều 11.", is_bullet=True)

    # ĐIỀU 9
    add_article(doc, "9", "Quyền sở hữu trí tuệ và bàn giao mã nguồn")
    add_p(doc, "Sau khi Bên A thanh toán đầy đủ 100% giá trị Hợp đồng, toàn bộ quyền tài sản đối với mã nguồn phát triển riêng (Custom Code) của Phần mềm thuộc quyền sở hữu của Bên A.", is_bullet=True)
    add_p(doc, "Các framework, thư viện mã nguồn mở bên thứ ba (Next.js, React, Tailwind CSS, Prisma, Playwright, Recharts...) tuân theo giấy phép mã nguồn mở tương ứng (MIT, Apache 2.0).", is_bullet=True)
    add_p(doc, "Bên B có nghĩa vụ bàn giao đầy đủ toàn bộ source code sạch, repository, migration files, hướng dẫn build/deploy và tài liệu kỹ thuật theo đúng Checklist Phụ lục 05.", is_bullet=True)

    # ĐIỀU 10
    add_article(doc, "10", "Bảo mật thông tin")
    add_p(doc, "Mỗi Bên cam kết giữ bí mật tuyệt đối các thông tin kỹ thuật, kinh doanh, tài chính, dữ liệu tài khoản và mã nguồn của Bên kia trong suốt thời gian thực hiện Hợp đồng và tối thiểu 02 năm sau khi Hợp đồng kết thúc.", is_bullet=True)
    add_p(doc, "Thông tin bảo mật chỉ được sử dụng duy nhất cho mục đích thực hiện Hợp đồng này và không được tiết lộ cho bất kỳ bên thứ ba nào khi chưa có sự đồng ý trước bằng văn bản của Bên sở hữu thông tin.", is_bullet=True)

    # ĐIỀU 11
    add_article(doc, "11", "Bảo hành và hỗ trợ kỹ thuật")
    add_p(doc, "Thời hạn bảo hành hệ thống là 30 ngày tính từ ngày ký Biên bản nghiệm thu và bàn giao phiên bản MVP.", is_bullet=True)
    add_p(doc, "Bảo hành áp dụng đối với các lỗi kỹ thuật phát sinh từ mã nguồn và chức năng do Bên B phát triển không phù hợp với yêu cầu nghiệm thu. Không áp dụng bảo hành đối với lỗi do hạ tầng máy chủ, đường truyền mạng, máy trạm Bên A, lỗi nội bộ của phần mềm GPM-Login hoặc do TikTok thay đổi cấu trúc nền tảng.", is_bullet=True)
    add_p(doc, "Cam kết thời gian phản hồi và hỗ trợ sự cố:\n• Lỗi Critical: Phản hồi trong vòng 02 giờ; khắc phục trong 12 – 24 giờ.\n• Lỗi Major: Phản hồi trong vòng 04 giờ; khắc phục trong 01 – 02 ngày làm việc.\n• Lỗi Minor: Phản hồi trong vòng 01 ngày làm việc; khắc phục trong 02 – 03 ngày làm việc.", is_bullet=True)
    add_p(doc, "Dịch vụ nâng cấp tính năng mới hoặc bảo trì định kỳ sau khi hết thời hạn bảo hành sẽ được ký kết theo hợp đồng bảo trì/nâng cấp riêng.", is_bullet=True)

    # ĐIỀU 12
    add_article(doc, "12", "An toàn thông tin và quản lý tài khoản")
    add_p(doc, "Bên B áp dụng các tiêu chuẩn bảo mật hợp lý trong mã nguồn: mã hóa mật khẩu người dùng với Bcrypt, quản lý phiên làm việc JWT Token an toàn.", is_bullet=True)
    add_p(doc, "Mọi thông tin nhạy cảm (API key, Database URL, Secret Key) phải được lưu trữ trong biến môi trường (.env), tuyệt đối không đưa vào mã nguồn công khai.", is_bullet=True)
    add_p(doc, "Bên A chịu trách nhiệm bảo quản tài khoản quản trị hệ thống (Admin account) sau khi Bên B bàn giao chính thức.", is_bullet=True)

    # ĐIỀU 13 - 18
    add_article(doc, "13", "Vi phạm hợp đồng và bồi thường thiệt hại")
    add_p(doc, "Trường hợp một Bên vi phạm nghĩa vụ hợp đồng gây thiệt hại thực tế cho Bên kia, Bên vi phạm có trách nhiệm bồi thường toàn bộ thiệt hại thực tế, trực tiếp phát sinh theo quy định của pháp luật Việt Nam.", is_bullet=True)

    add_article(doc, "14", "Giới hạn trách nhiệm")
    add_p(doc, "Tổng trách nhiệm bồi thường thiệt hại của mỗi Bên phát sinh từ hoặc liên quan đến Hợp đồng này trong mọi trường hợp không vượt quá 100% tổng giá trị Hợp đồng (tương đương 30.000.000 VNĐ), trừ trường hợp cố ý vi phạm hoặc xâm phạm quyền sở hữu trí tuệ, nghĩa vụ bảo mật.", is_bullet=True)

    add_article(doc, "15", "Sự kiện bất khả kháng")
    add_p(doc, "Sự kiện bất khả kháng là sự kiện xảy ra khách quan, không thể lường trước và không thể khắc phục được mặc dù đã áp dụng mọi biện pháp cần thiết (thiên tai, dịch bệnh, hỏa hoạn, chiến tranh, sự cố đứt cáp quang biển diện rộng, thay đổi pháp luật cấm cản hoạt động...).", is_bullet=True)
    add_p(doc, "Bên bị ảnh hưởng phải thông báo cho Bên kia trong vòng 03 ngày làm việc và thời hạn thực hiện nghĩa vụ được kéo dài tương ứng.", is_bullet=True)

    add_article(doc, "16", "Tạm ngừng và chấm dứt hợp đồng")
    add_p(doc, "Một Bên có quyền yêu cầu khắc phục vi phạm bằng thông báo văn bản. Nếu vi phạm không được khắc phục trong vòng 07 ngày làm việc kể từ ngày nhận thông báo, Bên không vi phạm có quyền đơn phương chấm dứt Hợp đồng.", is_bullet=True)
    add_p(doc, "Trường hợp Bên A đơn phương chấm dứt hợp đồng vì nhu cầu riêng, Bên A phải thông báo trước 15 ngày và thanh toán cho Bên B chi phí tương ứng với khối lượng công việc Bên B đã hoàn thành thực tế.", is_bullet=True)

    add_article(doc, "17", "Nhà thầu phụ và dịch vụ bên thứ ba")
    add_p(doc, "Bên B có thể sử dụng các cộng sự hoặc chuyên gia kỹ thuật hỗ trợ chuyên môn nhưng Bên B vẫn là đầu mối duy nhất chịu trách nhiệm toàn diện trước Bên A về chất lượng và tiến độ sản phẩm.", is_bullet=True)

    add_article(doc, "18", "Luật áp dụng và giải quyết tranh chấp")
    add_p(doc, "Hợp đồng này được điều chỉnh và giải thích theo quy định của pháp luật nước Cộng hòa xã hội chủ nghĩa Việt Nam.", is_bullet=True)
    add_p(doc, "Mọi tranh chấp phát sinh sẽ được Các Bên ưu tiên giải quyết thông qua thương lượng hòa giải trong thời hạn 30 ngày. Trường hợp không hòa giải được, tranh chấp sẽ được đưa ra giải quyết tại Tòa án nhân dân có thẩm quyền tại Việt Nam.", is_bullet=True)

    add_article(doc, "19", "Thông báo và phương thức trao đổi điện tử")
    add_p(doc, "Các thông báo, yêu cầu hoặc tài liệu trao đổi có giá trị pháp lý khi được gửi đến đúng địa chỉ, số điện thoại hoặc email của người đại diện mỗi Bên ghi tại Hợp đồng này.", is_bullet=True)
    add_p(doc, "Các Bên công nhận giá trị pháp lý của các xác nhận nghiệp vụ, báo cáo tiến độ, phê duyệt Change Request gửi qua email chính thức hoặc nhóm trao đổi công việc của dự án.", is_bullet=True)

    add_article(doc, "20", "Điều khoản chung và hiệu lực hợp đồng")
    add_p(doc, "Hợp đồng có hiệu lực thi hành kể từ ngày ký (ngày 09/09/2026) cho đến khi Các Bên hoàn thành toàn bộ nghĩa vụ thanh toán và bảo hành.", is_bullet=True)
    add_p(doc, "Toàn bộ 06 Phụ lục đính kèm là bộ phận cấu thành không thể tách rời của Hợp đồng này. Mọi sửa đổi, bổ sung phải được lập thành văn bản hoặc phụ lục có chữ ký của người đại diện có thẩm quyền của Các Bên.", is_bullet=True)
    add_p(doc, "Hợp đồng gồm 06 Phụ lục, được lập thành 02 (hai) bản gốc có giá trị pháp lý như nhau, mỗi Bên giữ 01 (một) bản để thực hiện.", is_bullet=True)

    # 5. PHỤ LỤC 01 — SCOPE OF WORK
    doc.add_page_break()
    add_p(doc, "PHỤ LỤC 01 – SCOPE OF WORK / ĐẶC TẢ YÊU CẦU HỆ THỐNG", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=4, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    add_p(doc, "Hệ thống Quản lý TikTok Account & Tự động hóa Vận hành (TikTok Fleet Management MVP)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=10, font_size=11, italic=True, color=COLOR_MUTED, keep_with_next=True)

    sow_data = [
        ("1. Quản lý Tài khoản TikTok & Hồ sơ Vận hành", "Quản lý danh sách tài khoản tập trung; phân loại trạng thái vòng đời (Active, Warming, Restricted, Banned, Stopped), quốc gia, gán tài khoản cho nhân viên/nhóm phụ trách; theo dõi lịch sử Audit Trail & Risk Alerts.", "Tuần 1\n(16/09/2026)", "4.000.000 VNĐ"),
        ("2. Tự động hóa GPM-Login & Playwright Extraction Engine", "Tích hợp GPM-Login REST API v1 quản lý profile trình duyệt độc lập chống checkpoint; Playwright CDP engine trích xuất số liệu Views (1d/7d/30d), Likes, Followers, Creator Rewards USD, RPM; cơ chế quét tự động ngầm (Auto-sync Cron).", "Tuần 2\n(23/09/2026)", "6.500.000 VNĐ"),
        ("3. Hệ thống Chấm công & Checklist Hiệu suất", "Danh sách công việc chi tiết hằng ngày gắn theo từng tài khoản TikTok; thuật toán tự động tính ngày công chuẩn hóa (≥85%: 1.0 công; 50-84%: 0.5 công; <50%: 0.0 công); cơ chế khóa sổ tự động cố định (Auto Cut-off Lock 23:59) chống gian lận lùi ngày.", "Tuần 3\n(30/09/2026)", "4.500.000 VNĐ"),
        ("4. Quản lý, Phân tích & Import Báo cáo Doanh thu", "Quản lý doanh thu đa kênh (Creator Rewards, Affiliate, Ads); module nạp file Excel/CSV số lượng lớn với cơ chế đối soát tự động; tính toán các chỉ số tài chính nâng cao (Doanh thu/video, Doanh thu/account, RPM trung bình).", "Tuần 4\n(07/10/2026)", "4.000.000 VNĐ"),
        ("5. Dashboard Trung tâm & Bảng Xếp Hạng (Leaderboard)", "Dashboard thời gian thực trực quan hóa dữ liệu tăng trưởng (Recharts); thống kê chuyên sâu theo Account, Nhân viên, Team; Bảng xếp hạng (Leaderboard) vinh danh nhân viên theo Doanh thu và Số ngày công tích lũy.", "Tuần 5\n(14/10/2026)", "4.500.000 VNĐ"),
        ("6. Quản trị Đội ngũ, Phân Quyền & Bảo Mật (Admin RBAC)", "Quản lý danh sách nhân sự; quản lý nhóm làm việc (Team); phân quyền truy cập đa cấp (Admin / Leader / Staff); bảo mật đăng nhập với JWT Token mã hóa & Bcrypt; trang cấu hình tham số hệ thống.", "Tuần 1 & 5", "3.000.000 VNĐ"),
        ("7. Kiểm thử Tích hợp, Tối ưu Hiệu năng & Triển khai", "Kiểm thử toàn diện luồng tự động hóa trích xuất GPM; tối ưu hóa tốc độ truy vấn cơ sở dữ liệu PostgreSQL; đóng gói ứng dụng web Next.js 16 triển khai lên máy chủ VPS của Bên A; đào tạo và bàn giao vận hành.", "Tuần 6\n(21/10/2026)", "3.500.000 VNĐ"),
        ("TỔNG CỘNG CHI PHÍ PHÁT TRIỂN", "Trọn gói phát triển toàn bộ 07 module hệ thống TikTok Fleet Automation MVP (Chưa bao gồm VAT, không bao gồm chi phí bên thứ ba VPS/Proxy/GPM).", "06 tuần\n(09/09 – 21/10)", "30.000.000 VNĐ")
    ]

    t_sow = doc.add_table(rows=len(sow_data) + 1, cols=4)
    t_sow.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_sow.autofit = False
    configure_table_pr(t_sow)
    sow_widths = [1996, 4356, 1360, 1360]
    
    # Header
    r0 = t_sow.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_txt in enumerate(["Hạng mục / Module", "Mô tả chi tiết & Tiêu chí kỹ thuật", "Thời hạn", "Giá trị"]):
        format_cell(r0.cells[c_i], width_dxa=sow_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_txt)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, row_t in enumerate(sow_data):
        row = t_sow.rows[r_i + 1]
        make_row_cant_split(row)
        is_total = (r_i == len(sow_data) - 1)
        fill = HEX_ROW_ALT if is_total else ("FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG)
        
        for c_i, val in enumerate(row_t):
            format_cell(row.cells[c_i], width_dxa=sow_widths[c_i], fill_hex=fill)
            p = row.cells[c_i].paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            
            if c_i in (2, 3):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                
            r = p.add_run(val)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(10)
            if is_total:
                r.bold = True
                if c_i == 3:
                    r.font.color.rgb = COLOR_NAVY
            elif c_i == 0:
                r.bold = True
                r.font.color.rgb = COLOR_NAVY

    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(6)
    post_p.paragraph_format.space_after = Pt(8)

    # 6. PHỤ LỤC 02 — DANH MỤC BÀN GIAO
    add_p(doc, "PHỤ LỤC 02 – DANH MỤC SẢN PHẨM BÀN GIAO (DELIVERABLES)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=14, space_after=8, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    deliverables = [
        "Toàn bộ mã nguồn hoàn chỉnh của ứng dụng web (Full Source Code Next.js 16 App Router + React 19 + TypeScript + Prisma ORM v7).",
        "Cấu trúc cơ sở dữ liệu và các tệp Database Migrations PostgreSQL hoàn chỉnh.",
        "Bộ module Tự động hóa GPM-Login REST API Client và Playwright Engine trích xuất dữ liệu hoàn chỉnh.",
        "Ứng dụng web MVP hoàn chỉnh vận hành ổn định trên máy chủ / VPS của Bên A.",
        "Bảng điều khiển quản trị trung tâm (Admin Dashboard) & Bảng xếp hạng nhân viên (Leaderboard).",
        "Chức năng quản lý đội ngũ tài khoản TikTok & liên kết Profile GPM-Login độc lập.",
        "Chức năng danh sách công việc hằng ngày (Checklist) và thuật toán tự động tính ngày công.",
        "Chức năng quản lý, phân tích RPM & module import đối soát dữ liệu doanh thu từ file Excel/CSV.",
        "Tài liệu kiến trúc kỹ thuật, hướng dẫn cài đặt môi trường, triển khai và hướng dẫn sử dụng vận hành hệ thống cơ bản.",
        "Danh mục thư viện mã nguồn mở và các thành phần bên thứ ba (Third-Party Component List).",
        "Biên bản bàn giao quyền quản trị, tài khoản hệ thống và Biên bản nghiệm thu dự án."
    ]
    for d in deliverables:
        add_p(doc, d, is_bullet=True)

    # 7. PHỤ LỤC 03 — THANH TOÁN
    add_p(doc, "PHỤ LỤC 03 – LỊCH TRÌNH THANH TOÁN THEO MỐC TIẾN ĐỘ", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=14, space_after=8, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    
    pay_data = [
        ("1", "Ký Hợp đồng & Khởi động dự án: Xác nhận đặc tả phạm vi, thiết kế CSDL PostgreSQL, cấu hình Prisma ORM và khung ứng dụng Next.js 16.", "30%", "9.000.000 VNĐ", "Ngày 09/09/2026\n(trong vòng 03 ngày làm việc sau khi ký)"),
        ("2", "Hoàn thành phát triển & tích hợp tự động hóa MVP: Hoàn thành tích hợp GPM-Login REST API, Playwright trích xuất dữ liệu, checklist chấm công tự động, import doanh thu Excel và Dashboard.", "40%", "12.000.000 VNĐ", "Dự kiến ngày 07/10/2026\n(sau khi hoàn thành Mốc 2)"),
        ("3", "Nghiệm thu UAT, triển khai & bàn giao: Hoàn thành kiểm thử nghiệm thu UAT thực tế, triển khai lên hạ tầng của Bên A, bàn giao toàn bộ mã nguồn, tài liệu và ký Biên bản nghiệm thu.", "30%", "9.000.000 VNĐ", "Dự kiến ngày 21/10/2026\n(trong vòng 03 ngày làm việc sau khi ký Biên bản nghiệm thu)"),
        ("TỔNG CỘNG", "Toàn bộ 03 đợt thanh toán trọn gói theo tiến độ hoàn thành dự án", "100%", "30.000.000 VNĐ", "Thời hạn thanh toán: tối đa 03 ngày làm việc")
    ]
    
    t_pay = doc.add_table(rows=len(pay_data) + 1, cols=5)
    t_pay.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_pay.autofit = False
    configure_table_pr(t_pay)
    pay_widths = [726, 2903, 1270, 2086, 2087]
    
    r0 = t_pay.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_txt in enumerate(["Mốc", "Điều kiện nghiệm thu thanh toán", "Tỷ lệ", "Số tiền (VNĐ)", "Hạn thanh toán"]):
        format_cell(r0.cells[c_i], width_dxa=pay_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_txt)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, row_t in enumerate(pay_data):
        row = t_pay.rows[r_i + 1]
        make_row_cant_split(row)
        is_total = (r_i == len(pay_data) - 1)
        fill = HEX_ROW_ALT if is_total else ("FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG)
        
        for c_i, val in enumerate(row_t):
            format_cell(row.cells[c_i], width_dxa=pay_widths[c_i], fill_hex=fill)
            p = row.cells[c_i].paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            
            if c_i in (0, 2, 3, 4):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                
            r = p.add_run(val)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(10)
            if is_total:
                r.bold = True
                if c_i == 3:
                    r.font.color.rgb = COLOR_NAVY
            elif c_i in (0, 2, 3):
                r.bold = True

    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(8)
    post_p.paragraph_format.space_after = Pt(8)

    # 8. CHỮ KÝ HỢP ĐỒNG CHÍNH
    add_signature_block(doc, rep_a="[Họ và tên Người đại diện Bên A]", rep_b="Nguyễn Tiến Đạt", role_a="[Chức vụ]", role_b="Cá nhân / Bên cung cấp dịch vụ")

    # 9. PHẦN BỔ SUNG — CÁC ĐIỀU KHOẢN CHUYÊN SÂU
    doc.add_page_break()
    add_p(doc, "PHẦN BỔ SUNG – CÁC ĐIỀU KHOẢN CHUYÊN SÂU ĐỀ XUẤT", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=6, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    add_p(doc, "Phần này bổ sung các cơ chế chuyên sâu bảo vệ quyền lợi vận hành thực tế của Các Bên: quản lý mã nguồn, môi trường triển khai, cam kết SLA quản lý lỗi, bảo mật, sao lưu dữ liệu và chuyển đổi bàn giao.", align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=10, line_spacing=1.15, font_size=11, italic=True, color=COLOR_MUTED)

    add_article(doc, "21", "Tài liệu yêu cầu và tiêu chí kỹ thuật")
    add_p(doc, "Tài liệu đặc tả yêu cầu nghiệp vụ (SRS/BRD), thiết kế giao diện (Figma/Wireframe), sơ đồ cơ sở dữ liệu PostgreSQL và tài liệu API là căn cứ kỹ thuật chính xác để xác định phạm vi và nghiệm thu sản phẩm.", is_bullet=True)
    add_p(doc, "Mỗi chức năng phải có tiêu chí kiểm tra rõ ràng theo nguyên tắc Đạt / Không đạt (Pass/Fail) dựa trên kết quả vận hành thực tế.", is_bullet=True)

    add_article(doc, "22", "Mô hình phát triển, repository và quản lý phiên bản")
    add_p(doc, "Mô hình hợp đồng: Fixed Price (Trọn gói theo phạm vi MVP đã xác định).", is_bullet=True)
    add_p(doc, "Hệ thống quản lý mã nguồn (Repository): Bên B khởi tạo và duy trì source code trên nền tảng GitHub / GitLab private repository, phân chia rõ ràng các branch (main, develop, release) và gắn tag các phiên bản bàn giao.", is_bullet=True)
    add_p(doc, "Mọi thông tin bảo mật, API key của Bên A tuyệt đối không được đưa trực tiếp (hardcode) vào source code công khai.", is_bullet=True)

    add_article(doc, "23", "Quy trình quản lý lỗi và mức độ ưu tiên (SLA)")
    sla_data = [
        ("P1 / Critical", "Hệ thống ngừng hoạt động hoàn toàn, lỗi kết nối database hoặc luồng trích xuất dữ liệu cốt lõi bị gián đoạn toàn bộ.", "Trong vòng 02 giờ", "12 – 24 giờ"),
        ("P2 / Major", "Chức năng quan trọng bị lỗi (như chấm công hoặc import Excel bị sai số liệu) nhưng hệ thống vẫn truy cập được.", "Trong vòng 04 giờ", "01 – 02 ngày làm việc"),
        ("P3 / Minor", "Lỗi giao diện nhỏ, sai lệch định dạng hiển thị, không ảnh hưởng đến luồng vận hành cốt lõi.", "Trong vòng 01 ngày làm việc", "02 – 03 ngày làm việc")
    ]
    t_sla = doc.add_table(rows=len(sla_data) + 1, cols=4)
    t_sla.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_sla.autofit = False
    configure_table_pr(t_sla)
    sla_widths = [1633, 3810, 1814, 1815]
    
    r0 = t_sla.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_txt in enumerate(["Mức độ lỗi", "Mô tả tiêu chí lỗi", "Thời gian phản hồi", "Mục tiêu khắc phục"]):
        format_cell(r0.cells[c_i], width_dxa=sla_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_txt)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, row_t in enumerate(sla_data):
        row = t_sla.rows[r_i + 1]
        make_row_cant_split(row)
        fill = "FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG
        for c_i, val in enumerate(row_t):
            format_cell(row.cells[c_i], width_dxa=sla_widths[c_i], fill_hex=fill)
            p = row.cells[c_i].paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            if c_i in (0, 2, 3):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(val)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(10)
            if c_i == 0:
                r.bold = True
                r.font.color.rgb = COLOR_NAVY

    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(4)
    post_p.paragraph_format.space_after = Pt(6)

    add_article(doc, "24", "Triển khai, môi trường và Go-Live")
    add_p(doc, "Môi trường triển khai bao gồm: Môi trường Development (phát triển nội bộ) và Môi trường Production (máy chủ VPS của Bên A).", is_bullet=True)
    add_p(doc, "Bên B hỗ trợ cấu hình máy chủ VPS, cài đặt Docker, PostgreSQL Database, Node.js runtime, cấu hình Nginx Reverse Proxy và SSL Let's Encrypt / Cloudflare cho Bên A.", is_bullet=True)

    add_article(doc, "25", "Sao lưu, khôi phục và tính liên tục")
    add_p(doc, "Tần suất sao lưu: Tự động sao lưu cơ sở dữ liệu hằng ngày (Daily Auto-backup lúc 02:00 sáng). Thời gian lưu trữ bản backup tối thiểu 14 ngày trên máy chủ.", is_bullet=True)
    add_p(doc, "Mục tiêu phục hồi: RPO (Recovery Point Objective) ≤ 24 giờ; RTO (Recovery Time Objective) ≤ 04 giờ đối với hệ thống Production.", is_bullet=True)

    add_article(doc, "26", "Bảo vệ dữ liệu cá nhân")
    add_p(doc, "Các Bên tuân thủ quy định tại Nghị định 13/2023/NĐ-CP về bảo vệ dữ liệu cá nhân. Bên B chỉ xử lý dữ liệu nhân sự và tài khoản theo đúng chỉ dẫn phục vụ vận hành của Bên A.", is_bullet=True)

    add_article(doc, "27", "Kiểm thử bảo mật")
    add_p(doc, "Bên B thực hiện kiểm thử rà quét tĩnh (Static Analysis) và kiểm tra lỗ hổng dependency trước khi Go-live để đảm bảo an toàn mã nguồn.", is_bullet=True)

    add_article(doc, "28", "Open-Source và tài sản bên thứ ba")
    add_p(doc, "Bên B chỉ sử dụng các thư viện mã nguồn mở có giấy phép phổ biến (MIT, Apache 2.0, BSD), tuyệt đối không sử dụng thư viện dính giấy phép copyleft (GPL v3) buộc phải công khai mã nguồn độc quyền của Bên A.", is_bullet=True)

    add_article(doc, "29", "Sở hữu trí tuệ – Phân loại tài sản")
    ip_data = [
        ("Custom Code tạo riêng", "Bên A sở hữu độc quyền sau khi thanh toán đủ 100% giá trị Hợp đồng.", "Bàn giao đầy đủ mã nguồn và tài liệu kiến trúc."),
        ("Pre-existing Tools của Bên B", "Bên B giữ quyền tác giả gốc.", "Bên A nhận license sử dụng vĩnh viễn, phi độc quyền cho mục đích vận hành nội bộ."),
        ("Thư viện Open-source", "Theo license mã nguồn mở tương ứng (MIT/Apache).", "Cung cấp danh mục dependency trong package.json."),
        ("Dữ liệu tài khoản Bên A", "Thuộc quyền sở hữu tuyệt đối của Bên A.", "Bên B cam kết không sao chép, lưu trữ hay sử dụng ngoài phạm vi Hợp đồng.")
    ]
    t_ip = doc.add_table(rows=len(ip_data) + 1, cols=3)
    t_ip.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_ip.autofit = False
    configure_table_pr(t_ip)
    ip_widths = [2358, 3357, 3357]
    
    r0 = t_ip.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_txt in enumerate(["Loại tài sản", "Chủ sở hữu / Quyền sử dụng", "Cách thức xử lý bàn giao"]):
        format_cell(r0.cells[c_i], width_dxa=ip_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_txt)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10.5)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, row_t in enumerate(ip_data):
        row = t_ip.rows[r_i + 1]
        make_row_cant_split(row)
        fill = "FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG
        for c_i, val in enumerate(row_t):
            format_cell(row.cells[c_i], width_dxa=ip_widths[c_i], fill_hex=fill)
            p = row.cells[c_i].paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(val)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(10)
            if c_i == 0:
                r.bold = True
                r.font.color.rgb = COLOR_NAVY

    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(4)
    post_p.paragraph_format.space_after = Pt(6)

    add_article(doc, "30", "Bàn giao và chuyển giao tri thức")
    add_p(doc, "Trong vòng 05 ngày làm việc kể từ ngày nghiệm thu, Bên B bàn giao toàn bộ mã nguồn, cấu hình CI/CD và tài liệu hướng dẫn vận hành.", is_bullet=True)
    add_p(doc, "Bên B hỗ trợ đào tạo chuyển giao tri thức (Knowledge Transfer) tối đa 08 giờ làm việc trong vòng 07 ngày sau bàn giao.", is_bullet=True)

    add_article(doc, "31", "Đầu mối và phê duyệt")
    add_p(doc, "Bên A chỉ định Product Owner / Project Manager là người đại diện duy nhất có quyền xác nhận yêu cầu thay đổi và nghiệm thu kỹ thuật.", is_bullet=True)

    add_article(doc, "32", "Chậm thanh toán và tạm ngừng")
    add_p(doc, "Nếu Bên A chậm thanh toán quá 07 ngày làm việc kể từ ngày đến hạn thanh toán mà không có lý do chính đáng được Bên B chấp thuận, Bên B có quyền tạm ngừng cung cấp dịch vụ sau khi đã gửi thông báo trước 03 ngày làm việc.", is_bullet=True)

    add_article(doc, "33", "Nhân sự chủ chốt")
    add_p(doc, "Nhân sự kỹ thuật chủ chốt phụ trách dự án từ phía Bên B: Ông Nguyễn Tiến Đạt (Tech Lead / Full-Stack Developer).", is_bullet=True)

    add_article(doc, "34", "Lưu trữ hồ sơ dự án")
    add_p(doc, "Bên B có trách nhiệm lưu trữ an toàn bản sao mã nguồn và biên bản nghiệm thu trong vòng ít nhất 12 tháng kể từ ngày kết thúc dự án.", is_bullet=True)

    add_article(doc, "35", "Thuế và chi phí")
    add_p(doc, "Giá trị Hợp đồng chưa bao gồm VAT. Mỗi Bên tự chịu trách nhiệm thực hiện các nghĩa vụ thuế của mình phát sinh từ Hợp đồng theo quy định của pháp luật Việt Nam.", is_bullet=True)

    add_article(doc, "36", "Thứ tự ưu tiên tài liệu")
    add_p(doc, "Trường hợp có sự mâu thuẫn giữa các tài liệu, thứ tự ưu tiên áp dụng như sau: (1) Phụ lục sửa đổi gần nhất; (2) Hợp đồng này; (3) Báo giá và Scope of Work đã phê duyệt.", is_bullet=True)

    # 10. PHỤ LỤC 04 — CHECKLIST NGHIỆM THU
    doc.add_page_break()
    add_p(doc, "PHỤ LỤC 04 – CHECKLIST NGHIỆM THU KỸ THUẬT (UAT)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=8, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    
    chk_data = [
        ("1", "Quản lý TikTok Account", "Thêm/sửa/xóa, gán tài khoản cho nhân viên/team, cập nhật trạng thái vòng đời (Active, Warming, Restricted, Banned, Stopped), lưu Audit Trail.", "[ ] Đạt  [ ] Không đạt", "Đầy đủ theo SOW"),
        ("2", "GPM-Login & Tự động hóa", "Kết nối Local REST API mở đúng Profile UUID, Playwright CDP engine trích xuất Views, Likes, Creator Rewards USD, RPM chính xác.", "[ ] Đạt  [ ] Không đạt", "Đạt tiêu chí chống checkpoint"),
        ("3", "Checklist & Chấm công", "Checklist hằng ngày theo account, tự động chấm công (≥85%: 1 công, 50-84%: 0.5 công, <50%: 0 công), khóa sổ tự động lúc 23:59.", "[ ] Đạt  [ ] Không đạt", "Đã kiểm thử logic khóa sổ"),
        ("4", "Phân tích Doanh thu & Excel", "Import doanh thu từ file Excel/CSV chuẩn xác, tính toán RPM trung bình, doanh thu/account, doanh thu/video.", "[ ] Đạt  [ ] Không đạt", "Đạt chuẩn đối soát"),
        ("5", "Dashboard & Leaderboard", "Hiển thị biểu đồ trực quan Recharts mượt mà, Bảng xếp hạng nhân viên vinh danh đúng theo Doanh thu và Số ngày công.", "[ ] Đạt  [ ] Không đạt", "Hiển thị thời gian thực"),
        ("6", "Phân quyền & Bảo mật RBAC", "Phân quyền chặt chẽ Admin / Leader / Staff, mã hóa mật khẩu Bcrypt, phiên làm việc an toàn với JWT Token.", "[ ] Đạt  [ ] Không đạt", "Bảo mật an toàn"),
        ("7", "Triển khai & Bàn giao", "Ứng dụng vận hành ổn định trên máy chủ VPS của Bên A, kết nối CSDL PostgreSQL, bàn giao đầy đủ mã nguồn và tài liệu hướng dẫn.", "[ ] Đạt  [ ] Không đạt", "Triển khai hoàn chỉnh")
    ]
    
    t_chk = doc.add_table(rows=len(chk_data) + 1, cols=5)
    t_chk.alignment = WD_TABLE_ALIGNMENT.CENTER
    t_chk.autofit = False
    configure_table_pr(t_chk)
    chk_widths = [635, 2086, 2722, 1996, 1633]
    
    r0 = t_chk.rows[0]
    make_row_cant_split(r0)
    make_row_header(r0)
    for c_i, h_txt in enumerate(["STT", "Hạng mục kiểm tra", "Tiêu chí nghiệm thu Đạt / Không đạt", "Kết quả UAT", "Ghi chú"]):
        format_cell(r0.cells[c_i], width_dxa=chk_widths[c_i], fill_hex=HEX_NAVY, top_m=140, bot_m=140)
        p = r0.cells[c_i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(h_txt)
        r.bold = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.color.rgb = COLOR_WHITE
        
    for r_i, row_t in enumerate(chk_data):
        row = t_chk.rows[r_i + 1]
        make_row_cant_split(row)
        fill = "FFFFFF" if r_i % 2 == 1 else HEX_LIGHT_BG
        for c_i, val in enumerate(row_t):
            format_cell(row.cells[c_i], width_dxa=chk_widths[c_i], fill_hex=fill)
            p = row.cells[c_i].paragraphs[0]
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            p.paragraph_format.line_spacing = 1.15
            if c_i in (0, 3):
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
            r = p.add_run(val)
            r.font.name = 'Times New Roman'
            r.font.size = Pt(9.5)
            if c_i == 0:
                r.bold = True
            elif c_i == 1:
                r.bold = True
                r.font.color.rgb = COLOR_NAVY

    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(6)
    post_p.paragraph_format.space_after = Pt(8)

    # 11. PHỤ LỤC 05 — CHECKLIST BÀN GIAO SOURCE CODE & HẠ TẦNG
    add_p(doc, "PHỤ LỤC 05 – CHECKLIST BÀN GIAO MÃ NGUỒN & HẠ TẦNG KỸ THUẬT", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=14, space_after=8, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    infra_items = [
        "Repository Git và toàn bộ quyền quản trị (Admin access) trên GitHub / GitLab.",
        "Toàn bộ mã nguồn sạch (Full Source Code) phiên bản hoàn chỉnh đã qua kiểm thử UAT.",
        "Tệp cấu hình môi trường (.env.example) và danh mục các biến môi trường cần thiết.",
        "Tệp sơ đồ cơ sở dữ liệu (schema.prisma) và toàn bộ các file migrations PostgreSQL.",
        "Module tự động hóa Playwright Engine và script chạy ngầm định kỳ (Background Auto-sync Cron).",
        "Tệp Dockerfile / docker-compose.yml hoặc script triển khai máy chủ tự động.",
        "Cấu hình Nginx Web Server Reverse Proxy và chứng chỉ SSL bảo mật.",
        "Tài liệu hướng dẫn cài đặt môi trường máy chủ và hướng dẫn build/deploy hệ thống từ đầu.",
        "Tài liệu hướng dẫn sử dụng Dashboard dành cho Admin, Leader và Nhân viên.",
        "Tài khoản quản trị cao nhất (Super Admin Account) bàn giao cho Bên A đổi mật khẩu.",
        "Danh mục các thư viện bên thứ ba và license tương ứng.",
        "Biên bản bàn giao và cam kết hỗ trợ bảo hành 30 ngày."
    ]
    for item in infra_items:
        add_p(doc, item, is_bullet=True)

    # 12. PHỤ LỤC 06 — BIÊN BẢN NGHIỆM THU MẪU
    doc.add_page_break()
    add_p(doc, "PHỤ LỤC 06 – BIÊN BẢN NGHIỆM THU VÀ BÀN GIAO SẢN PHẨM", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=10, space_after=6, font_size=13, bold=True, color=COLOR_NAVY, keep_with_next=True)
    add_p(doc, "(Mẫu ký khi hoàn thành kiểm thử UAT và triển khai hệ thống)", align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=12, font_size=11, italic=True, color=COLOR_MUTED, keep_with_next=True)

    add_p(doc, "Hôm nay, ngày 21 tháng 10 năm 2026, tại Hà Nội, Các Bên gồm:", space_before=4, space_after=4, italic=True)
    add_p(doc, "• BÊN A: [Tên Khách hàng / Tên Doanh nghiệp] — Đại diện: [Họ và tên]", space_before=2, space_after=2)
    add_p(doc, "• BÊN B: Nguyễn Tiến Đạt — Đại diện: Ông Nguyễn Tiến Đạt (Bên cung cấp dịch vụ)", space_before=2, space_after=6)
    add_p(doc, "Hai Bên cùng tiến hành đánh giá, nghiệm thu sản phẩm phần mềm theo Hợp đồng số 01/2026/HĐPTPM-TIKTOK ký ngày 09/09/2026 với các nội dung chi tiết sau:", space_before=4, space_after=6)

    add_p(doc, "1. Tên sản phẩm nghiệm thu: Hệ thống Quản lý TikTok Account & Tự động hóa Vận hành (TikTok Account Management MVP v1.0).", is_bullet=True)
    add_p(doc, "2. Nội dung nghiệm thu: Toàn bộ 07 module tính năng theo Scope of Work (Phụ lục 01) và Checklist kiểm thử kỹ thuật (Phụ lục 04).", is_bullet=True)
    add_p(doc, "3. Kết quả nghiệm thu thực tế: ĐẠT YÊU CẦU NGHIỆM THU TOÀN PHẦN. Hệ thống hoạt động ổn định trên máy chủ, kết nối GPM-Login trích xuất dữ liệu chính xác, thuật toán chấm công và module doanh thu vận hành đúng đặc tả.", is_bullet=True)
    add_p(doc, "4. Danh mục lỗi còn tồn đọng: Không có lỗi nghiêm trọng (Critical / Major). Các yêu cầu tinh chỉnh giao diện thẩm mỹ nhỏ (nếu có) được ghi nhận để Bên B hỗ trợ trong thời hạn bảo hành 30 ngày.", is_bullet=True)
    add_p(doc, "5. Kết luận: Bên A đồng ý nghiệm thu và nhận bàn giao toàn bộ mã nguồn, tài liệu và quyền quản trị hệ thống. Việc ký biên bản này là căn cứ để Bên A thanh toán Đợt 3 (30% giá trị hợp đồng tương đương 9.000.000 VNĐ) cho Bên B.", is_bullet=True)

    add_signature_block(doc, rep_a="[Họ và tên Người đại diện Bên A]", rep_b="Nguyễn Tiến Đạt", role_a="[Chức vụ]", role_b="Cá nhân / Bên cung cấp dịch vụ")

    # 13. GHI CHÚ SOẠN THẢO (CALLOUT BOX)
    post_p = doc.add_paragraph()
    post_p.paragraph_format.space_before = Pt(8)
    post_p.paragraph_format.space_after = Pt(8)

    note_tbl = doc.add_table(rows=1, cols=1)
    note_tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
    note_tbl.autofit = False
    configure_borderless_table_pr(note_tbl)
    
    cell = note_tbl.rows[0].cells[0]
    format_callout_cell(cell, width_dxa=TOTAL_WIDTH_DXA)
    
    cp0 = cell.paragraphs[0]
    cp0.paragraph_format.space_before = Pt(0)
    cp0.paragraph_format.space_after = Pt(4)
    r = cp0.add_run("GHI CHÚ SOẠN THẢO – HƯỚNG DẪN HOÀN THIỆN TRƯỚC KHI KÝ KẾT")
    r.bold = True
    r.font.name = 'Times New Roman'
    r.font.size = Pt(11)
    r.font.color.rgb = COLOR_NAVY

    notes = [
        "1. Toàn bộ thông tin của Bên B (Ông Nguyễn Tiến Đạt, CCCD 040096021300, Địa chỉ Thanh Lĩnh, Thanh Chương, Nghệ An, SĐT 0326119184, STK 1234567890 Vietcombank) đã được cập nhật chính xác 100% vào Hợp đồng.",
        "2. Toàn bộ thông số dự án (Tổng giá trị 30.000.000 VNĐ, 3 đợt thanh toán 9tr - 12tr - 9tr, tiến độ 6 tuần từ 09/09/2026 đến 21/10/2026, 7 module chi tiết SOW, bảo hành 30 ngày) đã được đồng bộ chuẩn xác từ bản Báo giá TikTok Account Management MVP.",
        "3. Trước khi ký chính thức, Bên A chỉ cần điền các thông tin pháp nhân của Bên A vào các vị trí có dấu ngoặc vuông [●] tại bảng Bên A ở trang đầu, sau đó in 02 bản hoặc xuất file PDF ký số điện tử."
    ]
    for n in notes:
        cp = cell.add_paragraph()
        cp.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        cp.paragraph_format.space_before = Pt(2)
        cp.paragraph_format.space_after = Pt(4)
        cp.paragraph_format.line_spacing = 1.15
        r = cp.add_run(n)
        r.italic = True
        r.font.name = 'Times New Roman'
        r.font.size = Pt(10)
        r.font.color.rgb = RGBColor(75, 85, 99)

    out_path = "c:\\Users\\datng\\tiktok-automation\\Mau_Hop_Dong_Phat_Trien_Phan_Mem_Viet_Nam_Comprehensive_v2.docx"
    doc.save(out_path)
    print(f"SUCCESS: Saved customized contract to {out_path}")

    # Validate with Word COM
    res = subprocess.run(['powershell', '-ExecutionPolicy', 'Bypass', '-File', 'test_open.ps1', out_path], capture_output=True, text=True)
    print("Word validation:", res.stdout.strip())

if __name__ == '__main__':
    create_document()
