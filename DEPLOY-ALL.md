# Deploy all EduTube projects on Render

The workspace consists of four independent repositories. EduTube already has a
Render Blueprint in `render.yaml`; Admin Panel, Agent Panel, and Check Auth now
have one at the root of their respective repositories. Create a Render Blueprint
for each repository. Keep the service names in these files, or update every
matching service URL below if Render assigns a different URL or you use a custom
domain.

## Before deploying

- Allow Render to reach MongoDB Atlas (network access list) and use four
  separate databases. Set a dedicated database path in EduTube's
  `MONGODB_URL`; the other three backends use `MONGODB_DATABASE` values
  `edutube_standalone_admin`, `edutube_agent_panel`, and `edutube_check_auth`.
  Never point separate applications at the same database.
- Have the Firebase Web API key, Cloudinary credentials, Gemini API key, Gmail
  App Password, and Razorpay credentials ready if those features are enabled.
- In Firebase Authentication, enable Google sign-in and add all deployed
  frontend domains under Authorized domains.
- Generate distinct random secrets of at least 32 characters for each
  integration below. Do not reuse the JWT, bootstrap, Gmail, or Firebase values
  as integration secrets.

## Deploy order and service URLs

Create/deploy the EduTube Blueprint first, then Agent Panel, Check Auth, and
Admin Panel. The inter-project URLs below assume the service names from the
Blueprints:

| Project | Frontend | Backend |
|---|---|---|
| EduTube | `https://edutube-frontend-qr5q.onrender.com` | `https://edutube-backend-gfmr.onrender.com` |
| Admin Panel | `https://admin-panel-frontend.onrender.com` | `https://admin-panel-backend.onrender.com` |
| Agent Panel | `https://agent-panel-frontend.onrender.com` | `https://agent-panel-backend.onrender.com` |
| Check Auth | `https://check-auth-frontend.onrender.com` | `https://check-auth-backend.onrender.com` |

Render may show a different public hostname (for example, when a service already
exists or a custom domain is used). In that case, replace the example URL in all
the corresponding backend origins, API URLs, frontend build variables, Firebase
authorized domains, and EduTube `CORS_ORIGIN`. Origins must be exact and have no
trailing slash.

The blueprints set secure cross-site cookies for the separate Render frontend
and API hosts. Some browsers or privacy settings can block third-party cookies;
if a sign-in does not persist, put the frontends and APIs on custom subdomains
under one domain you control (for example, `app.example.com` and
`api.example.com`) and update all origins/URLs in the Render settings.

## Required cross-project settings

Set these in Render's backend environment settings. The values in each matching
pair must be identical:

| Set in | Variable | Must match |
|---|---|---|
| EduTube backend | `AGENT_PANEL_INTEGRATION_SECRET` | Agent Panel `AGENT_PANEL_INTEGRATION_SECRET` |
| EduTube backend | `AGENT_PANEL_INTEGRATION_SECRET` | Check Auth `AGENT_PANEL_INTEGRATION_SECRET` |
| Admin Panel backend | `AGENT_PANEL_INTEGRATION_SECRET` | Agent Panel `ADMIN_STUDIO_INTEGRATION_SECRET` |
| Admin Panel backend | `EMPLOYEE_DIRECTORY_SECRET` | Check Auth `ADMIN_DIRECTORY_INTEGRATION_SECRET` |
| Admin Panel backend | `EDUTUBE_INTEGRATION_SECRET` | EduTube/Agent Panel `AGENT_PANEL_INTEGRATION_SECRET` |
| EduTube backend | `AGENT_PANEL_URL` | Agent Panel backend URL |
| EduTube backend | `CHECK_AUTH_URL` | Check Auth backend URL |
| EduTube backend | `AGENT_PANEL_FRONTEND_URL` | Agent Panel frontend URL |
| Admin Panel backend | `AGENT_PANEL_API_URL` | Agent Panel backend URL |
| Admin Panel backend | `CHECK_AUTH_API_URL` | Check Auth backend URL |
| Admin Panel backend | `EDUTUBE_API_URL` | EduTube backend URL |
| Agent Panel backend | `EDUTUBE_API_URL` | EduTube backend URL |
| Check Auth backend | `EDUTUBE_API_URL` | EduTube backend URL |
| Admin Panel backend | `PANEL_ORIGIN` | Admin Panel frontend origin |
| Agent Panel backend | `PANEL_ORIGIN` | Agent Panel frontend origin |
| Agent Panel backend | `ADMIN_STUDIO_ORIGIN` | Admin Panel frontend origin |
| Check Auth backend | `PANEL_ORIGIN` | Check Auth frontend origin |
| Check Auth backend | `ADMIN_STUDIO_ORIGIN` | Admin Panel frontend origin |

Use the corresponding frontend API/app URL build variables from each Blueprint.
They are baked into the static build, so rebuild/redeploy the frontend after any
URL change. Set `CORS_ORIGIN` on EduTube to its frontend origin (plus any
additional EduTube frontend domains that are actually in use).

## Feature credentials and first sign-in

- Set `MONGODB_URL` on all four backends. Set a distinct `MONGODB_DATABASE` for
  each app; never point the standalone admin, agent, or Check Auth app at the
  EduTube database.
- Set the same Firebase Web API key on EduTube and in both Agent Panel/Check
  Auth backend and frontend variables. Add each actual frontend domain to
  Firebase Authorized domains.
- Set EduTube `CLOUDINARY_NAME`, `CLOUDINARY_API_KEY`,
  `CLOUDINARY_API_SECRET`, `CLOUDINARY_AUTH_TOKEN_KEY`, and `GEMINI_API_KEY`.
  Configure Razorpay keys and webhook secret if payments are enabled.
- Set EduTube `USER_EMAIL` and `USER_PASSWORD` to the Gmail account and its
  16-character Google App Password. Admin verification/username emails and
  Check Auth recovery emails depend on this sender.
- Set `ADMIN_EMAIL` to the intended first admin email in both Agent Panel and
  Check Auth. Check Auth also needs its own private `ADMIN_BOOTSTRAP_SECRET`;
  use it once when creating its initial admin account.
- The standalone Admin Panel creates its first account through its public
  signup flow. Additional Admin Panel admins are created by a signed-in admin.

## Verify after deployment

1. Check `/health` on all four backend URLs. Each should return HTTP 200 and
   report a connected MongoDB database.
2. Open each frontend and verify sign-in/session cookies over HTTPS.
3. Test Google sign-in in Agent Panel and Check Auth, then test EduTube guest
   browsing and a normal sign-in.
4. Test an Admin Panel signup using a recipient mailbox you control; verify the
   email OTP arrives, enter it before its five-minute expiry, and confirm the
   account can sign in.
5. Test a non-production upload/review, admin directory loading, and payment
   test-mode flow if those features are enabled.
6. Check each backend's Render logs for integration, MongoDB, Firebase, Gmail,
   Cloudinary, or payment-provider errors.

The Blueprint uses Render's free web-service plan to avoid introducing hosting
charges. Free web services can sleep when idle; their first request can be slow.
For consistently warm APIs or production traffic, choose an appropriate paid
plan in Render. No third-party service can guarantee that credentials, billing,
provider quotas, or account policies will remain available after deployment.
