# infra — despliegue de iTier detrás de Cloudflare Tunnel

Automatiza el despliegue de los servicios de iTier en un VPS que solo tiene
**Docker Engine + docker-compose**, detrás de un **Cloudflare Tunnel**.

La idea central: **el SSL lo termina Cloudflare, no el VPS.** Con el túnel no se
abren puertos ni se instalan certificados en el servidor — `cloudflared` sale
hacia Cloudflare y nadie entra al VPS desde internet.

```
internet ──HTTPS──> Cloudflare (termina TLS) ──túnel──> cloudflared (ya existe)
                                                            │ red docker `tunnel_default`
                                                         Traefik ──> servicios
```

Reusa el túnel **DW-Services** que ya tenés (gestionado desde el dashboard) y su
connector `cloudflared` (contenedor `cloudflared-tunnel`, red `tunnel_default`),
que ya corre en el VPS. Este repo solo agrega el reverse proxy y los servicios, y
los engancha a esa misma red — sin crear redes ni tocar el compose del túnel.

## Este repo contiene un demo end-to-end

Despliega la **landing de iTier** (sitio estático) en `demo.itier.pymesenlinea.com.ar`.
Es liviano a propósito: sirve para probar toda la cadena (túnel + proxy + CI)
antes de mover el stack pesado de GLPI/Zabbix.

```
infra/
├── stack/                       Lo que corre en el VPS
│   ├── compose.yaml             traefik + landing (sin cloudflared, sin puertos)
│   ├── .env.example
│   └── README.md                red compartida + Public Hostname + levantar
└── examples/itier-landing-ci/   Archivos para COPIAR al repo itier
    ├── Dockerfile               empaqueta la landing en nginx
    ├── nginx.conf               headers de seguridad + /healthz
    └── deploy-landing.yml       GitHub Actions: build → GHCR → deploy por SSH
```

## Cómo encaja cada pieza

| Pieza | Quién la maneja | Dónde vive |
|---|---|---|
| Túnel + connector | **ya existe** (DW-Services) | tu VPS + dashboard |
| Public Hostname (ingress) | dashboard del túnel | Cloudflare |
| DNS | lo crea el dashboard al agregar el hostname | Cloudflare |
| Reverse proxy + servicios | **docker compose** | `stack/compose.yaml` |
| Imagen de la landing | **GitHub Actions → GHCR** | `examples/` → repo `itier` |
| SSL público | **Cloudflare** (Universal SSL) | nada que instalar |

El punto de integración es la red de docker del túnel (**`tunnel_default`**, que ya
existe): el Traefik de este stack se engancha a ella y así el `cloudflared-tunnel`
lo alcanza por su nombre de contenedor.

---

## Puesta en marcha del demo

### Requisitos previos
- El túnel DW-Services activo (ya lo tenés) con su `cloudflared` corriendo como
  contenedor en el VPS.
- El repo `infra` clonado en el VPS (o al menos la carpeta `stack/`).

### Paso 1 — Publicar la imagen de la landing (en el repo `itier`)

Copiá los tres archivos de `examples/itier-landing-ci/` al repo `itier`:

```sh
cp examples/itier-landing-ci/Dockerfile   <itier>/landing/Dockerfile
cp examples/itier-landing-ci/nginx.conf   <itier>/landing/nginx.conf
cp examples/itier-landing-ci/deploy-landing.yml \
   <itier>/.github/workflows/deploy-landing.yml
```

Commiteá y pusheá a `main`. GitHub Actions publica
`ghcr.io/pel-matiasvaldivia/itier-landing:latest`. Marcá el paquete como
**público** (o dale acceso al VPS) para que el `docker pull` funcione.

> La imagen se puede probar sin nada de Cloudflare:
> `docker build -t itier-landing landing/ && docker run --rm -p 8080:80 itier-landing`

### Paso 2 — Agregar el Public Hostname en el túnel

En Cloudflare → Networks → Tunnels → **DW-Services** → Published application routes,
agregá: `demo.itier.pymesenlinea.com.ar` → Service `HTTP` `itier-traefik:80`.
El DNS lo crea el dashboard solo.

### Paso 3 — Levantar el stack

```sh
cd stack
cp .env.example .env          # LANDING_HOST = el hostname del paso 2
docker compose up -d
```

Traefik se engancha a `tunnel_default` (ya existe), así que el `cloudflared-tunnel`
lo ve de inmediato. No hay que crear ninguna red.

### Paso 4 — Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar        # HTTP/2 200
```

En el VPS, `docker compose ps` muestra `traefik` y `landing` arriba y **ningún
puerto publicado**.

---

## Despliegue continuo

Cada push a `main` en `itier` que toque `landing/`:

1. GitHub Actions construye la imagen y la publica en GHCR.
2. Si cargaste los secrets `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` en el repo,
   el mismo workflow entra por SSH y hace `docker compose pull && up -d landing`.

El VPS nunca compila: solo baja imágenes ya construidas.

## Migrar el stack real (GLPI/Zabbix)

El repo `itier` ya tiene `deploy/vps/docker-compose.yml` pensado para NPM. Para
moverlo a esta arquitectura: quitá los `ports:` publicados, poné los frontends
(GLPI, Zabbix web) en la red `tunnel_default`, agregales labels de Traefik, y creá sus
Public Hostname en el túnel. El SSL deja de necesitar Let's Encrypt.
