# stack — lo que corre en el VPS

`compose.yaml` agrega `traefik` + `landing` y los conecta al **cloudflared que ya
tenés corriendo** (túnel DW-Services) a través de una red de docker compartida.

**No levanta otro cloudflared** y **no publica ningún puerto.** Traefik solo es
alcanzable dentro de la red `edge`; el cloudflared existente lo alcanza por su
nombre de contenedor.

## Paso 1 — Red compartida `edge`

El cloudflared existente y este stack tienen que estar en la misma red de docker.
Creá una red externa una sola vez:

```sh
docker network create edge
```

Y conectá tu **cloudflared existente** a ella. En el compose donde vive tu
cloudflared, agregá la red:

```yaml
services:
  cloudflared:
    networks: [ <tu-red-actual>, edge ]   # sumá `edge` a las que ya tenga
networks:
  edge:
    external: true
```

Recreá ese contenedor (`docker compose up -d`). Para una prueba rápida sin editar
nada, podés conectarlo en caliente (se pierde al recrear):

```sh
docker network connect edge <nombre-del-contenedor-cloudflared>
```

## Paso 2 — Public Hostname en el túnel (dashboard)

En Cloudflare → **Networks → Tunnels → DW-Services → Published application routes**
(o "Public Hostname"), agregá:

| Campo | Valor |
|---|---|
| Subdomain | `demo` |
| Domain | `itier.pymesenlinea.com.ar` |
| Service | `HTTP` · `itier-traefik:80` |

Cloudflare crea el DNS solo. La request llega a Traefik con el Host original, y
Traefik la rutea a la landing por el label `Host(...)`.

## Paso 3 — Levantar

```sh
cp .env.example .env          # editá LANDING_HOST (= al Public Hostname) y LANDING_IMAGE
docker compose up -d
docker compose ps             # traefik y landing arriba
```

## Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar        # HTTP/2 200
# desde el cloudflared, que resuelva Traefik:
docker exec <cloudflared> wget -qO- http://itier-traefik:80/healthz   # ok
```

## Agregar más servicios

1. Sumá el servicio a `compose.yaml` en la red `edge` con sus labels de Traefik
   (`Host(\`otro.tudominio\`)`).
2. En el túnel, agregá otro Public Hostname → el mismo `http://itier-traefik:80`.
3. `docker compose up -d`.

## Notas de seguridad

- **`docker.sock` en Traefik es read-only.** Para endurecer, se puede interponer
  un [socket-proxy](https://github.com/Tecnativa/docker-socket-proxy).
- Ningún puerto se publica al host: el único proceso con salida es el cloudflared
  existente, y no acepta conexiones entrantes.
