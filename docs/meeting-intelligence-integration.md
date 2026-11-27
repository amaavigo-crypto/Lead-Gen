# Meeting Intelligence integration (Lead Gen)

The integration is committed on `feature/unified-inbox-redesign`. These commits do not deploy either service.

## Server environment

Set on the Lead Gen GoDaddy VPS (server-side only):
- `MEETING_INTELLIGENCE_API_URL=https://meetings.amaavigo.com`
- `MEETING_INTELLIGENCE_API_KEY`: same value as Meeting Intelligence `SERVICE_API_KEY`
- `MEETING_INTELLIGENCE_WEBHOOK_SECRET`: same value as Meeting Intelligence `WEBHOOK_SIGNING_SECRET`

On the Meeting Intelligence service:
- `UMRAH_WEBHOOK_URL=https://leads.amaavigo.com/api/webhooks/meeting-intelligence`
- `SERVICE_API_KEY` must match Lead Gen `MEETING_INTELLIGENCE_API_KEY`.
- `WEBHOOK_SIGNING_SECRET` must match Lead Gen `MEETING_INTELLIGENCE_WEBHOOK_SECRET`.

Do not use client-side Vite variables for these secrets and do not commit them.

## Booking -> Meeting Intelligence

The `createGoogleCalendarDemoBooking` service submits a meeting only when all four consent attributes are supplied:
- `recordingConsent === true`
- `recordingConsentAt` (ISO timestamp recorded when the operator confirms the attendee's consent in the booking modal)
- `recordingConsentSource` (`attendee_form`, `attendee_chat`, `attendee_email`, or `attendee_whatsapp`)
- `recordingConsentTextVersion`

**Manual booking UI:** the Demo Scheduling quick-book modal has an unchecked consent confirmation. It shows the disclosure and requires the operator to confirm that the attendee has actually agreed, then select how that attendee consent was received. Selecting the control is an operator attestation; it is not an attendee self-service consent form and does not independently prove the attendee's choice. The operator must not select it unless consent was genuinely given and documented.

**AI-chat and inbound lead booking:** these paths do not set recording consent and therefore do not schedule a recording bot. They remain recording-disabled until attendee-facing consent is implemented in those flows and evidence is persisted. Do not treat a booking, calendar invite, joining the Meet, or an operator's preference as participant consent.

The tenant ID is resolved from the current server-side tenant context. The external booking ID is the existing Firestore booking ID, making the create request idempotent.

## Reschedule and cancellation

When a consented booking is rescheduled, Lead Gen updates the existing Meeting Intelligence job with the replacement Google Meet link and time before releasing the old calendar event. If the meeting job cannot be moved, the CRM restores the original booking and does not silently leave the bot at the old time.

When a consented booking is cancelled, Lead Gen cancels the bot job before deleting the Google Calendar event. If the bot cannot be cancelled, the calendar booking is left active. If calendar deletion fails after bot cancellation, the original booking and pending bot schedule are restored where possible.

The Meeting Intelligence service only accepts a reschedule for jobs that have not started (and have no joined/recording timestamps). A meeting already joined or recording is not silently moved or cancelled by this path.

## Meeting Intelligence -> Lead Gen

- `POST /api/webhooks/meeting-intelligence` receives the raw JSON body and verifies HMAC-SHA256 using `X-Amaavigo-Signature` before parsing or processing.
- The signed envelope contains `tenant_id`, `external_booking_id`, `meeting_id`, `event_id`, `type` and `data`.
- Before applying the event, the receiver reads the authoritative meeting status from the service and verifies tenant and booking identity. This prevents delayed webhook retries from reverting a newer schedule state.
- Events update the corresponding `tenants/{tenantId}/bookings/{bookingId}` record and linked CRM lead under the same tenant scope.
- Event receipts are stored under the tenant and deduplicated by event ID.
- `GET /api/meetings/intelligence/{bookingId}` is an authenticated workspace API. It uses the authenticated tenant from the session to retrieve status, report, transcript and a 15-minute R2 recording URL. It does not accept a tenant ID from the browser.

## Required validation before customer activation

1. Configure the secrets above on both servers without committing them.
2. Test that an invalid callback signature returns 401 and a duplicate event is acknowledged without duplicate side effects.
3. Test that an event for one tenant cannot update another tenant's booking.
4. Implement attendee-facing opt-in for AI-chat and inbound booking paths; review the disclosure and retention policy with appropriate counsel.
5. Test booking, cancellation, rescheduling, recording, AssemblyAI diarization, AI report, webhook delivery and CRM retrieval in an internal, explicitly consented test meeting.
6. Only then bundle changes into one controlled VPS deployment. No deployment is triggered by these branch commits.
