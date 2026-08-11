# stack — lo que corre en el VPS

`compose.yaml` define el stack de demo: `cloudflared` + `traefik` + `landing`.

**No publica ningún puerto.** `cloudflared` sale hacia Cloudflare; Traefik solo
es alcanzable dentro de la red `edge`. El firewall del VPS puede quedar cerrado a
todo lo entrante.

## Antes de levantar

1. Creá el túnel y sus credenciales: ver **[cloudflared/README.md](cloudflared/README.md)**.
   Tenés que quedar con `cloudflared/config.yml` (con el UUID) y
   `cloudflared/creds.json` en su lugar.
2. Creá el CNAME en Cloudflare (a mano) apuntando al túnel.

## Levantar

```sh
cp .env.example .env          # editá LANDING_HOST y LANDING_IMAGE
docker compose up -d
docker compose ps             # cloudflared, traefik y landing arriba
docker compose logs -f cloudflared   # "Registered tunnel connection" = OK
```

## Cómo fluye un request

1. Cloudflare recibe el HTTPS y lo manda por el túnel a `cloudflared`.
2. `cloudflared` reenvía **todo** a `http://traefik:80` (catch-all del `config.yml`).
3. Traefik mira el `Host` y lo rutea al contenedor con el label
   `Host(\`demo.itier.pymesenlinea.com.ar\`)` → `landing`.

## Notas de seguridad

- **`docker.sock` en Traefik es read-only.** Para endurecer más, se puede
  interponer un [socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
  que exponga solo la API que Traefik necesita.
- `creds.json` es secreto (gitignored). El único proceso con salida es
  `cloudflared`, y no acepta conexiones entrantes.
