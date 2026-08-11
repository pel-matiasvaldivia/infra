# pulumi — Cloudflare como código

Proyecto Pulumi (TypeScript) que maneja la parte de Cloudflare del despliegue:
el túnel, su ingress y el DNS. Opcionalmente empuja el stack al VPS por SSH.

## Recursos que crea

| Recurso | Qué hace |
|---|---|
| `random.RandomBytes` | Secreto de 32 bytes del túnel |
| `cloudflare.ZeroTrustTunnelCloudflared` | El túnel (gestionado localmente) |
| `cloudflare.ZeroTrustTunnelCloudflaredConfig` | Ingress: `hostname → http://traefik:80` |
| `cloudflare.Record` | CNAME proxied → `<tunnel-id>.cfargotunnel.com` |
| `command.remote.*` | (opcional) copia el compose y corre `docker compose up` |

El **token del connector** se deriva del túnel y se expone como output secreto
(`tunnelTokenOut`); es lo que consume `cloudflared` en el compose.

## Config

| Clave | Requerida | Default |
|---|---|---|
| `accountId` | sí | — |
| `zoneId` | sí | — |
| `hostname` | sí | `demo.itier.pymesenlinea.com.ar` |
| `tunnelName` | no | `itier-demo` |
| `landingImage` | no | `ghcr.io/pel-matiasvaldivia/itier-landing:latest` |
| `deployToVps` | no | `false` |
| `vpsHost` / `vpsUser` / `vpsSshKey` | si `deployToVps` | — |

Secretos:

```sh
export CLOUDFLARE_API_TOKEN=<token>      # o: pulumi config set --secret cloudflare:apiToken <token>
pulumi config set --secret vpsSshKey -- "$(cat ~/.ssh/id_demo)"   # solo si deployToVps=true
```

El API token necesita: `Account:Cloudflare Tunnel:Edit` y `Zone:DNS:Edit`.

## Comandos

```sh
npm install
pulumi stack select demo
pulumi preview            # ver qué haría
pulumi up                # aplicar
pulumi stack output tunnelTokenOut --show-secrets   # token para el VPS
pulumi destroy           # desmontar
```

## Versión del provider

Fijado a `@pulumi/cloudflare` **v5.x**. La v6 renombró varios recursos
(`Record` → `DnsRecord`, entre otros); si actualizás, ajustá `index.ts`.
