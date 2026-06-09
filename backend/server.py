import json
import os
import subprocess
import threading
import time
import ctypes
from ctypes import wintypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
STATIC_DIR = ROOT / "static"
INDEX_FILE = ROOT / "index.html"
PROCESS_FILE = Path(os.environ.get("PROCESS_FILE", "/tmp/processes.json"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
_process_sample_lock = threading.Lock()
_previous_process_cpu = {}
_previous_sample_time = None


def system_capacity():
    memory_bytes = 0
    available_bytes = 0
    if os.name == "nt":
        class MEMORYSTATUSEX(ctypes.Structure):
            _fields_ = [
                ("dwLength", wintypes.DWORD),
                ("dwMemoryLoad", wintypes.DWORD),
                ("ullTotalPhys", ctypes.c_ulonglong),
                ("ullAvailPhys", ctypes.c_ulonglong),
                ("ullTotalPageFile", ctypes.c_ulonglong),
                ("ullAvailPageFile", ctypes.c_ulonglong),
                ("ullTotalVirtual", ctypes.c_ulonglong),
                ("ullAvailVirtual", ctypes.c_ulonglong),
                ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
            ]

        status = MEMORYSTATUSEX()
        status.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            memory_bytes = int(status.ullTotalPhys)
            available_bytes = int(status.ullAvailPhys)
    else:
        try:
            memory_bytes = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES")
            available_bytes = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_AVPHYS_PAGES")
        except (AttributeError, OSError, ValueError):
            memory_bytes = 0
            available_bytes = 0

    return {
        "cpu_logical": os.cpu_count() or 0,
        "memory_gb": round(memory_bytes / 1024 ** 3, 1) if memory_bytes else 0,
        "memory_used_gb": round((memory_bytes - available_bytes) / 1024 ** 3, 1) if memory_bytes else 0,
    }


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
    global _previous_process_cpu, _previous_sample_time

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
    sample_time = time.perf_counter()
    with _process_sample_lock:
        previous_cpu = _previous_process_cpu
        previous_time = _previous_sample_time
        elapsed = sample_time - previous_time if previous_time is not None else 0
        current_cpu = {}

    for row in rows:
        pid = row.get("Id")
        if not isinstance(pid, int):
            continue
        cpu_total = float(row.get("CPU") or 0)
        current_cpu[pid] = cpu_total
        cpu_delta = max(0, cpu_total - previous_cpu.get(pid, cpu_total))
        # A process using one logical core fully is 100%. This scale matches
        # the 40% and 80% color thresholds used by the dashboard.
        cpu_percent = cpu_delta / elapsed * 100 if elapsed > 0 else 0
        memory_mb = round(float(row.get("WorkingSet64") or 0) / 1024 / 1024, 1)
        processes.append({
            "pid": pid,
            "ppid": parent_by_pid.get(pid, 0),
            "name": row.get("ProcessName") or f"pid-{pid}",
            "user": os.environ.get("USERNAME") or "windows",
            "cpu_percent": round(min(100, cpu_percent), 1),
            "memory_mb": memory_mb,
            # If Get-Process returned it, the process still exists. CPU can be
            # zero during this sample without meaning the process is closed.
            "status": "activo",
            "threads": int(row.get("Threads") or 1),
            "runtime": row.get("Runtime") or "n/d",
        })

    with _process_sample_lock:
        _previous_process_cpu = current_cpu
        _previous_sample_time = sample_time

    return {
        "timestamp": int(time.time()),
        "source": "windows-get-process+toolhelp-parents",
        "alive_pids": list(parent_by_pid),
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

        payload["capacity"] = system_capacity()
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
