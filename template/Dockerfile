# EJEMPLO — reemplazá por el build real de tu proyecto (Node, Python, Go, etc.).
# Lo único que el pipeline necesita: que la imagen sirva HTTP en un puerto
# (por defecto 80; si es otro, poné `port:` en .github/workflows/deploy.yml).
#
# Este ejemplo sirve un sitio estático con nginx.
FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/
EXPOSE 80
