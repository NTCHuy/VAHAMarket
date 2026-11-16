/**
 * Danh sách ngân hàng Việt Nam kèm mã BIN chuẩn VietQR (NAPAS).
 * `code` dùng để hiển thị/tìm kiếm, `bin` dùng để tạo mã QR.
 */
export interface Bank {
  /** Mã BIN 6 số theo chuẩn VietQR/NAPAS */
  bin: string;
  /** Mã viết tắt */
  code: string;
  /** Tên thương mại */
  shortName: string;
  /** Tên đầy đủ */
  name: string;
}

export const BANKS: readonly Bank[] = [
  { bin: '970436', code: 'VCB', shortName: 'Vietcombank', name: 'Ngân hàng TMCP Ngoại thương Việt Nam' },
  { bin: '970415', code: 'ICB', shortName: 'VietinBank', name: 'Ngân hàng TMCP Công thương Việt Nam' },
  { bin: '970418', code: 'BIDV', shortName: 'BIDV', name: 'Ngân hàng TMCP Đầu tư và Phát triển Việt Nam' },
  { bin: '970405', code: 'VBA', shortName: 'Agribank', name: 'Ngân hàng Nông nghiệp và Phát triển Nông thôn Việt Nam' },
  { bin: '970422', code: 'MB', shortName: 'MBBank', name: 'Ngân hàng TMCP Quân đội' },
  { bin: '970407', code: 'TCB', shortName: 'Techcombank', name: 'Ngân hàng TMCP Kỹ thương Việt Nam' },
  { bin: '970416', code: 'ACB', shortName: 'ACB', name: 'Ngân hàng TMCP Á Châu' },
  { bin: '970432', code: 'VPB', shortName: 'VPBank', name: 'Ngân hàng TMCP Việt Nam Thịnh Vượng' },
  { bin: '970423', code: 'TPB', shortName: 'TPBank', name: 'Ngân hàng TMCP Tiên Phong' },
  { bin: '970403', code: 'STB', shortName: 'Sacombank', name: 'Ngân hàng TMCP Sài Gòn Thương Tín' },
  { bin: '970437', code: 'HDB', shortName: 'HDBank', name: 'Ngân hàng TMCP Phát triển TP. Hồ Chí Minh' },
  { bin: '970441', code: 'VIB', shortName: 'VIB', name: 'Ngân hàng TMCP Quốc tế Việt Nam' },
  { bin: '970443', code: 'SHB', shortName: 'SHB', name: 'Ngân hàng TMCP Sài Gòn - Hà Nội' },
  { bin: '970431', code: 'EIB', shortName: 'Eximbank', name: 'Ngân hàng TMCP Xuất Nhập khẩu Việt Nam' },
  { bin: '970426', code: 'MSB', shortName: 'MSB', name: 'Ngân hàng TMCP Hàng Hải Việt Nam' },
  { bin: '970448', code: 'OCB', shortName: 'OCB', name: 'Ngân hàng TMCP Phương Đông' },
  { bin: '970440', code: 'SSB', shortName: 'SeABank', name: 'Ngân hàng TMCP Đông Nam Á' },
  { bin: '970449', code: 'LPB', shortName: 'LPBank', name: 'Ngân hàng TMCP Lộc Phát Việt Nam (LienVietPostBank)' },
  { bin: '970454', code: 'VCCB', shortName: 'BanVietBank', name: 'Ngân hàng TMCP Bản Việt (Viet Capital Bank)' },
  { bin: '970409', code: 'BAB', shortName: 'BacABank', name: 'Ngân hàng TMCP Bắc Á' },
  { bin: '970425', code: 'ABB', shortName: 'ABBANK', name: 'Ngân hàng TMCP An Bình' },
  { bin: '970428', code: 'NAB', shortName: 'NamABank', name: 'Ngân hàng TMCP Nam Á' },
  { bin: '970412', code: 'PVCB', shortName: 'PVcomBank', name: 'Ngân hàng TMCP Đại Chúng Việt Nam' },
  { bin: '970438', code: 'BVB', shortName: 'BaoVietBank', name: 'Ngân hàng TMCP Bảo Việt' },
  { bin: '970452', code: 'KLB', shortName: 'KienLongBank', name: 'Ngân hàng TMCP Kiên Long' },
  { bin: '970419', code: 'NCB', shortName: 'NCB', name: 'Ngân hàng TMCP Quốc Dân' },
  { bin: '970433', code: 'VBB', shortName: 'VietBank', name: 'Ngân hàng TMCP Việt Nam Thương Tín' },
  { bin: '970429', code: 'SCB', shortName: 'SCB', name: 'Ngân hàng TMCP Sài Gòn' },
  { bin: '970430', code: 'PGB', shortName: 'PGBank', name: 'Ngân hàng TMCP Thịnh vượng và Phát triển (PGBank)' },
  { bin: '970408', code: 'GPB', shortName: 'GPBank', name: 'Ngân hàng Thương mại TNHH MTV Dầu Khí Toàn Cầu' },
  { bin: '970400', code: 'SGICB', shortName: 'SaigonBank', name: 'Ngân hàng TMCP Sài Gòn Công Thương' },
  { bin: '970406', code: 'DOB', shortName: 'DongABank', name: 'Ngân hàng TMCP Đông Á' },
  { bin: '970414', code: 'OJB', shortName: 'Oceanbank', name: 'Ngân hàng Thương mại TNHH MTV Đại Dương' },
  { bin: '970446', code: 'COOPBANK', shortName: 'Co-opBank', name: 'Ngân hàng Hợp tác xã Việt Nam' },
  { bin: '970457', code: 'WVN', shortName: 'Woori Bank', name: 'Ngân hàng TNHH MTV Woori Việt Nam' },
  { bin: '970424', code: 'SHBVN', shortName: 'Shinhan Bank', name: 'Ngân hàng TNHH MTV Shinhan Việt Nam' },
  { bin: '970458', code: 'UOB', shortName: 'UOB', name: 'Ngân hàng United Overseas Bank Việt Nam' },
  { bin: '970439', code: 'PBVN', shortName: 'Public Bank', name: 'Ngân hàng TNHH MTV Public Việt Nam' },
  { bin: '970442', code: 'HLBVN', shortName: 'Hong Leong Bank', name: 'Ngân hàng TNHH MTV Hong Leong Việt Nam' },
  { bin: '970410', code: 'SCVN', shortName: 'Standard Chartered', name: 'Ngân hàng TNHH MTV Standard Chartered Việt Nam' },
  { bin: '458761', code: 'HSBC', shortName: 'HSBC', name: 'Ngân hàng TNHH MTV HSBC Việt Nam' },
  { bin: '422589', code: 'CIMB', shortName: 'CIMB', name: 'Ngân hàng TNHH MTV CIMB Việt Nam' },
  { bin: '546034', code: 'CAKE', shortName: 'CAKE by VPBank', name: 'Ngân hàng số CAKE by VPBank' },
  { bin: '546035', code: 'UBANK', shortName: 'Ubank', name: 'Ngân hàng số Ubank by VPBank' },
  { bin: '963388', code: 'TIMO', shortName: 'Timo', name: 'Ngân hàng số Timo (Bản Việt)' },
  { bin: '971005', code: 'VIETTELMONEY', shortName: 'Viettel Money', name: 'Tổng Công ty Dịch vụ số Viettel (Viettel Money)' },
  { bin: '971011', code: 'VNPTMONEY', shortName: 'VNPT Money', name: 'VNPT Money' },
] as const;

const BANK_BY_BIN = new Map(BANKS.map((b) => [b.bin, b]));
const BANK_BY_CODE = new Map(BANKS.map((b) => [b.code.toUpperCase(), b]));

export const getBankByBin = (bin: string): Bank | undefined => BANK_BY_BIN.get(bin);
export const getBankByCode = (code: string): Bank | undefined => BANK_BY_CODE.get(code.toUpperCase());

/** Ngân hàng của tài khoản Escrow. */
export const ESCROW_BANK_BIN = '970418'; // BIDV
