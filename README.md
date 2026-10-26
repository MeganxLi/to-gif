# Loop — Threads 轉 GIF

用 React、Tailwind CSS 打造的影片轉 GIF 網頁。前端以 FFmpeg.wasm 在瀏覽器處理影片；Vercel Python Functions 用開源 `yt-dlp-threads` 外掛解析 Threads 公開貼文，並將影片串流傳回瀏覽器。

## 本機預覽

```sh
nvm use
npm install
npm run dev
```

請使用 Node.js 20 以上版本及 Python 3.12（分別由 `.nvmrc`、`.python-version` 指定）。

`npm run dev` 會在 `http://localhost:5173` 開啟本機網頁，可測試影片上傳與轉 GIF。要測試 Threads 連結，請先停止一般開發伺服器，再執行 `npm run dev:vercel`，並開啟 `http://localhost:3001`；這會在本機同時提供網頁與 `api/` 函式，不會部署網站。啟動腳本會在使用者快取目錄安裝獨立版 `uv` 和 Python 3.12，不會用 pip 修改 macOS 管理的 Python。第一次啟動需要網路連線，Vercel CLI 也可能要求登入或連結專案。

## 部署到 Vercel

1. 將專案推送到自己的 GitHub repository。
2. 在 Vercel 選 **Add New → Project**，匯入該 GitHub repository。
3. 使用預設的 Vite 專案設定部署。Vercel 會執行 `npm run build`，並部署 `api/` 內的 Python Functions。
4. 開啟部署完成後的 Vercel 網址即可使用。

Vercel Hobby 個人方案目前免費，適合個人、非商用專案。用量超過方案額度時會暫停相關功能，需等額度重置；商業用途需留意方案條款及計費。

## 支援範圍

- 只支援公開且包含影片的 Threads 貼文；私人、刪除、登入限定貼文無法解析。
- `yt-dlp-threads` 是社群維護的非官方解析外掛。Threads 調整網站格式或存取方式時，外掛可能暫時失效。
- GIF 轉換在使用者的瀏覽器內執行。FFmpeg.wasm 核心隨網站一起部署，第一次轉換會下載約 32 MB 的開源轉檔核心；影片不會傳到轉檔服務。`@ffmpeg/core` 採 GPL-2.0-or-later 授權。
- 解析與取回來源影片需要呼叫 Vercel API。此 API 只接受 Threads 網址，影片代理只允許 Threads/Meta CDN 網域。

## 技術

- React + Vite
- Tailwind CSS 與 shadcn/ui 風格的介面元件
- FFmpeg.wasm（瀏覽器本機轉檔）
- Vercel Python Functions + yt-dlp-threads
