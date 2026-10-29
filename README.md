# Loop — Threads 轉 GIF

Loop 可將影片轉成 GIF：你可以上傳影片檔，或貼上含公開影片的 Threads 貼文連結。影片檔的轉檔在瀏覽器中執行；Threads 連結則透過 Vercel Functions 解析並串流來源影片。

## 功能

- 上傳影片檔，或讀取公開 Threads 影片貼文。
- 預覽影片並調整 GIF 的起訖時間、寬度和影格率。
- 在瀏覽器中產生 GIF，預覽後下載。

## 本機開發

需要 Node.js 20 以上版本及 Python 3.12。版本分別記錄在 `.nvmrc` 和 `.python-version`。

安裝前端依賴並啟動 Vite：

```sh
nvm use
npm install
npm run dev
```

開啟 <http://localhost:5173>。此模式可測試影片上傳與轉檔；Threads 貼文解析需要 API，因此請另外使用下列整合模式。

先停止一般 Vite 開發伺服器，再執行：

```sh
npm run dev:vercel
```

開啟 <http://localhost:3001>，即可在本機同時測試網頁及 `api/` 函式。第一次啟動需要網路連線；腳本會在使用者快取目錄安裝獨立的 `uv` 和 Python 3.12，並啟動 Vercel CLI，不會部署網站。Vercel CLI 可能要求登入或連結專案。

建立正式版前端：

```sh
npm run build
```

## 部署

專案使用 Vercel 設定檔 `vercel.json`，以 `npm run build` 建置 Vite 網站，並部署 `api/` 下的 Python Functions。將 repository 匯入 Vercel，使用專案預設設定部署；部署後請確認網站與 Threads 解析 API 都能使用。

## 支援範圍與資料處理

- Threads 解析僅接受公開且含影片的貼文；私人、已刪除或需登入才能檢視的貼文無法解析。
- Threads 解析使用社群維護的 `yt-dlp-threads`。若 Threads 調整網站格式或存取方式，解析可能暫時失效。
- 上傳的影片在使用者瀏覽器內轉檔，不會上傳到轉檔服務。Threads 貼文解析及來源影片串流會呼叫 Vercel API。
- 影片轉檔核心由 FFmpeg.wasm 提供；首次轉檔時瀏覽器需載入核心檔案。
- API 只接受 Threads 貼文網址；影片代理只允許 Threads／Meta CDN 網域。

## 技術

- React 18、Vite 6、Tailwind CSS
- FFmpeg.wasm：在瀏覽器產生 GIF
- Vercel Python Functions、yt-dlp-threads：解析 Threads 影片貼文並串流影片
