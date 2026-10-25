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
