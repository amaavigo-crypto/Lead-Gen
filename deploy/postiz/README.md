# Amaavigo Postiz deployment

This stack runs Postiz as a separate service on the Ubuntu VPS. It does not replace the Amaavigo API or MongoDB. The browser uses Amaavigo; only the Amaavigo server calls the Postiz Public API.

## Components and exposure

- Postiz app: \`ghcr.io/gitroomhq/postiz-app:v2.26.0\`
- PostgreSQL 17: Postiz application data
- Redis 7.2: Postiz queue/cache
- Temporal + its dedicated PostgreSQL and Elasticsearch: scheduled publishing/orchestration
- Local persistent volumes: Postiz config, uploads and databases
- Public hostname: \`publisher.amaavigo.com\`
- Host port: \`127.0.0.1:4007\` only

Do not publish PostgreSQL, Redis, Temporal gRPC, Elasticsearch or Temporal UI ports to the public internet. Do not point Postiz at Amaavigo's MongoDB; it requires its own PostgreSQL database.

## Before installation

1. Check available VPS RAM, CPU and disk capacity. Postiz includes a Temporal worker stack and Elasticsearch; do not start it on a VPS without adequate headroom.
2. Create an A record for \`publisher.amaavigo.com\` pointing to the VPS public IP.
3. Ensure ports 80 and 443 are reachable for HTTPS. The Postiz container itself is bound only to localhost port 4007.
4. Choose a persistent directory, for example \`/opt/amaavigo/postiz\`.

## Install

Copy \`docker-compose.yml\` and \`.env.example\` to \`/opt/amaavigo/postiz\`, then run:

\`\`\`bash
cd /opt/amaavigo/postiz
cp .env.example .env
chmod 600 .env
\`\`\`

Generate strong values instead of using placeholders:

\`\`\`bash
openssl rand -hex 48   # POSTIZ_JWT_SECRET
openssl rand -hex 32   # POSTIZ_ENCRYPTION_KEY (check Postiz's key format requirements for the pinned release)
openssl rand -hex 32   # POSTIZ_DB_PASSWORD
openssl rand -hex 32   # POSTIZ_TEMPORAL_DB_PASSWORD
\`\`\`

Edit \`.env\` and set \`POSTIZ_URL\`, all generated secrets, and only the provider application credentials that Amaavigo is ready to use. Keep the finished \`.env\` outside Git and restrict its permissions.

Start and inspect the stack:

\`\`\`bash
docker compose pull
docker compose up -d
docker compose ps
docker compose logs -f postiz
\`\`\`

The service listens locally at \`http://127.0.0.1:4007\`. Do not open port 4007 in the VPS firewall.

## HTTPS reverse proxy

The supplied `nginx.publisher.amaavigo.com.conf` is the final HTTPS configuration and refers to certificate files. Obtain the certificate before enabling that final file, otherwise `nginx -t` will fail because the certificate paths do not exist yet.

1. Create a temporary HTTP-only server block for `publisher.amaavigo.com` that proxies to `http://127.0.0.1:4007` and passes the Host, X-Real-IP, X-Forwarded-For and X-Forwarded-Proto headers.
2. Enable the temporary site and verify `sudo nginx -t && sudo systemctl reload nginx`.
3. Run Certbot's Nginx plugin to issue the certificate: `sudo certbot --nginx -d publisher.amaavigo.com`.
4. Replace the temporary server block with the supplied `nginx.publisher.amaavigo.com.conf`, then run `sudo nginx -t && sudo systemctl reload nginx`.

Keep the DNS A record pointed at the VPS and ports 80/443 reachable while obtaining and renewing the certificate.

## First Postiz administrator and provider setup

1. Complete the initial Postiz administrator sign-up using a controlled Amaavigo-owned admin identity. If registration is disabled before the first account exists, temporarily set \`DISABLE_REGISTRATION=false\`, recreate the Postiz container, complete the initial setup, then disable open registration again.
2. Review Postiz's current self-hosted organization and API-key management flow. For each Amaavigo tenant, create/select a dedicated Postiz Organization and create a distinct Organization API key. Do not share one API key between tenants.
3. Configure the provider applications in the Postiz environment. Meta, Google/YouTube, TikTok, LinkedIn and X require their own developer app credentials and whatever production permissions/review those networks demand. Self-hosting does not bypass those reviews.
4. Add the exact OAuth callback/redirect URLs shown by the pinned Postiz provider implementation to each provider developer console. Keep the Postiz hostname stable after provider approvals.
5. Restart Postiz after environment changes: \`docker compose up -d\`.
6. In Amaavigo Platform Console → Social Studio, select the matching tenant, enter its Postiz Organization ID and that organization's API key, and click **Verify and save**. Amaavigo checks \`/api/public/v1/me\` and rejects a key whose Organization ID does not match.

Customers connect their own social identities from Amaavigo Social Studio. They do not need to create Postiz logins to use Postiz's supported connect-link flow; they will see Postiz's connection interstitial and then authorize on the social platform.

## Backups and upgrades

Back up all persistent volumes, especially Postiz PostgreSQL, Postiz uploads/config, Redis state, and Temporal databases before upgrades. At minimum, take a consistent database dump and an off-host copy of the volume data.

Example database dump:

\`\`\`bash
docker compose exec -T postiz-postgres pg_dump -U postiz -d postiz > postiz-$(date +%F).sql
docker compose exec -T temporal-postgresql pg_dump -U temporal -d temporal > temporal-$(date +%F).sql
\`\`\`

Store dumps securely off the VPS. Test restore procedures before production use.

Upgrade deliberately: review Postiz release notes, pin the tested image tag (do not use \`latest\`), back up all volumes, pull the new image, recreate the app, and verify OAuth, channel listing, media upload, draft creation and scheduled publishing before enabling tenants again.

## Operational checks

- \`docker compose ps\` shows every required service running.
- \`https://publisher.amaavigo.com\` loads over HTTPS.
- Amaavigo can reach \`POSTIZ_BASE_URL + /api/public/v1/me\` from its server.
- Postiz provider credentials and callback URLs are configured.
- One Postiz Organization and API key exist for each Amaavigo tenant.
- Platform Console provisioning verifies the exact Organization ID before saving the encrypted key.
- A test tenant can connect one test social account, upload tenant media, create a draft, publish a test post, and schedule a second test post.
- A second tenant cannot list or publish through the first tenant's API key.

## Important limitations

- The documented self-hosted Public API supports connect links and publishing for an existing Postiz Organization; it does not document general-purpose Organization creation and API-key provisioning. The Platform Console's secure manual provisioning step is intentional until Postiz documents a supported automated process.
- Connect-link providers are limited to the integrations supported by Postiz's link flow. Some services requiring manual API keys, special instance URLs or browser extensions will not use this flow.
- Social networks still require Amaavigo-owned developer applications, OAuth callbacks, permissions and production approvals.
- Postiz is AGPL-3.0. Obtain legal review of the intended commercial network-service deployment before customer launch.
