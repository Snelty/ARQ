#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_FILE="${OUTPUT_FILE:-/tmp/processes.json}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-1}"
LIMIT="${LIMIT:-40}"
HOST="${HOST:-127.0.0.1}"
# Usa un puerto distinto al launcher Windows para no reutilizar por error
# un app.py que ya esté escuchando en localhost:8000.
PORT="${PORT:-8765}"
URL="http://${HOST}:${PORT}"

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    command -v python3
  elif command -v python >/dev/null 2>&1; then
    command -v python
  else
    echo "No se encontro python3/python en PATH." >&2
    exit 1
  fi
}

write_process_snapshot() {
  local timestamp tmp
  timestamp="$(date +%s)"
  tmp="$(mktemp)"

  {
    echo "{"
    echo "  \"timestamp\": $timestamp,"
    echo "  \"source\": \"bash-ps\","
    printf "  \"alive_pids\": ["
    ps -eo pid= 2>/dev/null | awk '
      BEGIN { first = 1 }
      {
        if (first == 0) printf ","
        printf "%d", $1
        first = 0
      }
      END { print "]," }
    '
    echo "  \"processes\": ["

    ps -eo pid=,ppid=,pcpu=,rss=,stat=,nlwp=,etime=,user=,comm= --sort=-pcpu 2>/dev/null | head -n "$LIMIT" | awk '
    BEGIN { first = 1 }
    function esc(s) {
      gsub(/\\/,"\\\\",s)
      gsub(/"/,"\\\"",s)
      return s
    }
    {
      pid = $1
      ppid = $2
      cpu = $3 + 0
      mem_mb = ($4 + 0) / 1024
      stat = $5
      threads = $6 + 0
      runtime = $7
      user = $8
      name = $9

      status = (stat ~ /^R/) ? "activo" : "reposo"

      if (first == 0) print ","

      printf "    {\n"
      printf "      \"pid\": %d,\n", pid
      printf "      \"ppid\": %d,\n", ppid
      printf "      \"name\": \"%s\",\n", esc(name)
      printf "      \"user\": \"%s\",\n", esc(user)
      printf "      \"cpu_percent\": %.1f,\n", cpu
      printf "      \"memory_mb\": %.1f,\n", mem_mb
      printf "      \"status\": \"%s\",\n", status
      printf "      \"threads\": %d,\n", threads
      printf "      \"runtime\": \"%s\"\n", esc(runtime)
      printf "    }"

      first = 0
    }
    END { printf "\n" }
    '

    echo "  ]"
    echo "}"
  } > "$tmp"

  if command -v jq >/dev/null 2>&1; then
    if jq . "$tmp" >/dev/null 2>&1; then
      mv "$tmp" "$OUTPUT_FILE"
    else
      rm -f "$tmp"
    fi
  else
    mv "$tmp" "$OUTPUT_FILE"
  fi
}

collect_processes() {
  while true; do
    write_process_snapshot
    sleep "$INTERVAL_SECONDS"
  done
}

server_has_linux_data() {
  local python_bin="$1"
  "$python_bin" - "$URL/api/processes" <<'PY' >/dev/null 2>&1
import json
import sys
import urllib.request

try:
    with urllib.request.urlopen(sys.argv[1], timeout=1) as response:
        payload = json.load(response)
        raise SystemExit(0 if response.status == 200 and payload.get("source") == "bash-ps" else 1)
except Exception:
    raise SystemExit(1)
PY
}

port_is_available() {
  local python_bin="$1"
  "$python_bin" - "$HOST" "$PORT" <<'PY' >/dev/null 2>&1
import socket
import sys

sock = socket.socket()
try:
    sock.bind((sys.argv[1], int(sys.argv[2])))
except OSError:
    raise SystemExit(1)
finally:
    sock.close()
PY
}

open_browser() {
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "$URL" >/dev/null 2>&1 &
  elif command -v sensible-browser >/dev/null 2>&1; then
    sensible-browser "$URL" >/dev/null 2>&1 &
  elif command -v gio >/dev/null 2>&1; then
    gio open "$URL" >/dev/null 2>&1 &
  else
    echo "Abre esta URL en tu navegador: $URL"
  fi
}

start_dashboard() {
  local python_bin collector_pid server_pid
  python_bin="$(find_python)"

  write_process_snapshot

  while ! port_is_available "$python_bin" && ! server_has_linux_data "$python_bin"; do
    PORT="$((PORT + 1))"
    URL="http://${HOST}:${PORT}"
  done

  OUTPUT_FILE="$OUTPUT_FILE" INTERVAL_SECONDS="$INTERVAL_SECONDS" LIMIT="$LIMIT" \
    "$BASH" "$0" collect &
  collector_pid="$!"

  if ! server_has_linux_data "$python_bin"; then
    PROCESS_FILE="$OUTPUT_FILE" HOST="$HOST" PORT="$PORT" \
      "$python_bin" "$ROOT_DIR/backend/server.py" &
    server_pid="$!"
  else
    server_pid=""
  fi

  echo "Dashboard: $URL"
  echo "Recolector PID: $collector_pid"
  if [ -n "$server_pid" ]; then
    echo "Servidor PID: $server_pid"
  else
    echo "Servidor ya estaba activo en $URL"
  fi

  open_browser

  cleanup() {
    kill "$collector_pid" >/dev/null 2>&1 || true
    if [ -n "${server_pid:-}" ]; then
      kill "$server_pid" >/dev/null 2>&1 || true
    fi
  }

  trap cleanup INT TERM EXIT
  wait "$collector_pid"
}

case "${1:-open}" in
  collect)
    collect_processes
    ;;
  open|start|dashboard)
    start_dashboard
    ;;
  *)
    echo "Uso:"
    echo "  bash bash.md          # abre dashboard con tus procesos"
    echo "  bash bash.md collect  # solo genera /tmp/processes.json"
    exit 1
    ;;
esac
