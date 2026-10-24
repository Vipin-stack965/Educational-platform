# Deployment

## Render

1. Push the project to a GitHub or GitLab repository and create a new Render Blueprint from that repository. Render will read `render.yaml` and create the API and static frontend services.
2. Enter the requested secret values in Render. `MONGODB_URL` must point to a MongoDB deployment whose network access permits Render. Add the Cloudinary credentials for uploads and the Firebase web API key for sign-in. Add `GEMINI_API_KEY`, `USER_EMAIL`, and `USER_PASSWORD` for AI features and email delivery. `JWT_SECRET` is generated automatically.
3. The blueprint uses `playtube-backend.onrender.com` and `playtube-frontend.onrender.com`. If you rename either service or use a custom domain, update `VITE_SERVER_URL` on the frontend and `CORS_ORIGIN` on the backend to match.
4. Add the frontend domain to Firebase Authentication's authorized domains. After both services deploy, check `https://playtube-backend.onrender.com/health` for `{"status":"ok","database":"connected"}` and open the frontend service URL.
5. The free backend service can sleep when idle, so its first request after inactivity may take time to wake up.

## Docker Compose

1. Copy `.env.example` to `.env` and `backend/.env.example` to `backend/.env`.
2. Replace every `replace_with_...` value with the real service credentials. Keep both `.env` files out of source control.
3. Set `VITE_SERVER_URL` to the public backend URL (including `https://`) and `FRONTEND_URL` to the public frontend origin. The Firebase web API key must be set as a frontend build argument; configure the deployed frontend domain in Firebase Authentication's authorized domains.
4. For an HTTPS deployment, set `COOKIE_SECURE=true`. Use `COOKIE_SAME_SITE=none` when the frontend and API are on different sites; use `strict` for local HTTP testing.
5. Run `docker compose up --build -d`. The frontend is served on port 8080 and the API on port 8000 by default. Verify the API at `/health`; it reports unavailable until MongoDB is connected.

MongoDB must be reachable from the backend and its network/IP access list must allow the deployment host. Configure valid Cloudinary credentials for media uploads, Gemini credentials for AI search, and a Gmail app password for password-reset email and feedback delivery. `USER_EMAIL` is also used as the support contact shown on the Help page. Feedback is stored in MongoDB even if email delivery fails; the API reports that delivery failure explicitly.

Visitors can browse and use the publishing and interaction features without signing in. The backend creates a guest profile and channel and keeps the session in an HttpOnly cookie; guest publishing is limited to three successful posts per day. Clearing browser cookies loses access to that guest profile and its content. Feedback remains limited to signed-in accounts. Settings (theme, channel visibility, watch-history preference, autoplay, and language) are stored on the current MongoDB profile and synchronized with the browser session.

## Direct Node deployment

Deploy `backend/` with Node.js 22 or newer, run `npm ci --omit=dev` and `npm start`, and set the variables listed in `backend/.env.example` in the hosting provider's secret/environment settings. Deploy `frontend/` as a static Vite site with `npm ci` and `npm run build`; set `VITE_SERVER_URL` and `VITE_FIREBASE_APIKEY` at build time, then publish `frontend/dist`. Configure backend `CORS_ORIGIN` to the exact frontend origin. Both deployments need HTTPS for production authentication cookies.
