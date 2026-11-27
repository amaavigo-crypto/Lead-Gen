# Meeting Intelligence integration (Lead Gen)

This integration is being developed on `feature/unified-inbox-redesign`; it does not change the active deployment by itself.

## Server environment

Set on the Lead Gen GoDaddy VPS (server-side only):
- `MEETING_INTELLIGENCE_API_URL=https://meetings.amaavigo.com`
- `MEETING_INTELLIGENCE_API_KEY`: same value as Meeting Intelligence `SERVICE_API_KEY`
- `MEETING_INTELLIGENCE_WEBHOOK_SECRET`: same value as Meeting Intelligence `WEBHOOK_SIGNING_SECRET`

On the Meeting Intelligence VPS service:
- `UMRAH_WEBHOOK_URL=https://leads.amaavigo.com/api/webhooks/meeting-intelligence`
- `SERVICE_API_KEY` must match Lead Gen `MEETING_INTELLIGENCE_API_KEY`.
- `WEBHOOK_SIGNING_SECRET` must match Lead Gen `MEETING_INTELLIGENCE_WEBHOOK_SECRET`.

Do not use client-side Vite variables for these secrets and do not commit them.

## Booking -> Meeting Intelligence

The `createGoogleCalendarDemoBooking` service has an explicit consent gate. It will submit a meeting only when all of the following are supplied from an attendee opt-in record:
- `recordingConsent === true`
- `recordingConsentAt` (ISO timestamp)
- `recordingConsentSource` (`attendee_form`, `attendee_chat`, `attendee_email`, or `attendee_whatsapp`)
- `recordingConsentTextVersion`

The tenant ID is resolved from the current server-side tenant context. The external booking ID is the existing booking ID, making retries idempotent. An ordinary booking or AI scheduling conversation does not imply recording consent and does not schedule recording.

**Consent UX still required:** wire an attendee-facing affirmative opt-in and persist its evidence before passing the four consent fields. Do not let a workspace operator's booking action, a pre-checked box, or the attendee merely joining the Meet call count as consent. Customer recording remains inactive for any path that does not provide verified consent evidence. Reschedule and cancellation actions must also be synchronized to the Meeting Intelligence schedule before enabling unattended customer recordings.

## Meeting Intelligence -> Lead Gen

- `POST /api/webhooks/meeting-intelligence` receives raw JSON and verifies HMAC-SHA256 using `X-Amaavigo-Signature` before parsing/processing.
- The signed envelope contains `tenant_id`, `external_booking_id`, `meeting_id`, `event_id`, `type` and `data`.
- Events update the corresponding `tenants/{tenantId}/bookings/{bookingId}` record and its linked CRM lead under the same tenant scope.
- Event receipts are stored under that tenant, and retries are deduplicated by event ID.
- `GET /api/meetings/intelligence/{bookingId}` is an authenticated workspace API. It uses the authenticated tenant from the session to retrieve status, report, transcript and a 15-minute R2 recording URL. It does not accept a tenant ID from the browser.

## Required validation before deployment

1. Configure the secrets above on both servers without committing them.
2. Test the callback signature with a controlled event and verify invalid signatures return 401.
3. Test that an event for one tenant cannot update another tenant's booking.
4. Complete the attendee-facing consent UX and verify its saved evidence.
5. Test booking, cancellation, rescheduling, recording, AssemblyAI diarization, AI report, webhook delivery and CRM retrieval using an internal consented meeting.
6. Only then bundle these changes into one controlled VPS deployment. No deployment is triggered by this branch commit.
