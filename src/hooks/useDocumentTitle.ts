import { useEffect } from 'react';

const BASE_TITLE = 'VAHA Market';

/** Cập nhật thẻ <title> theo từng trang để hỗ trợ SEO, lịch sử duyệt web và tab trình duyệt. */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const clean = title?.trim();
    document.title = clean ? `${clean} — ${BASE_TITLE}` : `${BASE_TITLE} — Sàn Giao Dịch Trung Gian Thiết Bị Âm Thanh`;
    return () => {
      document.title = BASE_TITLE;
    };
  }, [title]);
}
