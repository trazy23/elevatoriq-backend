# How to Run ElevatorIQ Locally

## Prerequisites

- PostgreSQL 17 running (it auto-starts on your Mac via Homebrew)
- Node.js installed
- `.env` file present in `elevatoriq-backend/`

---

## Start the Backend

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
cd /Users/treyzackery/OpenClawSandbox/elevatoriq-backend
node index.js
```

Server starts at: **http://localhost:3001**

Health check: http://localhost:3001/health

---

## Verify PostgreSQL Is Running

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
pg_isready
```

Should return: `localhost:5432 - accepting connections`

If it's not running:
```bash
brew services start postgresql@17
```

---

## Check the Database

```bash
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
psql -U treyzackery -d elevatoriq_dev
```

Useful queries once inside:
```sql
-- List recent cases
SELECT id, review_type, status, created_at FROM cases ORDER BY created_at DESC LIMIT 10;

-- List reports and download tokens
SELECT id, case_id, download_token, created_at FROM reports ORDER BY created_at DESC LIMIT 10;

-- Check extractions
SELECT id, case_id, created_at FROM extractions_raw ORDER BY created_at DESC LIMIT 10;

-- Exit
\q
```

---

## Stop the Backend

If running in the foreground: `Ctrl+C`

If running in background:
```bash
kill $(lsof -ti:3001)
```

---

## Environment Variables

All config lives in `elevatoriq-backend/.env`. See `credentials.md` for a full map of what each variable does.

**Redis/Bull queue is disabled by default.** The backend processes jobs directly (no Redis needed). If you ever want to enable queued processing, add `REDIS_ENABLED=true` to `.env` and run a local Redis instance.
