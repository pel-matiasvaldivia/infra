/**
 * iTier — despliegue detrás de Cloudflare Tunnel, definido como código.
 *
 * Qué hace `pulumi up`:
 *   1. Crea un Cloudflare Tunnel (localmente gestionado) con un secreto propio.
 *   2. Define el ingress del túnel: el hostname público → Traefik (http://traefik:80).
 *   3. Crea el registro DNS (CNAME proxied) que apunta al túnel.
 *   4. Deriva el TUNNEL_TOKEN del connector y lo expone como output secreto.
 *   5. (Opcional, deployToVps=true) copia el compose al VPS por SSH y corre
 *      `docker compose up -d`, inyectando el token.
 *
 * El SSL lo termina Cloudflare en el edge. El VPS no abre puertos ni tiene
 * certificados: `cloudflared` sale hacia Cloudflare, no recibe conexiones.
 *
 * Provider de Cloudflare fijado a v5.x (ver package.json). Si actualizás a v6,
 * revisá los nombres de recursos (varios se renombraron).
 */

import * as pulumi from "@pulumi/pulumi";
import * as cloudflare from "@pulumi/cloudflare";
import * as command from "@pulumi/command";
import * as random from "@pulumi/random";

const cfg = new pulumi.Config();

// --- Cloudflare -------------------------------------------------------------
const accountId = cfg.require("accountId");
const zoneId = cfg.require("zoneId");
const hostname = cfg.require("hostname");
const tunnelName = cfg.get("tunnelName") ?? "itier-demo";
const landingImage =
    cfg.get("landingImage") ?? "ghcr.io/pel-matiasvaldivia/itier-landing:latest";

// --- Despliegue remoto (opcional) ------------------------------------------
const deployToVps = cfg.getBoolean("deployToVps") ?? false;
const vpsHost = cfg.get("vpsHost");
const vpsUser = cfg.get("vpsUser") ?? "deploy";
const vpsSshKey = cfg.getSecret("vpsSshKey");
const remoteDir = cfg.get("remoteDir") ?? "/opt/itier-demo";

// ---------------------------------------------------------------------------
// 1) Secreto del túnel: 32 bytes aleatorios en base64.
//    Es lo que comparten Cloudflare y el connector `cloudflared`.
// ---------------------------------------------------------------------------
const tunnelSecret = new random.RandomBytes("tunnel-secret", { length: 32 });

// ---------------------------------------------------------------------------
// 2) El túnel en sí (localmente gestionado: la config vive acá, no en el dash).
// ---------------------------------------------------------------------------
const tunnel = new cloudflare.ZeroTrustTunnelCloudflared("itier", {
    accountId,
    name: tunnelName,
    secret: tunnelSecret.base64,
    configSrc: "cloudflare",
});

// ---------------------------------------------------------------------------
// 3) Ingress del túnel: el hostname público entra a Traefik; el resto, 404.
//    Agregar otro servicio público = otra regla acá (o, mejor, un label en
//    Traefik si mandás un wildcard al proxy).
// ---------------------------------------------------------------------------
const tunnelConfig = new cloudflare.ZeroTrustTunnelCloudflaredConfig("itier", {
    accountId,
    tunnelId: tunnel.id,
    config: {
        ingressRules: [
            { hostname, service: "http://traefik:80" },
            { service: "http_status:404" },
        ],
    },
});

// ---------------------------------------------------------------------------
// 4) DNS: CNAME proxied hacia <tunnel-id>.cfargotunnel.com.
//    `proxied: true` es obligatorio para que el tráfico pase por el túnel.
// ---------------------------------------------------------------------------
const record = new cloudflare.Record("itier-landing", {
    zoneId,
    name: hostname,
    type: "CNAME",
    content: pulumi.interpolate`${tunnel.id}.cfargotunnel.com`,
    proxied: true,
    comment: "iTier landing — via Cloudflare Tunnel (gestionado por Pulumi)",
});

// ---------------------------------------------------------------------------
// 5) Token del connector. Para un túnel gestionado localmente, el token es
//    base64(JSON{ a: accountId, t: tunnelId, s: tunnelSecret }). Lo computamos
//    nosotros (estable entre versiones del provider) y lo marcamos secreto.
// ---------------------------------------------------------------------------
const tunnelToken = pulumi.secret(
    pulumi
        .all([accountId, tunnel.id, tunnelSecret.base64])
        .apply(([a, t, s]) =>
            Buffer.from(JSON.stringify({ a, t, s })).toString("base64"),
        ),
);

// ---------------------------------------------------------------------------
// 6) Despliegue remoto opcional: copiar el compose y levantarlo por SSH.
// ---------------------------------------------------------------------------
if (deployToVps) {
    if (!vpsHost || !vpsSshKey) {
        throw new Error(
            "deployToVps=true requiere 'vpsHost' y el secreto 'vpsSshKey'. " +
                "Cargalos con `pulumi config set` (ver README).",
        );
    }

    const connection: command.types.input.remote.ConnectionArgs = {
        host: vpsHost,
        user: vpsUser,
        privateKey: vpsSshKey,
    };

    // Aseguramos el directorio de despliegue en el VPS.
    const ensureDir = new command.remote.Command("ensure-dir", {
        connection,
        create: `mkdir -p ${remoteDir}`,
    });

    // Copiamos el compose del repo al VPS.
    const copyCompose = new command.remote.CopyToRemote(
        "copy-compose",
        {
            connection,
            source: new pulumi.asset.FileAsset("../stack/compose.yaml"),
            remotePath: `${remoteDir}/compose.yaml`,
        },
        { dependsOn: ensureDir },
    );

    // Escribimos el .env con el token (secreto) y la imagen.
    const writeEnv = new command.remote.Command(
        "write-env",
        {
            connection,
            create: pulumi.interpolate`cat > ${remoteDir}/.env <<'EOF'
TUNNEL_TOKEN=${tunnelToken}
LANDING_IMAGE=${landingImage}
LANDING_HOST=${hostname}
EOF
chmod 600 ${remoteDir}/.env`,
            // El token es secreto: que no se logueen los args del comando.
        },
        { dependsOn: ensureDir, additionalSecretOutputs: ["stdout", "stderr"] },
    );

    // Levantamos (o actualizamos) el stack. `--pull always` baja la última imagen.
    new command.remote.Command(
        "compose-up",
        {
            connection,
            create: `cd ${remoteDir} && docker compose --env-file .env up -d --pull always --remove-orphans`,
            // Reejecuta el up cuando cambie el compose o el token.
            triggers: [copyCompose.remotePath, tunnelToken],
        },
        { dependsOn: [copyCompose, writeEnv, tunnelConfig] },
    );
}

// --- Outputs ----------------------------------------------------------------
export const tunnelId = tunnel.id;
export const publicUrl = pulumi.interpolate`https://${hostname}`;
export const dnsRecord = record.hostname;
// Secreto: mostralo con `pulumi stack output tunnelToken --show-secrets`.
export const tunnelTokenOut = tunnelToken;
