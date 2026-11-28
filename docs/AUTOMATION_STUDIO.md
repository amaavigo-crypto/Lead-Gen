# Amaavigo Automation Studio

AI-first workflow creation with deterministic execution. The AI creates a validated draft; the worker runs only registered actions. Generated JavaScript, SQL, shell commands and arbitrary HTTP actions are not executable.

## Triggers
- Webhook: tenant-specific endpoint using HMAC-SHA256 over timestamp + dot + exact raw request bytes, with a five-minute replay window. Headers: X-Amaavigo-Timestamp, X-Amaavigo-Signature (sha256=hex), optional X-Event-Id.
- Stripe: customer configures the endpoint in Stripe and supplies its endpoint signing secret. Amaavigo verifies the Stripe-Signature timestamp and v1 digest over raw bytes.
- Native: lead.created, lead.updated and inbox.message_received.
- Schedule: recurring interval from five minutes to thirty days.
- Manual: admin-triggered one-time run.

Creating a webhook does not register it at an arbitrary provider automatically. Provider setup is manual unless a dedicated adapter exists.

## Registered steps
send_email uses the tenant-aware existing sender and optional saved campaign template. send_whatsapp_template uses an approved connected Meta template. update_lead is restricted to an allow-list of CRM profile fields. condition supports registered comparisons and branches. delay and wait_for_event are persisted waits; no worker sleeps. stop ends a branch. A no-reply flow can wait for inbox.message_received matched against the same lead ID and follow up only on timeout.

## Safety and lifecycle
Drafts and workflow versions are immutable and checksummed. Sample mapping tests are dry-run only; webhook activation additionally requires a valid signed provider test event. Admin activation binds approval to the exact workflow version and SHA-256 hash. Edits invalidate approvals and endpoint tests. Secret values are encrypted in the tenant secrets collection and never returned by list APIs or included in AI prompts. Deterministic run IDs deduplicate provider retries. Atomic step claims prevent concurrent sends; an ambiguous worker interruption becomes needs_review rather than automatic replay.

## Storage and runtime
Tenant collections: automations, automation_versions, automation_endpoints, automation_approvals, automation_runs, automation_run_steps, and existing tenant secrets/usage. Global automation_webhook_routes stores only opaque endpoint-to-tenant routing metadata. The long-running VPS worker advances schedules, delayed runs, event waits and queued steps. The Vercel catch-all preserves raw request bytes for signature checks while retaining JSON and URL-encoded request body parsing for existing APIs.
