# Social Studio — Postiz Integration Plan

**Status:** Initial implementation committed to feature branch; VPS/provider onboarding and runtime validation remain  
**Date:** 2026-11-24  
**Amaavigo repo:** `amaavigo-crypto/Lead-Gen`  
**Branch:** `feature/social-studio-postiz-integration`  
**Base:** `main` at `5c768d739377c29d9e5613697c269127603d1df0`

## Implementation snapshot — 2026-11-24

The initial Social Studio implementation has been prepared on `feature/social-studio-postiz-integration`:

- New Social Studio navigation and dedicated customer-facing screens (overview, channels, composer, calendar, posts, media library and analytics).
- Server-only Postiz Public API client with encrypted per-tenant API keys and a validation step that compares Postiz `/me` organization ID with the selected Amaavigo tenant mapping.
- Platform Console tenant provisioning UI. This deliberately uses one manually created Postiz Organization + API key per Amaavigo tenant because the self-hosted Public API does not document arbitrary Organization creation/key issuance.
- Connect, reconnect, disconnect, channel listing, post listing, draft / publish-now / schedule, deletion and provider analytics integration.
- Tenant-owned Company Assets are streamed server-to-server into the tenant's Postiz media library.
- Request de-duplication prevents accidental repost after uncertain network outcomes.
- Channel removal includes an explicit destructive warning: Postiz's public delete-channel endpoint also deletes associated Postiz posts and may delete whole cross-channel post groups; there is no non-destructive disconnect endpoint in the inspected self-hosted Public API.
- AI caption drafting uses the existing OpenAI tenant quota and usage ledger.
- Tenant module permissions separate Social Studio access from publishing/scheduling permission.
- A branch-scoped GitHub Actions production bundle build (Node.js 22, `npm ci`, `npm run build`) passed on commit `ff5ebb3538957d414c2165973fe4849494b8689c`. The repository-wide `npm run lint` currently reports legacy type errors outside Social Studio; the branch CI runs the production bundle build and does not suppress or rewrite those unrelated modules.
- Self-hosted Docker Compose, Nginx reverse-proxy example, secret template and deployment runbook.

**Not yet completed outside this repository:** no VPS has been changed, no Postiz containers have been started, no provider developer credentials have been supplied, no external app reviews have been completed, and no social-account publish test has been run. Build/type-check/runtime QA must be run against the assembled branch before customer rollout. The AGPL-3.0 commercial deployment model requires legal review.

---

## 1. Product decision

Amaavigo will remain one application with two product workspaces:

1. **Lead Generation** — existing CRM, inbox, AI agents, lead databases, campaigns and automations. Existing behaviour must remain unchanged.
2. **Social Studio** — social account connections, content creation, media, publishing, scheduling, calendar and social analytics.

A workspace/product switcher will sit in the shared application shell. Both workspaces use the same Amaavigo sign-in, tenant, team and billing identity. Social Studio gets its own navigation and screens.

**Proposed implementation:** self-host Postiz as a separate publishing service on the existing Ubuntu VPS. Build the customer-facing Social Studio interface natively in Amaavigo. Amaavigo's backend calls Postiz's Public API; the browser never receives Postiz API keys or provider tokens.

## 2. What Postiz will and will not do

Postiz self-hosted provides the social-publishing engine: provider adapters, platform OAuth flows, channel records, media handling, post validation, immediate publishing, durable scheduling/orchestration, publishing status and supported analytics.

Postiz self-hosting does **not** remove the requirement for Amaavigo to configure its own developer applications/credentials and obtain the platform permissions/approvals required for a self-hosted integration. We configure each platform application once for the Amaavigo Postiz installation, not a separate developer application for every Amaavigo tenant. Each tenant authorizes its own social accounts.

Postiz's Public API includes connect-link support. A connect link is generated inside a particular Postiz organization, expires after one hour, can redirect the person back to Amaavigo, and allows the person to continue to the social platform without needing a Postiz user account. The link flow is only available for providers that support a normal OAuth/redirect connection; providers needing manual API keys, instance URLs, browser extensions or other special setup may still require a different connection flow.

The Postiz connect page is a Postiz-hosted interstitial before the user reaches the social network. We should not promise a fully embedded/white-labelled OAuth journey in the self-hosted version.

## 3. Tenant isolation — non-negotiable design

**One Amaavigo tenant = one dedicated Postiz Organization = one dedicated Postiz API key.**

Do not place all Amaavigo tenants inside one Postiz Organization and separate them only with Postiz customer groups. A Postiz API key is scoped to its Organization; groups are useful for grouping customer channels inside an Organization, but are not an adequate security boundary between Amaavigo tenants.

Connection and publishing flow:

1. An Amaavigo tenant is enabled for Social Studio.
2. A dedicated Postiz Organization and API key are provisioned for that tenant.
3. The Postiz Organization ID is stored as non-secret tenant integration metadata. Its API key is encrypted and stored in the tenant's server-only secrets collection.
4. A tenant admin opens **Social Studio → Connected Accounts → Connect** and chooses a provider, such as Instagram.
5. The Amaavigo backend authenticates the caller using the existing Firebase ID token and trusted tenant claims. It checks role and Social Studio entitlement.
6. The backend loads only that tenant's encrypted Postiz API key, calls Postiz's connect-link endpoint for that Organization, and returns/redirects to the one-time link.
7. The customer authorizes their own Instagram/other social account on the platform's official authorization page. They do not need to create a Postiz login for the connect-link flow.
8. Postiz stores the channel under that tenant's Postiz Organization and returns the customer to Amaavigo.
9. Amaavigo refreshes the channel list from Postiz using the same tenant-scoped key. We do not trust a tenant ID, Postiz Organization ID or API key supplied by the browser.

The same pattern applies to every tenant. A request authenticated as Tenant A can only load Tenant A's Postiz key and can never query Tenant B's Postiz Organization.

### Provisioning caveat to prove before broad rollout

The Postiz Public API documents creating connect links and managing posts/channels, but the inspected self-hosted Public API does not expose a documented general-purpose endpoint for creating arbitrary Organizations and issuing their API keys. The source contains a separate Enterprise provisioning controller, but we must not treat that internal/Enterprise route as a supported self-hosted contract.

Therefore, Phase 0 must prove the supported Postiz Organization + API-key provisioning process. The safest initial fallback is a controlled platform-admin/manual provisioning step per tenant, with the key saved into Amaavigo through a secure server-side setup path. We should automate tenant provisioning only after Postiz documents or confirms a supported method. Do not query or mutate Postiz's database directly, share one API key between tenants, or depend on undocumented Enterprise endpoints.

## 4. Amaavigo architecture

### Existing foundations to reuse

- React + Vite application shell and current authenticated session.
- Express / universal API handler in `src/server/coreApiHandler.ts`.
- Firebase Auth claims and `authenticateRequest` in `src/server/authMiddleware.ts`.
- Tenant-scoped Mongo document paths through `tenantRepo(ctx)`.
- Existing encrypted tenant secrets helpers in `src/server/cryptoUtils.ts`.
- Existing tenant integration and secrets collections.
- Existing plan/feature registry in `src/shared/features.ts` and `src/server/entitlements.ts`.
- Existing role and allowed-module conventions.

### New server-side components

Proposed files (names to be confirmed against local conventions before coding):

- `src/server/postizClient.ts` — server-only HTTP client for the configured Postiz instance; adds the tenant API key, applies timeouts, sanitizes errors and never logs credentials.
- `src/server/socialStudioService.ts` — tenant-aware application service for provisioning status, connect links, channels, media upload, posts and analytics.
- API routes in the existing universal API handler under `/api/social-studio/*`.
- New Social Studio UI components under `src/components/social-studio/`.
- New active-tab/product-workspace types and navigation support.

All Social Studio API routes must call `authenticateRequest` (or the established equivalent in the request handler), derive `tenantId` from verified claims, and use `tenantRepo(ctx)`. No Social Studio route may accept a caller-selected tenant ID as its security scope.

### Tenant data

- `tenants/{tenantId}/integrations/postiz`: non-secret metadata such as provisioning status, Postiz Organization ID, instance identifier, connection status and timestamps.
- `tenants/{tenantId}/secrets/postiz_api_key`: encrypted Postiz API key, server-only.
- Optional small tenant-scoped mapping/audit records for Amaavigo post IDs, Postiz post IDs and user actions. Postiz remains the source of truth for scheduled/published post state; do not build a second scheduler or duplicate the complete Postiz post database in MongoDB.

Do not reuse or overwrite the existing `instagram` integration/token used for Instagram messaging. Instagram DM/messaging access and Instagram publishing channels are distinct connections with different scopes and lifecycles.

## 5. Social Studio product scope

### First release

1. **Social Studio Home** — channel connection summary, upcoming posts, recent publication results and quick actions.
2. **Connected Accounts** — connect, list, refresh/reconnect and disconnect eligible providers; show account identity, provider and connection health.
3. **Create Post** — caption, media, platform selection, per-platform variations/settings, preview, save draft, publish now or schedule.
4. **Content Calendar** — month/week/day views, scheduled and published items, status and edit/cancel actions where supported.
5. **Posts** — drafts, queued/scheduled, published and failed items; detail view and safe retry.
6. **Media Library** — choose existing tenant assets or upload new images/videos; keep asset access tenant-scoped.
7. **Analytics** — channel analytics and supported per-post metrics, with clear unavailable/unsupported states.

### Later releases

- AI caption, hashtag and content-idea generation.
- Cross-platform content adaptation.
- Approval workflows and team collaboration.
- Recurring/recycled posts, RSS or automation triggers.
- Additional provider-specific capabilities after validating the Postiz API and the platform's rules.

The first release should prioritize a reliable Instagram image/Reel/carousel flow plus a small set of additional high-value providers confirmed in the live Postiz provider list. We should not promise every feature supported by a platform's native app.

## 6. Proposed Amaavigo API boundary

The browser talks only to Amaavigo. Amaavigo talks server-to-server to Postiz.

Initial route contract (final request/response schemas to be written during implementation):

- `GET /api/social-studio/status` — Social Studio entitlement and Postiz provisioning state.
- `GET /api/social-studio/channels` — channels for the authenticated tenant.
- `POST /api/social-studio/connect/:provider` — create a short-lived connection link.
- `DELETE /api/social-studio/channels/:channelId` — disconnect a channel after ownership validation.
- `POST /api/social-studio/media` — upload selected tenant media to Postiz.
- `GET /api/social-studio/posts` — list posts for calendar and status views.
- `POST /api/social-studio/posts` — create a draft, immediate or scheduled post.
- `DELETE /api/social-studio/posts/:postId` — cancel/delete a not-yet-published post where supported.
- `GET /api/social-studio/analytics` — channel/post analytics supported by Postiz.

For every mutation, the backend must verify that referenced channel/post IDs belong to the tenant's Postiz Organization. Use Postiz's validation responses to show understandable platform-specific errors.

### Media flow

Amaavigo assets may be private or authenticated. Do not pass a private asset URL to Postiz and assume Instagram can fetch it. The preferred flow is server-to-server: authenticate the tenant, resolve the tenant-owned asset using the existing asset service, stream the file to Postiz's upload API, then use the returned Postiz media reference in the post. Enforce file type/size constraints and never allow a tenant to upload another tenant's asset.

### Scheduling and status

Postiz owns publish timing, background jobs, retries and provider publishing state. Amaavigo must not schedule a second independent publish job for the same post. Store the Postiz post ID and minimal tenant-side metadata for navigation/audit. Use supported Postiz webhook events if the self-hosted API provides the required lifecycle; otherwise refresh status through the Public API with bounded polling.

Use idempotency protection in Amaavigo so a repeated browser request or network retry cannot create duplicate posts. Treat an ambiguous publish result carefully: do not automatically resubmit a post if Postiz may already have accepted it.

## 7. Postiz VPS deployment

Run Postiz as an independent application stack on the existing Ubuntu VPS, not inside the Amaavigo process and not on Amaavigo's MongoDB.

Expected components:

- Postiz frontend
- Postiz NestJS backend
- Postiz Temporal orchestrator/worker
- PostgreSQL dedicated to Postiz
- Redis dedicated to Postiz
- Postiz-supported media/object storage
- HTTPS reverse proxy and a dedicated hostname (proposed: `publisher.amaavigo.com`)

Keep PostgreSQL, Redis and Temporal private; expose only the required web/API endpoints. Configure persistent volumes, backups, log rotation, health checks, resource limits and a documented upgrade/migration process. Enable Postiz token encryption at rest and keep provider app secrets in the deployment's secret manager/environment, never in the Git repository.

Before installation, inspect the VPS CPU/RAM/disk use and current service ports. Do not assume the existing host has enough free resources without checking. Keep Postiz's storage and backup lifecycle independent from MongoDB.

## 8. Platform app credentials and approvals

Configure each provider's developer application/credentials once in the self-hosted Postiz installation. Customers then authorize their own accounts through those shared Amaavigo-owned applications.

For each provider, maintain a checklist of:

- Developer app ownership and production status.
- Exact OAuth callback/redirect URLs for the Postiz hostname.
- Required scopes/permissions and app-review/Advanced Access status.
- Account eligibility and platform publishing restrictions.
- Token validity/reconnect behaviour and rate limits.
- Any provider features that cannot be automated or connected with Postiz's connect-link flow.

Do not assume the existing Instagram messaging connection is sufficient for publishing. Check the permissions and app configuration separately; keep messaging and publishing credentials/lifecycles independent. Meta approval for messaging does not automatically grant content-publishing access.

## 9. Roles, plans and tenant controls

Add a Social Studio feature entitlement (proposed key: `social_studio`) to Amaavigo's feature registry and map it to the new product workspace. The Platform Console should control which plans include the module.

Add explicit Amaavigo-side limits (to be agreed with product pricing), such as maximum connected channels and optionally monthly scheduled/published posts. Postiz self-hosted may be unlimited, but Amaavigo must still enforce the limits sold in its own plans.

Proposed permissions:

- Tenant admin: connect/disconnect social accounts, manage publishing settings and manage team permissions.
- Authorized publisher: create, edit, schedule and publish posts.
- Draft-only member: prepare drafts but cannot publish or connect accounts.
- Platform admin: inspect provisioning status and resolve tenant setup issues, but cannot casually browse customer social content.

Enforce permissions in the backend, not only by hiding UI controls. Log connection, disconnection, post creation, scheduling, publishing, cancellation and failure/retry actions to the tenant audit trail.

## 10. Phased delivery plan

### Phase 0 — feasibility spike / go-no-go

Use one internal Amaavigo test tenant and test social accounts. No production tenant rollout yet.

1. Deploy a disposable Postiz test instance or use an isolated test deployment.
2. Configure one provider app, starting with Instagram publishing.
3. Prove a dedicated Postiz Organization and API key can be provisioned through a supported process.
4. Use the Public API to create a connect link scoped to that organization.
5. Complete the OAuth flow as a person without a Postiz login; verify redirect back to Amaavigo.
6. Confirm the account appears only in that Postiz Organization.
7. Upload a tenant-owned image through Amaavigo server-to-server and Postiz's upload API.
8. Create a draft, publish-now post and scheduled post; verify post status and permalink.
9. Verify a second test tenant with a different Postiz API key cannot list the first tenant's channels or posts.
10. Confirm the exact Meta publishing permissions and approval requirements.
11. Review AGPL-3.0 obligations with counsel before commercial rollout.

**Exit criteria:** reliable tenant provisioning/key management, successful connect/publish/schedule lifecycle, proven isolation, media upload and acceptable licensing path. If the self-hosted edition has no supported organization-provisioning method, decide whether to use manual provisioning, obtain Postiz Enterprise support/licensing, or choose another integration architecture before building the complete module.

### Phase 1 — foundation

- Add workspace switcher and feature entitlement.
- Add secure Postiz instance configuration and tenant provisioning status.
- Add encrypted tenant API key storage and admin-only provisioning workflow.
- Add backend Postiz client and tenant-isolated channels/connect routes.
- Add channel connection UI and internal test coverage.

### Phase 2 — publishing MVP

- Add media upload, composer, platform-specific validation and previews.
- Add draft, publish-now and scheduled post endpoints.
- Add calendar and post status screens.
- Implement idempotency, failure handling and audit logs.

### Phase 3 — analytics and additional providers

- Add analytics screens.
- Add providers in priority order after verifying connect-link eligibility, permissions and test account behaviour.
- Add team approvals and AI content assistance after the core publishing path is stable.

### Phase 4 — tenant rollout

- Internal Amaavigo tenant first.
- One pilot customer tenant.
- Then staged enablement for all eligible tenants.
- Monitor publishing failures, OAuth reconnects, API quotas, Postiz worker health and storage usage.

## 11. Risks and decisions to resolve before full implementation

1. **Organization provisioning is the main architecture gate.** The documented Postiz Public API supports connect links and publishing for an existing Organization; the inspected public API does not document creating Organizations and issuing API keys. Validate the supported route before automating tenant onboarding.
2. **AGPL-3.0:** Postiz permits commercial use, but network use of modified covered software carries source-disclosure obligations. Keep Postiz as a distinct service and obtain legal advice on the exact deployment/integration model before release.
3. **Provider approvals:** self-hosting does not bypass platform app review or permissions.
4. **Connect UI branding:** connect links take users through a Postiz-hosted interstitial before the native platform authorization screen.
5. **Provider parity:** not every provider supports connect links or every native-platform capability through its API.
6. **VPS capacity:** Postiz adds several persistent services; inspect available resources before deploying.
7. **Instagram DM vs publishing:** keep the existing tenant-scoped Instagram messaging integration separate from the new Postiz publishing channel.

## 12. Initial implementation guardrails

- Work only on `feature/social-studio-postiz-integration`.
- Do not merge into `main`, change the production branch, create a Vercel project, or deploy without a separate explicit request.
- Preserve existing Lead Generation navigation, CRM, inbox, WhatsApp, Instagram messaging and tenant data behaviour.
- Do not add Postiz secrets, provider credentials, tokens or customer media to Git.
- Do not call undocumented Enterprise provisioning routes or write directly to Postiz's database as a shortcut.
- Keep every Postiz API request tenant-scoped and server-side.
- Do not start the full UI build until Phase 0 proves the tenant provisioning and isolation design.
