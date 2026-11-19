import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import { zipSync } from "fflate";
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
	Plus,
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

function getThreadsPostId(value) {
	try {
		const parsed = new URL(value);
		if (!/(^|\.)threads\.(com|net)$/i.test(parsed.hostname)) return "";
		return parsed.pathname.match(/\/post\/([^/]+)/i)?.[1] || "";
	} catch {
		return "";
	}
}

function safeBaseName(value) {
	return value.replace(/[\\/:*?"<>|]/g, "-").replace(/^\.+|\.+$/g, "") || "loop";
}

function App() {
	const [linkInputs, setLinkInputs] = useState([""]);
	const [videoFile, setVideoFile] = useState(null);
	const [videoSrc, setVideoSrc] = useState("");
	const [gifUrl, setGifUrl] = useState("");
	const [downloadName, setDownloadName] = useState("loop");
	const [batchJobs, setBatchJobs] = useState([]);
	const [batchRunning, setBatchRunning] = useState(false);
	const [batchClipSeconds, setBatchClipSeconds] = useState(5);
	const [batchZipUrl, setBatchZipUrl] = useState("");
	const [activeBatchName, setActiveBatchName] = useState("");
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
	useEffect(
		() => () => {
			if (batchZipUrl) URL.revokeObjectURL(batchZipUrl);
		},
		[batchZipUrl],
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
		setDownloadName(safeBaseName(file.name.replace(/\.[^.]+$/, "")));
		setVideoSrc(URL.createObjectURL(file));
		setLinkInputs([""]);
	}

	async function loadFromLink() {
		setError("");
		const links = [...new Set(linkInputs.map((value) => value.trim()).filter(Boolean))];
		if (!links.length) {
			setError("請貼上至少一個 Threads 貼文網址。");
			return;
		}
		if (links.length > 1) {
			try {
				if (links.length > 8) throw new Error("一次最多可加入 8 個 Threads 連結。");
				const names = new Set();
				const jobs = links.map((link, index) => {
					const postId = getThreadsPostId(link);
					if (!postId) throw new Error(`第 ${index + 1} 個連結不是有效的 Threads 貼文網址。`);
					let name = safeBaseName(postId);
					let suffix = 2;
					while (names.has(name)) name = `${safeBaseName(postId)}-${suffix++}`;
					names.add(name);
					return { id: `${Date.now()}-${index}`, url: link, name, status: "queued", gifBlob: null, error: "" };
				});
				setBatchJobs(jobs);
				setBatchZipUrl("");
				setBatchClipSeconds(5);
				setLinkInputs([""]);
				setStatus("idle");
				return;
			} catch (e) {
				setError(e.message || "無法加入 Threads 連結。");
				return;
			}
		}
		setStatus("loading");
		try {
			const singleUrl = links[0];
			if (!/^https?:\/\//i.test(singleUrl)) throw new Error("請貼上完整的 Threads 貼文網址。");
			let res;
			try {
				res = await fetch(`${RESOLVER}/resolve?url=${encodeURIComponent(singleUrl)}`);
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
			const postId = getThreadsPostId(singleUrl);
			const name = safeBaseName(postId || "threads-video");
			const file = new File([blob], `${name}.mp4`, { type: blob.type || "video/mp4" });
			setVideoFile(file);
			setDownloadName(name);
			setVideoSrc(URL.createObjectURL(file));
			setGifUrl("");
			setStatus("idle");
		} catch (e) {
			setError(e.message || "讀取失敗，請改用上傳影片。");
			setStatus("idle");
		}
	}

	async function getFFmpeg() {
		let ffmpeg = ffmpegRef.current;
		if (!ffmpeg) {
			ffmpeg = new FFmpeg();
			ffmpegLogsRef.current = [];
			ffmpeg.on("log", ({ message }) => {
				ffmpegLogsRef.current = [...ffmpegLogsRef.current.slice(-29), message];
			});
			ffmpeg.on("progress", ({ progress: value }) => setProgress(Math.max(0, Math.min(100, Math.round(value * 100)))));
			// Bundle and serve the open-source FFmpeg core with the app. This avoids
			// importing the core from a CDN/blob URL inside the FFmpeg web worker.
			await ffmpeg.load({
				coreURL: new URL(coreURL, window.location.href).href,
				wasmURL: new URL(wasmURL, window.location.href).href,
			});
			ffmpegRef.current = ffmpeg;
		}
		return ffmpeg;
	}

	async function convertFileToGif(file, clipStart, clipLength, outputPrefix = "loop") {
		const ffmpeg = await getFFmpeg();
		const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
		const input = `input-${suffix}.mp4`;
		const output = `${outputPrefix}-${suffix}.gif`;
		try {
			await ffmpeg.writeFile(input, await fetchFile(file));
			const filter = `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5[out]`;
			const exitCode = await ffmpeg.exec([
				"-ss",
				String(clipStart),
				"-t",
				String(clipLength),
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
			return new Blob([await ffmpeg.readFile(output)], { type: "image/gif" });
		} finally {
			if (ffmpeg.loaded) {
				await ffmpeg.deleteFile(input).catch(() => {});
				await ffmpeg.deleteFile(output).catch(() => {});
			}
		}
	}

	async function convert() {
		if (!videoFile) return;
		setError("");
		setStatus("converting");
		setProgress(0);
		try {
			const gif = await convertFileToGif(videoFile, start, Math.max(0.2, end - start));
			setGifUrl(URL.createObjectURL(gif));
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
			const ffmpeg = ffmpegRef.current;
			if (ffmpeg) {
				ffmpeg.terminate();
				ffmpegRef.current = null;
			}
			setStatus("idle");
		}
	}

	function updateBatchJob(id, updates) {
		setBatchJobs((items) => items.map((job) => (job.id === id ? { ...job, ...updates } : job)));
	}

	function readDuration(file) {
		return new Promise((resolve, reject) => {
			const source = URL.createObjectURL(file);
			const video = document.createElement("video");
			const cleanup = () => {
				video.removeAttribute("src");
				video.load();
				URL.revokeObjectURL(source);
			};
			video.preload = "metadata";
			video.onloadedmetadata = () => {
				const value = video.duration;
				cleanup();
				resolve(value);
			};
			video.onerror = () => {
				cleanup();
				reject(new Error("無法讀取影片長度。"));
			};
			video.src = source;
		});
	}

	async function resolveBatchVideo(job) {
		const response = await fetch(`${RESOLVER}/resolve?url=${encodeURIComponent(job.url)}`);
		const info = await response.json().catch(() => ({}));
		if (!response.ok || !info.videoUrl) throw new Error(info.error || `讀取連結失敗 (${response.status})`);
		const media = await fetch(`${RESOLVER}/media?url=${encodeURIComponent(info.videoUrl)}`);
		if (!media.ok) {
			const detail = await media.json().catch(() => ({}));
			throw new Error(detail.error || `下載影片失敗 (${media.status})`);
		}
		const mediaType = media.headers.get("content-type") || "";
		if (!mediaType.startsWith("video/") && !mediaType.includes("octet-stream")) {
			throw new Error("貼文沒有傳回影片檔。");
		}
		const fileType = mediaType.startsWith("video/") ? mediaType : "video/mp4";
		return new File([await media.blob()], `${job.name}.mp4`, { type: fileType });
	}

	async function processBatch() {
		if (batchRunning || !batchJobs.length) return;
		setBatchRunning(true);
		setBatchZipUrl("");
		setError("");
		const completed = new Map(batchJobs.filter((job) => job.gifBlob).map((job) => [job.name, job.gifBlob]));
		try {
			for (const job of batchJobs.filter((item) => item.status !== "done")) {
				setActiveBatchName(job.name);
				setProgress(0);
				updateBatchJob(job.id, { status: "resolving", error: "" });
				try {
					const file = await resolveBatchVideo(job);
					const durationValue = await readDuration(file);
					if (!Number.isFinite(durationValue) || durationValue < 0.2) throw new Error("影片長度無法辨識。");
					updateBatchJob(job.id, { status: "converting" });
					const gif = await convertFileToGif(file, 0, Math.min(batchClipSeconds, durationValue), `batch-${job.id}`);
					completed.set(job.name, gif);
					updateBatchJob(job.id, { status: "done", gifBlob: gif });
				} catch (e) {
					updateBatchJob(job.id, { status: "error", error: e.message || "處理失敗。" });
				}
			}
			if (!completed.size) throw new Error("沒有成功轉換的 GIF。請確認連結可公開瀏覽後重試。");
			const files = {};
			for (const [name, gif] of completed) files[`${name}.gif`] = new Uint8Array(await gif.arrayBuffer());
			const archive = zipSync(files, { level: 0 });
			setBatchZipUrl(URL.createObjectURL(new Blob([archive], { type: "application/zip" })));
		} catch (e) {
			setError(e.message || "批次轉換失敗。");
		} finally {
			setActiveBatchName("");
			setBatchRunning(false);
		}
	}

	function reset() {
		setVideoFile(null);
		setVideoSrc("");
		setGifUrl("");
		setDownloadName("loop");
		setLinkInputs([""]);
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
						{!active && batchJobs.length > 0 ? (
							<>
								<div className="step-line">
									<span className="step-number">02</span>
									<span>批次轉換</span>
									<span className="step-note">{batchJobs.length} 個 Threads 影片</span>
								</div>
								<div className="batch-settings">
									<label>
										每支影片從開頭取
										<select
											value={batchClipSeconds}
											disabled={batchRunning}
											onChange={(e) => setBatchClipSeconds(+e.target.value)}
										>
											<option value="2">2 秒</option>
											<option value="3">3 秒</option>
											<option value="5">5 秒</option>
											<option value="6">6 秒</option>
										</select>
									</label>
									<label>
										寬度
										<select value={width} disabled={batchRunning} onChange={(e) => setWidth(+e.target.value)}>
											<option value="320">320 px</option>
											<option value="480">480 px</option>
											<option value="640">640 px</option>
										</select>
									</label>
									<label>
										影格速率
										<select value={fps} disabled={batchRunning} onChange={(e) => setFps(+e.target.value)}>
											<option value="8">8 fps</option>
											<option value="12">12 fps</option>
											<option value="15">15 fps</option>
											<option value="20">20 fps</option>
										</select>
									</label>
								</div>
								<div className="batch-list" aria-live="polite">
									{batchJobs.map((job, index) => (
										<div className="batch-item" key={job.id}>
											<span className="batch-index">{String(index + 1).padStart(2, "0")}</span>
											<div className="batch-item-copy">
												<strong>{job.name}</strong>
												<small>
													{job.status === "queued" && "等待轉換"}
													{job.status === "resolving" && "正在讀取影片…"}
													{job.status === "converting" && `正在製作 GIF… ${progress}%`}
													{job.status === "done" && "完成"}
													{job.status === "error" && "轉換失敗"}
												</small>
												{job.error && <small className="batch-error">{job.error}</small>}
											</div>
											{job.status === "done" && <Check className="batch-check" size={16} />}
										</div>
									))}
								</div>
								{batchRunning && (
									<div className="batch-progress" aria-live="polite">
										<LoaderCircle className="spin" size={15} />
										<span>正在處理 {activeBatchName}，完成後會打包所有 GIF。</span>
									</div>
								)}
								{batchZipUrl && (
									<p className="batch-summary">
										已完成 {batchJobs.filter((job) => job.status === "done").length} / {batchJobs.length} 支 GIF。
									</p>
								)}
								<div className="batch-actions">
									<Button
										className="convert-button"
										onClick={processBatch}
										disabled={batchRunning || batchJobs.every((job) => job.status === "done")}
									>
										<Sparkles size={16} />{" "}
										{batchJobs.some((job) => job.status === "error") ? "重試失敗項目" : "開始批次轉換"}
									</Button>
									{batchZipUrl && (
										<a className="download-button" href={batchZipUrl} download="threads-gifs.zip">
											<ArrowDownToLine size={16} /> 下載全部 GIF（ZIP）
										</a>
									)}
									<button
										className="batch-reset"
										disabled={batchRunning}
										onClick={() => {
											setBatchJobs([]);
											setBatchZipUrl("");
											setLinkInputs([""]);
											setError("");
										}}
									>
										更換連結
									</button>
								</div>
								<div className="privacy-note batch-privacy">
									<LockKeyhole size={14} /> 影片逐支在瀏覽器處理，成功的 GIF 會一起打包下載
								</div>
							</>
						) : !active ? (
							<>
								<div className="step-line">
									<span className="step-number">01</span>
									<span>加入你的影片</span>
									<button
										className="arrow-button"
										aria-label="讀取連結"
										onClick={loadFromLink}
										disabled={status === "loading"}
									>
										{status === "loading" ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
									</button>
								</div>
								<div className="links-entry-list">
									{linkInputs.map((link, index) => (
										<div className="link-entry" key={index}>
											<div className="input-wrap">
												<Link2 size={18} />
												<input
													aria-label={`Threads 影片連結 ${index + 1}`}
													placeholder="貼上 Threads 影片連結…"
													value={link}
													onChange={(e) =>
														setLinkInputs((current) =>
															current.map((value, i) => (i === index ? e.target.value : value)),
														)
													}
													onKeyDown={(e) => e.key === "Enter" && (e.metaKey || e.ctrlKey) && loadFromLink()}
												/>
												<button
													className="paste-btn"
													onClick={async () => {
														try {
															const text = await navigator.clipboard.readText();
															setLinkInputs((current) => current.map((value, i) => (i === index ? text : value)));
														} catch {}
													}}
												>
													貼上
												</button>
											</div>
											{linkInputs.length > 1 && (
												<button
													className="remove-link-button"
													aria-label={`移除第 ${index + 1} 個連結欄位`}
													onClick={() => setLinkInputs((current) => current.filter((_, i) => i !== index))}
												>
													<X size={16} />
												</button>
											)}
										</div>
									))}
									{linkInputs.length < 8 && (
										<button className="add-link-button" onClick={() => setLinkInputs((current) => [...current, ""])}>
											<Plus size={12} /> 新增另一個連結
										</button>
									)}
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
											<span>你的 GIF 已準備好，可以下載。</span>
											<div className="result-actions">
												<a className="download-button" href={gifUrl} download={`${downloadName}.gif`}>
													<ArrowDownToLine size={17} /> 下載 GIF
												</a>
											</div>
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
