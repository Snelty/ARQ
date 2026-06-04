import json
import os
import subprocess
import time
import ctypes
from ctypes import wintypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
STATIC_DIR = ROOT / "static"
INDEX_FILE = ROOT / "index.html"
PROCESS_FILE = Path("/tmp/processes.json")
HOST = "127.0.0.1"
PORT = 8000


def windows_parent_process_map():
    if os.name != "nt":
        return {}

    class PROCESSENTRY32(ctypes.Structure):
        _fields_ = [
            ("dwSize", wintypes.DWORD),
            ("cntUsage", wintypes.DWORD),
            ("th32ProcessID", wintypes.DWORD),
            ("th32DefaultHeapID", ctypes.POINTER(wintypes.ULONG)),
            ("th32ModuleID", wintypes.DWORD),
            ("cntThreads", wintypes.DWORD),
            ("th32ParentProcessID", wintypes.DWORD),
            ("pcPriClassBase", ctypes.c_long),
            ("dwFlags", wintypes.DWORD),
            ("szExeFile", wintypes.CHAR * 260),
        ]

    kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
    create_snapshot = kernel32.CreateToolhelp32Snapshot
    create_snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    create_snapshot.restype = wintypes.HANDLE
    process_first = kernel32.Process32First
    process_first.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]
    process_first.restype = wintypes.BOOL
    process_next = kernel32.Process32Next
    process_next.argtypes = [wintypes.HANDLE, ctypes.POINTER(PROCESSENTRY32)]
    process_next.restype = wintypes.BOOL
    close_handle = kernel32.CloseHandle
    close_handle.argtypes = [wintypes.HANDLE]

    snapshot = create_snapshot(0x00000002, 0)
    if snapshot == wintypes.HANDLE(-1).value:
        return {}

    parents = {}
    entry = PROCESSENTRY32()
    entry.dwSize = ctypes.sizeof(PROCESSENTRY32)
    try:
        if not process_first(snapshot, ctypes.byref(entry)):
            return {}
        while True:
            parents[int(entry.th32ProcessID)] = int(entry.th32ParentProcessID)
            if not process_next(snapshot, ctypes.byref(entry)):
                break
    finally:
        close_handle(snapshot)

    return parents


def windows_process_snapshot():
    parent_by_pid = windows_parent_process_map()
    command = r"""
$ErrorActionPreference = 'SilentlyContinue'
Get-Process |
  Sort-Object CPU -Descending |
  Select-Object -First 60 `
    Id,
    ProcessName,
    CPU,
    WorkingSet64,
    @{Name='Threads';Expression={$_.Threads.Count}},
    @{Name='Runtime';Expression={if ($_.StartTime) { ((Get-Date) - $_.StartTime).ToString('d\.hh\:mm\:ss') } else { 'n/d' }}} |
  ConvertTo-Json -Compress
"""
    try:
        completed = subprocess.run(
            ["powershell", "-NoProfile", "-Command", command],
            capture_output=True,
            text=True,
            timeout=5,
        )
    except (OSError, subprocess.SubprocessError):
        return None

    if completed.returncode != 0 or not completed.stdout.strip():
        return None

    try:
        raw = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return None

    rows = raw if isinstance(raw, list) else [raw]
    processes = []
    for row in rows:
        pid = row.get("Id")
        if not isinstance(pid, int):
            continue
        cpu_total = float(row.get("CPU") or 0)
        memory_mb = round(float(row.get("WorkingSet64") or 0) / 1024 / 1024, 1)
        processes.append({
            "pid": pid,
            "ppid": parent_by_pid.get(pid, 0),
            "name": row.get("ProcessName") or f"pid-{pid}",
            "user": os.environ.get("USERNAME") or "windows",
            "cpu_percent": round(min(100, cpu_total), 1),
            "memory_mb": memory_mb,
            "status": "activo" if cpu_total > 0 else "reposo",
            "threads": int(row.get("Threads") or 1),
            "runtime": row.get("Runtime") or "n/d",
        })

    return {
        "timestamp": int(time.time()),
        "source": "windows-get-process+toolhelp-parents",
        "processes": processes,
    }


class ProcessDashboardHandler(SimpleHTTPRequestHandler):
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
        elif os.name == "nt":
            payload = windows_process_snapshot() or payload

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


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), ProcessDashboardHandler)
    print(f"Servidor corriendo en http://{HOST}:{PORT}")
    print("Endpoint de procesos: /api/processes")
    server.serve_forever()
