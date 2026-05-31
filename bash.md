#!/bin/bash

OUTPUT_FILE="/tmp/processes.json"

while true; do
  TIMESTAMP=$(date +%s)
  
  # Crear archivo temporal
  TMP=$(mktemp)
  
  # Generar JSON
  {
    echo "{"
    echo "  \"timestamp\": $TIMESTAMP,"
    echo "  \"processes\": ["
    
    ps -eo pid,ppid,pcpu,pmem,comm --no-headers 2>/dev/null | head -20 | awk '
    BEGIN { first = 1 }
    {
      pid = $1
      ppid = $2
      cpu = $3
      mem = $4
      cmd = $5
      
      if (first == 0) print ","
      
      printf "    {\n"
      printf "      \"pid\": %d,\n", pid
      printf "      \"ppid\": %d,\n", ppid
      printf "      \"name\": \"%s\",\n", cmd
      printf "      \"cpu_percent\": %s,\n", cpu
      printf "      \"memory_mb\": %s\n", mem
      printf "    }"
      
      first = 0
    }
    END { printf "\n" }
    '
    
    echo "  ]"
    echo "}"
  } > "$TMP"
  
  # Verificar que es JSON válido antes de mover
  if jq . "$TMP" > /dev/null 2>&1; then
    mv "$TMP" "$OUTPUT_FILE"
  else
    rm "$TMP"
  fi
  
  sleep 0.1
done
