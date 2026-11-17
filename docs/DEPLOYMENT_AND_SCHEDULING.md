# Deployment and background scheduling

Amaavigo is a Node.js application, not a Vercel-only application. Vercel can be used for the current build/preview stage, while the same codebase can later run on a Node 22 VPS or container host (for example, a GoDaddy VPS). The database and third-party integrations remain external to the web host.

## External scheduler (serverless hosting)

Do not configure Vercel Cron for this project. Configure an external cron service (for example, cron-job.org or an equivalent scheduler) to make the following **POST** requests every five minutes:

| Job | Request path | Purpose |
| --- | --- | --- |
| Campaign processing | `/api/campaigns/process-active` | Processes the next batch of active email/SMS campaigns and scheduled campaign sends |
| Inbound mailbox polling | `/api/inbound-mail/cron` | Polls tenant mailboxes and retries pending website-lead thank-you emails |
| AI follow-up worker | `/api/auto-followup/trigger` | Processes due auto follow-ups and the worker tasks included by this route |

For every job, configure:

- Method: `POST`
- Schedule: `*/5 * * * *` (every five minutes)
- Header: `Authorization: Bearer <CRON_SECRET>`
- Body: empty
- URL: `https://<your-hostname><request-path>`

Set the same `CRON_SECRET` value in the application host's environment variables and in the scheduler's protected header configuration. Generate a long random value (for example, `openssl rand -hex 32`). Do not put the secret in the URL, request body, source code, or a committed configuration file.

The API routes verify this bearer token before running work across tenants. Keep the secret private and rotate it in both places if it is exposed. Check each scheduler execution for a successful HTTP response; a scheduler reporting only that it sent the request is not proof that the worker completed.

The Vercel function duration remains capped by `vercel.json` (currently 60 seconds). Use a scheduler with an HTTP timeout that accommodates the function's configured limit. If the number of tenants or workload grows beyond that limit, split the work into smaller queue/worker units rather than increasing a serverless request indefinitely.

## Always-on Node.js host

The standalone Express server can run the API, frontend assets, mailbox poller, and in-process background workers. For a production Node host, build the portable entrypoint and run it with plain Node (no TypeScript runtime is needed in production):

```bash
npm ci
npm run build
npm run build:server
npm prune --omit=dev
npm run start:prod
```

By default, `BACKGROUND_WORKERS_ENABLED` is enabled (unless set to `false`). In this mode, the server starts its own tenant mailbox poller and background worker cycle. **Do not also configure external cron jobs for the same worker tasks**, or the same work will be needlessly invoked twice. Distributed job leases protect supported worker cycles, but they are not a reason to run duplicate schedulers.

To use the external scheduler on an always-on host instead, set:

```dotenv
BACKGROUND_WORKERS_ENABLED=false
```

Then configure the same three external jobs listed above. This is the intended mode when you want the scheduler to control worker timing independently of the web process.

## Docker / VPS deployment

A Dockerfile is included for a portable Node 22 deployment. Build the image from the repository root:

```bash
docker build -t amaavigo-app .
```

Run it with an environment file that contains the application's required production secrets/configuration:

```bash
docker run -d   --name amaavigo-app   --restart unless-stopped   --env-file .env   -p 3000:3000   amaavigo-app
```

Configure TLS and the public hostname through a reverse proxy in front of the container. Keep MongoDB and other managed services reachable from the host, and restrict database/network access to the deployed server where practical. Do not bake `.env` files or credentials into the image.

For GoDaddy, choose a plan that supports a continuously running Node.js 22 process or Docker (a VPS is the most flexible option). Verify the capabilities of the exact plan before purchasing; shared hosting and VPS plans do not provide the same process, networking, or container controls.

## Environment variables

Use `.env.example` as the starting point. At minimum, configure the same production values currently used by the app: MongoDB, Firebase Admin/Auth, encryption keys, AI provider keys, email provider, Stripe/Meta integrations, webhook secrets, and `CRON_SECRET` when external scheduling is enabled. Keep production and preview credentials separate.

`PORT` is read from the environment and defaults to `3000`. The container exposes port `3000`; the reverse proxy can map a public HTTPS hostname to it.
