# infra — despliegue de iTier detrás de Cloudflare Tunnel

Automatiza el despliegue de los servicios de iTier en un VPS que solo tiene
**Docker Engine + docker-compose**, detrás de un **Cloudflare Tunnel**.

La idea central: **el SSL lo termina Cloudflare, no el VPS.** Con el túnel no se
abren puertos ni se instalan certificados en el servidor — `cloudflared` sale
hacia Cloudflare y nadie entra al VPS desde internet.

```
internet ──HTTPS──> Cloudflare (termina TLS) ──túnel cifrado──> cloudflared
                                                                   │ http (red docker)
                                                                Traefik ──> servicios
```

Sin Pulumi ni ninguna herramienta de IaC: el túnel se define con un `config.yml`
versionado, y **los registros DNS los creás vos a mano** en el panel de Cloudflare.

## Este repo contiene un demo end-to-end

Despliega la **landing de iTier** (sitio estático) en `demo.itier.pymesenlinea.com.ar`.
Es liviano a propósito: sirve para probar toda la cadena (túnel + proxy + CI)
antes de mover el stack pesado de GLPI/Zabbix.

```
infra/
├── stack/                       Lo que corre en el VPS
│   ├── compose.yaml             cloudflared + traefik + landing (sin puertos)
│   ├── .env.example
│   └── cloudflared/
│       ├── config.yml           ingress del túnel (todo → Traefik)
│       └── README.md            crear el túnel + credenciales + DNS
└── examples/itier-landing-ci/   Archivos para COPIAR al repo itier
    ├── Dockerfile               empaqueta la landing en nginx
    ├── nginx.conf               headers de seguridad + /healthz
    └── deploy-landing.yml       GitHub Actions: build → GHCR → deploy por SSH
```

## Cómo encaja cada pieza

| Pieza | Quién la maneja | Dónde vive |
|---|---|---|
| Ingress del túnel | archivo versionado | `stack/cloudflared/config.yml` |
| Registros DNS | **vos, a mano** | panel de Cloudflare |
| Contenedores en el VPS | **docker compose** | `stack/compose.yaml` |
| Imagen de la landing | **GitHub Actions → GHCR** | `examples/` → repo `itier` |
| SSL público | **Cloudflare** (Universal SSL) | nada que instalar |

---

## Puesta en marcha del demo

### Requisitos previos
- Una cuenta de Cloudflare con la zona `pymesenlinea.com.ar`.
- Un VPS con Docker Engine + docker-compose.
- El repo `infra` clonado en el VPS (o al menos la carpeta `stack/`).

### Paso 1 — Publicar la imagen de la landing (en el repo `itier`)

Copiá los tres archivos de `examples/itier-landing-ci/` al repo `itier`:

```sh
cp examples/itier-landing-ci/Dockerfile   <itier>/landing/Dockerfile
cp examples/itier-landing-ci/nginx.conf   <itier>/landing/nginx.conf
cp examples/itier-landing-ci/deploy-landing.yml \
   <itier>/.github/workflows/deploy-landing.yml
```

Commiteá y pusheá a `main`. GitHub Actions construye y publica
`ghcr.io/pel-matiasvaldivia/itier-landing:latest`. Marcá el paquete como
**público** (o dale acceso al VPS) para que el `docker pull` funcione.

> La imagen se puede probar sin nada de Cloudflare:
> `docker build -t itier-landing landing/ && docker run --rm -p 8080:80 itier-landing`
> y abrís `http://localhost:8080`.

### Paso 2 — Crear el túnel y el DNS

Seguí **[stack/cloudflared/README.md](stack/cloudflared/README.md)**. En resumen:

1. `cloudflared tunnel login` + `tunnel create itier-demo` (desde la imagen de
   docker, no hace falta instalar nada) → te da el **UUID** y `creds.json`.
2. Poné el UUID en `stack/cloudflared/config.yml` y dejá `creds.json` en esa
   carpeta (queda gitignored).
3. En Cloudflare → DNS, creá el CNAME a mano:
   `demo.itier` → `<UUID>.cfargotunnel.com`, **Proxied** (nube naranja).

### Paso 3 — Levantar el stack en el VPS

```sh
cd stack
cp .env.example .env          # editá LANDING_HOST y LANDING_IMAGE
docker compose up -d
docker compose ps             # cloudflared, traefik y landing arriba
```

### Paso 4 — Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar
```

Deberías ver `HTTP/2 200` servido a través de Cloudflare. En el VPS,
`docker compose ps` muestra los tres servicios arriba y **ningún puerto publicado**.

---

## Despliegue continuo

Una vez enganchado, cada push a `main` en `itier` que toque `landing/`:

1. GitHub Actions construye la imagen y la publica en GHCR.
2. Si cargaste los secrets `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` en el repo,
   el mismo workflow entra por SSH y hace `docker compose pull && up -d landing`.

El VPS nunca compila: solo baja imágenes ya construidas.

## Agregar más servicios

1. Sumá el servicio a `stack/compose.yaml` con sus labels de Traefik
   (`Host(\`otro.tudominio\`)`).
2. Creá **otro CNAME** en Cloudflare → el mismo `<UUID>.cfargotunnel.com`.
3. `docker compose up -d`.

El `config.yml` del túnel no se toca: es catch-all hacia Traefik, y Traefik
hace todo el ruteo por Host.

## Migrar el stack real (GLPI/Zabbix)

El repo `itier` ya tiene `deploy/vps/docker-compose.yml` pensado para NPM. Para
moverlo a esta arquitectura: quitá los `ports:` publicados, poné los frontends
(GLPI, Zabbix web) en la red `edge`, agregales labels de Traefik, y creá sus
CNAME. El SSL deja de necesitar Let's Encrypt.
