# Plantilla de proyecto desplegable

Copiá estos archivos en cada proyecto nuevo (o convertí un repo con esto en
**template repository** en GitHub: Settings → *Template repository* → ✓, y
después "Use this template" para cada proyecto).

```
tu-proyecto/
├── .github/workflows/deploy.yml   llama al pipeline de infra (editás el `with:`)
├── deploy/compose.yaml            cómo corre el servicio en el VPS (no se toca casi)
├── Dockerfile                     el build de tu app (reemplazá el ejemplo)
└── index.html                     ejemplo; borralo cuando pongas tu app
```

## Qué editar

Solo el bloque `with:` en **`.github/workflows/deploy.yml`**:

```yaml
    with:
      service: tu-proyecto                               # nombre (imagen + proyecto)
      staging_host: tu-proyecto.staging.pymesenlinea.com.ar
      prod_host: tu-proyecto.pymesenlinea.com.ar
      port: 80                                           # puerto interno del contenedor
```

## Cómo funciona

```
push a staging ─► build imagen → GHCR ─► deploy en VPS deployments (runner `staging`)
push a main    ─► build imagen → GHCR ─► deploy en VPS Azure        (runner `prod`)
```

El deploy lo corre un self-hosted runner dentro del VPS (ver
[`infra/base/README.md`](../base/README.md)). No se abren puertos: el servicio
se engancha a la red `edge` y Traefik lo publica por el túnel según su `Host`.

## Alta de dominios (una vez por servicio)

1. **DNS** en Cloudflare: `CNAME` `tu-proyecto` → `<ID-túnel>.cfargotunnel.com` (proxied).
   Lo hacés en el túnel de staging y en el de producción, con el host de cada uno.
2. **Public Hostname** en cada túnel: `tu-proyecto[.staging].pymesenlinea.com.ar`
   → `HTTP` → `traefik:80`.
3. Pusheás a `staging` / `main` y listo.

## Checklist por proyecto nuevo

- [ ] Copiar esta plantilla al repo.
- [ ] Poner el `Dockerfile` real y borrar `index.html`.
- [ ] Editar `service` / `*_host` / `port` en `deploy.yml`.
- [ ] Registrar los runners `staging` y `prod` en el repo (o usar los de la org).
- [ ] Dar de alta DNS + Public Hostname en ambos túneles.
