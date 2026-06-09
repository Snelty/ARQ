# Process Tree Monitoring Dashboard

Dashboard HTML/CSS/JavaScript servido por Python y conectado a un recolector Bash.

## Ejecutar

En Linux/WSL, ejecuta:

```bash
bash bash.md
```

Ese comando inicia el recolector, levanta `backend/server.py` si hace falta y abre `http://127.0.0.1:8765`.

Linux empieza en el puerto `8765` para no confundirse con `app.py` de Windows, que usa el `8000`. Si está ocupado, busca automáticamente el siguiente puerto libre.

## Comandos utiles

- Abrir dashboard completo:
   ```bash
   bash bash.md
   ```
- Correr solo el recolector:
   ```bash
   bash bash.md collect
   ```
- Correr solo el servidor:
   ```bash
   python backend/server.py
   ```

## Flujo de datos

- `bash.md` escribe `/tmp/processes.json`.
- `backend/server.py` publica ese archivo en `/api/processes`.
- `backend/server.py` sirve como index real `index.html`.
- Si no hay JSON valido, la interfaz conserva datos demo para no quedar vacia.

## Archivos principales

- `index.html` - index real del dashboard.
- `bash.md` - comando Linux principal y recolector de procesos basado en `ps`.
- `backend/server.py` - servidor recomendado.
- `app.py` - launcher alternativo desde la raiz.
