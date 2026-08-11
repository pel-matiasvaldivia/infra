# infra — despliegue de iTier detrás de Cloudflare Tunnel

Automatiza el despliegue de los servicios de iTier en un VPS que solo tiene
**Docker Engine + docker-compose**, detrás de un **Cloudflare Tunnel**, con
**Pulumi** manejando la parte de Cloudflare.

La idea central: **el SSL lo termina Cloudflare, no el VPS.** Con el túnel no se
abren puertos ni se instalan certificados en el servidor — `cloudflared` sale
hacia Cloudflare y nadie entra al VPS desde internet.

```
internet ──HTTPS──> Cloudflare (termina TLS) ──túnel cifrado──> cloudflared
                                                                   │ http (red docker)
                                                                Traefik ──> servicios
```

## Este repo contiene un demo end-to-end

Despliega la **landing de iTier** (sitio estático) en `demo.itier.pymesenlinea.com.ar`.
Es liviano a propósito: sirve para probar toda la cadena (túnel + proxy + CI)
antes de mover el stack pesado de GLPI/Zabbix.

```
infra/
├── pulumi/                     Proyecto Pulumi (TypeScript)
│   ├── index.ts                túnel + ingress + DNS + deploy remoto opcional
│   ├── Pulumi.yaml             proyecto y config con defaults
│   └── Pulumi.demo.yaml        stack "demo"
├── stack/                      Lo que corre en el VPS
│   ├── compose.yaml            cloudflared + traefik + landing (sin puertos)
│   └── .env.example
└── examples/itier-landing-ci/  Archivos para COPIAR al repo itier
    ├── Dockerfile              empaqueta la landing en nginx
    ├── nginx.conf              headers de seguridad + /healthz
    └── deploy-landing.yml      GitHub Actions: build → GHCR → deploy por SSH
```

## Cómo encaja cada pieza

| Pieza | Quién la maneja | Dónde vive |
|---|---|---|
| Túnel, ingress, DNS | **Pulumi** (API de Cloudflare) | `pulumi/` |
| Contenedores en el VPS | **docker compose** | `stack/compose.yaml` |
| Imagen de la landing | **GitHub Actions → GHCR** | `examples/` → repo `itier` |
| SSL público | **Cloudflare** (Universal SSL) | nada que instalar |

---

## Puesta en marcha del demo

### Requisitos previos
- Una cuenta de Cloudflare con la zona `pymesenlinea.com.ar` (tenés a mano el
  **Account ID** y el **Zone ID**).
- Un **API Token** de Cloudflare con permisos: `Account:Cloudflare Tunnel:Edit`,
  `Zone:DNS:Edit`.
- Un VPS con Docker Engine + docker-compose y acceso SSH.
- [Pulumi CLI](https://www.pulumi.com/docs/install/) y Node.js 20+.

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

> Detalle: la imagen se puede probar localmente sin nada de Cloudflare:
> `docker build -t itier-landing landing/ && docker run --rm -p 8080:80 itier-landing`
> y abrís `http://localhost:8080`.

### Paso 2 — Provisionar Cloudflare con Pulumi

```sh
cd pulumi
npm install
pulumi stack init demo                       # o `pulumi stack select demo`

# Config (editá Pulumi.demo.yaml con tus IDs o usá estos comandos):
pulumi config set accountId  <tu-account-id>
pulumi config set zoneId     <tu-zone-id>
pulumi config set hostname   demo.itier.pymesenlinea.com.ar

# Secreto: el API token de Cloudflare
export CLOUDFLARE_API_TOKEN=<tu-token>        # o: pulumi config set --secret cloudflare:apiToken <token>

pulumi up
```

Esto crea el túnel, el ingress (`hostname → traefik:80`), el CNAME proxied, y
te deja el **token del connector** como output:

```sh
pulumi stack output tunnelTokenOut --show-secrets
```

### Paso 3 — Levantar el stack en el VPS

**Opción A — a mano** (control total):

```sh
# en el VPS
mkdir -p /opt/itier-demo && cd /opt/itier-demo
# copiá stack/compose.yaml a este directorio, y creá .env:
cat > .env <<EOF
TUNNEL_TOKEN=<el-token-del-paso-2>
LANDING_IMAGE=ghcr.io/pel-matiasvaldivia/itier-landing:latest
LANDING_HOST=demo.itier.pymesenlinea.com.ar
EOF
docker compose --env-file .env up -d
```

**Opción B — que lo haga Pulumi** (un solo `pulumi up` para todo):

```sh
cd pulumi
pulumi config set deployToVps true
pulumi config set vpsHost <ip-del-vps>
pulumi config set vpsUser deploy
pulumi config set --secret vpsSshKey -- "$(cat ~/.ssh/id_demo)"
pulumi up      # ahora también copia el compose y corre docker compose up
```

### Paso 4 — Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar
```

Deberías ver `HTTP/2 200` servido a través de Cloudflare. En el VPS,
`docker compose ps` muestra `cloudflared`, `traefik` y `landing` arriba, y
**ningún puerto publicado**.

---

## Despliegue continuo

Una vez enganchado, cada push a `main` en `itier` que toque `landing/`:

1. GitHub Actions construye la imagen y la publica en GHCR.
2. Si cargaste los secrets `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` en el repo,
   el mismo workflow entra por SSH y hace `docker compose pull && up -d landing`.

El VPS nunca compila: solo baja imágenes ya construidas.

## Agregar más servicios

Para sumar otro servicio detrás del mismo túnel: agregalo a `stack/compose.yaml`
con sus labels de Traefik (`Host(...)`) y agregá su hostname al ingress del túnel
en `pulumi/index.ts`. `pulumi up` + `docker compose up -d` y listo.

## Migrar el stack real (GLPI/Zabbix)

El repo `itier` ya tiene `deploy/vps/docker-compose.yml` pensado para NPM. Para
moverlo a esta arquitectura: quitá los `ports:` publicados, poné los frontends
(GLPI, Zabbix web) en la red `edge`, agregales labels de Traefik, y sumá sus
hostnames al ingress del túnel. El SSL deja de necesitar Let's Encrypt.
