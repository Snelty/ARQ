"""Process Tree Monitoring Dashboard.

Ejecuta este archivo y abre http://127.0.0.1:8000 en el navegador.
El endpoint /api/processes lee el JSON generado por bash.md en /tmp/processes.json.
"""

import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
INDEX_FILE = ROOT / "index.html"
PROCESS_FILE = Path("/tmp/processes.json")
HOST = "127.0.0.1"
PORT = 8000


class DashboardHandler(SimpleHTTPRequestHandler):
    """Sirve la interfaz y el JSON generado por el recolector Bash."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        if self.path == "/api/processes":
            self.send_processes()
            return
        if self.path in ("/", "/index.html"):
            self.send_index()
            return
        super().do_GET()

    def send_index(self):
        data = INDEX_FILE.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_processes(self):
        payload = {
            "timestamp": None,
            "source": "fallback-empty",
            "processes": [],
        }

        if PROCESS_FILE.exists():
            try:
                payload = json.loads(PROCESS_FILE.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                payload["source"] = "invalid-process-file"

        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, format, *args):
        print(f"[process-dashboard] {self.address_string()} - {format % args}")


def main():
    if not INDEX_FILE.exists():
        raise FileNotFoundError(f"No se encontro {INDEX_FILE.name}")

    server = ThreadingHTTPServer((HOST, PORT), DashboardHandler)
    url = f"http://{HOST}:{PORT}"
    print("Process Tree Monitoring Dashboard")
    print(f"Servidor Python iniciado en {url}")
    print("Endpoint de procesos: /api/processes")
    print("Pulsa Ctrl+C para detenerlo.")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nDeteniendo servidor...")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
