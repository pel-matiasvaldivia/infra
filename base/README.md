# Stack base del VPS (túnel + Traefik + runner)

Esto es lo único fijo de cada servidor. Se instala **una vez por VPS** y queda
corriendo. Los servicios de cada proyecto llegan después, solos, por el pipeline
(ver [`../README.md`](../README.md)).

Se instala igual en los dos VPS; lo único que cambia es el **token del túnel** y
la **etiqueta del runner** (`staging` o `prod`).

---

## 1. Levantar el túnel + Traefik

En el VPS:

```sh
git clone https://github.com/pel-matiasvaldivia/infra.git
cd infra/base
cp .env.example .env
nano .env                 # pegá el TUNNEL_TOKEN de ESTE VPS
docker compose up -d
```

Verificá:

```sh
docker logs cloudflared --tail 20     # "Registered tunnel connection"
docker network ls | grep edge         # la red compartida existe
```

> Cada VPS usa su propio túnel de Cloudflare. Creá dos túneles distintos
> (p. ej. `deployments` y `azure-prod`) y poné en cada VPS el token que
> corresponde.

## 2. Instalar el self-hosted runner de GitHub Actions

El runner es quien ejecuta el deploy **dentro** del VPS (sin SSH ni puertos
abiertos: el runner sale hacia GitHub, toma el job y hace `docker compose up`).

En GitHub → repo (o la organización) → **Settings → Actions → Runners → New
self-hosted runner → Linux**, y seguí los comandos que te da (descarga +
`./config.sh ...`). **Lo único importante: la etiqueta (label).**

| VPS | Label del runner |
|---|---|
| VPS de deployments | `staging` |
| VPS de Azure (producción) | `prod` |

Dejalo como servicio para que arranque solo:

```sh
sudo ./svc.sh install
sudo ./svc.sh start
```

> **Nota sobre cuentas personales vs. organización.** En una cuenta personal los
> runners son **por repositorio**: tendrías que registrar el runner en cada
> proyecto. Si querés que *todos* tus repos compartan los mismos dos runners
> (y el mismo pipeline y settings), conviene mover los repos a una **organización**
> (gratis): ahí el runner es a nivel org y lo comparten todos. El pipeline de
> este repo funciona igual en los dos casos.

## 3. Dar de alta los dominios

Por cada servicio, en el dashboard del túnel de ese VPS agregás un **Public
Hostname** → `HTTP` → `traefik:80`, y el **CNAME** en DNS (→
`<ID-del-túnel>.cfargotunnel.com`, proxied). Traefik rutea por `Host`.
