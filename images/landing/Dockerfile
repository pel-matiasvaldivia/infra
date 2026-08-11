# Imagen de la landing de iTier — nginx sirviendo el sitio estático.
#
# La construye .github/workflows/build-images.yml (en ESTE repo, infra) y la
# publica a GHCR. El contenido HTML (index.html, manual.html) viene del repo
# `itier`: el workflow hace checkout de itier y usa su carpeta `landing/` como
# contexto de build, con este nginx.conf copiado adentro.
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
