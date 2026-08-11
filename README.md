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
├── .github/workflows/
│   └── build-images.yml         Actions: construye las imágenes → GHCR
├── images/
│   └── landing/                 Cómo se empaqueta la landing
│       ├── Dockerfile           nginx sirviendo el sitio estático
│       └── nginx.conf           headers de seguridad + /healthz
└── stack/                       Lo que corre en el VPS
    ├── compose.yaml             traefik + landing (sin cloudflared, sin puertos)
    ├── .env.example
    └── README.md                Public Hostname + levantar
```

**El flujo en dos tiempos:** GitHub Actions construye las imágenes y las publica
en GHCR → en el VPS clonás este repo y hacés `docker compose up` (baja las
imágenes ya construidas; el VPS nunca compila).

## Cómo encaja cada pieza

| Pieza | Quién la maneja | Dónde vive |
|---|---|---|
| Túnel + connector | **ya existe** (DW-Services) | tu VPS + dashboard |
| Public Hostname (ingress) | dashboard del túnel | Cloudflare |
| DNS | lo crea el dashboard al agregar el hostname | Cloudflare |
| Imágenes docker | **GitHub Actions → GHCR** | `.github/workflows/build-images.yml` |
| Reverse proxy + servicios | **docker compose** | `stack/compose.yaml` |
| SSL público | **Cloudflare** (Universal SSL) | nada que instalar |

El punto de integración es la red de docker del túnel (**`tunnel_default`**, que ya
existe): el Traefik de este stack se engancha a ella y así el `cloudflared-tunnel`
lo alcanza por su nombre de contenedor.

---

## Parte 1 — Construir las imágenes (GitHub Actions)

El workflow **`.github/workflows/build-images.yml`** construye las imágenes de la
infra y las publica en GHCR. Hoy hay una: la landing. Como su HTML vive en el repo
`itier`, el workflow hace checkout de `itier` y construye desde su carpeta
`landing/` con el `Dockerfile` de este repo.

Se dispara solo al pushear cambios en `images/**` a `main`, o a mano desde la
pestaña **Actions → build-images → Run workflow**. Publica
`ghcr.io/pel-matiasvaldivia/itier-landing:latest`.

> **Hacé público el paquete** `itier-landing` (o dale acceso de lectura al VPS),
> así el `docker pull` del VPS funciona sin login. Si lo dejás privado, en el VPS
> hacé `docker login ghcr.io` con un PAT de lectura de packages.

Para reconstruir tras editar la landing en `itier`, corré el workflow a mano
(la fuente está en otro repo, así que un push a `infra` no se entera). Opcional:
en `itier` podés agregar un workflow que dispare este por `repository_dispatch`.

## Parte 2 — Desplegar en el VPS (clonar + compose up)

### Paso 1 — Public Hostname en el túnel

En Cloudflare → Networks → Tunnels → **DW-Services** → Published application routes,
agregá: `demo.itier.pymesenlinea.com.ar` → Service `HTTP` `itier-traefik:80`.
El DNS lo crea el dashboard solo.

### Paso 2 — Clonar el repo y levantar

En el VPS:

```sh
git clone https://github.com/pel-matiasvaldivia/infra
cd infra/stack
cp .env.example .env          # LANDING_HOST = el hostname del paso 1
docker compose up -d
```

Traefik se engancha a `tunnel_default` (ya existe), así que el `cloudflared-tunnel`
lo ve de inmediato. No hay que crear ninguna red.

### Paso 3 — Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar        # HTTP/2 200
```

`docker compose ps` muestra `traefik` y `landing` arriba y **ningún puerto publicado**.

## Actualizar

- **Nueva versión de una imagen:** corré el workflow (o pusheá a `images/**`) →
  en el VPS: `cd infra/stack && docker compose pull && docker compose up -d`.
- **Cambió el compose/config:** en el VPS `git pull` y `docker compose up -d`.

## Migrar el stack real (GLPI/Zabbix)

El repo `itier` ya tiene `deploy/vps/docker-compose.yml` pensado para NPM. Para
moverlo a esta arquitectura: quitá los `ports:` publicados, poné los frontends
(GLPI, Zabbix web) en la red `tunnel_default`, agregales labels de Traefik, y creá sus
Public Hostname en el túnel. El SSL deja de necesitar Let's Encrypt.
