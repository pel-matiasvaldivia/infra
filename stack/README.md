# stack — lo que corre en el VPS

`compose.yaml` define el stack de demo: `cloudflared` + `traefik` + `landing`.

**No publica ningún puerto.** `cloudflared` sale hacia Cloudflare; Traefik solo
es alcanzable dentro de la red `edge`. El firewall del VPS puede quedar cerrado a
todo lo entrante.

## Uso manual

```sh
mkdir -p /opt/itier-demo && cd /opt/itier-demo
# copiá compose.yaml acá y creá el .env (ver .env.example)
cp /ruta/a/infra/stack/compose.yaml .
cp /ruta/a/infra/stack/.env.example .env
# editá .env: TUNNEL_TOKEN (output de Pulumi), LANDING_HOST, LANDING_IMAGE
docker compose --env-file .env up -d
docker compose ps          # cloudflared, traefik y landing arriba
```

O dejá que Pulumi copie y levante todo por SSH: ver `deployToVps` en `../pulumi`.

## Cómo fluye un request

1. Cloudflare recibe el HTTPS y lo manda por el túnel a `cloudflared`.
2. `cloudflared` lo entrega a `http://traefik:80` (según el ingress del túnel).
3. Traefik mira el `Host` y lo rutea al contenedor con el label
   `Host(\`demo.itier.pymesenlinea.com.ar\`)` → `landing`.

## Notas de seguridad

- **`docker.sock` en Traefik es read-only.** Para endurecer más, se puede
  interponer un [socket-proxy](https://github.com/Tecnativa/docker-socket-proxy)
  que exponga solo la API que Traefik necesita.
- Los frontends nunca ven internet directo: el único proceso con salida es
  `cloudflared`, y no acepta conexiones entrantes.
