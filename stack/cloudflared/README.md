# cloudflared — túnel gestionado localmente (sin Pulumi)

La config del túnel vive acá como archivo versionado. Vos creás el túnel una
vez, copiás las credenciales al VPS, y creás los CNAME a mano en Cloudflare.

| Archivo | Qué es | ¿Se commitea? |
|---|---|---|
| `config.yml` | Ingress del túnel (todo → Traefik) | **Sí** (con el UUID) |
| `creds.json` | Credenciales del túnel | **No** (gitignored, es secreto) |
| `cert.pem` | Cert de origen de tu cuenta CF | **No** (gitignored) |

## Crear el túnel (una sola vez)

No hace falta instalar `cloudflared`: se corre desde su propia imagen. Desde la
carpeta `stack/` del repo, en tu máquina o en el VPS:

```sh
cd stack

# 1) Login: abre (o imprime) una URL para autorizar en el navegador y elegir
#    la zona pymesenlinea.com.ar. Deja cert.pem en ./cloudflared.
docker run --rm -it -v "$PWD/cloudflared:/etc/cloudflared" \
  cloudflare/cloudflared tunnel login

# 2) Crear el túnel. Escribe las credenciales <UUID>.json en ./cloudflared.
docker run --rm -it -v "$PWD/cloudflared:/etc/cloudflared" \
  cloudflare/cloudflared tunnel create itier-demo
```

El segundo comando imprime el **UUID** del túnel. Con eso:

```sh
# 3) Poné el UUID en config.yml y renombrá las credenciales a creds.json:
mv cloudflared/<UUID>.json cloudflared/creds.json
sed -i "s/<TUNNEL_UUID>/<UUID>/" cloudflared/config.yml
```

## Crear el DNS a mano (lo que querés controlar vos)

En el panel de Cloudflare → DNS de `pymesenlinea.com.ar`, agregá un registro:

| Tipo | Nombre | Destino | Proxy |
|---|---|---|---|
| CNAME | `demo.itier` | `<UUID>.cfargotunnel.com` | **Proxied** (nube naranja) |

> El proxy (nube naranja) es obligatorio: es lo que hace que el tráfico entre
> por el túnel y que Cloudflare termine el TLS.

Para cada servicio nuevo, agregás **otro CNAME** al mismo `<UUID>.cfargotunnel.com`
y un label `Host(...)` en `compose.yaml`. El `config.yml` no se toca (es catch-all).

## Levantar

```sh
cd stack
cp .env.example .env      # editá LANDING_HOST y LANDING_IMAGE
docker compose up -d
docker compose logs -f cloudflared    # "Registered tunnel connection" = OK
```
