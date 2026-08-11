# Imagen de la landing de iTier — nginx sirviendo el sitio estático.
#
# Va en itier/landing/Dockerfile. Contexto de build: la carpeta `landing/`.
# La construye y publica .github/workflows/deploy-landing.yml a GHCR.
#
# Detrás de Cloudflare Tunnel + Traefik: escucha HTTP en :80, sin TLS
# (Cloudflare ya terminó el TLS en el edge).

FROM nginx:1.27-alpine

# Config propia: security headers, gzip y un endpoint /healthz para el proxy.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# El sitio estático (autónomo: todo el CSS/JS va embebido en los HTML).
COPY index.html manual.html /usr/share/nginx/html/

EXPOSE 80

# Liveness sin depender de curl.
HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:80/healthz >/dev/null 2>&1 || exit 1
