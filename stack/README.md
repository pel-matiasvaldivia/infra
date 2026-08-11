# stack — lo que corre en el VPS

`compose.yaml` agrega `traefik` + `landing` y los engancha a la red del
**cloudflared que ya tenés corriendo** (`cloudflared-tunnel`, red `tunnel_default`).

**No levanta otro cloudflared** y **no publica ningún puerto.** Traefik solo es
alcanzable dentro de `tunnel_default`; el cloudflared existente lo alcanza por su
nombre de contenedor (`itier-traefik`). No hay que crear ninguna red.

## Paso 1 — Public Hostname en el túnel (dashboard)

En Cloudflare → **Networks → Tunnels → DW-Services → Published application routes**
(o "Public Hostname"), agregá:

| Campo | Valor |
|---|---|
| Subdomain | `demo` |
| Domain | `itier.pymesenlinea.com.ar` |
| Service | `HTTP` · `itier-traefik:80` |

Cloudflare crea el DNS solo. La request llega a Traefik con el Host original, y
Traefik la rutea a la landing por el label `Host(...)`.

## Paso 2 — Levantar

```sh
cp .env.example .env          # editá LANDING_HOST (= al Public Hostname) y LANDING_IMAGE
docker compose up -d
docker compose ps             # traefik y landing arriba
```

Como Traefik entra a `tunnel_default`, el `cloudflared-tunnel` lo ve enseguida.

## Verificar

```sh
curl -I https://demo.itier.pymesenlinea.com.ar        # HTTP/2 200
# que el cloudflared resuelva Traefik por su nombre:
docker exec cloudflared-tunnel wget -qO- http://itier-traefik:80/healthz   # ok
```

## Agregar más servicios

1. Sumá el servicio a `compose.yaml` en la red `tunnel` con sus labels de Traefik
   (`Host(\`otro.tudominio\`)`).
2. En el túnel, agregá otro Public Hostname → el mismo `http://itier-traefik:80`.
3. `docker compose up -d`.

## Notas de seguridad

- **`docker.sock` en Traefik es read-only.** Para endurecer, se puede interponer
  un [socket-proxy](https://github.com/Tecnativa/docker-socket-proxy).
- Ningún puerto se publica al host: el único proceso con salida es el
  `cloudflared-tunnel` existente, y no acepta conexiones entrantes.
