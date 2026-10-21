# Producción multi-servicio (VPS Azure + túnel Cloudflare dedicado)

Stack para servir **varios servicios de varios dominios** desde un único VPS de
Azure, detrás de un túnel Cloudflare **nuevo y dedicado**. Un solo `cloudflared`
y un solo **Traefik** alcanzan para todos los dominios: Traefik rutea por `Host`.

```
internet ──HTTPS──> Cloudflare (termina TLS)
   dominioA, dominioB, ...  (cada uno = un Public Hostname del túnel)
      └──túnel saliente──> cloudflared ──red `prod_web`──> Traefik ──┬─> app1
                                                                     └─> app2
```

- **Cero puertos abiertos** en el VPS: `cloudflared` solo hace conexiones
  salientes. No hace falta IP pública, ni 80/443, ni certificados en el origen.
- **TLS, WAF, caché y DDoS** los pone Cloudflare en el borde.
- Agregar un dominio = 3 pasos, siempre iguales (más abajo).

---

## Puesta en marcha (una sola vez)

### 1. Crear el túnel nuevo en Cloudflare

Dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel** →
tipo **Cloudflared** → nombre, por ej. `azure-prod`.

Al crearlo te muestra el comando `cloudflared ... run --token eyJh...`.
**Copiá solo el token** (la parte `eyJh...`) — es lo que va en `TUNNEL_TOKEN`.

### 2. Levantar el stack en el VPS

```sh
git clone https://github.com/pel-matiasvaldivia/infra.git
cd infra/prod
cp .env.example .env
nano .env            # pegá TUNNEL_TOKEN y poné los dominios reales
docker compose up -d
```

Verificá que el connector quedó sano:

```sh
docker logs cloudflared --tail 20     # debe decir "Registered tunnel connection"
```

En el dashboard, el túnel `azure-prod` debería figurar **HEALTHY**.

### 3. Publicar los dominios (pasos 1-2-3 por servicio, ver abajo)

---

## Agregar un servicio / dominio

Siempre son **3 pasos**:

### Paso 1 — DNS en Cloudflare (lo hacés a mano)

Dashboard → **DNS** del dominio → agregar registro:

| Tipo  | Nombre        | Destino                               | Proxy        |
|-------|---------------|---------------------------------------|--------------|
| CNAME | `app1`        | `<ID-del-túnel>.cfargotunnel.com`     | 🟠 Proxied   |

El `<ID-del-túnel>` lo ves en la URL del túnel o en su página de configuración.
Para un dominio de otra zona, el CNAME va en esa zona (todas en tu cuenta CF).

### Paso 2 — Public Hostname en el túnel

Dashboard → túnel `azure-prod` → **Public Hostnames → Add a public hostname**:

- **Subdomain / Domain**: `app1.pymesenlinea.com.ar`
- **Service**: `HTTP`  →  `traefik:80`

> Todos los dominios apuntan al **mismo** `traefik:80`. Quien decide a qué
> contenedor va cada uno es Traefik, según el `Host` (paso 3).

### Paso 3 — Servicio + labels en el compose

En `compose.yaml`, copiá un bloque de servicio (`app1`/`app2`), poné la imagen
real y el `Host`:

```yaml
  miservicio:
    <<: *comun
    image: ghcr.io/pel-matiasvaldivia/miservicio:latest
    container_name: miservicio
    labels:
      - traefik.enable=true
      - traefik.http.routers.miservicio.rule=Host(`app1.pymesenlinea.com.ar`)
      - traefik.http.routers.miservicio.entrypoints=web
      - traefik.http.services.miservicio.loadbalancer.server.port=80   # puerto INTERNO del contenedor
    networks: [web]
```

Aplicá los cambios:

```sh
docker compose up -d
```

### Verificar

```sh
curl -I https://app1.pymesenlinea.com.ar      # → HTTP/2 200
```

Si querés chequear sin salir a internet (desde el VPS, por la red interna):

```sh
docker exec cloudflared wget -qO- --header="Host: app1.pymesenlinea.com.ar" http://traefik:80
```

---

## Notas

- `server.port` en los labels es el puerto **interno** del contenedor (donde
  escucha la app), no un puerto publicado. No se publica ningún puerto al host.
- Los servicios de ejemplo usan `traefik/whoami` solo para probar el camino:
  reemplazalos por tus servicios reales.
- Imágenes privadas en GHCR: hacé `docker login ghcr.io` en el VPS, o publicá
  el paquete, antes de `docker compose up -d`.
- El `.env` con el `TUNNEL_TOKEN` es un secreto y está en `.gitignore`: no se
  commitea nunca.
