# images/landing — imagen de la landing

Dockerfile + nginx.conf para empaquetar la landing de iTier. El **contenido HTML
vive en el repo `itier`** (`landing/index.html`, `landing/manual.html`); acá solo
está cómo se sirve.

La construye `.github/workflows/build-images.yml`, que hace checkout de `itier` y
usa su carpeta `landing/` como contexto, con este `nginx.conf` copiado adentro.
Publica `ghcr.io/pel-matiasvaldivia/itier-landing`.

## Build local (para probar)

Desde una copia del repo `itier`, con este repo `infra` al lado:

```sh
cp infra/images/landing/nginx.conf itier/landing/nginx.conf
docker build -f infra/images/landing/Dockerfile -t itier-landing itier/landing
docker run --rm -p 8080:80 itier-landing
# http://localhost:8080  y  http://localhost:8080/healthz → ok
```
