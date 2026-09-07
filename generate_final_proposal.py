import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    shading_elm = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    cell._tc.get_or_add_tcPr().append(shading_elm)

def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for m, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        node = OxmlElement(f'w:{m}')
        node.set(qn('w:w'), str(val))
        node.set(qn('w:type'), 'dxa')
        tcMar.append(node)
    tcPr.append(tcMar)

def set_cell_border(cell, **kwargs):
    tcPr = cell._tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
        edge_data = kwargs.get(edge)
        if edge_data:
            tag = f'w:{edge}'
            element = OxmlElement(tag)
            element.set(qn('w:val'), edge_data.get('val', 'single'))
            element.set(qn('w:sz'), str(edge_data.get('sz', 4)))
            element.set(qn('w:space'), '0')
            element.set(qn('w:color'), edge_data.get('color', 'auto'))
            tcBorders.append(element)
    tcPr.append(tcBorders)

def build_full_proposal(output_path):
    doc = docx.Document()
    
    # Page Margins
    for s in doc.sections:
        s.top_margin = Pt(45)
        s.bottom_margin = Pt(45)
        s.left_margin = Pt(50)
        s.right_margin = Pt(50)
        
    # Theme Palette
    COLOR_PRIMARY = RGBColor(0x1F, 0x38, 0x64)    # Dark Navy
    COLOR_SECONDARY = RGBColor(0x2E, 0x75, 0xB6)  # Accent Blue
    COLOR_SUBTITLE = RGBColor(0x16, 0x23, 0x3F)   # Dark Slate
    COLOR_MUTED = RGBColor(0x44, 0x54, 0x6A)      # Muted Grey
    COLOR_DARK = RGBColor(0x26, 0x26, 0x26)       # Body text
    COLOR_SUCCESS = RGBColor(0x1E, 0x7E, 0x34)    # Success Green
    
    # Header Title
    p_title1 = doc.add_paragraph()
    p_title1.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title1.paragraph_format.space_before = Pt(0)
    p_title1.paragraph_format.space_after = Pt(4)
    r1 = p_title1.add_run('BÁO GIÁ PHÁT TRIỂN HỆ THỐNG')
    r1.font.size = Pt(20)
    r1.font.bold = True
    r1.font.color.rgb = COLOR_PRIMARY
    
    p_title2 = doc.add_paragraph()
    p_title2.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title2.paragraph_format.space_before = Pt(0)
    p_title2.paragraph_format.space_after = Pt(18)
    r2 = p_title2.add_run('QUẢN LÝ TIKTOK ACCOUNT & TỰ ĐỘNG HÓA VẬN HÀNH — MVP')
    r2.font.size = Pt(15.5)
    r2.font.bold = True
    r2.font.color.rgb = COLOR_SECONDARY
    
    # Helper Functions
    def add_heading1(num_str, title_str):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(14)
        p.paragraph_format.space_after = Pt(6)
        p.paragraph_format.keep_with_next = True
        
        r_num = p.add_run(num_str + ' ')
        r_num.font.size = Pt(13)
        r_num.font.bold = True
        r_num.font.color.rgb = COLOR_SECONDARY
        
        r_title = p.add_run(title_str)
        r_title.font.size = Pt(13)
        r_title.font.bold = True
        r_title.font.color.rgb = COLOR_PRIMARY
        return p

    def add_subheading(letter_str, title_str):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(3)
        p.paragraph_format.keep_with_next = True
        
        r_let = p.add_run(letter_str + ' ')
        r_let.font.size = Pt(11.5)
        r_let.font.bold = True
        r_let.font.color.rgb = COLOR_SUBTITLE
        
        r_title = p.add_run(title_str)
        r_title.font.size = Pt(11.5)
        r_title.font.bold = True
        r_title.font.color.rgb = COLOR_SUBTITLE
        return p

    def add_bullet(text, level=0, bold_prefix=None, text_after=None, color=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(2)
        p.paragraph_format.left_indent = Pt(18 * (level + 1))
        
        r_bullet = p.add_run('• ' if level == 0 else '– ')
        r_bullet.font.size = Pt(10.5 if level == 0 else 10)
        r_bullet.font.color.rgb = COLOR_SECONDARY if level == 0 else COLOR_MUTED
        
        if bold_prefix:
            r_prefix = p.add_run(bold_prefix)
            r_prefix.font.size = Pt(10.5 if level == 0 else 10)
            r_prefix.font.bold = True
            r_prefix.font.color.rgb = COLOR_PRIMARY if level == 0 else COLOR_SUBTITLE
            
        if text:
            r_text = p.add_run(text)
            r_text.font.size = Pt(10.5 if level == 0 else 10)
            if color:
                r_text.font.color.rgb = color
            else:
                r_text.font.color.rgb = COLOR_DARK if level == 0 else COLOR_MUTED
                
        if text_after:
            r_after = p.add_run(text_after)
            r_after.font.size = Pt(10.5 if level == 0 else 10)
            r_after.font.color.rgb = COLOR_DARK if level == 0 else COLOR_MUTED
            
        return p

    def add_paragraph_body(text, italic=False):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(text)
        r.font.size = Pt(10.5)
        r.font.italic = italic
        r.font.color.rgb = COLOR_DARK
        return p

    # ==========================================
    # 1. PHẠM VI PHÁT TRIỂN
    # ==========================================
    add_heading1('1.', 'PHẠM VI PHÁT TRIỂN')
    
    add_subheading('A.', 'Quản lý TikTok Account & Hồ Sơ Vận Hành')
    add_bullet('Thêm / sửa / xóa / quản lý danh sách tài khoản TikTok tập trung.')
    add_bullet('Gán tài khoản cho nhân viên phụ trách theo cấu trúc Team/Nhóm.')
    add_bullet('Liên kết hồ sơ trình duyệt độc lập (GPM-Login Profile UUID) cho từng tài khoản.')
    add_bullet('Quản lý trạng thái vòng đời tài khoản:')
    add_bullet('Active (Hoạt động bình thường)', level=1)
    add_bullet('Warming (Đang nuôi dưỡng / tương tác nhẹ)', level=1)
    add_bullet('Restricted (Bị hạn chế / bóp tương tác)', level=1)
    add_bullet('Banned (Bị khóa / đình chỉ)', level=1)
    add_bullet('Stopped (Tạm dừng vận hành)', level=1)
    add_bullet('Theo dõi lịch sử thay đổi trạng thái và nhật ký cảnh báo (Audit Trail & Risk Alerts).')
    add_bullet('Hiển thị các chỉ số tài khoản và video trích xuất tự động:')
    for item in ['Username / Kênh', 'Followers', 'Following', 'Total Likes', 'Tổng số Video', 'Video Views (Hôm nay / 7d / 14d / 30d)', 'Video Likes & Tương tác', 'Creator Rewards Program (USD)', 'Ước tính RPM']:
        add_bullet(item, level=1)
        
    add_subheading('B.', 'Đồng bộ Dữ liệu TikTok qua GPM-Login & Tự động hóa Trình duyệt')
    add_bullet('Kết nối với GPM-Login Local REST API quản lý môi trường profile sạch, chống quét vân tay thiết bị.')
    add_bullet('Tự động hóa trình duyệt (Playwright Engine) trích xuất dữ liệu trực tiếp từ tài khoản TikTok Studio / Web.')
    add_bullet('Đồng bộ thông tin tài khoản, chỉ số video, lượt xem theo chu kỳ thời gian thực.')
    add_bullet('Trích xuất chỉ số doanh thu Creator Rewards Program (USD) và dữ liệu RPM trực tiếp.')
    add_bullet('Cơ chế Auto-sync chạy ngầm định kỳ (Background Cron Sync) không làm gián đoạn nhân viên.')
    add_bullet('Cơ chế Fallback: Hỗ trợ nạp dữ liệu từ file Excel/CSV và cập nhật thủ công khi cần.')

    add_subheading('C.', 'Chấm công / Checklist Hiệu suất Hằng ngày')
    add_bullet('Checklist công việc chi tiết theo từng TikTok Account (đăng video, tương tác, kiểm tra trạng thái).')
    add_bullet('Theo dõi tỷ lệ tài khoản hoàn thành nhiệm vụ trong ngày của từng nhân sự.')
    add_bullet('Thuật toán tự động tính ngày công chuẩn hóa:')
    add_bullet('≥ 85%: 1,0 ngày công', level=1)
    add_bullet('50% – < 85%: 0,5 ngày công', level=1)
    add_bullet('< 50%: 0,0 ngày công', level=1)
    add_bullet('Cơ chế Khóa sổ Tự động (Auto Cut-off Lock) tại khung giờ chốt dữ liệu cố định, chống sửa đổi lùi ngày.')
    add_bullet('Các ngưỡng chấm công và giờ chốt sổ có thể cấu hình linh hoạt trong trang Quản trị (Admin).')

    add_subheading('D.', 'Quản lý & Phân tích Doanh thu')
    add_bullet('Nhập doanh thu chi tiết theo từng account.')
    add_bullet('Import doanh thu Creator Rewards, TikTok Shop / Affiliate hàng loạt từ file Excel/CSV.')
    add_bullet('Tổng hợp doanh thu đa chiều theo:')
    for item in ['Tài khoản (Account)', 'Nhân viên phụ trách', 'Đội nhóm (Team)', 'Ngày / Tuần / Tháng / Khoảng thời gian tùy chọn']:
        add_bullet(item, level=1)
    add_bullet('Theo dõi các chỉ số tài chính nâng cao:')
    for item in ['Doanh thu trung bình / Account', 'Doanh thu trung bình / Video', 'Chỉ số RPM trung bình theo kênh / nhân viên']:
        add_bullet(item, level=1)

    add_subheading('E.', 'Dashboard Điều Hành & Bảng Xếp Hạng (Leaderboard)')
    add_bullet('Dashboard tổng quan thời gian thực (tổng view, doanh thu, tài khoản active, tỷ lệ cảnh báo).')
    add_bullet('Biểu đồ trực quan hóa dữ liệu tăng trưởng (Recharts) theo ngày/tuần/tháng.')
    add_bullet('Thống kê chuyên sâu theo Account, Nhân viên và Team.')
    add_bullet('Leaderboard vinh danh nhân viên theo:')
    for item in ['Tổng doanh thu tạo ra', 'Số ngày công đạt được']:
        add_bullet(item, level=1)
    add_bullet('Bộ lọc linh hoạt theo thời gian, nhân viên, nhóm và trạng thái.')

    add_subheading('F.', 'Quản trị Hệ thống & Phân Quyền (Admin & Security)')
    add_bullet('Quản lý nhân sự, phân quyền đa cấp (Admin / Leader / Staff).')
    add_bullet('Quản lý phân chia Team / Nhóm.')
    add_bullet('Cấu hình các tham số hệ thống (ngưỡng chấm công, giờ chốt sổ, cấu hình cổng GPM-Login API).')
    add_bullet('Quản lý và giám sát trạng thái sức khỏe toàn bộ dàn tài khoản.')
    add_bullet('Hệ thống Audit Logs ghi nhận lịch sử hoạt động và cảnh báo rủi ro.')

    # ==========================================
    # 2. ĐỀ XUẤT GIẢI PHÁP & CÔNG NGHỆ TRIỂN KHAI
    # ==========================================
    add_heading1('2.', 'ĐỀ XUẤT GIẢI PHÁP & CÔNG NGHỆ TRIỂN KHAI')
    
    add_subheading('A.', 'Kiến trúc & Công nghệ Sử Dụng (Tech Stack)')
    add_paragraph_body('Hệ thống được thiết kế theo kiến trúc hiện đại, phân lớp rõ ràng, áp dụng giải pháp tự động hóa trình duyệt chống phát hiện (Anti-detect Automation) kết hợp nền tảng Web App hiệu năng cao:')
    
    add_bullet(bold_prefix='Giao diện & Trải nghiệm Người dùng (Frontend): ', text='')
    add_bullet('Next.js 16 (App Router) + React 19 + TypeScript: ', level=1, text_after='Nền tảng phát triển ứng dụng web hiện đại nhất, kết hợp SSR & CSR tối ưu tốc độ render, bảo mật mã nguồn và an toàn kiểu dữ liệu (Strict Type-Safety).')
    add_bullet('Tailwind CSS v4 & Radix UI: ', level=1, text_after='Xây dựng giao diện Dashboard chuyên nghiệp, hỗ trợ Dark/Light mode chuẩn mực, tương thích responsive trên mọi kích thước màn hình.')
    add_bullet('TanStack React Query v5 & Redux Toolkit: ', level=1, text_after='Quản lý dữ liệu tập trung, cơ chế tự động cache và cập nhật nền (background sync) giúp thao tác tức thì không cần tải lại trang.')
    add_bullet('Recharts Data Visualization: ', level=1, text_after='Hệ thống biểu đồ trực quan tương tác cao, phục vụ phân tích xu hướng doanh thu, RPM, lượt xem và bảng xếp hạng.')

    add_bullet(bold_prefix='Hệ thống Backend & Cơ sở Dữ liệu: ', text='')
    add_bullet('Next.js API & tRPC Architecture: ', level=1, text_after='Kiến trúc Type-safe end-to-end kết nối đồng bộ giữa Client và Server, loại bỏ triệt để sai lệch dữ liệu, nâng cao độ tin cậy.')
    add_bullet('PostgreSQL Database: ', level=1, text_after='Hệ cơ sở dữ liệu quan hệ mạnh mẽ, đảm bảo tính toàn vẹn dữ liệu tài chính và chấm công (chuẩn ACID), tối ưu hóa chỉ mục (Indexing) cho hàng triệu bản ghi.')
    add_bullet('Prisma ORM v7: ', level=1, text_after='Tầng truy cập dữ liệu cao cấp, bảo đảm an toàn dữ liệu, chống SQL Injection và tự động quản lý phiên bản database migration.')
    add_bullet('NextAuth.js v5 (Auth.js) & Bcrypt: ', level=1, text_after='Bảo mật phiên làm việc với JWT Token mã hóa an toàn, phân quyền đa cấp theo vai trò (Admin / Lead / Staff).')

    add_bullet(bold_prefix='Tự động hóa Trình duyệt & Tích hợp Dữ liệu (Automation & Extraction Layer): ', text='')
    add_bullet('GPM-Login REST API Client (v1): ', level=1, text_after='Giao tiếp trực tiếp với phần mềm GPM-Login qua Local REST API, quản lý độc lập các profile trình duyệt chống phát hiện vân tay (Anti-detect Fingerprint), tách biệt môi trường proxy sạch cho từng tài khoản.')
    add_bullet('Playwright Engine & Fast Snapshot CDP: ', level=1, text_after='Bộ máy tự động hóa trình duyệt chuyên dụng kết nối qua Chrome DevTools Protocol (CDP), trích xuất nhanh dữ liệu hồ sơ, lượt xem, Creator Rewards USD, RPM mà không chiếm dụng thao tác hay làm gián đoạn luồng làm việc của nhân viên.')
    add_bullet('Background Auto-Sync Cron: ', level=1, text_after='Hệ thống tác vụ chạy ngầm định kỳ tự động quét và cập nhật số liệu mới nhất về hệ cơ sở dữ liệu trung tâm.')
    add_bullet('Smart File Processor (XLSX/CSV): ', level=1, text_after='Module nạp dữ liệu thông minh, tự động phân tích và đối soát file báo cáo doanh thu Creator Rewards / Affiliate / RPM số lượng lớn.')

    add_subheading('B.', 'Phương Án & Giải Pháp Nghiệp Vụ Kỹ Thuật')
    
    add_bullet(bold_prefix='1. Giải pháp Quản lý Tài khoản Đa cấp & Chống Checkpoint (Fleet & Profile Isolation):', text='')
    add_bullet('Phân bổ tài khoản linh hoạt cho từng nhân viên và nhóm (Team). Nhân viên chỉ thấy và thao tác trên tài khoản được giao phụ trách, đảm bảo tính bảo mật nội bộ.', level=1)
    add_bullet('Mỗi tài khoản TikTok được gắn kết chặt chẽ với một GPM-Login Profile UUID độc lập, bảo toàn cookie/session và môi trường proxy sạch, hạn chế tối đa nguy cơ checkpoint hay khóa liên đới tài khoản.', level=1)
    add_bullet('Quản lý vòng đời tài khoản toàn diện với các trạng thái rõ ràng (Active, Warming, Restricted, Banned, Stopped) kèm hệ thống Audit Log ghi nhận lịch sử thay đổi.', level=1)
    add_bullet('Cơ chế cảnh báo rủi ro (Risk & Health Alerts): Tự động phát hiện và cảnh báo tài khoản bị hạn chế, mất trạng thái đăng nhập hoặc dính cảnh báo vi phạm.', level=1)

    add_bullet(bold_prefix='2. Giải pháp Thu thập & Đồng bộ Dữ liệu Tự động (Automated Multi-tier Ingestion):', text='')
    add_bullet('Tầng 1 (Tự động hóa GPM-Login & Playwright): Tự động mở ngầm profile, kết nối CDP trích xuất đầy đủ các chỉ số Views (1d/7d/14d/30d), Likes, Followers, Videos, Creator Rewards Program USD và tính toán RPM thời gian thực.', level=1)
    add_bullet('Tầng 2 (Import Báo cáo Thông minh): Đối với các bảng tổng kết tài chính định kỳ từ TikTok Studio / Affiliate, hệ thống cung cấp công cụ nạp file Excel/CSV chuẩn hóa với cơ chế đối soát dữ liệu tự động.', level=1)
    add_bullet('Tầng 3 (Manual Fallback): Cho phép cập nhật thủ công tức thì khi cần điều chỉnh khẩn cấp hoặc khi môi trường máy trạm cần nhập bù số liệu.', level=1)

    add_bullet(bold_prefix='3. Giải pháp Chấm công Tự động theo Hiệu suất & Checklist (Automated Workday Scoring):', text='')
    add_bullet('Checklist việc làm hằng ngày gắn chặt với từng TikTok Account (đăng video, tương tác, kiểm tra trạng thái).', level=1)
    add_bullet('Thuật toán tự động chấm công chuẩn hóa theo tỷ lệ hoàn thành checklist trong ngày: Đạt ≥85% tính 1.0 công; 50% đến <85% tính 0.5 công; dưới 50% tính 0.0 công.', level=1)
    add_bullet('Cơ chế Khóa sổ Tự động (Auto Cut-off Lock): Tự động chốt dữ liệu vào khung giờ cấu hình (ví dụ 23:59), ngăn chặn tình trạng gian lận hoặc sửa đổi lùi ngày.', level=1)

    add_bullet(bold_prefix='4. Giải pháp Báo cáo Doanh thu & Bảng Xếp Hạng Động Lực (Leaderboard & Analytics):', text='')
    add_bullet('Tổng hợp doanh thu đa chiều: theo Account, theo Nhân viên, theo Team và theo từng khoảng thời gian tùy chọn.', level=1)
    add_bullet('Phân tích chuyên sâu các chỉ số tài chính mở rộng: Doanh thu trung bình/video, RPM trung bình, hiệu suất tài chính theo từng nhân sự.', level=1)
    add_bullet('Bảng xếp hạng (Leaderboard) vinh danh nhân viên xuất sắc theo Doanh thu và Số ngày công, kích thích động lực làm việc tích cực trong đội ngũ.', level=1)

    add_bullet(bold_prefix='5. Giải pháp An toàn, Bảo mật & Sẵn sàng Mở rộng (Security & Scalability):', text='')
    add_bullet('Bảo mật dữ liệu nhiều lớp, mã hóa mật khẩu và token, phân quyền truy cập nghiêm ngặt theo vai trò.', level=1)
    add_bullet('Kiến trúc phân tán tối ưu sẵn sàng mở rộng quy mô từ 50 tài khoản lên hàng nghìn tài khoản mà không làm giảm tốc độ hệ thống.', level=1)

    # ==========================================
    # 3. TIẾN ĐỘ THỰC HIỆN
    # ==========================================
    add_heading1('3.', 'TIẾN ĐỘ THỰC HIỆN')
    add_paragraph_body('Tổng thời gian dự kiến: 4–6 tuần')
    
    # Table 1: Timeline
    table_timeline = doc.add_table(rows=7, cols=3)
    table_timeline.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_timeline.autofit = False
    
    col_widths_tl = [Inches(1.3), Inches(1.0), Inches(4.5)]
    headers_tl = ['Giai đoạn', 'Thời gian', 'Nội dung']
    
    hdr_cells = table_timeline.rows[0].cells
    for i, title in enumerate(headers_tl):
        hdr_cells[i].text = title
        set_cell_background(hdr_cells[i], '1F3864')
        set_cell_margins(hdr_cells[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i < 2 else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.size = Pt(10)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    tl_data = [
        ('Giai đoạn 1', 'Tuần 1', 'Cấu trúc cơ sở dữ liệu PostgreSQL, xác thực người dùng NextAuth, phân quyền RBAC và quản lý tài khoản TikTok'),
        ('Giai đoạn 2', 'Tuần 2', 'Tích hợp GPM-Login REST API, xây dựng Engine tự động hóa Playwright trích xuất chỉ số & Creator Rewards'),
        ('Giai đoạn 3', 'Tuần 3', 'Hệ thống danh sách công việc (Checklist), thuật toán tính ngày công và cơ chế khóa sổ tự động (Cut-off Lock)'),
        ('Giai đoạn 4', 'Tuần 4', 'Quản lý, phân tích doanh thu, RPM, module import Excel/CSV và bảng xếp hạng nhân viên (Leaderboard)'),
        ('Giai đoạn 5', 'Tuần 5', 'Bảng điều khiển quản trị trung tâm (Admin Dashboard), hệ thống cảnh báo rủi ro và kiểm thử tích hợp toàn diện'),
        ('Giai đoạn 6', 'Tuần 6', 'Tối ưu hóa hiệu năng, kiểm thử nghiệm thu (UAT), đóng gói triển khai và bàn giao hệ thống')
    ]
    
    for r_idx, (g_doan, t_gian, n_dung) in enumerate(tl_data, start=1):
        row_cells = table_timeline.rows[r_idx].cells
        row_cells[0].text = g_doan
        row_cells[1].text = t_gian
        row_cells[2].text = n_dung
        
        bg_color = 'F2F5F9' if r_idx % 2 == 1 else 'FFFFFF'
        
        for c_idx, cell in enumerate(row_cells):
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            set_cell_border(cell, 
                            bottom={'sz': 4, 'val': 'single', 'color': 'D9D9D9'},
                            top={'sz': 4, 'val': 'single', 'color': 'D9D9D9'})
            p = cell.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SUBTITLE
            elif c_idx == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.color.rgb = COLOR_DARK
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.color.rgb = COLOR_DARK

    for row in table_timeline.rows:
        for idx, width in enumerate(col_widths_tl):
            row.cells[idx].width = width

    add_paragraph_body('Tiến độ có thể thay đổi linh hoạt tùy thuộc vào tốc độ cung cấp tài khoản, cấu hình máy trạm GPM-Login, tài liệu nghiệp vụ từ phía khách hàng.', italic=True)

    # ==========================================
    # 4. CHI PHÍ TRIỂN KHAI CHI TIẾT
    # ==========================================
    add_heading1('4.', 'CHI PHÍ TRIỂN KHAI CHI TIẾT')
    add_paragraph_body('Bảng phân rã chi phí chi tiết theo từng module chức năng của hệ thống (Tổng giá trị phát triển: 30.000.000 VNĐ):')
    
    table_cost = doc.add_table(rows=9, cols=3)
    table_cost.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_cost.autofit = False
    col_widths_cost = [Inches(1.8), Inches(3.3), Inches(1.7)]
    
    cost_headers = ['Module / Hạng mục', 'Mô tả chi tiết hạng mục công việc', 'Chi phí']
    hdr_cells_cost = table_cost.rows[0].cells
    for i, title in enumerate(cost_headers):
        hdr_cells_cost[i].text = title
        set_cell_background(hdr_cells_cost[i], '1F3864')
        set_cell_margins(hdr_cells_cost[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells_cost[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i == 0 else (WD_ALIGN_PARAGRAPH.LEFT if i == 1 else WD_ALIGN_PARAGRAPH.RIGHT)
        for r in p.runs:
            r.font.size = Pt(10)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    cost_data = [
        ('1. Quản lý Tài khoản TikTok & Hồ sơ Vận hành', 'Quản lý danh sách tập trung, phân loại trạng thái (Active, Warming, Restricted, Banned, Stopped), quốc gia, gán tài khoản cho nhân viên/team, nhật ký Audit Trail.', '4.000.000 VNĐ'),
        ('2. Tự động hóa GPM-Login & Playwright Extraction Engine', 'Tích hợp GPM-Login REST API v1, engine tự động hóa Playwright trích xuất dữ liệu TikTok Studio (Followers, Likes, Views 1d/7d/30d, Creator Rewards USD, RPM), quét ngầm định kỳ (Auto-sync Cron).', '6.500.000 VNĐ'),
        ('3. Hệ thống Chấm công & Checklist Hiệu suất', 'Checklist hằng ngày theo tài khoản, thuật toán tự động chấm ngày công theo tỷ lệ hoàn thành (≥85% $\\rightarrow$ 1 công, 50-84% $\\rightarrow$ 0.5 công, <50% $\\rightarrow$ 0 công), cơ chế khóa sổ tự động (Cut-off Lock).', '4.500.000 VNĐ'),
        ('4. Quản lý, Phân tích & Import Báo cáo Doanh thu', 'Quản lý doanh thu đa nguồn (Creator Rewards, Affiliate), module xử lý & đối soát file Excel/CSV hàng loạt, tính toán các chỉ số tài chính nâng cao (RPM, Doanh thu/video, Doanh thu/account).', '4.000.000 VNĐ'),
        ('5. Dashboard Trung tâm & Bảng Xếp Hạng (Leaderboard)', 'Dashboard thời gian thực trực quan hóa dữ liệu (Recharts), thống kê doanh thu, tài khoản, tỷ lệ cảnh báo, Leaderboard vinh danh nhân viên theo doanh thu và số ngày công.', '4.500.000 VNĐ'),
        ('6. Quản trị Đội ngũ, Phân Quyền & Bảo Mật (Admin RBAC)', 'Quản lý nhân sự, quản lý nhóm (Team), phân quyền đa cấp (Admin / Leader / Staff), bảo mật tài khoản với JWT Token & Bcrypt, trang cấu hình tham số hệ thống.', '3.000.000 VNĐ'),
        ('7. Kiểm thử Tích hợp, Tối ưu Hiệu năng & Triển khai', 'Kiểm thử toàn diện luồng tự động hóa GPM, tối ưu hóa tốc độ truy vấn cơ sở dữ liệu PostgreSQL, đóng gói triển khai và đào tạo bàn giao vận hành.', '3.500.000 VNĐ'),
    ]
    
    for r_idx, (h_muc, m_ta, c_phi) in enumerate(cost_data, start=1):
        row_cells = table_cost.rows[r_idx].cells
        row_cells[0].text = h_muc
        row_cells[1].text = m_ta
        row_cells[2].text = c_phi
        bg_color = 'F2F5F9' if r_idx % 2 == 1 else 'FFFFFF'
        
        for c_idx, cell in enumerate(row_cells):
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            set_cell_border(cell, 
                            bottom={'sz': 4, 'val': 'single', 'color': 'D9D9D9'},
                            top={'sz': 4, 'val': 'single', 'color': 'D9D9D9'})
            p = cell.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(9.5)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SUBTITLE
            elif c_idx == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(9.5)
                    r.font.color.rgb = COLOR_DARK
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SECONDARY

    # Total Row
    total_cells = table_cost.rows[8].cells
    total_cells[0].text = 'TỔNG CỘNG CHI PHÍ'
    total_cells[1].text = 'Trọn gói phát triển toàn bộ 7 module tính năng hệ thống MVP'
    total_cells[2].text = '30.000.000 VNĐ'
    for c_idx, cell in enumerate(total_cells):
        set_cell_background(cell, '1F3864')
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if c_idx < 2 else WD_ALIGN_PARAGRAPH.RIGHT
        for r in p.runs:
            r.font.size = Pt(10.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for row in table_cost.rows:
        for idx, width in enumerate(col_widths_cost):
            row.cells[idx].width = width

    # ==========================================
    # 5. ƯỚC TÍNH CHI PHÍ VẬN HÀNH HÀNG THÁNG (DỊCH VỤ BÊN THỨ BA)
    # ==========================================
    add_heading1('5.', 'ƯỚC TÍNH CHI PHÍ VẬN HÀNH HÀNG THÁNG (DỊCH VỤ BÊN THỨ BA)')
    add_paragraph_body('Khoản chi phí hạ tầng định kỳ này do khách hàng trực tiếp thanh toán cho các nhà cung cấp dịch vụ (Hosting, VPS, Tên miền, Cơ sở dữ liệu). Bên phát triển hỗ trợ tư vấn, cài đặt tối ưu và đóng gói hoàn chỉnh:')
    
    table_ops = doc.add_table(rows=6, cols=4)
    table_ops.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_ops.autofit = False
    col_widths_ops = [Inches(1.5), Inches(1.8), Inches(1.8), Inches(1.7)]
    
    ops_headers = ['Hạng mục dịch vụ', 'Phương án 1: Tối Ưu Nhất (Self-hosted VPS)', 'Phương án 2: Dịch Vụ Đám Mây (Managed Cloud)', 'Ghi chú & Khuyến nghị']
    hdr_cells_ops = table_ops.rows[0].cells
    for i, title in enumerate(ops_headers):
        hdr_cells_ops[i].text = title
        set_cell_background(hdr_cells_ops[i], '1F3864')
        set_cell_margins(hdr_cells_ops[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells_ops[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i in (1, 2) else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.size = Pt(9.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    ops_data = [
        ('Máy chủ (VPS / Web App)', '150.000 – 250.000 VNĐ / tháng\n(VPS 2 CPU, 4GB RAM Vietnix/Hetzner)', '0 – 500.000 VNĐ / tháng\n(Vercel / Render / Cloud)', 'Phương án 1 gom chung App + Database chạy trên 1 VPS duy nhất.'),
        ('Cơ sở dữ liệu (PostgreSQL)', '0 VNĐ / tháng\n(Tự host Docker PostgreSQL trên chính VPS)', '625.000 VNĐ / tháng\n(~ $25/tháng Supabase Pro)', 'Tự host không bị giới hạn dung lượng, tốc độ truy vấn 0ms nội bộ.'),
        ('Tên miền (Domain)', '~25.000 VNĐ / tháng\n(~300.000 VNĐ / năm cho .com/.vn)', '~25.000 VNĐ / tháng\n(~300.000 VNĐ / năm)', 'Định danh thương hiệu và truy cập hệ thống qua Web Dashboard.'),
        ('Chứng chỉ SSL & Chống DDoS', '0 VNĐ / tháng\n(Cloudflare Free / Let\'s Encrypt)', '0 VNĐ / tháng\n(Cloudflare Free / Let\'s Encrypt)', 'Vừa cấp SSL miễn phí, vừa ẩn IP máy chủ và chống tấn công DDoS.'),
        ('Bản quyền GPM-Login', 'Theo gói thực tế của khách hàng\n(Tùy quy mô số lượng Profile)', 'Theo gói thực tế của khách hàng\n(Tùy quy mô số lượng Profile)', 'Khách hàng tự đăng ký trực tiếp phần mềm GPM-Login.'),
    ]
    
    for r_idx, (d_vu, pa1, pa2, g_chu) in enumerate(ops_data, start=1):
        row_cells = table_ops.rows[r_idx].cells
        row_cells[0].text = d_vu
        row_cells[1].text = pa1
        row_cells[2].text = pa2
        row_cells[3].text = g_chu
        bg_color = 'F2F5F9' if r_idx % 2 == 1 else 'FFFFFF'
        
        for c_idx, cell in enumerate(row_cells):
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            set_cell_border(cell, 
                            bottom={'sz': 4, 'val': 'single', 'color': 'D9D9D9'},
                            top={'sz': 4, 'val': 'single', 'color': 'D9D9D9'})
            p = cell.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(9)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SUBTITLE
            elif c_idx == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.size = Pt(9)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SUCCESS
            elif c_idx == 2:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.size = Pt(9)
                    r.font.color.rgb = COLOR_DARK
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(8.5)
                    r.font.color.rgb = COLOR_MUTED

    # Total Operational Cost Row
    total_ops_cells = table_ops.rows[5].cells
    total_ops_cells[0].text = 'TỔNG CHI PHÍ HẠ TẦNG CỐ ĐỊNH'
    total_ops_cells[1].text = '~175.000 – 275.000 VNĐ / tháng\n(TIẾT KIỆM >70% CHI PHÍ)'
    total_ops_cells[2].text = '~650.000 – 1.150.000 VNĐ / tháng'
    total_ops_cells[3].text = 'Khuyên dùng Phương án 1 (Self-hosted VPS) để tối ưu chi phí lâu dài.'
    
    for c_idx, cell in enumerate(total_ops_cells):
        set_cell_background(cell, '1F3864' if c_idx != 1 else '1E7E34')
        set_cell_margins(cell, top=120, bottom=120, left=140, right=140)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT if c_idx in (0, 3) else WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.size = Pt(9.5)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)

    for row in table_ops.rows:
        for idx, width in enumerate(col_widths_ops):
            row.cells[idx].width = width

    # ==========================================
    # 6. CÁC MỐC THANH TOÁN
    # ==========================================
    add_heading1('6.', 'CÁC MỐC THANH TOÁN')
    p_tot = doc.add_paragraph()
    p_tot.paragraph_format.space_before = Pt(2)
    p_tot.paragraph_format.space_after = Pt(6)
    r_t1 = p_tot.add_run('Tổng giá trị phát triển hệ thống: ')
    r_t1.font.size = Pt(11)
    r_t1.font.bold = True
    r_t1.font.color.rgb = COLOR_PRIMARY
    r_t2 = p_tot.add_run('30.000.000 VNĐ')
    r_t2.font.size = Pt(11)
    r_t2.font.bold = True
    r_t2.font.color.rgb = COLOR_SECONDARY

    table_pay = doc.add_table(rows=4, cols=4)
    table_pay.alignment = WD_TABLE_ALIGNMENT.CENTER
    table_pay.autofit = False
    col_widths_pay = [Inches(2.2), Inches(0.9), Inches(1.7), Inches(2.0)]
    
    pay_headers = ['Mốc thanh toán', 'Tỷ lệ', 'Số tiền', 'Thời điểm']
    hdr_cells_pay = table_pay.rows[0].cells
    for i, title in enumerate(pay_headers):
        hdr_cells_pay[i].text = title
        set_cell_background(hdr_cells_pay[i], '1F3864')
        set_cell_margins(hdr_cells_pay[i], top=120, bottom=120, left=140, right=140)
        p = hdr_cells_pay[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER if i in (1, 2) else WD_ALIGN_PARAGRAPH.LEFT
        for r in p.runs:
            r.font.size = Pt(10)
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            
    pay_data = [
        ('1. Khởi động dự án', '30%', '9.000.000 VNĐ', 'Khi ký hợp đồng & bắt đầu dự án'),
        ('2. Phát triển & Hoàn thiện Tự động hóa MVP', '40%', '12.000.000 VNĐ', 'Sau khi hoàn thành tích hợp GPM, trích xuất dữ liệu, chấm công & doanh thu'),
        ('3. Nghiệm thu, Triển khai & Bàn giao', '30%', '9.000.000 VNĐ', 'Khi hoàn thành kiểm thử nghiệm thu UAT, triển khai và bàn giao')
    ]
    
    for r_idx, (m_moc, t_le, s_tien, t_diem) in enumerate(pay_data, start=1):
        row_cells = table_pay.rows[r_idx].cells
        row_cells[0].text = m_moc
        row_cells[1].text = t_le
        row_cells[2].text = s_tien
        row_cells[3].text = t_diem
        bg_color = 'F2F5F9' if r_idx % 2 == 1 else 'FFFFFF'
        
        for c_idx, cell in enumerate(row_cells):
            set_cell_background(cell, bg_color)
            set_cell_margins(cell, top=100, bottom=100, left=140, right=140)
            set_cell_border(cell, 
                            bottom={'sz': 4, 'val': 'single', 'color': 'D9D9D9'},
                            top={'sz': 4, 'val': 'single', 'color': 'D9D9D9'})
            p = cell.paragraphs[0]
            if c_idx == 0:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SUBTITLE
            elif c_idx == 1:
                p.alignment = WD_ALIGN_PARAGRAPH.CENTER
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_SECONDARY
            elif c_idx == 2:
                p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.bold = True
                    r.font.color.rgb = COLOR_DARK
            else:
                p.alignment = WD_ALIGN_PARAGRAPH.LEFT
                for r in p.runs:
                    r.font.size = Pt(10)
                    r.font.color.rgb = COLOR_DARK

    for row in table_pay.rows:
        for idx, width in enumerate(col_widths_pay):
            row.cells[idx].width = width

    # Details of Milestones
    p_m1 = doc.add_paragraph()
    p_m1.paragraph_format.space_before = Pt(8)
    p_m1.paragraph_format.space_after = Pt(2)
    r = p_m1.add_run('Mốc 1 — Khởi động dự án (9.000.000 VNĐ)')
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = COLOR_PRIMARY
    add_bullet('Xác nhận phạm vi công việc và tài liệu đặc tả nghiệp vụ.')
    add_bullet('Xây dựng thiết kế cơ sở dữ liệu PostgreSQL, cấu hình Prisma ORM và xác thực phân quyền.')
    add_bullet('Khởi tạo giao diện ứng dụng web Next.js 16 và hệ thống quản lý tài khoản cơ bản.')

    p_m2 = doc.add_paragraph()
    p_m2.paragraph_format.space_before = Pt(8)
    p_m2.paragraph_format.space_after = Pt(2)
    r = p_m2.add_run('Mốc 2 — Phát triển & Hoàn thiện Tự động hóa MVP (12.000.000 VNĐ)')
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = COLOR_PRIMARY
    add_bullet('Hoàn thành tích hợp GPM-Login REST API và bộ máy tự động hóa Playwright trích xuất dữ liệu.')
    add_bullet('Hoàn thành module quản lý chỉ số kênh, Creator Rewards USD, RPM và Auto-sync Cron.')
    add_bullet('Hoàn thành hệ thống Checklist công việc, thuật toán tính ngày công và cơ chế khóa sổ.')
    add_bullet('Hoàn thành module quản lý, phân tích và import file Excel doanh thu.')
    add_bullet('Hoàn thiện Dashboard điều hành và Bảng xếp hạng nhân viên (Leaderboard).')

    p_m3 = doc.add_paragraph()
    p_m3.paragraph_format.space_before = Pt(8)
    p_m3.paragraph_format.space_after = Pt(2)
    r = p_m3.add_run('Mốc 3 — Nghiệm thu, Triển khai & Bàn giao (9.000.000 VNĐ)')
    r.font.size = Pt(10.5)
    r.font.bold = True
    r.font.color.rgb = COLOR_PRIMARY
    add_bullet('Kiểm thử nghiệm thu UAT toàn diện trên môi trường thực tế cùng khách hàng.')
    add_bullet('Tối ưu hóa hiệu năng hệ thống và xử lý toàn bộ các lỗi phát sinh.')
    add_bullet('Triển khai hệ thống lên hạ tầng máy chủ của khách hàng.')
    add_bullet('Bàn giao mã nguồn hoàn chỉnh và tài liệu hướng dẫn vận hành.')

    # ==========================================
    # 7. CÁC HẠNG MỤC KHÔNG BAO GỒM
    # ==========================================
    add_heading1('7.', 'CÁC HẠNG MỤC KHÔNG BAO GỒM')
    add_paragraph_body('Các nội dung sau không nằm trong báo giá phát triển 30.000.000 VNĐ, trừ khi hai bên có thỏa thuận bổ sung:')
    
    add_subheading('A.', 'Hạ tầng & Bản quyền Phần mềm Bên thứ ba')
    add_bullet('Chi phí bản quyền phần mềm GPM-Login (khách hàng tự trang bị key/gói GPM-Login).')
    add_bullet('Chi phí Proxy / Dcom / Mạng IP riêng để nuôi và vận hành tài khoản.')
    add_bullet('Dịch vụ máy chủ / VPS / Cloud Hosting và Cơ sở dữ liệu.')
    add_bullet('Tên miền (Domain) và chứng chỉ SSL riêng.')
    add_bullet('Các chi phí dịch vụ bên thứ ba phát sinh ngoài phạm vi hệ thống.')

    add_subheading('B.', 'Giới hạn từ Nền tảng TikTok')
    add_bullet('Các trường hợp tài khoản TikTok bị checkpoint, khóa vĩnh viễn do chính sách kiểm duyệt của TikTok hoặc do chất lượng proxy/nội dung.')
    add_bullet('Thay đổi cấu trúc giao diện web TikTok Studio quá lớn dẫn đến cần nâng cấp module bóc tách dữ liệu mới (sẽ được hỗ trợ theo phạm vi bảo hành hoặc bảo trì nâng cấp).')

    add_subheading('C.', 'Tính năng Bổ sung Nâng cao')
    add_bullet('Ứng dụng di động (Mobile App iOS / Android native).')
    add_bullet('Phân tích hoặc dự đoán doanh thu bằng trí tuệ nhân tạo (AI deep analytics).')
    add_bullet('Quy trình tự động hóa phức tạp ngoài phạm vi phiên bản MVP (tự động render video, tự động lách bản quyền, tự động đăng video hàng loạt bypass captcha...).')
    add_bullet('Hệ thống tính lương & tính hoa hồng nhân sự chuyên sâu ngoài cơ chế ngày công.')
    add_bullet('Các yêu cầu phát sinh sau khi thống nhất phạm vi công việc sẽ được đánh giá và báo giá riêng.')

    # ==========================================
    # 8. BẢO HÀNH VÀ HỖ TRỢ
    # ==========================================
    add_heading1('8.', 'BẢO HÀNH VÀ HỖ TRỢ')
    
    add_subheading('A.', 'Phạm vi Bảo hành')
    add_paragraph_body('Thời gian bảo hành: 30 ngày kể từ ngày nghiệm thu và bàn giao phiên bản MVP.')
    add_paragraph_body('Trong thời gian bảo hành, bên phát triển hỗ trợ:')
    add_bullet('Sửa các lỗi kỹ thuật phát sinh từ chức năng đã được bàn giao.')
    add_bullet('Sửa lỗi logic không đúng với phạm vi công việc đã thống nhất.')
    add_bullet('Hỗ trợ kiểm tra các vấn đề liên quan đến kết nối GPM-Login API và triển khai hệ thống.')

    add_subheading('B.', 'Không thuộc phạm vi bảo hành')
    add_bullet('Thay đổi yêu cầu nghiệp vụ sau nghiệm thu.')
    add_bullet('Yêu cầu bổ sung chức năng mới.')
    add_bullet('Lỗi do hạ tầng mạng, máy chủ, proxy hoặc lỗi nội bộ phần mềm bên thứ ba (GPM-Login server).')
    add_bullet('Các yêu cầu mới sau khi nghiệm thu sẽ được xem là yêu cầu thay đổi (Change Request) và báo giá riêng.')

    # ==========================================
    # 9. SẢN PHẨM BÀN GIAO
    # ==========================================
    add_heading1('9.', 'SẢN PHẨM BÀN GIAO')
    add_paragraph_body('Sau khi hoàn thành dự án, khách hàng sẽ nhận được:')
    add_bullet('Mã nguồn hoàn chỉnh của hệ thống (Full Source Code Next.js 16 + TypeScript + Prisma).')
    add_bullet('Cấu trúc cơ sở dữ liệu và các tệp Database Migrations PostgreSQL.')
    add_bullet('Bộ module Tự động hóa GPM-Login & Playwright Engine trích xuất dữ liệu hoàn chỉnh.')
    add_bullet('Ứng dụng web MVP vận hành ổn định trên máy chủ/môi trường của khách hàng.')
    add_bullet('Bảng điều khiển quản trị trung tâm (Admin Dashboard).')
    add_bullet('Chức năng quản lý đội ngũ tài khoản TikTok & liên kết Profile GPM.')
    add_bullet('Chức năng danh sách công việc (Checklist) và chấm công tự động.')
    add_bullet('Chức năng quản lý, phân tích RPM & import doanh thu Excel/CSV.')
    add_bullet('Bảng điều khiển trực quan và bảng xếp hạng nhân viên (Leaderboard).')
    add_bullet('Tài liệu kỹ thuật và hướng dẫn sử dụng, vận hành hệ thống cơ bản.')

    # Save to output_path
    doc.save(output_path)
    print(f'Successfully updated proposal: {output_path}')

if __name__ == '__main__':
    build_full_proposal(r'C:\Users\datng\tiktok-automation\Bao_gia_TikTok_Account_Management_MVP.docx')
    build_full_proposal(r'C:\Users\datng\tiktok-automation\Bao_gia_TikTok_Account_Management_MVP_v2.docx')
