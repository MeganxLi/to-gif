import json
import re
from http.server import BaseHTTPRequestHandler
from urllib.parse import parse_qs, urlparse, urlunparse

import yt_dlp


def normalized_threads_url(value):
    parsed = urlparse(value)
    if parsed.scheme not in ("https", "http") or parsed.hostname not in {
        "threads.com", "www.threads.com", "threads.net", "www.threads.net"
    }:
        raise ValueError("只接受 Threads 貼文網址。")
    path = re.sub(r"/media/?$", "", parsed.path)
    return urlunparse(("https", parsed.netloc, path, "", "", ""))


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        query = parse_qs(urlparse(self.path).query)
        try:
            post_url = normalized_threads_url(query.get("url", [""])[0])
            options = {"quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": True}
            with yt_dlp.YoutubeDL(options) as ydl:
                info = ydl.extract_info(post_url, download=False)
            if info and info.get("entries"):
                info = next((entry for entry in info["entries"] if entry), None)
            video_url = info.get("url") if info else None
            if not video_url and info:
                formats = [f for f in info.get("formats", []) if f.get("url") and f.get("vcodec") != "none"]
                if formats:
                    video_url = formats[-1]["url"]
            if not video_url:
                raise ValueError("找不到公開影片。請確認貼文仍可公開瀏覽，或改為上傳影片檔。")
            self.send_json(200, {"videoUrl": video_url})
        except ValueError as exc:
            self.send_json(400, {"error": str(exc)})
        except Exception:
            self.send_json(502, {"error": "Threads 目前無法提供這則影片。確認貼文為公開影片，稍後再試，或直接上傳影片檔。"})

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        return
