import os
from http.server import SimpleHTTPRequestHandler, HTTPServer

class MiPrimerServidor(SimpleHTTPRequestHandler):
    def do_GET(self):
        # Cuando el frontend pida los procesos, respondemos con el JSON
        if self.path == '/api/processes':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            
            # Dirección del archivo JSON que generará la Persona 1
            ruta_json = '/tmp/processes.json'
            
            if os.path.exists(ruta_json):
                with open(ruta_json, 'r') as archivo:
                    self.wfile.write(archivo.read().encode())
            else:
                # Si el script de Bash aún no corre, enviamos una lista vacía para no romper el frontend
                self.wfile.write(b"[]")
        else:
            super().do_GET()

if __name__ == '__main__':
    direccion_servidor = ('', 8000)
    print("🚀 Servidor corriendo en http://localhost:8000")
    servidor = HTTPServer(direccion_servidor, MiPrimerServidor)
    servidor.serve_forever()
