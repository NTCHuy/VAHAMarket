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
import { BRAND_NAME, DISCORD_SERVER_URL, GROUP_URL } from '@/constants/links';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';

export default function Terms() {
  useDocumentTitle('Điều khoản sử dụng');
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          <ArrowLeft className="h-4 w-4" /> Về trang chủ
        </Link>
        <div className="mt-3 flex items-start gap-2.5">
          <FileText size={18} strokeWidth={1.75} className="mt-1 shrink-0 text-blue-700 dark:text-blue-400" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              Điều khoản sử dụng
            </h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Áp dụng cho mọi thành viên mua và bán trên {BRAND_NAME}.
            </p>
          </div>
        </div>
      </div>

      {/* CẢNH BÁO PHÁP LÝ */}
      <section
        aria-label="Cảnh báo chống lừa đảo"
        className="rounded-lg border-2 border-red-600 bg-red-50 p-5 text-red-950 dark:border-red-500/80 dark:bg-red-950/60 dark:text-red-50 sm:p-6"
      >
        <div className="flex items-start gap-2.5">
          <ShieldAlert size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
          <div className="min-w-0 space-y-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-300">
                Cảnh báo pháp lý
              </p>
              <h2 className="mt-0.5 text-lg font-bold text-red-900 dark:text-red-100">
                Xử lý lừa đảo &amp; Phối hợp cơ quan Công an
              </h2>
            </div>

            <p className="text-sm leading-relaxed text-red-900 dark:text-red-100/95">
              Hành vi lừa đảo trên {BRAND_NAME} (bán hàng giả/hỏng cố ý, tráo hàng, làm giả ảnh xác thực, lừa đảo tay ba) sẽ bị <strong>khóa vĩnh viễn</strong>, <strong>giữ lại tiền giải ngân</strong> và cung cấp đầy đủ dữ liệu cho <strong>Cơ quan Công an</strong>:
            </p>

            <ul className="grid gap-1.5 rounded-lg border border-red-200 bg-white/80 p-3.5 text-xs font-medium text-red-950 dark:border-red-800/80 dark:bg-red-950/80 dark:text-red-100 sm:grid-cols-2">
              <li>• Email Google đăng nhập</li>
              <li>• Số điện thoại liên hệ</li>
              <li>• Đường dẫn Facebook cá nhân</li>
              <li>• Số tài khoản &amp; chủ tài khoản ngân hàng</li>
              <li>• Nhật ký giao dịch ngân hàng</li>
              <li>• Toàn bộ ảnh và video đối soát</li>
            </ul>

            <div className="space-y-2 rounded-lg border border-red-300 bg-white p-4 text-xs leading-relaxed text-neutral-700 dark:border-red-800 dark:bg-neutral-950/90 dark:text-neutral-300 sm:text-sm">
              <p className="flex items-center gap-1.5 font-semibold text-red-700 dark:text-red-400">
                <Scale className="h-4 w-4 shrink-0" /> Căn cứ Bộ luật Hình sự 2015 (sửa đổi 2017)
              </p>
              <p>
                <strong className="text-neutral-900 dark:text-neutral-100">Điều 174 (Lừa đảo chiếm đoạt tài sản):</strong>{' '}
                Chiếm đoạt từ <strong className="text-red-700 dark:text-red-400">2.000.000₫</strong> trở lên (hoặc dưới mức này nếu có tình tiết tăng nặng) bị xử lý hình sự, phạt tù từ <strong>6 tháng đến 20 năm hoặc chung thân</strong>.
              </p>
              <p>
                <strong className="text-neutral-900 dark:text-neutral-100">Điều 175 (Lạm dụng tín nhiệm chiếm đoạt tài sản):</strong>{' '}
                Gian dối, bỏ trốn để chiếm đoạt tài sản bị phạt tù từ <strong className="text-red-700 dark:text-red-400">6 tháng đến 20 năm</strong>.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 1. VAI TRÒ TRUNG GIAN */}
      <section id="video-rules" className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          <ShieldCheck className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          1. Vai trò trung gian &amp; Bằng chứng bắt buộc
        </h2>
        <div className="space-y-2.5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <p>
            <strong>{BRAND_NAME}</strong> là sàn phi lợi nhuận <strong>0% phí</strong> của cộng đồng Hội người Việt nghiện tai nghe. Sàn giữ tiền trung gian và phân xử dựa trên bằng chứng:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <strong>Ảnh xác thực:</strong> Sản phẩm đặt cạnh giấy viết tay ghi{' '}
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                VAHA + Ngày + Tên Facebook
              </code>.
            </li>
            <li>
              <strong>Video người bán:</strong> Quay liền mạch lúc kiểm tra sản phẩm và đóng gói đủ 6 mặt cùng mã vận đơn.
            </li>
            <li>
              <strong>Video người mua:</strong> Quay liền mạch mở hộp đủ 6 mặt từ lúc còn nguyên niêm phong đến lúc kiểm tra máy.
            </li>
          </ul>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3.5 text-xs leading-relaxed text-amber-950 dark:border-amber-800/70 dark:bg-amber-950/40 dark:text-amber-200 sm:text-sm">
            <p className="flex items-center gap-1.5 font-semibold text-amber-900 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Miễn trừ trách nhiệm
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5">
              <li>Sàn không phải người bán và không bảo hành hao mòn tự nhiên của hàng đã qua sử dụng.</li>
              <li>Sàn không chịu trách nhiệm nếu đơn vị vận chuyển làm hỏng hoặc thất lạc hàng (hai bên dùng video để khiếu nại hãng vận chuyển).</li>
              <li>Sàn không hỗ trợ giao dịch chuyển khoản riêng ngoài hệ thống.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 2. ĐỊNH DANH & DUYỆT TIN */}
      <section className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          <Camera className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          2. Định danh người bán &amp; Duyệt tin
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <li>
            <strong>Hồ sơ bắt buộc:</strong> Cần có số điện thoại, Facebook cá nhân công khai và ít nhất 1 tài khoản ngân hàng. Tên chủ tài khoản phải là <strong>tên chính chủ, khớp với tên Facebook</strong>.
          </li>
          <li>
            <strong>Khóa thông tin:</strong> Khi có tin đang mở/chờ duyệt hoặc đơn đang xử lý, không thể tự đổi Facebook hay thông tin ngân hàng.
          </li>
          <li>
            <strong>Duyệt tin:</strong> Tin mới chờ duyệt ảnh xác thực trước khi hiển thị. Nếu sửa nội dung, ảnh hoặc tài khoản nhận tiền, tin sẽ cần duyệt lại.
          </li>
          <li className="flex items-start gap-1.5 list-none -ml-5 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-800/50">
            <Ban className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
            <span>
              <strong>Cấm giao dịch ngoài sàn:</strong> Không ghi số điện thoại, Zalo hoặc kêu gọi chuyển khoản riêng trong tin đăng.
            </span>
          </li>
        </ul>
      </section>

      {/* 3. THANH TOÁN & KHIẾU NẠI */}
      <section id="fee-cap" className="card space-y-3 p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          <Video className="h-5 w-5 text-brand-700 dark:text-brand-400" />
          3. Thanh toán, giao hàng &amp; khiếu nại
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <li>
            <strong>Thanh toán VietQR (15 phút):</strong> Người mua cần lưu sẵn 1 tài khoản ngân hàng để nhận hoàn tiền nếu đơn hủy. Sàn giữ tiền đến khi người mua xác nhận đã nhận hàng ổn định.
          </li>
          <li>
            <strong>Hạn gửi hàng 48 giờ:</strong> Sau khi nhận tiền, người bán có 48 giờ để gửi hàng và cập nhật vận đơn + video đóng gói. Quá hạn, người mua được hủy đơn để nhận hoàn tiền.
          </li>
          <li>
            <strong>Rà soát sau 14 ngày:</strong> Nếu đơn đã gửi quá 14 ngày mà người mua không xác nhận và không khiếu nại, quản trị viên sẽ kiểm tra vận đơn để mở khóa giải ngân cho người bán.
          </li>
          <li>
            <strong>Miễn phí 0%:</strong> Mọi đơn hàng đều 0% phí. Người mua trả đúng giá đăng, người bán nhận đủ 100%.
          </li>
          <li>
            <strong>Giải quyết khiếu nại:</strong> Dựa trên video đóng gói của người bán và video mở hộp đủ 6 mặt của người mua. Không có video mở hộp hợp lệ sẽ không đủ căn cứ hoàn tiền.
          </li>
        </ul>
      </section>

      {/* 4. CẢNH BÁO & KHÓA TÀI KHOẢN */}
      <section className="card space-y-3 border-red-200 p-5 dark:border-red-900/70 sm:p-6">
        <h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-neutral-50">
          <ShieldAlert className="h-5 w-5 text-red-600 dark:text-red-400" />
          4. Cảnh báo vi phạm &amp; Khóa tài khoản
        </h2>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-700 dark:text-neutral-300">
          <li>
            <strong>3 cảnh báo tự khóa:</strong> Mỗi lần vi phạm nhận 1 cảnh báo. Đủ <strong className="text-red-700 dark:text-red-400">3/3 cảnh báo</strong>, tài khoản tự động bị khóa vĩnh viễn và gỡ toàn bộ tin.
          </li>
          <li>
            <strong>Khóa ngay lập tức:</strong> Hành vi lừa đảo nghiêm trọng sẽ bị khóa thẳng không cần cảnh báo trước.
          </li>
          <li>
            <strong>Danh sách đen:</strong> Thông tin định danh của tài khoản bị khóa (thiết bị, ngân hàng, Facebook, số điện thoại, email) bị đưa vào danh sách đen để chặn lập tài khoản mới.
          </li>
        </ul>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        <span>Cần hỗ trợ hoặc báo cáo gian lận?</span>
        <div className="flex flex-wrap gap-2">
          <a href={GROUP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Nhóm Facebook
          </a>
          <span>·</span>
          <a href={DISCORD_SERVER_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand-700 hover:underline dark:text-brand-400">
            Discord hỗ trợ
          </a>
        </div>
      </div>
    </div>
  );
}
