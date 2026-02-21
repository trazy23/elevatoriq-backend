# Deploying ElevatorIQ Backend

The backend needs to be deployed so the frontend (elevatoriq.ai) can reach it. Recommended platforms: **Railway** or **Render** — both are simple, no-DevOps-required.

---

## Option A: Railway (Recommended)

**Why Railway:** Simple GitHub deploy, automatic HTTPS, free Postgres add-on, good logs.

### Steps

1. **Create a GitHub repo for the backend**
   ```bash
   cd /Users/treyzackery/OpenClawSandbox/elevatoriq-backend
   git init
   git add .
   git commit -m "Initial deploy"
   # Create a new repo on github.com called elevatoriq-backend
   git remote add origin https://github.com/YOUR_USERNAME/elevatoriq-backend.git
   git push -u origin main
   ```

2. **Sign up / log in at railway.app**

3. **New Project → Deploy from GitHub repo → select `elevatoriq-backend`**

4. **Add a PostgreSQL plugin** (Railway dashboard → Add Plugin → PostgreSQL)
   - Railway gives you a `DATABASE_URL` variable automatically — it will override the local one

5. **Set environment variables in Railway dashboard:**

   | Variable | Value |
   |----------|-------|
   | `ANTHROPIC_API_KEY` | (from your `.env`) |
   | `AWS_BUCKET` | `elevatoriq-documents` |
   | `AWS_REGION` | `auto` |
   | `AWS_ACCESS_KEY_ID` | (from your `.env`) |
   | `AWS_SECRET_ACCESS_KEY` | (from your `.env`) |
   | `R2_ENDPOINT` | `https://8d019a2f5e3aaeba152a925ccf74527a.r2.cloudflarestorage.com` |
   | `CF_ACCOUNT_ID` | (from your `.env`) |
   | `CF_API_TOKEN` | (from your `.env`) |
   | `EMAIL_PROVIDER_API_KEY` | (from your `.env`) |
   | `SMTP_HOST` | `smtp.resend.com` |
   | `SMTP_PORT` | `587` |
   | `SMTP_USER` | `resend` |
   | `FROM_EMAIL` | `reports@elevatoriq.ai` |
   | `PORT` | `3001` |
   | `BASE_URL` | `https://your-app.railway.app` (set after first deploy) |

6. **Run the schema on Railway's Postgres**
   - Railway gives you a connection string — use it to run `schema_v1.sql`:
   ```bash
   psql YOUR_RAILWAY_DATABASE_URL < /Users/treyzackery/OpenClawSandbox/elevatoriq-backend/schema_v1.sql
   ```

7. **Update `BASE_URL`** to your Railway app URL → redeploy

8. **Update CORS** in `index.js`:
   ```javascript
   app.use(cors({ origin: ['https://elevatoriq.ai', 'https://www.elevatoriq.ai'] }));
   ```

---

## Option B: Render

Similar process to Railway. Use `render.com` → New Web Service → Connect GitHub repo → set same env vars above. Render also offers a free PostgreSQL database add-on.

---

## Post-Deploy Checklist

- [ ] Health check endpoint responds: `GET https://your-url/health`
- [ ] Test case submits successfully (use `api-guide.md` flow)
- [ ] Email delivers with correct download link (link should point to production URL, not localhost)
- [ ] Download link opens the PDF in browser
- [ ] CORS allows requests from elevatoriq.ai frontend
- [ ] `reports@elevatoriq.ai` domain verified in Resend dashboard

---

## Wire the Frontend

After deploy, update the frontend (`ElevatorIQ_Landing_v6.jsx`) to point API calls at your production URL:

```javascript
const API_BASE = 'https://your-app.railway.app';
```

Then redeploy the frontend (wherever it's hosted — Vercel, Cloudflare Pages, etc.).
