# Telegram & X News Reader

Đọc tin từ **kênh Telegram công khai** và **tài khoản X công khai** trong đúng **một file `index.html`**:
không server, không `npm install`, không tài khoản, không API key, không build.

Mục lục: [Lỗi 403](#-gặp-lỗi-403-từ-rjinai--chạy-start-pythoncmd-trước-tiên) · [Dùng nhanh](#dùng-nhanh) ·
[Cấu trúc](#cấu-trúc-thư-mục) · [Nguồn dữ liệu](#nguồn-dữ-liệu--vì-sao-cần-mạng) · [Tính năng](#tính-năng) ·
[Dữ liệu lưu](#dữ-liệu-lưu-trên-máy) · [Giới hạn](#giới-hạn) · [Bảo mật](#bảo-mật) · [Sự cố](#xử-lý-sự-cố)

## ⚠️ Gặp lỗi 403 từ r.jina.ai → chạy `start-python.cmd` trước tiên

**Triệu chứng:** chip kênh báo `r.jina.ai từ chối (HTTP 403)` (hoặc lỗi tương tự khi tải tin Telegram),
trong khi mạng vẫn bình thường. Đây là Jina/Cloudflare giới hạn tạm thời theo IP — **không phải** kênh sai
hay app hỏng.

**Cách xử lý (theo thứ tự):**

1. **Trong app:** chip lỗi 403 có nút **Khắc phục** → panel hiện 3 bước, nút **Chép lệnh**, **Tải .cmd**
   và dòng trạng thái proxy `127.0.0.1:8787`. Khi proxy lên, app tự **Làm mới** một lần.
   (Web không tự chạy `.cmd` được — trình duyệt không cho trang chạy chương trình trên máy.)
2. **Double-click `start-python.cmd`** trong thư mục này. Cần **Python 3.10+** (`python --version` để kiểm tra;
   thiếu thì cài từ <https://python.org>).
3. **Giữ cửa sổ đen đang mở** — đóng cửa sổ là tắt proxy. Cửa sổ in ra:
   `Proxy: http://127.0.0.1:8787/api/tg?ch=<kenh>`.
4. Quay lại app, bấm **Làm mới** (hoặc **Kiểm tra lại** trong panel). App tự gọi proxy local khi Jina trả
   `403`/`429`, không cần cấu hình gì.
5. Không dùng được `.cmd` (macOS/Linux)? Chạy `python serve.py` trong thư mục này.
6. Muốn mở app qua proxy: vào <http://127.0.0.1:8787/> (serve.py phục vụ luôn `index.html`). Mở qua đây cũng
   là cách chắc chắn nhất khi app đang chạy từ GitHub Pages (`https`) — trình duyệt có thể chặn gọi tới
   `http://127.0.0.1` từ trang https, panel sẽ báo "không kiểm tra được" và đưa link này.

**Nếu vẫn 403 sau khi proxy chạy:**

- Chờ 1–2 phút rồi bấm **Làm mới** (giới hạn của Jina chỉ là tạm thời).
- Giảm số kênh bật cùng lúc, tắt auto-refresh, giãn nhịp làm mới.
- Đổi mạng/VPN — IP khác thường thoát giới hạn ngay.
- Cổng 8787 bận: đóng tiến trình đang giữ cổng rồi chạy `start-python.cmd` lại.

**Proxy local an toàn:** chỉ bind `127.0.0.1` (không lộ ra LAN), chỉ nhận username Telegram hợp lệ và
`before` dạng số, không nhận URL tùy ý, không có secret. Khi dùng proxy, request đi **thẳng** tới `t.me`,
không qua bên thứ ba.

**Thứ tự dự phòng khi Jina lỗi:** proxy local (đủ bài/ảnh/lượt xem) → **Corsfix** (chỉ khi app chạy qua
localhost + bấm Làm mới thủ công) → **RSS** (`rss2json` + RSSHub/`tg.i-c-a.su`, tối đa 10 bài, không có lượt xem)
→ hiện lỗi Jina gốc.

## Dùng nhanh

1. Double-click **`index.html`** (chạy trực tiếp bằng `file://`).
2. Chọn **Nguồn**: `Telegram` hoặc `X (Twitter)`.
3. Nhập `@channelusername` / `t.me/channelusername` (Telegram) hoặc `@handle` / `x.com/handle` (X) → **Thêm kênh**.
4. Tick/bỏ tick từng kênh trên chip, hoặc **Chọn tất cả / Bỏ chọn tất cả**.
5. Chỉnh số tin (10/20/30/50), cỡ chữ (13–20 px), chiều rộng khung, theme, dịch, auto-refresh → **Làm mới**.

Nút **palette** ở góc phải đổi bảng màu terminal + bật/tắt hiệu ứng CRT. Nút **Xuất / nhập** trong
“Kênh đã lưu” sao lưu/chuyển danh sách kênh bằng một chuỗi `TGNEWS1:…`.

## Cấu trúc thư mục

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ app (HTML + CSS + JS trong một file). Đây là thứ duy nhất cần để đọc tin. |
| `serve.py` | Proxy local fallback khi Jina 403/429 — tuỳ chọn, chỉ cần khi gặp lỗi. |
| `start-python.cmd` | Double-click để chạy `serve.py` trên Windows (kiểm tra Python trước khi chạy). |
| `.gitignore` | Bỏ qua `__pycache__`, file hệ điều hành, log. |

## Nguồn dữ liệu & vì sao cần mạng

- **Telegram:** `t.me/s/<kênh>` trả HTML nhưng **không có** header CORS, nên trình duyệt không đọc trực tiếp được.
  App dùng **`r.jina.ai`** (proxy công khai) và yêu cầu trả HTML gốc bằng header `x-return-format: html`.
- **X (Twitter):** dùng **FxTwitter** (`api.fxtwitter.com`) — JSON công khai, `Access-Control-Allow-Origin: *`.

Đo trên máy này:

| Kiểm tra | Kết quả |
|---|---|
| `r.jina.ai/https://t.me/s/telegram` + `x-return-format: html` | `200`, ~133 KB, CORS `null` (hợp cho `file://`) |
| `api.fxtwitter.com/2/profile/nasa/statuses` | `200`, `ACAO: *`, 20 tweet/trang, có `cursor.bottom` |
| `r.jina.ai/https://x.com/<user>` | chỉ trả login wall — không dùng |
| allorigins / codetabs / corsproxy / cors.lol / cors.eu.org | `5xx`/`401`/`429` — không dùng |

**Cache & giới hạn:** Jina free tier ~20 request/phút; app cache 60 s/trang, giãn cách 200 ms, tự thử lại 1 lần
khi gặp `403`/`429`/5xx. Trang đầu gửi `X-No-Cache: true` để luôn thấy bài mới; các trang cũ `?before=…` dùng
cache Jina (~1 giờ). FxTwitter không có SLA — cũng thử lại 1 lần.

**Quyền riêng tư:** tên kênh + nội dung bài **công khai** đi qua `r.jina.ai` (Telegram) hoặc
`api.fxtwitter.com` (X). Ảnh tải trực tiếp từ CDN Telegram/X. Nội dung chỉ gửi sang Google Translate khi
bạn bật dịch. Khi Jina lỗi và proxy local đang chạy, request đi thẳng tới `t.me`.

## Tính năng

- **Hai nguồn, một danh sách:** chip có badge ✈/𝕏, mỗi kênh một màu (bấm chấm màu để đổi, tránh trùng màu);
  kéo-thả chip để đổi thứ tự, thứ tự được lưu lại.
- **Số tin & phân trang:** 10/20/30/50 mỗi kênh; Telegram phân trang `?before=<msgId>`, X dùng `cursor.bottom`.
- **Auto-refresh** 1/5/10/15/30 phút có đếm ngược, không reset khi chuyển tab, tab ẩn không cào.
- **Hai cách xem:** *Theo kênh* (nhóm màu, header dính, đếm tin) hoặc *Dòng thời gian* (trộn kênh);
  phân cách ngày, badge **MỚI**.
- **Tìm kiếm** không phân biệt dấu, tìm cả bản gốc + bản dịch + tiêu đề link.
- **Dịch tiếng Việt** qua Google Translate (tuỳ chọn), bản dịch cache trong bộ nhớ tab.
- **Media chỉ nhúng URL:** thumbnail gọn, lưới 2 cột (tối đa 4 ảnh + `+N`), lazy-load thẳng từ CDN;
  **lightbox** với `←`/`→`/`Esc`, zoom 1:1, nút mở bài gốc.
- **Chụp hình bài viết:** xuất PNG đúng theme + cỡ chữ, sao chép vào clipboard (không tải file).
- **Chép bài / Lưu TXT:** chép nội dung + link bài gốc; lưu N tin mới nhất mỗi kênh ra `.txt` (UTF-8, chỉ
  thời gian + nội dung).
- **4 bảng màu terminal dark:** Terminal Green (mặc định), Amber, Cyan, Blue — cùng một ngôn ngữ terminal
  (mono, nhãn uppercase, prompt `$`/`>`, góc vuông), nội dung bài vẫn dùng font sans để đọc dài.

## Dữ liệu lưu trên máy

**Tin đã cào không được lưu** — chỉ nằm trong RAM của tab; reload là tải mới. Chỉ danh sách kênh, cài đặt
và trạng thái ẩn banner được lưu vào `localStorage`:

| Key | Nội dung |
|---|---|
| `tgnews.channels.v2` | `{v, channels:[{type:'telegram'\|'twitter', username, title, color, enabled, addedAt}]}` |
| `tgnews.settings.v1` | `{v, count, auto, interval, translate, view, theme, lang, source, fontSize, frameWidth, crt}` |
| `tgnews.notice.v1` | đánh dấu đã ẩn banner giới thiệu |

- `fontSize` = 13/14/15/16/18/20 px (mặc định 14); `frameWidth` = 860/1120/1440/0 (0 = toàn màn hình).
- `theme` = `terminal-dark` (Green) / `terminal-amber` / `terminal-cyan` / `classic-dark` (Blue).
  ID cũ (`classic-light`, `terminal-light`, `dracula`, `nord`, `dark`, `light`) được tự migrate.
- `tgnews.channels.v1` được tự migrate sang v2 rồi xoá; hai key tin/bản dịch cũ (`tgnews.posts.v1`,
  `tgnews.translations.v1`) bị xoá khi khởi động.
- Xoá toàn bộ dữ liệu: DevTools → Application → Local Storage → xoá các key `tgnews.*`.

## Giới hạn

- Chỉ đọc nội dung **công khai**: `t.me/s/<kênh>` và tài khoản X công khai. Kênh hạn chế nội dung có thể
  chỉ trả một phần hoặc chèn “Please open Telegram to view this post”.
- Telegram tối đa 20 bài/trang, tải tối đa 4 trang; một trang có thể chỉ 17–19 bài (album/bài bị xoá) — app
  vẫn phân trang tiếp đến khi đủ số tin. X: 20 tweet/trang, tối đa 3 trang, chỉ timeline gần đây
  (không tìm kiếm/hashtag/archive).
- Giữ tối đa **400 bài trong RAM** mỗi tab; reload xoá và tải lại từ đầu.
- Tweet quote chỉ hiện 600 ký tự đầu, không có media bên trong; retweet hiện như tweet thường.
- Video chỉ có thumbnail; bấm vào mở bài gốc. Một số ảnh CDN bị chặn (`ERR_BLOCKED_BY_ORB`) thì ảnh đó
  không hiện, phần còn lại vẫn dùng.
- Fallback RSS chỉ có tối đa 10 bài, không có lượt xem; proxy local giữ đầy đủ nhất.

## Bảo mật

- HTML tin nhắn là dữ liệu không tin cậy: allowlist tag, bỏ mọi attribute, chỉ giữ `href` http(s) +
  `target="_blank" rel="noopener noreferrer"`; ảnh chỉ nhận `https://`.
- CSP meta: `default-src 'self'`, `connect-src` chỉ `r.jina.ai`, `api.fxtwitter.com`, `api.rss2json.com`,
  `proxy.corsfix.com`, `translate.googleapis.com`, `http://127.0.0.1:8787`; không script/frame ngoài.
- Nhập kênh chỉ nhận `type` telegram/twitter, username hợp lệ, màu hex; `title` được escape; tối đa 500 kênh;
  chuỗi chỉ `JSON.parse`, không `eval`.
- Không có secret hay API key trong file; ảnh chụp chỉ ghi vào clipboard khi bạn bấm nút.

## Xử lý sự cố

| Triệu chứng | Cách xử lý |
|---|---|
| `r.jina.ai từ chối (HTTP 403)` | Bấm **Khắc phục** trên chip lỗi → **Chép lệnh**/tải `.cmd`, chạy proxy, app tự dò `127.0.0.1:8787`. Hoặc làm tay: chạy `start-python.cmd` rồi **Làm mới** (mục đầu tiên). Vẫn lỗi → chờ 1–2 phút, giảm số kênh, đổi mạng. |
| Panel báo "không kiểm tra được" | App đang mở từ https (Pages) và trình duyệt chặn `http://127.0.0.1`. Mở app qua <http://127.0.0.1:8787/> hoặc dùng bản `index.html` chạy `file://`. |
| `429` liên tục | Tắt auto-refresh, giảm số kênh, chờ vài phút (Jina ~20 req/phút). |
| Không thấy bài mới dù kênh có tin | Jina cache ~1 giờ; bấm **Làm mới** (bỏ qua cache nội bộ và gửi `X-No-Cache`). |
| “Kênh riêng tư hoặc không tồn tại” | Sai username, hoặc kênh không phải công khai. |
| Corsfix báo `invalid_origin` | Corsfix chỉ dùng khi mở app qua `localhost`; với `file://` app tự bỏ qua. |
| Ảnh trống / không tải | Ảnh CDN bị chặn (`ERR_BLOCKED_BY_ORB`) hoặc không trả CORS; ảnh đó bị bỏ, phần còn lại vẫn chạy. |
| Clipboard bị chặn khi chụp hình | App mở lightbox — bấm **Sao chép ảnh** hoặc chuột phải → *Copy image*. |
| Cổng 8787 bận | Đóng tiến trình đang giữ cổng (thường là `serve.py` cũ) rồi chạy lại `start-python.cmd`. |

## Yêu cầu

Trình duyệt hiện đại (Chrome/Edge/Firefox) — không cần Node.js. Python 3.10+ chỉ cần khi dùng proxy local.
