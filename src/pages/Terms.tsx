import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Camera,
  FileText,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Video,
} from 'lucide-react';
import { BRAND_FULL_NAME, BRAND_NAME, DISCORD_SERVER_URL, FOUNDER_FACEBOOK_URL, GROUP_URL } from '@/constants/links';

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ArrowLeft className="h-4 w-4" /> Quay lại trang chủ
        </Link>
        <div className="mt-3 flex items-center gap-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
              Điều khoản dịch vụ &amp; Quy định giao dịch
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {BRAND_NAME} ({BRAND_FULL_NAME}) · Áp dụng cho toàn bộ người mua và người bán trên sàn.
            </p>
          </div>
        </div>
      </div>

      {/* KHUNG CẢNH BÁO ĐỎ NỔI BẬT — PHỐI HỢP CƠ QUAN CHỨC NĂNG & LUẬT HÌNH SỰ */}
      <section
        aria-label="Cảnh báo chống lừa đảo và trách nhiệm hình sự"
        className="rounded-2xl border-2 border-red-600 bg-red-50 p-5 text-red-950 shadow-sm dark:border-red-500/80 dark:bg-red-950/60 dark:text-red-50 sm:p-6"
      >
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white">
            <ShieldAlert className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                Cảnh báo pháp lý bắt buộc
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-red-900 dark:text-red-100">
                Cam kết phối hợp Cơ quan chức năng &amp; Truy cứu trách nhiệm hình sự
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-red-900 dark:text-red-100/95">
              Mọi hành vi lừa đảo chiếm đoạt tài sản trên {BRAND_NAME} — bao gồm nhưng không giới hạn ở:{' '}
              <strong>
                đăng bán hàng giả/hàng hỏng cố ý, tráo hàng, giả mạo chứng từ/ảnh xác thực, lừa đảo tay ba
              </strong>{' '}
              — sẽ bị <strong>khóa tài khoản vĩnh viễn</strong>, <strong>đóng băng toàn bộ tiền giải ngân</strong>{' '}
              và <strong>Admin sẽ cung cấp toàn bộ dữ liệu định danh</strong> cho{' '}
              <strong>Cơ quan Cảnh sát điều tra (Công an)</strong> để khởi tố theo quy định pháp luật, bao gồm:
            </p>

            <ul className="grid gap-1.5 rounded-xl border border-red-200 bg-white/80 p-3.5 text-xs font-medium text-red-950 dark:border-red-800/80 dark:bg-red-950/80 dark:text-red-100 sm:grid-cols-2">
              <li>• Email tài khoản Google đăng nhập</li>
              <li>• Số điện thoại liên hệ</li>
              <li>• Đường dẫn trang cá nhân Facebook</li>
              <li>• Số tài khoản &amp; tên chủ tài khoản ngân hàng</li>
              <li>• Lịch sử IP &amp; nhật ký giao dịch ngân hàng</li>
              <li>• Toàn bộ bằng chứng video, hình ảnh đối soát</li>
            </ul>

            <div className="space-y-2.5 rounded-xl border border-red-300 bg-white p-4 text-sm text-slate-900 dark:border-red-800 dark:bg-slate-950/90 dark:text-slate-100">
              <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                <Scale className="h-4 w-4 shrink-0" /> Căn cứ pháp luật hiện hành tại Việt Nam
              </p>
              <div className="space-y-2 text-xs leading-relaxed text-slate-700 dark:text-slate-300 sm:text-sm">
                <p>
                  <strong className="text-slate-900 dark:text-slate-100">
                    1. Điều 174 Bộ luật Hình sự 2015 (sửa đổi, bổ sung 2017) — Tội lừa đảo chiếm đoạt tài sản:
                  </strong>{' '}
                  Hành vi dùng thủ đoạn gian dối chiếm đoạt tài sản trị giá từ{' '}
                  <strong className="text-red-700 dark:text-red-400">2.000.000 đồng trở lên</strong> (hoặc dưới
                  2.000.000 đồng nhưng gây hậu quả nghiêm trọng, đã bị xử phạt vi phạm hành chính về hành vi chiếm đoạt
                  tài sản hoặc có tiền án chưa được xóa án tích) sẽ bị truy cứu trách nhiệm hình sự: phạt cải tạo không
                  giam giữ đến 3 năm hoặc{' '}
                  <strong className="text-red-700 dark:text-red-400">
                    phạt tù từ 06 tháng đến 20 năm, hoặc tù chung thân
                  </strong>{' '}
                  tùy theo giá trị tài sản chiếm đoạt (từ 500 triệu đồng trở lên).
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-slate-100">
                    2. Điều 175 Bộ luật Hình sự 2015 (sửa đổi, bổ sung 2017) — Tội lạm dụng tín nhiệm chiếm đoạt tài sản:
                  </strong>{' '}
                  Hành vi vay, mượn, thuê tài sản hoặc nhận được tài sản bằng hình thức hợp đồng rồi dùng thủ đoạn gian
                  dối, bỏ trốn để chiếm đoạt tài sản sẽ bị xử lý hình sự với mức{' '}
                  <strong className="text-red-700 dark:text-red-400">phạt tù từ 06 tháng đến 20 năm</strong>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 1. VAI TRÒ TRUNG GIAN & MIỄN TRỪ TRÁCH NHIỆM */}
      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          1. Vai trò trung gian &amp; Miễn trừ trách nhiệm của Admin
        </h2>
        <div className="space-y-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <p>
            <strong>{BRAND_NAME}</strong> và đội ngũ quản trị viên (Founder{' '}
            <strong>Nguyễn Trần Công Huy — HweeHiFi</strong>) chỉ đóng vai trò cung cấp nền tảng kết nối giữa người mua
            và người bán, đồng thời cung cấp dịch vụ <strong>giữ tiền bảo lãnh trung gian (Escrow)</strong> dựa trên
            quy tắc đối soát bằng chứng minh bạch:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Ảnh xác thực chính chủ</strong>: chụp sản phẩm đặt cạnh mảnh giấy viết tay ghi rõ{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                VAHA + Ngày tháng + Tên Facebook
              </code>
              .
            </li>
            <li>
              <strong>Video đầu gửi (người bán)</strong>: video test chức năng &amp; đóng gói liền mạch 6 mặt hộp hàng,
              thể hiện rõ tình trạng sản phẩm và mã vận đơn.
            </li>
            <li>
              <strong>Video đầu nhận (người mua)</strong>: video mở hộp liền mạch 6 mặt từ lúc gói hàng còn nguyên vẹn
              chưa cắt băng dính cho tới khi kiểm tra ngoại quan và chức năng sản phẩm.
            </li>
          </ul>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200 sm:text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Phạm vi miễn trừ trách nhiệm
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>
                Admin <strong>không phải là người bán</strong> và không chịu trách nhiệm về chất lượng nội tại, tuổi thọ
                linh kiện, chai pin hoặc hao mòn tự nhiên của hàng hóa âm thanh đã qua sử dụng.
              </li>
              <li>
                Admin được miễn trừ trách nhiệm đối với hư hỏng, thất lạc phát sinh từ phía{' '}
                <strong>đơn vị vận chuyển bên thứ ba</strong> nằm ngoài phạm vi đối soát bằng chứng của hai bên (hai
                bên chủ động làm việc và khiếu nại bồi thường với hãng vận chuyển dựa trên video đóng gói/mở hộp).
              </li>
              <li>
                Admin <strong>không giải quyết và không chịu trách nhiệm</strong> với bất kỳ thỏa thuận chuyển khoản
                riêng, đặt cọc trực tiếp hoặc giao dịch ngầm nào thực hiện ngoài hệ thống {BRAND_NAME}.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* 2. QUY ĐỊNH ĐỊNH DANH & BẰNG CHỨNG */}
      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          <Camera className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          2. Quy định định danh, tiền kiểm &amp; chống giao dịch ngoài sàn
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <li>
            <strong>Hồ sơ người bán bắt buộc:</strong> Người bán phải cung cấp đầy đủ Số điện thoại, Link trang cá nhân
            Facebook công khai và ít nhất 01 tài khoản ngân hàng nhận tiền. Tên chủ tài khoản ngân hàng phải là{' '}
            <strong>tên chính chủ, khớp với tên trên trang cá nhân Facebook của bạn</strong> để được giải ngân.
          </li>
          <li>
            <strong>Khóa thông tin định danh:</strong> Khi có tin đang hiển thị/chờ duyệt hoặc đơn bán đang xử lý, hệ
            thống tự động khóa chỉnh sửa Link Facebook và thông tin tài khoản ngân hàng đã lưu.
          </li>
          <li>
            <strong>Tiền kiểm bài đăng:</strong> Tin đăng mới của thành viên thường ở trạng thái chờ duyệt cho đến khi
            Admin xác minh ảnh viết tay chính chủ và nội dung hợp lệ. Tin đã duyệt nếu chỉnh sửa nội dung, ảnh hoặc tài
            khoản nhận tiền sẽ quay lại hàng chờ duyệt.
          </li>
          <li className="flex items-start gap-1.5 list-none -ml-5 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-800/50">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              <strong>Nghiêm cấm dẫn dụ giao dịch ngoài sàn:</strong> Không chèn số điện thoại, Zalo hoặc kêu gọi
              &ldquo;chuyển khoản trực tiếp / không qua sàn&rdquo; trong tiêu đề và mô tả tin đăng.
            </span>
          </li>
        </ul>
      </section>

      {/* 3. QUY TRÌNH TRANH CHẤP & PHÍ DỊCH VỤ */}
      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-50">
          <Video className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          3. Thanh toán, phí bảo lãnh &amp; giải quyết khiếu nại
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
          <li>
            <strong>Thanh toán VietQR tự động:</strong> Đơn hàng giữ chỗ trong 15 phút. Tiền được giữ an toàn tại tài
            khoản trung gian của sàn cho đến khi người mua bấm xác nhận đã nhận hàng ổn định hoặc có phán quyết cuối
            cùng từ Admin.
          </li>
          <li>
            <strong>Phí trung gian:</strong> Mức phí chuẩn là 5% giá niêm yết (hoặc theo mức ưu đãi toàn sàn đang áp
            dụng; Mod Group được hưởng 0%). Người bán tự chọn phương thức chia phí (Người bán chịu / Người mua chịu /
            Chia đôi); giá hiển thị cho người mua luôn là giá trọn gói.
          </li>
          <li>
            <strong>Căn cứ giải quyết khiếu nại:</strong> Admin phân xử hoàn tiền hoặc giải ngân dựa trên đối chiếu{' '}
            <em>video test &amp; đóng gói 6 mặt</em> của người bán và <em>video mở hộp liền mạch 6 mặt</em> của người
            mua. Thiếu video mở hộp hợp lệ đồng nghĩa người mua mất quyền khiếu nại về ngoại quan/thiếu phụ kiện/tráo
            hàng.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        <span>Cần hỗ trợ hoặc báo cáo gian lận? Liên hệ trực tiếp kênh chính thức của {BRAND_NAME}:</span>
        <div className="flex flex-wrap gap-2">
          <a href={FOUNDER_FACEBOOK_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Facebook Founder
          </a>
          <span>·</span>
          <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Group Cộng đồng
          </a>
          <span>·</span>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Discord
          </a>
        </div>
      </div>
    </div>
  );
}
