import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import {
	ArrowDownToLine,
	ArrowLeft,
	ArrowRight,
	Check,
	Clapperboard,
	Github,
	Link2,
	LoaderCircle,
	LockKeyhole,
	Pause,
	Play,
	Scissors,
	Sparkles,
	Upload,
	X,
} from "lucide-react";
import { Button } from "./components/ui/button";
import "./style.css";

const RESOLVER = (import.meta.env.VITE_RESOLVER_URL || "/api").replace(/\/$/, "");
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function App() {
	const [url, setUrl] = useState("");
	const [videoFile, setVideoFile] = useState(null);
	const [videoSrc, setVideoSrc] = useState("");
	const [gifUrl, setGifUrl] = useState("");
	const [duration, setDuration] = useState(0);
	const [start, setStart] = useState(0);
	const [end, setEnd] = useState(5);
	const [width, setWidth] = useState(480);
	const [fps, setFps] = useState(12);
	const [status, setStatus] = useState("idle");
	const [progress, setProgress] = useState(0);
	const [error, setError] = useState("");
	const [playing, setPlaying] = useState(false);
	const [isDragging, setIsDragging] = useState(false);
	const inputRef = useRef(null);
	const videoRef = useRef(null);
	const ffmpegRef = useRef(null);
	const ffmpegLogsRef = useRef([]);

	useEffect(
		() => () => {
			if (videoSrc.startsWith("blob:")) URL.revokeObjectURL(videoSrc);
		},
		[videoSrc],
	);
	useEffect(
		() => () => {
			if (gifUrl) URL.revokeObjectURL(gifUrl);
		},
		[gifUrl],
	);

	async function acceptFile(file) {
		if (!file || !file.type.startsWith("video/")) {
			setError("請選擇影片檔案。");
			return;
		}
		setError("");
		setStatus("idle");
		setVideoFile(file);
		setGifUrl("");
		setVideoSrc(URL.createObjectURL(file));
		setUrl("");
	}

	async function loadFromLink() {
		setError("");
		setStatus("loading");
		try {
			if (!/^https?:\/\//i.test(url.trim())) throw new Error("請貼上完整的 Threads 貼文網址。");
			let res;
			try {
				res = await fetch(`${RESOLVER}/resolve?url=${encodeURIComponent(url.trim())}`);
			} catch {
				const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
				throw new Error(
					local
						? "本機網頁已開啟，但 Threads 解析 API 尚未啟動。先用 npm run dev:vercel 啟動本機 API，或改用影片檔上傳。"
						: "連線不到 Threads 解析 API。請確認網站部署包含 api/ 函式，或稍後再試。",
				);
			}
			const contentType = res.headers.get("content-type") || "";
			const body = await res.text().catch(() => "");
			let data = {};
			if (contentType.includes("application/json")) {
				try {
					data = JSON.parse(body);
				} catch {
					data = {};
				}
			}
			if (!res.ok) {
				const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
				const detail = data.error || (local ? body.trim().slice(0, 600) : "");
				throw new Error(detail || `Threads API 回應錯誤 (${res.status})，請稍後再試。`);
			}
			if (!data.videoUrl) {
				const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
				throw new Error(
					local
						? "本機網頁可正常開啟，但 Threads API 尚未啟動。請執行 npm run dev:vercel（不會發佈），或改用影片檔上傳。"
						: "解析服務沒有傳回影片網址。請確認部署包含 api/ 函式，或稍後再試。",
				);
			}
			const media = `${RESOLVER}/media?url=${encodeURIComponent(data.videoUrl)}`;
			let fileResponse;
			try {
				fileResponse = await fetch(media);
			} catch {
				throw new Error("連線不到影片代理 API。請確認本機 API 或 Vercel 部署正在執行。");
			}
			if (!fileResponse.ok) {
				const body = await fileResponse.json().catch(() => ({}));
				throw new Error(body.error || "無法下載影片，請確認貼文可公開瀏覽。");
			}
			const mediaType = fileResponse.headers.get("content-type") || "";
			if (!mediaType.startsWith("video/") && !mediaType.includes("octet-stream")) {
				throw new Error("影片代理沒有傳回影片檔。若在本機測試 Threads，請執行 npm run dev:vercel。");
			}
			const blob = await fileResponse.blob();
			const file = new File([blob], "threads-video.mp4", { type: blob.type || "video/mp4" });
			setVideoFile(file);
			setVideoSrc(URL.createObjectURL(file));
			setGifUrl("");
			setStatus("idle");
		} catch (e) {
			setError(e.message || "讀取失敗，請改用上傳影片。");
			setStatus("idle");
		}
	}

	async function convert() {
		if (!videoFile) return;
		setError("");
		setStatus("converting");
		setProgress(0);
		let ffmpeg;
		let input;
		let output;
		try {
			ffmpeg = ffmpegRef.current;
			if (!ffmpeg) {
				ffmpeg = new FFmpeg();
				ffmpegLogsRef.current = [];
				ffmpeg.on("log", ({ message }) => {
					ffmpegLogsRef.current = [...ffmpegLogsRef.current.slice(-29), message];
				});
				ffmpeg.on("progress", ({ progress: p }) => setProgress(Math.max(0, Math.min(100, Math.round(p * 100)))));
				// Bundle and serve the open-source FFmpeg core with the app. This avoids
				// importing the core from a CDN/blob URL inside the FFmpeg web worker.
				await ffmpeg.load({
					coreURL: new URL(coreURL, window.location.href).href,
					wasmURL: new URL(wasmURL, window.location.href).href,
				});
				ffmpegRef.current = ffmpeg;
			}
			input = `input-${Date.now()}.mp4`;
			output = `loop-${Date.now()}.gif`;
			await ffmpeg.writeFile(input, await fetchFile(videoFile));
			const length = Math.max(0.2, end - start);
			// split/palettegen produces a multi-output graph, so it must use
			// -filter_complex and an explicit output map (not -vf).
			const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5[out]`;
			const exitCode = await ffmpeg.exec([
				"-ss",
				String(start),
				"-t",
				String(length),
				"-i",
				input,
				"-filter_complex",
				filter,
				"-map",
				"[out]",
				"-loop",
				"0",
				output,
			]);
			if (exitCode !== 0) {
				const details = ffmpegLogsRef.current.slice(-5).join(" ").trim();
				throw new Error(details || `FFmpeg 結束代碼 ${exitCode}`);
			}
			const data = await ffmpeg.readFile(output);
			setGifUrl(URL.createObjectURL(new Blob([data], { type: "image/gif" })));
			setStatus("done");
			setProgress(100);
		} catch (e) {
			console.error("GIF conversion failed:", e);
			const logDetails = ffmpegLogsRef.current.slice(-5).join(" ").trim();
			const reason = [e?.message || String(e), logDetails].filter(Boolean).join(" — ");
			if (/memory|allocate|out of range/i.test(reason)) {
				setError("瀏覽器記憶體不足。請縮短片段或把寬度調低後再試。");
			} else if (/fetch|network|failed to load|loading.*core/i.test(reason)) {
				setError("轉檔元件載入失敗，請確認網路連線後重新整理頁面再試。");
			} else {
				setError(`轉換失敗：${reason}`);
			}
			// A failed FFmpeg worker may be left in a bad state; recreate it on retry.
			if (ffmpeg) {
				ffmpeg.terminate();
				ffmpegRef.current = null;
			}
			setStatus("idle");
		} finally {
			if (ffmpeg?.loaded) {
				if (input) await ffmpeg.deleteFile(input).catch(() => {});
				if (output) await ffmpeg.deleteFile(output).catch(() => {});
			}
		}
	}

	function reset() {
		setVideoFile(null);
		setVideoSrc("");
		setGifUrl("");
		setUrl("");
		setError("");
		setStatus("idle");
		setProgress(0);
		if (inputRef.current) inputRef.current.value = "";
	}

	const onDrop = (e) => {
		e.preventDefault();
		setIsDragging(false);
		acceptFile(e.dataTransfer.files?.[0]);
	};
	const active = Boolean(videoFile);

	return (
		<main className="min-h-screen px-5 pb-12 pt-6 md:px-10 md:pt-8">
			<header className="mx-auto flex max-w-6xl items-center justify-between">
				<a className="brand" href="#">
					<span className="brand-mark">
						<span />
					</span>
					<span>
						loop<span className="brand-dot">.</span>
					</span>
				</a>
				<a href="https://github.com" target="_blank" rel="noreferrer" className="top-link">
					<Github size={14} /> Megan <ArrowRight size={14} />
				</a>
			</header>

			<section className="mx-auto max-w-6xl pt-12 md:pt-[70px]">
				<div className="eyebrow">
					<span className="eyebrow-star">✳</span> THE INTERNET, IN A LOOP
				</div>
				<div className="hero-row">
					<h1>
						把一段喜歡，
						<br />
						<span>變成循環</span>
					</h1>
					<p className="hero-copy">
						貼上 Threads 影片連結，幾秒鐘就能
						<br className="hidden md:block" />
						做成 GIF。簡單、私密，完全免費
					</p>
				</div>

				<div className="workspace">
					<div className="workspace-main">
						{!active ? (
							<>
								<div className="step-line">
									<span className="step-number">01</span>
									<span>加入你的影片</span>
									<span className="step-note">公開 Threads 貼文或影片檔</span>
								</div>
								<div className="link-entry">
									<div className="input-wrap">
										<Link2 size={18} />
										<input
											aria-label="Threads 影片連結"
											placeholder="貼上 Threads 連結…"
											value={url}
											onChange={(e) => setUrl(e.target.value)}
											onKeyDown={(e) => e.key === "Enter" && loadFromLink()}
										/>
										<button
											className="paste-btn"
											onClick={async () => {
												try {
													setUrl(await navigator.clipboard.readText());
												} catch {}
											}}
										>
											貼上
										</button>
									</div>
									<button
										className="arrow-button"
										aria-label="讀取連結"
										onClick={loadFromLink}
										disabled={status === "loading"}
									>
										{status === "loading" ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
									</button>
								</div>
								<div className="or-divider">
									<span>或</span>
								</div>
								<div
									className={`dropzone ${isDragging ? "dropzone-active" : ""}`}
									onClick={() => inputRef.current?.click()}
									onDragOver={(e) => {
										e.preventDefault();
										setIsDragging(true);
									}}
									onDragLeave={() => setIsDragging(false)}
									onDrop={onDrop}
								>
									<input
										ref={inputRef}
										type="file"
										accept="video/*"
										hidden
										onChange={(e) => acceptFile(e.target.files?.[0])}
									/>
									<div className="upload-icon">
										<Upload size={20} />
									</div>
									<div>
										<strong>
											拖曳影片到這裡，或 <span>瀏覽檔案</span>
										</strong>
										<small>MP4、MOV、WebM · 建議 100 MB 以內</small>
									</div>
								</div>
								<div className="privacy-note">
									<LockKeyhole size={14} /> 檔案只在你的瀏覽器處理，不會儲存或上傳
								</div>
							</>
						) : (
							<>
								<div className="step-line">
									<button onClick={reset} className="back-button">
										<ArrowLeft size={16} />
									</button>
									<span className="step-number">02</span>
									<span>調整 GIF 範圍</span>
									<span className="step-note">{videoFile.name}</span>
								</div>
								<div className="video-preview">
									<video
										ref={videoRef}
										src={videoSrc}
										onLoadedMetadata={(e) => {
											const d = e.currentTarget.duration || 0;
											setDuration(d);
											setEnd(Math.min(5, d));
										}}
										onTimeUpdate={(e) => {
											if (e.currentTarget.currentTime >= end) {
												e.currentTarget.currentTime = start;
												e.currentTarget.pause();
												setPlaying(false);
											}
										}}
										onPlay={() => setPlaying(true)}
										onPause={() => setPlaying(false)}
										playsInline
									/>
									<button
										className="play-toggle"
										onClick={() => {
											const v = videoRef.current;
											if (v.paused) {
												if (v.currentTime < start || v.currentTime >= end) v.currentTime = start;
												v.play();
											} else v.pause();
										}}
									>
										{playing ? <Pause size={19} /> : <Play size={19} fill="currentColor" />}
									</button>
									<span className="video-duration">{fmtTime(duration)}</span>
								</div>
								<div className="range-editor">
									<div className="range-label">
										<span>
											<Scissors size={14} /> 剪輯長度
										</span>
										<span className="time-value">
											{fmtTime(start)} <i>→</i> {fmtTime(end)} <b>·</b> {Math.max(0, end - start).toFixed(1)} 秒
										</span>
									</div>
									<div className="range-controls">
										<label>
											開始
											<input
												type="number"
												min="0"
												max={duration}
												step="0.1"
												value={start}
												onChange={(e) => setStart(Math.min(+e.target.value, Math.max(0, end - 0.2)))}
											/>
											<span>秒</span>
										</label>
										<div className="range-track">
											<input
												aria-label="GIF 開始時間"
												type="range"
												min="0"
												max={Math.max(0, duration - 0.2)}
												step="0.1"
												value={start}
												onChange={(e) => setStart(Math.min(+e.target.value, end - 0.2))}
											/>
											<input
												aria-label="GIF 結束時間"
												type="range"
												min="0.2"
												max={Math.max(0.2, duration)}
												step="0.1"
												value={Math.max(0.2, end)}
												onChange={(e) => setEnd(Math.max(+e.target.value, start + 0.2))}
											/>
										</div>
										<label>
											結束
											<input
												type="number"
												min="0.2"
												max={duration}
												step="0.1"
												value={end}
												onChange={(e) => setEnd(Math.max(start + 0.2, Math.min(+e.target.value, duration)))}
											/>
											<span>秒</span>
										</label>
									</div>
									<div className="trim-hint">建議控制在 6 秒內，檔案更輕巧、分享更順暢。</div>
								</div>
								<div className="step-line settings-heading">
									<span className="step-number">03</span>
									<span>畫質設定</span>
								</div>
								<div className="settings-row">
									<label>
										寬度{" "}
										<select value={width} onChange={(e) => setWidth(+e.target.value)}>
											<option value="320">320 px</option>
											<option value="480">480 px</option>
											<option value="640">640 px</option>
										</select>
									</label>
									<label>
										影格速率{" "}
										<select value={fps} onChange={(e) => setFps(+e.target.value)}>
											<option value="8">8 fps</option>
											<option value="12">12 fps</option>
											<option value="15">15 fps</option>
											<option value="20">20 fps</option>
										</select>
									</label>
									<span className="estimated">約 {Math.round((end - start) * fps)} 張影格</span>
								</div>
								{status === "converting" ? (
									<div className="progress-box">
										<div className="progress-meta">
											<span>
												<LoaderCircle className="spin" size={15} /> 正在製作你的 GIF
											</span>
											<b>{progress}%</b>
										</div>
										<div className="progress-track">
											<span style={{ width: `${progress}%` }} />
										</div>
										<small>首次使用需要下載轉檔元件，請稍候一下。</small>
									</div>
								) : status === "done" && gifUrl ? (
									<div className="result-box">
										<div className="result-preview">
											<img src={gifUrl} alt="完成的 GIF 預覽" />
										</div>
										<div className="result-details">
											<span className="success-tag">
												<Check size={13} /> 完成了
											</span>
											<strong>你的 GIF 已經準備好了。</strong>
											<span>點擊下載，分享這個瞬間。</span>
											<a className="download-button" href={gifUrl} download="loop.gif">
												<ArrowDownToLine size={17} /> 下載 GIF
											</a>
										</div>
									</div>
								) : (
									<div className="convert-actions">
										<Button className="convert-button" onClick={convert}>
											<Sparkles size={17} /> 開始轉換 <ArrowRight size={16} />
										</Button>
										<span>轉換只會在你的裝置進行</span>
									</div>
								)}
							</>
						)}
						{error && (
							<div className="error-box">
								<X size={16} />
								<span>{error}</span>
							</div>
						)}
					</div>
					<aside className="workspace-aside">
						<div className="aside-top">
							<div className="aside-label">
								<Clapperboard size={15} /> HOW IT WORKS
							</div>
							<h3>三步，一個 loop</h3>
							<div className="how-step">
								<span>01</span>
								<div>
									<b>貼上連結</b>
									<p>從 Threads 公開貼文開始，或直接上傳影片</p>
								</div>
							</div>
							<div className="how-step">
								<span>02</span>
								<div>
									<b>選取片段</b>
									<p>挑出最值得重播的幾秒鐘</p>
								</div>
							</div>
							<div className="how-step">
								<span>03</span>
								<div>
									<b>下載 GIF</b>
									<p>調整畫質，一鍵存到你的裝置</p>
								</div>
							</div>
						</div>
						<div className="aside-bottom">
							<div className="sparkle-art">
								<span>✳</span>
							</div>
							<p>
								好看的瞬間，
								<br />
								值得再看一次
							</p>
							<small>NO WATERMARK · NO SIGN-UP</small>
						</div>
					</aside>
				</div>
				<footer>
					<span>
						MADE FOR THE MOMENTS THAT MATTER <span className="footer-heart">✳</span>
					</span>
				</footer>
			</section>
		</main>
	);
}

createRoot(document.getElementById("root")).render(<App />);
