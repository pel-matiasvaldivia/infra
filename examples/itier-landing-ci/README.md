# CI de la landing — archivos para el repo `itier`

Estos tres archivos **no van en el repo `infra`**: son para copiar al repo
[`itier`](https://github.com/pel-matiasvaldivia/itier). Empaquetan la landing en
una imagen y la publican en GHCR en cada push.

| Archivo | Destino en `itier` |
|---|---|
| `Dockerfile` | `landing/Dockerfile` |
| `nginx.conf` | `landing/nginx.conf` |
| `deploy-landing.yml` | `.github/workflows/deploy-landing.yml` |

```sh
cp Dockerfile   <itier>/landing/Dockerfile
cp nginx.conf   <itier>/landing/nginx.conf
cp deploy-landing.yml <itier>/.github/workflows/deploy-landing.yml
```

## Qué hace el workflow

- **En cada push a `main`** que toque `landing/`: construye
  `ghcr.io/pel-matiasvaldivia/itier-landing` y la publica (tags `latest` y `sha`).
- **En pull requests**: solo construye (no publica) — sirve de smoke test.
- **Deploy por SSH (opcional)**: si en el repo `itier` cargás los secrets
  `VPS_HOST`, `VPS_USER` y `VPS_SSH_KEY`, el workflow entra al VPS y hace
  `docker compose pull && up -d landing`. Sin esos secrets, solo publica la imagen.

## Sigue las convenciones del repo

Mismo patrón que el `build-agent.yml` que ya tiene `itier`: `docker/metadata-action`
para los tags, `buildx`, login a GHCR con `GITHUB_TOKEN`, y build solo (sin push)
en PRs. La diferencia es que la landing es amd64 (va en el VPS x86), no multi-arch.

## Probar la imagen localmente

```sh
cd <itier>/landing
docker build -t itier-landing .
docker run --rm -p 8080:80 itier-landing
# abrí http://localhost:8080  (y http://localhost:8080/healthz → "ok")
```
