import json
from http.server import BaseHTTPRequestHandler
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen


def allowed_host(host):
    return host == "fbcdn.net" or host.endswith(".fbcdn.net") or host == "cdninstagram.com" or host.endswith(".cdninstagram.com") or host == "threads.net" or host.endswith(".threads.net")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            value = parse_qs(urlparse(self.path).query).get("url", [""])[0]
            media = urlparse(value)
            if media.scheme != "https" or not media.hostname or not allowed_host(media.hostname):
                self.send_json(400, {"error": "不支援這個影片網址。"})
                return
            request = Request(value, headers={"User-Agent": "Mozilla/5.0 (compatible; Loop/1.0)"})
            upstream = urlopen(request, timeout=25)
            if not allowed_host(urlparse(upstream.geturl()).hostname or ""):
                upstream.close()
                self.send_json(400, {"error": "影片來源網址不受支援。"})
                return
            content_type = upstream.headers.get("Content-Type", "video/mp4")
            if not content_type.startswith("video/") and "octet-stream" not in content_type:
                upstream.close()
                self.send_json(415, {"error": "貼文沒有傳回影片檔。"})
                return
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Access-Control-Allow-Origin", "*")
            if upstream.headers.get("Content-Length"):
                self.send_header("Content-Length", upstream.headers["Content-Length"])
            self.end_headers()
            while chunk := upstream.read(512 * 1024):
                self.wfile.write(chunk)
            upstream.close()
        except HTTPError as exc:
            self.send_json(502, {"error": "Threads 影片目前無法下載，請稍後再試。"})
        except (URLError, TimeoutError, OSError):
            try:
                self.send_json(502, {"error": "影片串流中斷，請稍後再試。"})
            except OSError:
                pass

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
