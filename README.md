# Telegram & X News Reader — 1 file HTML

Mở **`index.html`** bằng double-click. Đọc tin từ **kênh Telegram công khai** và **tài khoản X công khai**.
Không cần server, không cần `npm install`, không cần đăng nhập, không dùng bot token hay API key.

> Bản `serve.js` / `start.cmd` trong thư mục là phiên bản cũ dùng proxy local.
> `index.html` hiện tại **không phụ thuộc** vào chúng; có thể xoá hai file đó.

## Vì sao vẫn cần mạng (và tại sao không cần server)

- **Telegram:** `t.me/s/<kênh>` trả HTML nhưng **không có header `Access-Control-Allow-Origin`**.
  App dùng **`r.jina.ai`** làm proxy công khai, yêu cầu trả lại **HTML gốc** bằng header
  `x-return-format: html`.
- **X (Twitter):** không có đường đọc công khai ổn định từ trình duyệt. App dùng **FxTwitter**
  (`api.fxtwitter.com`) — API JSON công khai, trả `Access-Control-Allow-Origin: *`.

Đã đo trên máy này:

| Kiểm tra | Kết quả |
|---|---|
| `r.jina.ai/https://t.me/s/telegram` + `x-return-format: html` | `200`, 133 KB, 226 widget marker, ~0,75 s |
| CORS Telegram qua Jina | `Access-Control-Allow-Origin: null` (đúng cho `file://`) |
| Preflight `OPTIONS` | cho phép `x-return-format` |
| Phân trang `?before=441` | trả đúng trang cũ (post 420–440) |
| Kênh không tồn tại | trả trang contact, app nhận diện `not_public` |
| `api.fxtwitter.com/2/profile/nasa/statuses` | `200`, `ACAO: *`, **20 tweet/trang**, ~84 KB, có `cursor.bottom` |
| `api.fxtwitter.com/<user>` | `200`, `ACAO: *` — profile (tên, avatar, followers) |
| `cdn.syndication.twimg.com/...` | `200` nhưng **body 0 byte**, ACAO chỉ cho `platform.twitter.com` |
| `r.jina.ai/https://x.com/<user>` | `200` nhưng chỉ trả **login wall**, không có tweet |
| allorigins / codetabs / corsproxy / cors.lol / cors.eu.org | `500`/`520`/`522`/`401`/`429` — không dùng |

**Quyền riêng tư:** tên kênh/tài khoản và nội dung bài **công khai** sẽ đi qua `r.jina.ai` (Telegram)
hoặc `api.fxtwitter.com` (X). Ảnh/video tải trực tiếp từ CDN Telegram (`cdn*.telesco.pe`) hoặc
`pbs.twimg.com`. Nội dung gửi sang Google Translate chỉ khi bật dịch.
Khi Jina lỗi: proxy local (`serve.py`) chạy trên máy bạn và gọi thẳng `t.me` (không qua bên thứ ba);
nếu dùng Corsfix, tên kênh đi qua `proxy.corsfix.com`; nếu dùng RSS, qua `api.rss2json.com` + RSS
bridge (`rsshub.rssforever.com` / `tg.i-c-a.su`).

**Giới hạn free tier:** Jina khoảng 20 request/phút; app cache 60 s/trang, xếp hàng và giãn cách
200 ms giữa các request Jina, tự chờ + thử lại một lần khi gặp `403`, `429` hoặc lỗi 5xx.
Jina Reader cache trang khoảng **1 giờ**; app gửi `X-No-Cache: true` cho **trang đầu** để luôn thấy
bài mới, chỉ dùng cache Jina cho các trang cũ `?before=…` (nội dung tĩnh).
FxTwitter không có SLA — có thể rate-limit hoặc đổi API; app cũng thử lại một lần khi `403`/`429`/5xx.

## Dùng

1. Double-click `index.html`.
2. Chọn **Nguồn**: `Telegram` hoặc `X (Twitter)`.
3. Nhập `@channelusername` / `t.me/channelusername` (Telegram) hoặc `@handle` / `x.com/handle` (X)
   → **Thêm kênh**.
4. Chọn/bỏ chọn từng kênh bằng checkbox trên chip (hoặc **Chọn tất cả / Bỏ chọn tất cả**).
5. Chọn số tin (10/20/30/50), bật auto-refresh, bật dịch, chọn kiểu xem, chỉnh **cỡ chữ bài viết** và
   **chiều rộng khung tin**, gõ tìm kiếm.
6. Bấm nút **palette** ở góc phải để chọn bảng màu terminal (4 bảng dark: Green mặc định, Amber, Cyan, Blue)
   và bật/tắt hiệu ứng CRT (scanline).
7. Nếu gặp 403/429, chạy `start-python.cmd` (tuỳ chọn) để app dùng proxy local khi Jina lỗi.
8. Bấm **Xuất / nhập** trong “Kênh đã lưu” để sao lưu hoặc chuyển danh sách kênh bằng chuỗi.
9. Bấm **Lưu TXT** cạnh **Làm mới** để lưu N tin mới nhất mỗi kênh ra file `.txt` (chỉ thời gian + nội dung; chọn nơi lưu nếu trình duyệt hỗ trợ).

## Tính năng

- **Nguồn Telegram + X**: chip có badge ✈/𝕏, mỗi kênh một màu riêng (bấm chấm màu để đổi, tự tránh
  trùng màu). Handle trùng giữa hai nguồn bị chặn để giữ khoá duy nhất.
- **Kéo thả kênh**: kéo chip để đổi thứ tự; thứ tự lưu ngay vào `tgnews.channels.v2` và áp dụng
  cho cả danh sách chip lẫn thứ tự nhóm trong feed.
- **Xuất / nhập kênh**: nút **Xuất / nhập** trong “Kênh đã lưu” tạo chuỗi `TGNEWS1:…` (JSON
  base64url) gồm loại, username, tên, màu, bật/tắt; dán chuỗi để nhập. Nhập **gộp**, bỏ qua kênh
  trùng, chuẩn hoá username/màu, không tự tải tin.
- **Tên kênh dài được rút gọn** trong chip: tối đa 24 ký tự (cắt ưu tiên tại khoảng trắng),
  username tối đa 20 ký tự; rê chuột để xem tên đầy đủ trong tooltip.
- **Số tin mới nhất**: 10/20/30/50 mỗi kênh; Telegram phân trang `?before=<msgId>`,
  X phân trang bằng `cursor.bottom` của FxTwitter.
- **Auto refresh**: 1/5/10/15/30 phút, có đếm ngược. Bộ đếm **không bị reset khi chuyển tab**;
  tab ẩn không cào, khi quay lại nếu đã quá hạn sẽ cào bù ngay.
- **Dự phòng Jina 403/429**: thử lại 1 lần, tạm nghỉ 60 s/30 s rồi tự chuyển theo thứ tự:
  **proxy local** (`start-python.cmd` — đầy đủ bài/ảnh/lượt xem) → **Corsfix** (chỉ localhost + Làm mới
  thủ công) → **RSS** (`rss2json` + RSSHub/tg.i-c-a.su, tối đa 10 bài, không có lượt xem).
  Nếu tất cả lỗi, hiện lỗi Jina gốc.
- **Tiếng Việt**: UI Việt/Anh + toggle dịch nội dung qua Google Translate.
- **Hiển thị rõ ràng**: chế độ *Theo kênh* (nhóm màu, header dính, đếm tin) hoặc *Dòng thời gian*
  (trộn kênh, mỗi bài có chip kênh); phân cách ngày; badge **MỚI**.
- **Tìm kiếm** không phân biệt dấu, tìm cả bản gốc + bản dịch + tiêu đề link.
- **Media chỉ nhúng URL**: thumbnail gọn (1 ảnh cao tối đa 300 px; nhiều ảnh xếp lưới 2 cột vuông,
  tối đa 4 ảnh + huy hiệu `+N`), lazy-load thẳng từ CDN Telegram/X, không tải về máy, không lưu
  base64/`data:`/`blob:`. Ảnh tweet dùng `?name=small` cho thumbnail và `?name=orig` cho lightbox.
- **Lightbox**: bấm ảnh/video để mở lớn; `←`/`→` chuyển ảnh, `Esc` đóng, bấm vào ảnh để zoom 1:1
  (cuộn được), có nút Mở bài gốc và ghi chú video chỉ có thumbnail.
- **Chụp hình bài viết**: mỗi bài có nút **Chụp hình** ở chân bài → tạo PNG (nền sáng/tối theo theme,
  kèm URL bài gốc) và **sao chép vào clipboard**, không tải file. Ảnh **không thêm nền**, tự co theo
  nội dung: card mobile 360 px, chữ tối thiểu 19 px, xuất 6x (~2352 px rộng); bài dài ảnh cao hơn.
  Trên PC, ảnh hiển thị theo chiều rộng nên chữ vẫn đọc trực tiếp, không cần zoom. Ảnh CDN được nhúng
  thành `data:`; không dùng thư viện ngoài, không gửi ảnh đi đâu. Bài đang dịch chỉ chụp bản dịch đang
  hiển thị; **bỏ badge “Đã dịch từ…”** và mục **Bản gốc** — hai phần này chỉ hiện trên giao diện. Nếu
  trình duyệt chặn clipboard, app mở ảnh trong lightbox với nút **Sao chép ảnh** (hoặc chuột phải →
  *Copy image*).
- **Chép bài**: nút **Chép bài** sao chép nội dung đang hiển thị (bản dịch nếu đang bật) + **liên kết
  bài gốc**; dùng `navigator.clipboard.writeText`, fallback `document.execCommand('copy')`.
- **Lưu TXT**: nút **Lưu TXT** cạnh **Làm mới** lưu **N tin mới nhất mỗi kênh** (N = “Số tin mỗi kênh”),
  gộp và sắp mới nhất trước, vào một file `.txt` UTF-8 (BOM). Mỗi mục **chỉ có thời gian + nội dung**
  (bản dịch nếu có; nếu bài không có chữ thì dùng tiêu đề link) — **không** có tên kênh/username, lượt xem,
  link, media, URL hay chuyển tiếp. Trình duyệt hỗ trợ `showSaveFilePicker` mở hộp chọn nơi lưu; nếu
  không, tải vào thư mục tải mặc định.
- **Cỡ chữ & chiều rộng**: chọn cỡ chữ bài viết 13–20 px và chiều rộng khung tin (Hẹp 860 / Vừa 1120 /
  Rộng 1440 / Toàn màn hình). Áp dụng ngay và lưu vào `tgnews.settings.v1`. Ảnh chụp dùng cỡ chữ đã
  chọn nhưng tối thiểu 19 px và luôn rộng 360 px (6x), không theo chiều rộng khung.
- **Tweet có quote**: hiển thị nguyên văn tweet được trích dẫn (tối đa 600 ký tự) kèm link tác giả.
- **Cờ quốc gia**: Windows (Segoe UI Emoji) không vẽ regional indicator nên `🇯🇴` bị hiện thành “JO”.
  App thay mỗi cặp bằng ảnh SVG Twemoji (`cdn.jsdelivr.net`, chỉ URL, lazy-load) để cờ hiển thị đúng,
  áp dụng cho cả nội dung gốc, bản dịch, tiêu đề link và tên chuyển tiếp.
- **4 bảng màu terminal dark**: Terminal Green (mặc định), Terminal Amber, Terminal Cyan, Terminal Blue;
  tất cả dùng chung một ngôn ngữ terminal (mono, nhãn uppercase, prompt `$`/`>`, con trỏ nhấp nháy,
  góc vuông), chỉ khác bảng màu; nội dung bài vẫn dùng font sans. Panel chọn có swatch, lưu lựa chọn,
  kèm toggle **hiệu ứng CRT (scanline)** mặc định tắt.
  Link mở bài gốc trên Telegram.

## Hiệu năng

- HTML từng bài được cache theo khoá (nội dung, bản dịch, ngôn ngữ, view, màu kênh, badge **MỚI**),
  nên gõ tìm kiếm hoặc đổi theme không phải dựng lại toàn bộ 400 bài.
- Chỉ mục tìm kiếm (đã bỏ dấu) tính một lần cho mỗi bài; bản dịch cũng được chuẩn hoá một lần.
- Khi dịch xong, app chỉ cập nhật đúng các bài vừa dịch thay vì render lại cả feed.
- `.post` dùng `content-visibility: auto` + `contain-intrinsic-size` để bài ngoài màn hình bỏ qua
  layout/paint.
- Đếm số bài mỗi kênh bằng một lượt `Map` thay vì lọc lại toàn bộ posts cho từng kênh.
- Đo trên bản test 400 bài: render đủ feed **~18–21 ms**; tìm kiếm **~1–2 ms** lần đầu, **~0 ms** các
  lần sau; cập nhật 50 bài đã dịch **~8–9 ms** (trước đây render lại toàn bộ **~51 ms**).

## Khi r.jina.ai trả 403/429

App tự thử lại 1 lần, nghỉ 60 s/30 s rồi chuyển fallback theo thứ tự:

1. **Proxy local** — chạy `start-python.cmd` (hoặc `python serve.py`) một lần và giữ cửa sổ mở.
   Proxy chỉ bind `127.0.0.1:8787`, chỉ nhận username Telegram hợp lệ, trả HTML đầy đủ (bài, ảnh,
   lượt xem). Mở `index.html` như bình thường; app tự gọi proxy khi Jina lỗi.
   Có thể mở luôn app qua `http://127.0.0.1:8787/` (serve.py phục vụ index.html).
2. **Corsfix** — chỉ dùng khi app chạy qua localhost và bấm **Làm mới** thủ công. Corsfix từ chối
   `Origin: null` (file://); free tier 60 request/phút và 10 MB/tháng nên không dùng cho auto-refresh.
3. **RSS** — `rss2json` + RSSHub/tg.i-c-a.su; tối đa 10 bài, không có lượt xem.

Nếu cả ba đều lỗi, kênh hiện chip lỗi Jina gốc. Khi đó chờ 1–2 phút, giảm số kênh/interval hoặc đổi mạng.

## Xuất / nhập kênh

Trong mục **Kênh đã lưu**, bấm **Xuất / nhập**:

- **Xuất chuỗi**: tạo chuỗi `TGNEWS1:<base64url(JSON)>` từ toàn bộ kênh đang lưu (kể cả kênh đang tắt),
  gồm `type`, `username`, `title`, `color`, `enabled`, `addedAt`; chuỗi được đưa vào ô soạn và tự sao chép
  vào clipboard nếu trình duyệt cho phép.
- **Nhập kênh**: dán chuỗi vào ô rồi bấm **Nhập kênh**. App **gộp** vào danh sách hiện có, bỏ qua kênh
  trùng username; màu trùng/không hợp lệ được gán màu khác; username được chuẩn hoá; tối đa 500 kênh.
  Nhập xong **không tự tải tin** — bấm **Làm mới**.

Định dạng nhập chấp nhận:
- Chuỗi xuất `TGNEWS1:…` (base64url, có thể xuống dòng khi dán).
- JSON thuần: `{ "channels": [ … ] }`, mảng object, hoặc một object kênh đơn.
- Mảng string: `["@telegram", "x:@nasa"]`, hoặc base64 thuần không có tiền tố.

Chuỗi **không được mã hoá** — chỉ là JSON base64; đừng chia sẻ nếu không muốn lộ danh sách kênh. App không
gửi chuỗi đi đâu; chuỗi chỉ nằm trong ô soạn/clipboard và không được lưu vào localStorage.

## Giao diện

- Thanh cài đặt chia 3 tầng: hiển thị (số tin / cách xem / cỡ chữ / chiều rộng) → tự động + dịch + hành
  động → tìm kiếm full-width. Select có mũi tên riêng, checkbox thành switch; terminal dùng toggle
  **ON/OFF** vuông 62×24. Nút có icon; mobile 2 cột, topbar gọn, form thêm kênh 2 hàng. Nút **Làm mới**
  giữ icon khi đổi ngôn ngữ hoặc đang tải.
- 4 bảng màu terminal dark: **Terminal Green** (mặc định), **Terminal Amber**, **Terminal Cyan**,
  **Terminal Blue**.
- Nút **palette** ở topbar mở panel swatch; chọn theme áp dụng ngay, lưu vào `tgnews.settings.v1`;
  `Esc` hoặc bấm ra ngoài để đóng, focus trả về nút palette.
- **Toàn bộ theme dùng chung ngôn ngữ terminal**: font mono cho UI/nhãn/meta, nhãn uppercase, góc vuông,
  prompt `$`/`>`, con trỏ nhấp nháy; **hiệu ứng scanline CRT là tuỳ chọn, mặc định tắt**; **nội dung bài
  vẫn dùng font sans** để đọc dài. Các theme chỉ khác bảng màu.
- Ảnh chụp dùng computed style nên theo đúng theme, font và cỡ chữ đang chọn.

## Dịch sang tiếng Việt

- Endpoint: `translate.googleapis.com/translate_a/single?client=gtx&…` (đã đo `ACAO: *`).
- Endpoint công khai **không chính thức**: có thể bị `429`. App thử lại 1 lần, tối đa 2 request song
  song, dừng sau 4 lỗi, tối đa 50 bài/lượt.
- Bản dịch cache theo hash nội dung **trong bộ nhớ tab** → refresh/tắt-bật lại không gọi lại API;
  đóng tab/mở lại thì cache mất (không ghi ra đĩa).
- Bản dịch hiển thị dạng text thuần (giữ xuống đoạn); bản gốc có định dạng nằm trong **Bản gốc**.
- Tắt toggle nếu không muốn gửi nội dung tới Google.

## Dữ liệu lưu trên máy

**Tin đã cào KHÔNG được lưu.** Bài viết và bản dịch chỉ nằm trong bộ nhớ của tab đang mở; reload/mở lại
sẽ tải mới. Chỉ danh sách kênh, cài đặt và trạng thái ẩn banner là được lưu.

| Key | Nội dung |
|---|---|
| `tgnews.channels.v2` | `{v, channels:[{type:'telegram'\|'twitter', username,title,color,enabled,addedAt}]}` |
| `tgnews.settings.v1` | `{v,count,auto,interval,translate,view,theme,lang,source,fontSize,frameWidth}` |
| `tgnews.notice.v1` | đánh dấu đã ẩn banner giới thiệu |

`fontSize` = 13/14/15/16/18/20 (px); `frameWidth` = 860/1120/1440/0 (0 = toàn màn hình).
`theme` = `classic-dark` / `classic-light` / `terminal-dark` / `terminal-light` / `dracula` / `nord`
(giá trị cũ `dark` / `light` tự migrate sang `classic-*`).

Bản cũ `tgnews.channels.v1` được tự migrate sang v2 (mặc định `type:'telegram'`) rồi xoá.
Khi khởi động, app cũng tự xoá 2 key tin/bản dịch `tgnews.posts.v1` / `tgnews.translations.v1` nếu có.
Ảnh chụp bài chỉ được ghi vào clipboard khi bấm nút; app không tải file về máy và không lưu ảnh chụp
vào localStorage. Nếu clipboard bị chặn, ảnh chụp chỉ nằm trong lightbox của tab hiện tại.
Xoá toàn bộ dữ liệu: DevTools → Application → Local Storage → xoá các key `tgnews.*`.

## Giới hạn

- Chỉ kênh **Telegram công khai** (`t.me/s/<name>`) và **tài khoản X công khai**.
- Nội dung là đúng phần `t.me/s` công khai. Kênh bật hạn chế nội dung có thể chỉ trả một phần
  hoặc chèn “Please open Telegram to view this post”; app không đăng nhập nên không lấy thêm được.
- Telegram: tối đa 20 bài/trang, tải thêm tối đa 4 trang. Một trang có thể chỉ có 17–19 bài
  (album, bài bị xoá); app tiếp tục phân trang đến khi đủ số tin hoặc không còn bài cũ hơn,
  **không** dừng chỉ vì trang có ít hơn 20 bài. X: 20 tweet/trang, tối đa 3 trang
  (`cursor.bottom`), chỉ **timeline gần đây** — không tìm kiếm/hashtag/archive.
- Tweet quote chỉ hiển thị 600 ký tự đầu; media bên trong quote không hiển thị; retweet hiện như tweet thường.
- Bài Telegram dạng **reply** lấy nội dung chính (`.js-message_text`), không lấy bản trích
  `.js-message_reply_text` (bản trích bị Telegram cắt ngắn và có “…”, dễ tưởng là thiếu bài).
- Video chỉ có thumbnail; bấm vào mở bài gốc (Telegram hoặc X).
- Một số ảnh CDN có thể bị chặn (`ERR_BLOCKED_BY_ORB`) — ảnh đó không hiện, phần còn lại vẫn dùng.
- Chỉ giữ tối đa 400 bài **trong RAM** cho mỗi tab; reload sẽ xoá và tải lại từ đầu.
- Nếu `r.jina.ai` hoặc `api.fxtwitter.com` chết/giới hạn, app hiện lỗi theo kênh; không có tin cũ
  để hiển thị vì không lưu tin.
- Gặp chip **“r.jina.ai từ chối (HTTP 403)”**: app thử lại 1 lần, tạm nghỉ 60 s rồi chuyển
  **proxy local** (nếu đang chạy `start-python.cmd`) → **Corsfix** (chỉ localhost + Làm mới thủ công)
  → **RSS**. Nếu tất cả fallback lỗi, chờ 1–2 phút rồi bấm **Làm mới**. 403 thường do
  Jina/Cloudflare giới hạn tạm thời theo IP, không phải kênh sai. Nếu lặp lại liên tục, thử đổi
  mạng/VPN hoặc giảm số kênh bật cùng lúc.
- Fallback RSS chỉ có **tối đa 10 bài**, không có lượt xem; proxy local/Corsfix giữ đầy đủ hơn.
  Nếu tất cả fallback lỗi, kênh hiện chip lỗi Jina gốc và không có tin cũ để hiển thị.
- Jina Reader cache trang khoảng **1 giờ**; app đã gửi `X-No-Cache` cho trang đầu. Nếu vẫn thấy bài cũ,
  bấm **Làm mới** — nút này bỏ qua cả cache nội bộ 60 s và gọi lại Jina.
- **Chụp hình / clipboard**: ảnh **không thêm nền**, tự co theo nội dung; card 360 px, chữ ≥19 px,
  xuất 6x (~2352 px rộng). Bài rất cao bị giới hạn 24 000 px cạnh dài và 40 MP (giảm scale, không
  đổi layout); ảnh có thể rất cao với bài dài. Trên PC, ảnh hiển thị theo chiều rộng cho chữ hiệu
  dụng ~19,4 px (bài test 400 px) — đọc trực tiếp, không cần zoom. Ảnh CDN không trả CORS sẽ thành ô
  trống; ảnh chụp không có video (chỉ thumbnail) và với bài dịch chỉ chụp bản dịch — badge
  **Đã dịch từ…** và mục **Bản gốc** bị bỏ. `ClipboardItem image/png` cần trình duyệt hỗ trợ và quyền
  clipboard; nếu bị chặn, app mở lightbox để bấm **Sao chép ảnh** hoặc chuột phải → *Copy image*.
  Chrome/Edge/Firefox hiện đại đều chạy được.
- **Chép bài**: nếu cả Clipboard API và `execCommand` đều bị chặn, nút báo **Lỗi** và không có gì được
  sao chép; thử lại sau khi cấp quyền clipboard cho trang.
- **Lưu TXT**: chỉ lấy N tin mới nhất mỗi kênh (N = “Số tin mỗi kênh”), không lưu toàn bộ 400 bài tích
  lũy; file chỉ có thời gian + nội dung, không có metadata kênh/views/link/media. Nút tắt khi chưa có
  tin; bài không có chữ và không có link bị bỏ qua. File UTF-8 BOM + CRLF; `showSaveFilePicker` mở hộp
  chọn nơi lưu; nếu không hỗ trợ, file vào thư mục tải mặc định — huỷ hộp chọn thì không tạo file.

## Bảo mật

- HTML tin nhắn là dữ liệu không tin cậy: allowlist tag, bỏ mọi attribute, chỉ giữ `href` http(s) +
  `target="_blank" rel="noopener noreferrer"`; ảnh chỉ nhận `https://`.
- CSP meta: `default-src 'self'`; `connect-src` chỉ `r.jina.ai` + `api.fxtwitter.com`
  + `api.rss2json.com` + `proxy.corsfix.com` + `translate.googleapis.com` + `http://127.0.0.1:8787`;
  ảnh https; không có script/frame ngoài.
- Proxy local (`serve.py`) chỉ bind `127.0.0.1:8787`, chỉ nhận username Telegram hợp lệ + `before`
  dạng số, không nhận URL tùy ý; không có secret.
- Nhập kênh chỉ nhận `type` telegram/twitter, username hợp lệ, màu hex; `title` được escape khi render;
  tối đa 500 kênh; chuỗi chỉ được `JSON.parse`, không `eval`, không chèn HTML.
- Nội dung tweet được escape trước khi render; chỉ tự linkify URL `http(s)`, không chèn HTML thô.
- Chụp hình chỉ đọc DOM hiện tại và tải lại ảnh CDN bằng `crossorigin` để nhúng `data:`; ảnh và nội dung
  chỉ được ghi vào clipboard khi người dùng bấm nút, không tự tải file, không thêm script/thư viện ngoài,
  không đổi CSP.
- Không có secret hay API key trong file.

## Kiểm chứng đã chạy

- `node --check` cho toàn bộ JS nhúng: pass.
- Mở `file://` thật, thêm `@telegram`: cào 20 rồi 50 tin (3 request jina, gồm `before=441`, `before=420`),
  dịch 50/50 trong bộ nhớ.
- Nguồn X: thêm `@NASA` → 29 tweet (2 trang cursor), 23 media, ảnh `pbs.twimg.com` (`name=small`
  cho thumbnail, `name=orig` trong lightbox), views dạng `1.7M`; `@elonmusk` → 24 tweet, 20 tweet quote.
- Lightbox tweet: `1 / 1`, caption `NASA · 23/10 22:34`, nút mở đúng `x.com/NASA/status/…`.
- Video X: `@SpaceX` → 48 tweet, 10 video (thumbnail + thời lượng 0:19–0:33), 39 ảnh thumbnail `name=small`.
- Lỗi X: handle không tồn tại → chip lỗi “Không tìm thấy tài khoản X”; thêm `@telegram` khi chọn
  nguồn X → báo “Handle này đã có ở nguồn Telegram”.
- Migration: `tgnews.channels.v1` → `tgnews.channels.v2` với `type:'telegram'`, key v1 bị xoá.
- Reload: app tự cào lại (không đọc tin cũ); `localStorage` chỉ còn `tgnews.channels.v2`,
  `tgnews.settings.v1`, `tgnews.notice.v1`; hai key `tgnews.posts.v1` / `tgnews.translations.v1` bị xoá.
- Kênh không tồn tại: chip lỗi “Kênh riêng tư hoặc không tồn tại”, kênh tốt vẫn nguyên.
- Ảnh trong feed đều `loading="lazy"` + `decoding="async"`, không có `data:image`/`blob:` trong DOM.
- Cờ quốc gia: 28 ảnh Twemoji (Nga/Ukraine/Belarus/Kazakh/Kyrgyz/Uzbek/Trung Quốc…) tải thành công,
  0 ảnh lỗi; cờ có cả trong bản dịch và bản gốc.
- Media: ảnh đơn 310×300 px (không nhảy layout khi lazy-load); bài 2 ảnh (`durov/510`) xếp 2 ô vuông;
  lightbox mở đúng `1 / 2` → `2 / 2`, zoom 1:1 (578×800), `Esc` đóng và trả focus về thumbnail.
- Bài test 6 ảnh: lưới `n4` + huy hiệu `+2`; lightbox mở `4 / 6` và đi tới `6 / 6` (bài test đã xoá).
- Hiệu năng (bản test 400 bài): render đủ feed ~18–21 ms (content-visibility), tìm kiếm ~1–2 ms/0 ms,
  patch 50 bài ~8–9 ms so với render lại toàn bộ ~51 ms.
- Chụp hình PC: không thêm nền, ảnh tự co theo nội dung → short 2352×1080 (aspect 2.18), medium
  2352×9288 (aspect 0.25), long 1571×24000 (aspect 0.065, chạm maxSide 24k, scale 4.0); text trong
  ảnh 114/114/76 px; hiển thị ở 400 px rộng cho chữ hiệu dụng ~19,4 px cho cả ba — đọc trực tiếp
  trên PC, không cần zoom. Clipboard `image/png` 2.4 MB (medium); long PNG 7.58 MB; theme/footer URL
  giữ nguyên; trên `@telegram`: 20 bài/20 nút, 16 bài có media; khi clipboard bị chặn, lightbox +
  **Sao chép ảnh** hoạt động như cũ.
- Lưu TXT: count=2, 2 kênh/6 bài → **4 mục** (2 mới nhất mỗi kênh), 123 ký tự; mỗi mục chỉ có
  `YYYY-MM-DD HH:mm` + nội dung; bài dịch dùng bản dịch, bài chỉ có link dùng tiêu đề link; **không** có
  header/tên kênh/@username/views/URL/media/chuyển tiếp; bài cũ nhất bị loại; CRLF; BOM `EF BB BF`
  (239,187,191). Picker nhận `telegram-x-news-YYYYMMDD-HHmm.txt`, ghi/đóng; fallback/cancel/picker lỗi
  vẫn đúng; chưa có nội dung → "Chưa có nội dung để lưu.".
- Chép bài: `@telegram/460` → label **Đã chép**, nội dung 248 ký tự + dòng cuối `https://t.me/telegram/460`;
  `writeText` bị chặn → `execCommand` fallback vẫn chép đúng; cả hai lỗi → label **Lỗi**.
- Cỡ chữ & chiều rộng: 20 px → `--read-size: 20px` và `.post-text` 20 px; Rộng 1440 → `main.maxWidth`
  1440 px; Toàn màn hình (0) → `100%`; reload giữ 18 px / Hẹp 860.
- Giao diện: panel có 4 bảng màu terminal dark + swatch, active có check; **tất cả** dùng UI mono, nhãn
  uppercase, prompt `$`/`>`, cursor, góc vuông; nội dung bài vẫn sans; Terminal Green/Amber/Cyan/Blue
  đổi đúng palette. Toggle CRT (scanline) mặc định tắt, bật/tắt lưu vào settings. Đóng panel bằng
  backdrop/Esc, focus trả về nút palette. Reload giữ lựa chọn; theme cũ (`classic-light`,
  `terminal-light`, `dracula`, `nord`) migrate sang palette terminal tương ứng. Ảnh chụp dưới theme tối giữ màu
  terminal, bỏ badge/Bản gốc.
- Terminal switches: **tất cả theme** hiển thị toggle **ON/OFF** 62×24, thumb vuông, accent glow; bật/tắt
  không đổi bố cục.
- Độ trễ: request Jina trang đầu có `x-return-format: html` + `x-no-cache: true`; trang `?before=441`
  chỉ có `x-return-format` (dùng cache). **Làm mới** bỏ qua cache nội bộ (1 → 2 request) và vẫn gửi
  `x-no-cache`; bộ đếm auto không đổi khi dispatch `visibilitychange` hoặc `applyI18n` (delta 0 ms).
- Dự phòng Jina: `fetchTelegramViaRss('telegram')` → 10 bài, first key `telegram/460`, có thumbnail
  telesco; giả lập Jina 403 → `fetchTelegramPosts` trả 10 bài, 2 request Jina (retry), lần gọi tiếp theo
  trong cooldown không gọi Jina.
- Proxy local: `curl /api/tg?ch=telegram` → 200, 127 KB, 343 widget marker; harness giả lập Jina 403 →
  20 bài, first `telegram/460`, views 2.27M, 3 bài có media, 2 request Jina (retry) — dùng proxy local,
  không cần RSS.
- Corsfix: Origin `http://127.0.0.1:8787` → 200, 225 widget; Origin `null` (file://) → 400
  `invalid_origin`; app trả `corsfix_origin` và bỏ qua khi mở file://.
- Xuất / nhập kênh: xuất 2 kênh (Telegram + X) → chuỗi `TGNEWS1:` 438 ký tự, decode đúng
  type/title/color/enabled, tự copy; nhập vào danh sách rỗng → 2 kênh, lưu localStorage; nhập lại →
  bỏ qua 2, không nhân đôi. JSON mảng/object/mảng string/base64 thuần đều nhận; màu trùng được gán
  màu khác; chuỗi sai báo lỗi; panel mở/đóng giữ focus và loại trừ với panel giao diện.
- Tìm kiếm: `gift marketplace` → 1 bài; từ khoá không khớp → hiện “Không có tin khớp từ khoá”; xoá từ khoá
  → trả lại 20 bài. Lightbox vẫn mở/đóng đúng; feed không có `data:`/`blob:` image.
