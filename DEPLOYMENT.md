# Deployment

## Local development

1. In `backend/`, create `.env` from `.env.example` if it does not already exist. Set `MONGODB_URL` to a reachable MongoDB connection string and `JWT_SECRET` to a long random value. Keep `.env` out of source control.
2. The backend example is configured for local HTTP: `COOKIE_SECURE=false`, `COOKIE_SAME_SITE=strict`, and CORS allows Vite on port 5173 as well as the Docker frontend on port 8080.
3. Start the API from `backend/` with `npm install` and `npm run dev`. It listens on port 8000. Check `http://localhost:8000/health` for a connected database.
4. In `frontend/`, create `.env.local` from `.env.example`, set `VITE_SERVER_URL=http://localhost:8000`, and put the Firebase project's Web API key in `VITE_FIREBASE_APIKEY` if using Google sign-in. In Firebase Console, enable Google under Authentication → Sign-in method and add `localhost` under Authentication → Settings → Authorized domains. Restart Vite after changing `.env.local`.
5. Cloudinary credentials are needed only for media uploads. Without them, account signup without an avatar and other non-upload features can still be tested.

## Render

1. Push the project to a GitHub or GitLab repository and create a new Render Blueprint from that repository. Render will read `render.yaml` and create the EduTube API and static frontend services.
2. Enter the requested secret values in Render. `MONGODB_URL` must point to a MongoDB deployment whose network access permits Render. Add the Cloudinary credentials for uploads and the Firebase web API key for sign-in. Add `GEMINI_API_KEY`, `USER_EMAIL`, and `USER_PASSWORD` for AI features and email delivery. `JWT_SECRET` is generated automatically.
3. The blueprint creates `edutube-backend` and `edutube-frontend` services. If you rename either service or use a custom domain, update `VITE_SERVER_URL` on the frontend and `CORS_ORIGIN` on the backend to match.
4. Add the frontend domain to Firebase Authentication's authorized domains. After both services deploy, check `https://edutube-backend.onrender.com/health` for `{"status":"ok","database":"connected"}` and open the frontend service URL.
5. The free backend service can sleep when idle, so its first request after inactivity may take time to wake up.

## Docker Compose

1. Copy `.env.example` to `.env` and `backend/.env.example` to `backend/.env`.
2. Replace every `replace_with_...` value with the real service credentials. Keep both `.env` files out of source control.
3. Set `VITE_SERVER_URL` to the public backend URL (including `https://`) and `FRONTEND_URL` to the public frontend origin. The Firebase web API key must be set as a frontend build argument; configure the deployed frontend domain in Firebase Authentication's authorized domains.
4. For an HTTPS deployment, set `COOKIE_SECURE=true`. Use `COOKIE_SAME_SITE=none` when the frontend and API are on different sites; use `strict` for local HTTP testing.
5. Run `docker compose up --build -d`. The frontend is served on port 8080 and the API on port 8000 by default. Verify the API at `/health`; it reports unavailable until MongoDB is connected.

MongoDB must be reachable from the backend and its network/IP access list must allow the deployment host. Configure valid Cloudinary credentials for media uploads, Gemini credentials for AI search and mandatory educational-content moderation, and a Gmail app password for password-reset email and feedback delivery. Set `GEMINI_MODERATION_MODEL` to a Gemini model available to your API key; moderation fails closed (does not publish) if the model is unavailable. Set `MODERATOR_EMAILS` to a comma-separated allowlist of signed-in moderator account emails; only those accounts can open `/moderation` and approve/reject uncertain submissions. Do not leave the sample email in production. `USER_EMAIL` must be the Gmail address that generated the app password; `USER_PASSWORD` must be that account's 16-character Google App Password, not the regular Gmail password. Generate it in Google Account → Security → 2-Step Verification → App passwords, then set both variables in `backend/.env` locally or the backend service's environment settings in production. Restart/redeploy the backend after changing them. Never commit or share these credentials. `USER_EMAIL` is also used as the support contact shown on the Help page. Feedback is stored in MongoDB even if email delivery fails; the API reports that delivery failure explicitly.

Visitors can browse and use the publishing and interaction features without signing in. The backend creates a guest profile and channel and keeps the session in an HttpOnly cookie; guest publishing is limited to three successful posts per day. Clearing browser cookies loses access to that guest profile and its content. Feedback remains limited to signed-in accounts. Settings (theme, channel visibility, watch-history preference, autoplay, and language) are stored on the current MongoDB profile and synchronized with the browser session.

The video Download action saves the video to the signed-in account's Downloads list, starts copying the video into this browser's local IndexedDB storage, and opens the Downloads section under “You” so progress and speed are visible. Completed copies can play without internet from the same browser and device; they are not synced to other devices and are deleted from this device when removed from Downloads. Browser storage quotas can prevent very large videos from being saved, and the browser may clear stored data if the user clears site data. The offline app shell is cached after the first online visit and requires HTTPS in production (localhost is also treated as a secure context). A signed-in account is cached locally without credentials so its own offline Downloads can be opened while disconnected; signing out clears that cached account. The server-side account list remains synchronized when online.

Video, Short, and community-post publishing uses mandatory Gemini educational review before content is published. Uncertain AI decisions are checked a second time; if still uncertain, a moderator listed in `MODERATOR_EMAILS` must approve or reject the submission. AI review failures stop publishing rather than bypassing moderation. A confirmed non-educational violation signs the account out and temporarily blocks it for 3 hours; the owning channel's violation count is persistent, and the fifth confirmed violation permanently blocks the account. Configure and monitor the moderator allowlist before enabling this flow. Pending media is stored in Cloudinary under the `moderation-pending` folder until review; keep access to the moderation API and its URLs restricted.

For separately created Render services, set the frontend's `VITE_SERVER_URL` to the backend's public HTTPS URL and the backend's `CORS_ORIGIN` to the frontend's exact public origin (no trailing slash). `VITE_SERVER_URL` is embedded during the frontend build, so rebuild/redeploy the frontend after changing it. When unset, the frontend uses `http://localhost:8000` for local development. Confirm the backend responds at `/health` with `{"status":"ok","database":"connected"}` before testing sign-in or guest sessions. Signup and guest sessions both require a reachable backend and MongoDB.

## Direct Node deployment

Deploy `backend/` with Node.js 22 or newer, run `npm ci --omit=dev` and `npm start`, and set the variables listed in `backend/.env.example` in the hosting provider's secret/environment settings. Deploy `frontend/` as a static Vite site with `npm ci` and `npm run build`; set `VITE_SERVER_URL` and `VITE_FIREBASE_APIKEY` at build time, then publish `frontend/dist`. Configure backend `CORS_ORIGIN` to the exact frontend origin. Both deployments need HTTPS for production authentication cookies.

### Agent Panel analytics and EduTube offers

The Agent Panel administrator can view registered users, EduTube accounts or
guest sessions active during the last five minutes, channels, uploaded videos per channel,
country counts, and gross paid revenue. Channel charts include only
channel-attributed transactions. Account-wide offer sales appear in platform
totals and are not assigned to a channel; no creator payout split is configured.
The country count reads the configured `EDUTUBE_COUNTRY_HEADER` request header
(default `cf-ipcountry`). Configure the trusted CDN/reverse proxy to overwrite
this header and prevent direct access to the origin; otherwise missing or
untrusted country data must not be used for reporting. Country is stored on the
first signed-in activity heartbeat, which the website sends once a minute.

Admins create account-wide or selected-channel ad-free offers in the Agent
Panel. One-time offers have an admin-selected validity of 1–3,650 days;
subscriptions renew monthly or yearly and can be cancelled by the buyer.
The panel supports Individual prepaid/monthly and Student monthly plan labels.
All EduTube users are eligible for Student pricing; Family and Two-person plans
are unavailable and excluded from the public catalog. Plan purchases grant
entitlement only to the purchasing EduTube account. The analytics dashboard
supports 7-, 30-, 90-, 365-day,
and all-time revenue/new-user reporting, plus interactive channel, country,
currency, and metric filters.
An active account offer covers all channels; a channel offer covers videos in
that channel. These entitlements do not grant access to paid/protected videos
and are never attached to individual videos. Existing completed purchases and
channel memberships remain in user history, but the public catalog now shows
only Admin-created offers.

EduTube currently has no ad-serving/provider integration. The verified offer
flow records the account/channel entitlement and its expiration; future ad
placements must call the authenticated
`GET /api/payments/ad-free-access?channelId=<id>` endpoint and skip ads only
when it returns `entitled: true`. Once the entitlement expires, the endpoint
returns false and the ad provider can resume normal delivery.

The panel backend and website backend must have the same private
`AGENT_PANEL_INTEGRATION_SECRET`; it remains backend-only. The Agent Panel
proxies analytics and offer-management requests through authenticated private
EduTube integration endpoints.

### Razorpay memberships and purchases

The backend processes Admin-created one-time ad-free purchases and monthly/
yearly ad-free memberships through the **platform's** Razorpay merchant
account. Checkout requests only send an offer id, and the backend derives the
amount, currency, scope, and validity from the database. No creator split or
payout is configured.

Before enabling checkout:

1. Activate the platform's Razorpay merchant account and enable the desired
   currencies there. Set backend `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`,
   `RAZORPAY_WEBHOOK_SECRET`, and `RAZORPAY_ALLOWED_CURRENCIES` (comma-separated
   ISO currency codes) in the deployment secret manager. The default currency
   allowlist is `INR`. Only configure currencies actually enabled on the
   merchant account; Razorpay may impose additional account and currency
   eligibility requirements.
2. Register a Razorpay webhook at
   `https://<backend-host>/api/payments/webhook`, using the same webhook secret.
   Subscribe at minimum to `payment.captured`, `subscription.activated`,
   `subscription.charged`, `subscription.cancelled`, `subscription.completed`,
   and `subscription.halted`. The webhook secret is separate from the API key
   secret. The backend verifies the HMAC over the raw request body and
   de-duplicates Razorpay event ids.
3. Keep the key secret and webhook secret server-side. The API exposes only the
   public key id needed by Razorpay Checkout. Checkout and webhook credentials
   are not set on the frontend.

Payment verification checks Razorpay signatures and then fetches the payment
and order/subscription from Razorpay before recording paid status or membership
entitlement. Memberships are created with up to 100 billing cycles. Customers
can schedule cancellation at the end of their current billing period in the
membership page.

**Legacy media limitation:** videos uploaded before choosing protected paid
content remain public Cloudinary assets. Purchases do not retroactively revoke
or protect their existing public URLs. Do not publish those existing uploads
as paid protected media.

**Protected paid video uploads:** the existing upload option and video-level
entitlement checks remain available for existing purchases. New admin-created
ad-free offers do not grant paid-video access and are never attached to a
specific video. The current Memberships & purchases catalog does not publish
new video/course purchase offers. Public thumbnails remain available for cards.

Set `CLOUDINARY_AUTH_TOKEN_KEY` on the backend to the hexadecimal token key
configured for the Cloudinary delivery domain, and enable token-based
authenticated delivery for that domain in Cloudinary. The backend mints a
video-specific signed Cloudinary URL valid for one hour only after checking
channel ownership, a verified video/course purchase, or an active membership.
The playback endpoint returns no media URL to unauthorized viewers. Paid media
is never converted from public to private in place: older uploads remain
legacy/public and cannot be configured as protected offers. A viewer who has
already received a signed playback URL may use it until its one-hour expiry.

Do not treat the feature as production-live until the merchant is activated,
all Razorpay secrets and the Cloudinary token key are configured, webhooks and
authenticated delivery are registered, and end-to-end flows have been tested
in Razorpay test mode and then live mode.
