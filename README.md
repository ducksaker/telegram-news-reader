# Telegram & X News Reader

Đọc tin từ **kênh Telegram công khai** và **tài khoản X công khai** trong đúng **một file `index.html`**:
đọc tin không cần server, không `npm install`, không tài khoản, không API key, không build. **Dịch** chạy
trực tiếp trong trình duyệt bằng Google Translate public; chỉ khi Google chặn (429/CAPTCHA/CORS) mới cần
proxy local `serve.py` (Python 3.10+).

Mục lục: [Lỗi 403](#-gặp-lỗi-403-từ-rjinai--chạy-start-pythoncmd-trước-tiên) · [Dùng nhanh](#dùng-nhanh) ·
[Cấu trúc](#cấu-trúc-thư-mục) · [Nguồn dữ liệu](#nguồn-dữ-liệu--vì-sao-cần-mạng) · [Tính năng](#tính-năng) ·
[Dữ liệu lưu](#dữ-liệu-lưu-trên-máy) · [Giới hạn](#giới-hạn) · [Bảo mật](#bảo-mật) · [Kiểm thử](#kiểm-thử) ·
[Sự cố](#xử-lý-sự-cố)

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
   `Telegram: http://127.0.0.1:8787/api/tg?ch=<kenh>` và `Dich: http://127.0.0.1:8787/api/translate?q=<text>`.
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
`before` dạng số, không nhận URL tùy ý, không có secret. Khi dùng proxy cho Telegram, request đi **thẳng**
tới `t.me`; riêng `/api/translate` gửi text tới Google, rồi MyMemory khi Google lỗi.

**Thứ tự dự phòng khi Jina lỗi:** proxy local (đủ bài/ảnh/lượt xem) → **Corsfix** (chỉ khi app chạy qua
localhost + bấm Làm mới thủ công) → **RSS** (`rss2json` + RSSHub/`tg.i-c-a.su`, tối đa 10 bài, không có lượt xem)
→ hiện lỗi Jina gốc.

**Dịch mặc định chạy trực tiếp trong trình duyệt:** app gọi
`https://translate.googleapis.com/translate_a/single?client=gtx…` bằng `fetch`. Khi Google trả `200`, response
có `Access-Control-Allow-Origin: *` nên trình duyệt đọc được. Khi Google chặn (`429`/CAPTCHA, response lỗi
không có CORS) hoặc mất mạng, app tự gọi proxy local `http://127.0.0.1:8787/api/translate`; proxy gọi Google
phía server, lỗi thì fallback MyMemory. Sau một lần Google lỗi, app tạm bỏ qua Google 60 giây để không bắn
lặp 50 request. Không chạy proxy thì phần dịch báo đúng lỗi và hướng dẫn chạy `start-python.cmd`; đọc tin vẫn
hoạt động bình thường.

## Dùng nhanh

1. Double-click **`index.html`** (chạy trực tiếp bằng `file://`).
2. Chọn **Nguồn**: `Telegram` hoặc `X (Twitter)`.
3. Nhập `@channelusername` / `t.me/channelusername` (Telegram) hoặc `@handle` / `x.com/handle` (X) → **Thêm kênh**.
4. Tick/bỏ tick từng kênh trên chip, hoặc **Chọn tất cả / Bỏ chọn tất cả**.
5. Chỉnh số tin (10/20/30/50), cỡ chữ (13–20 px), chiều rộng khung, theme, dịch, auto-refresh → **Làm mới**.
   Dịch chạy trực tiếp bằng Google public, không cần chạy gì thêm. Nếu Google chặn, app báo và bạn chạy
   **`start-python.cmd`** để dùng proxy local.

Nút **palette** ở góc phải đổi bảng màu terminal + bật/tắt hiệu ứng CRT. Nút **Xuất / nhập** trong
“Kênh đã lưu” sao lưu/chuyển danh sách kênh + tag bằng một chuỗi `TGNEWS1:…`.

**Tag:** bấm **#** trên chip kênh để gắn/gỡ tag (gõ tên mới rồi `Enter` là tạo luôn). Dải chip phía trên
feed để lọc theo tag — bấm nhiều chip để chọn nhiều tag, **Tất cả** để bỏ lọc, **Quản lý tag** để đổi tên/xoá.

## Cấu trúc thư mục

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ app (HTML + CSS + JS trong một file). Đây là thứ duy nhất cần để đọc tin. |
| `serve.py` | Proxy local fallback khi Jina 403/429 hoặc khi Google Translate public bị chặn; endpoint dịch `/api/translate` (Google → MyMemory) — tuỳ chọn, chỉ cần khi gặp lỗi. |
| `start-python.cmd` | Double-click để chạy `serve.py` trên Windows (kiểm tra Python trước khi chạy). |
| `.gitignore` | Bỏ qua `__pycache__`, file hệ điều hành, log. |

## Nguồn dữ liệu & vì sao cần mạng

- **Telegram:** `t.me/s/<kênh>` trả HTML nhưng **không có** header CORS, nên trình duyệt không đọc trực tiếp được.
  App dùng **`r.jina.ai`** (proxy công khai) và yêu cầu trả HTML gốc bằng header `x-return-format: html`.
- **X (Twitter):** dùng **FxTwitter** (`api.fxtwitter.com`) — JSON công khai, `Access-Control-Allow-Origin: *`.
- **Dịch:** `translate.googleapis.com` trả `Access-Control-Allow-Origin: *` khi `200`, nên app gọi trực tiếp
  từ trình duyệt. Khi Google chặn `429`/CAPTCHA (response lỗi không có CORS), app gọi proxy local
  `127.0.0.1:8787/api/translate`; proxy gọi Google phía server, lỗi thì fallback **MyMemory**
  (`langpair=autodetect%7Cvi`, `ACAO: *`, tối đa 500 byte/request).

Đo trên máy này:

| Kiểm tra | Kết quả |
|---|---|
| `r.jina.ai/https://t.me/s/telegram` + `x-return-format: html` | `200`, ~133 KB, CORS `null` (hợp cho `file://`) |
| `api.fxtwitter.com/2/profile/nasa/statuses` | `200`, `ACAO: *`, 20 tweet/trang, có `cursor.bottom` |
| `translate.googleapis.com/translate_a/single?client=gtx…` | `200`, `ACAO: *`, JSON; khi bị chặn trả `429` HTML **không có ACAO** → trình duyệt chặn |
| `api.mymemory.translated.net/get?q=…&langpair=autodetect%7Cvi` | `200`, `ACAO: *`, tự nhận en/zh-CN/ru; tối đa 500 byte/request (chỉ dùng trong proxy) |
| `r.jina.ai/https://x.com/<user>` | chỉ trả login wall — không dùng |
| allorigins / codetabs / corsproxy / cors.lol / cors.eu.org | `5xx`/`401`/`429` — không dùng |

**Cache & giới hạn:** Jina free tier ~20 request/phút; app cache 60 s/trang, giãn cách 200 ms, tự thử lại 1 lần
khi gặp `403`/`429`/5xx. Trang đầu gửi `X-No-Cache: true` để luôn thấy bài mới; các trang cũ `?before=…` dùng
cache Jina (~1 giờ). FxTwitter không có SLA — cũng thử lại 1 lần.

**Giới hạn dịch:** Google public không có SLA và có thể chặn `429`/CAPTCHA theo IP; khi đó app chuyển sang
proxy local. Proxy thử Google phía server, nếu vẫn lỗi mới dùng MyMemory — miễn phí **5.000 ký tự/ngày**
(ẩn danh), **500 byte/request** nên proxy tự cắt chunk. Proxy cache bản dịch 1 giờ theo nội dung. Khi hết
hạn mức, app dừng dịch và báo rõ; bài đã dịch vẫn giữ trong RAM.

**Quyền riêng tư:** tên kênh + nội dung bài **công khai** đi qua `r.jina.ai` (Telegram) hoặc
`api.fxtwitter.com` (X). Ảnh tải trực tiếp từ CDN Telegram/X. Khi bật dịch, nội dung bài được gửi trực tiếp
tới Google Translate từ trình duyệt; nếu Google chặn, proxy local gửi tới Google, rồi MyMemory
(Translated.net) khi Google vẫn lỗi. Không có API key hay tài khoản nào được lưu. Khi Jina lỗi và proxy
local đang chạy, request đi thẳng tới `t.me`.

## Tính năng

- **Hai nguồn, một danh sách:** chip có badge ✈/𝕏, mỗi kênh một màu (bấm chấm màu để đổi, tránh trùng màu);
  kéo-thả chip để đổi thứ tự, thứ tự được lưu lại.
- **Số tin & phân trang:** 10/20/30/50 mỗi kênh; Telegram phân trang `?before=<msgId>`, X dùng `cursor.bottom`.
- **Auto-refresh** 1/5/10/15/30 phút có đếm ngược, không reset khi chuyển tab, tab ẩn không cào.
- **Hai cách xem:** *Theo kênh* (nhóm màu, header dính, đếm tin) hoặc *Dòng thời gian* (trộn kênh);
  phân cách ngày, badge **MỚI**.
- **Tìm kiếm** không phân biệt dấu, tìm cả bản gốc + bản dịch + tiêu đề link.
- **Tag & lọc theo tag:** gắn tối đa 10 tag mỗi kênh (tên ≤ 30 ký tự; `#Political`, ` political `,
  `Political` là một; `Chính trị` khớp `chinh tri`). Dải chip trên feed bấm để lọc nhiều tag, **Tất cả**
  để bỏ lọc; khi lọc, kênh ngoài tag bị **mờ** và tiêu đề "Kênh đã lưu" hiện badge `Lọc tag: n/tổng kênh`
  để thấy ngay tập đang dùng. Bấm **#** trên chip kênh để gắn/gỡ; **Quản lý tag** cho đổi tên/xoá (xoá tag
  báo số kênh, tự gỡ khỏi mọi kênh, không xoá kênh hay bài viết). Lựa chọn lọc được giữ khi mở lại app.
- **Tag có màu:** mỗi tag một màu trong palette 10 màu (tự gán, tránh trùng giữa các tag); màu hiện ở
  chấm trên chip lọc và trong popover. Bấm chấm màu ở **Quản lý tag** để đổi màu.
- **Cào theo phạm vi tag:** chỉ tải kênh thuộc tag đang lọc; cache 3 phút mỗi kênh nên đổi tag qua lại
  không cào lại — **Làm mới** và auto-refresh luôn bỏ qua cache. Kênh lỗi không làm hỏng feed, vẫn báo
  kênh nào không tải được.
- **Dịch tiếng Việt** trực tiếp bằng Google Translate public trong trình duyệt; nếu Google chặn mới fallback
  proxy local (Google → MyMemory), tuỳ chọn; bản dịch cache trong bộ nhớ tab, badge có tooltip ghi nguồn dịch.
- **Media chỉ nhúng URL:** thumbnail gọn, lưới 2 cột (tối đa 4 ảnh + `+N`), lazy-load thẳng từ CDN;
  **lightbox** với `←`/`→`/`Esc`, zoom 1:1, nút mở bài gốc.
- **Chụp hình bài viết, 12 tỷ lệ × 3 cỡ (36 preset):** mỗi preset là khung cố định — **16:9**, **3:2**,
  **4:3**, **1:1**, **4:5**, **5:8**, **9:16**, **2:1**, **1.91:1**, **21:9**, **3:1**, **2:3** — nhân với
  ba cỡ **Lớn** (= 1,5 × Trung bình) / **Trung bình** / **Nhỏ**. Hộp chọn **▾** mở dạng **dialog cố định**
  (`position: fixed`), nhóm theo tỷ lệ, mỗi dòng ghi rõ “16:9 – Trung bình · 1280×720”, dấu ✓ ở preset
  đang dùng; **không tự đóng khi cuộn hay khi chọn** — chọn xong hộp vẫn mở để đổi cỡ tiếp, đóng bằng
  nút **×**, `Esc` hoặc bấm ra ngoài. Ảnh ra **đúng số pixel** đó; bài tự co cho vừa khung (bài càng dài
  chữ càng nhỏ), phần dư lấp bằng màu nền theme. Sao chép vào clipboard, không tải file; lựa chọn được
  nhớ cho lần sau; dòng trạng thái trong hộp báo “Đã chép · 4:3 – Nhỏ · 640×480”.
- **Chép bài / Lưu TXT:** chép nội dung + link bài gốc; lưu N tin mới nhất mỗi kênh ra `.txt` (UTF-8, chỉ
  thời gian + nội dung).
- **4 bảng màu terminal dark:** Terminal Green (mặc định), Amber, Cyan, Blue — cùng một ngôn ngữ terminal
  (mono, nhãn uppercase, prompt `$`/`>`, góc vuông), nội dung bài vẫn dùng font sans để đọc dài.

## Dữ liệu lưu trên máy

**Tin đã cào không được lưu** — chỉ nằm trong RAM của tab; reload là tải mới. Chỉ danh sách kênh, cài đặt
và trạng thái ẩn banner được lưu vào `localStorage`:

| Key | Nội dung |
|---|---|
| `tgnews.channels.v3` | `{v:3, channels:[{type:'telegram'\|'twitter', username, title, color, enabled, addedAt, tags:[tagId]}], tags:[{id, name, color, createdAt}]}` |
| `tgnews.settings.v1` | `{v, count, auto, interval, translate, view, theme, lang, source, fontSize, frameWidth, shotSize, tagFilter, crt}` |
| `tgnews.notice.v1` | đánh dấu đã ẩn banner giới thiệu |

- `fontSize` = 13/14/15/16/18/20 px (mặc định 14); `frameWidth` = 860/1120/1440/0 (0 = toàn màn hình).
- `shotSize` = preset ảnh chụp dạng `<tỷ lệ>-<cỡ>`: `16x9-m` mặc định (16:9 – Trung bình 1280×720);
  `-l` Lớn, `-m` Trung bình, `-s` Nhỏ; slug tỷ lệ là `16x9`, `3x2`, `4x3`, `1x1`, `4x5`, `5x8`, `9x16`,
  `2x1`, `1.91x1`, `21x9`, `3x1`, `2x3`. Giá trị cũ/lạ tự về mặc định.
- `theme` = `terminal-dark` (Green) / `terminal-amber` / `terminal-cyan` / `classic-dark` (Blue).
  ID cũ (`classic-light`, `terminal-light`, `dracula`, `nord`, `dark`, `light`) được tự migrate.
- `tagFilter` = mảng id tag đang lọc (rỗng = tất cả kênh); id không còn tồn tại tự bị bỏ khi khởi động.
  Tag lưu `{id, name, color}` — đổi tên chỉ đổi `name`, id và liên kết kênh giữ nguyên.
- `tgnews.channels.v1`/`v2` được tự migrate sang v3 (kênh cũ nhận `tags: []`) rồi xoá key cũ; hai key
  tin/bản dịch cũ (`tgnews.posts.v1`, `tgnews.translations.v1`) bị xoá khi khởi động.
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
- Dịch mặc định **trực tiếp trong trình duyệt** bằng Google public. Google có thể chặn `429`/CAPTCHA theo IP;
  khi đó app chuyển sang **proxy local** (`start-python.cmd`), proxy thử Google rồi MyMemory (tối đa
  **5.000 ký tự/ngày** ẩn danh, **500 byte/request**). App tự dịch tối đa **50 bài/lần**, cache bản dịch
  trong RAM; hết hạn mức thì dừng và báo, không tự bắn tiếp.
- Ảnh chụp luôn **đúng W×H** của preset (tối đa 2560×1440 ở cỡ Lớn): bài dài được thu nhỏ cho vừa
  khung nên chữ có thể nhỏ, không bị cắt nội dung; bài ngắn có viền nền theme.
- Tag: tối đa **30 ký tự**/tên, **10 tag**/kênh; so trùng bỏ dấu tiếng Việt nên `Chính trị` và `Chinh tri`
  là một. Cache cào **3 phút/kênh** (RAM, mất khi reload); chọn tag không cào lại kênh còn mới.

## Bảo mật

- HTML tin nhắn là dữ liệu không tin cậy: allowlist tag, bỏ mọi attribute, chỉ giữ `href` http(s) +
  `target="_blank" rel="noopener noreferrer"`; ảnh chỉ nhận `https://`.
- CSP meta: `default-src 'self'`, `connect-src` chỉ `r.jina.ai`, `api.fxtwitter.com`, `api.rss2json.com`,
  `proxy.corsfix.com`, `translate.googleapis.com`, `http://127.0.0.1:8787`; không script/frame ngoài.
  MyMemory chỉ do `serve.py` gọi phía server nên không cần mở trong CSP trình duyệt.
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
| Dịch báo “Google Translate bị chặn và proxy chưa chạy” | Google đang chặn IP; chạy **`start-python.cmd`**, giữ cửa sổ đen mở, rồi bấm **Dịch**/ **Làm mới**. Kiểm tra `http://127.0.0.1:8787/api/health` trả `"translate": true`. |
| Dịch báo Google `429`/CAPTCHA | IP đang bị Google chặn tạm thời; app tự chuyển proxy local (Google → MyMemory). Chờ vài phút, tắt auto-refresh, hoặc đổi mạng/VPN. |
| Dịch báo MyMemory hết hạn mức | MyMemory miễn phí 5.000 ký tự/ngày, chỉ dùng trong proxy khi Google vẫn lỗi; chờ sang ngày mới hoặc dùng Google Translate thủ công. Bài đã dịch vẫn còn trong tab. |
| Badge ghi “MyMemory” thay vì Google | Bình thường: Google đang chặn nên proxy đã fallback; bản dịch vẫn hợp lệ. |
| Dịch không chạy khi app mở từ https (Pages) | Trình duyệt chặn `http://127.0.0.1`; mở app qua <http://127.0.0.1:8787/> hoặc chạy `index.html` bằng `file://`. |
| Cổng 8787 bận | Đóng tiến trình đang giữ cổng (thường là `serve.py` cũ) rồi chạy lại `start-python.cmd`. |

## Kiểm thử

Chạy test: Node ≥ 22 cho test JS, Python 3.10+ cho test proxy; app vẫn là 1 file HTML.

```bash
node tests/shot-presets.test.mjs     # bảng preset + hợp đồng "preset thật sự chạy trong luồng chụp"
node tests/shot-menu.dom.smoke.mjs   # nạp JS thật với DOM giả: mở menu, chọn cỡ, phím, i18n
node tests/tags.test.mjs             # chuẩn hoá tên tag, gắn/gỡ, phạm vi lọc, dọn dữ liệu
node tests/tags.dom.smoke.mjs        # UI tag với DOM giả + boot lại để kiểm tra dữ liệu sau reload
node tests/translate.test.mjs        # client dịch: Google trực tiếp trước, fallback proxy, cache, chunk, tiếng Việt
python tests/translate_proxy.test.py # serve.py: chunk UTF-8, parse Google/MyMemory, fallback, quota
```

`tests/shot-menu.smoke.mjs` là bản chạy trên Chrome/Edge thật (chụp cả screenshot) — cần môi trường
cho phép mở trình duyệt. Kiểm tra proxy thật (sau khi chạy `serve.py`):
`http://127.0.0.1:8787/api/translate?q=Hello` phải trả JSON `{"ok":true,...}`.

## Yêu cầu

Trình duyệt hiện đại (Chrome/Edge/Firefox) — không cần Node.js, không cần Python để đọc tin và **dịch
trực tiếp bằng Google public**. Python 3.10+ chỉ cần cho **proxy local** (fallback Jina 403/429 và fallback
dịch khi Google chặn); không có Python thì app vẫn đọc tin + dịch bình thường, chỉ khi Google chặn mới
không có proxy dự phòng.
