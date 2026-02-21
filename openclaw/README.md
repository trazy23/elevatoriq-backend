# OpenClaw v1.0
**Trey's AI-powered multi-agent operating system — orchestrated by Kirsten**

---

## Setup

```bash
cd openclaw
npm install
cp .env.example .env
# Fill in your API keys in .env
node openclaw-server.js
```

Server starts at: **http://localhost:3001**

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | ✅ Yes | Powers Kirsten + all Claude agents |
| `OPENAI_API_KEY` | ⚠️ Designer only | DALL-E 3 image generation |
| `IDEOGRAM_API_KEY` | Optional | Alternative to DALL-E for Designer |
| `PORT` | Optional | Default: 3001 |
| `R2_*` | Production | Cloudflare R2 persistent memory (dev uses ./memory/) |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | System status |
| GET | `/api/agents` | All registered agents |
| POST | `/api/prompt` | **Primary endpoint** — send a prompt (+ optional doc) |
| POST | `/api/spawn-agent` | Spawn a new agent from a description |
| POST | `/api/agent-call` | Direct agent-to-agent call (internal) |
| GET | `/api/memory/:id` | Read an agent's memory |
| POST | `/api/memory/:id` | Update an agent's memory |
| GET | `/api/audit` | Recent audit log |
| GET | `/api/tasks` | Master task list |

---

## Sending a Prompt

**Text only:**
```bash
curl -X POST http://localhost:3001/api/prompt \
  -H "Content-Type: application/json" \
  -d '{ "prompt": "Status update on ElevatorIQ" }'
```

**With document:**
```bash
curl -X POST http://localhost:3001/api/prompt \
  -F "prompt=Analyze this invoice for overcharges" \
  -F "doc=@/path/to/invoice.pdf"
```

**Response shape:**
```json
{
  "session_id": "uuid",
  "intent": "What Kirsten understood",
  "complexity": "simple | moderate | complex",
  "dispatch_plan": { "agents": [...] },
  "agent_results": [{ "agent_id": "marketing", "agent_name": "Marketing", "result": "..." }],
  "synthesis": "Kirsten's consolidated response with next actions",
  "notes": "Any assumptions flagged"
}
```

---

## Spawning a New Agent

```bash
curl -X POST http://localhost:3001/api/spawn-agent \
  -H "Content-Type: application/json" \
  -d '{ "description": "Legal agent that reviews contracts and flags risks in construction agreements" }'
```

Kirsten generates a full agent spec and adds it to `agent-registry.json` immediately. The agent is available for routing on the next prompt.

---

## Adding an Agent Manually

Edit `agent-registry.json` and add a new object to the `agents` array:

```json
{
  "id": "your_agent_id",
  "name": "Agent Name",
  "emoji": "🤖",
  "role": "What it does",
  "model": "claude-sonnet-4-6",
  "model_api": "anthropic",
  "memory_key": "your_agent_id_context",
  "can_call": [],
  "requires_kirsten_for": [],
  "cc_kirsten_on_calls": true,
  "capabilities": ["capability 1", "capability 2"],
  "projects": ["elevatoriq"],
  "system_prompt": "You are..."
}
```

Then initialize its memory file:
```bash
echo '{}' > memory/your_agent_id_context.json
```

---

## Agent Roster

| Agent | Role | Model |
|-------|------|-------|
| 👑 Kirsten | Chief of Staff / Orchestrator | claude-sonnet-4-6 |
| 🔨 Builder | Developer / Coder / Deployer | claude-sonnet-4-6 |
| 🔬 Researcher | Web Intel / Doc Analysis | claude-sonnet-4-6 |
| 📈 PM · ElevatorIQ | Project Manager — ElevatorIQ | claude-sonnet-4-6 |
| 🏗️ PM · Brinker | Project Manager — Brinker Supply | claude-sonnet-4-6 |
| ✅ Tasks | Capture / Triage / Track | claude-haiku-4-5 |
| 📣 Marketing | Content / Outreach / Campaigns | claude-sonnet-4-6 |
| 🎨 Designer | Visuals / UI / Brand Assets | dall-e-3 |
| 🛡️ Security | Audits / Access / Hygiene | claude-sonnet-4-6 |
| 🏠 Family Manager | Personal Ops / Schedules | claude-haiku-4-5 |

---

## Memory System

- **Development:** `./memory/*.json` — flat JSON files per agent
- **Production:** Set `R2_*` env vars to migrate to Cloudflare R2 (replace `readMemory`/`writeMemory` in `kirsten-engine.js`)
- `kirsten_global.json` — cross-agent awareness, injected into every agent call
- `audit_log.json` — full log of all agent calls and agent-to-agent calls
- `tasks_master.json` — master task list managed by the Tasks agent

---

## Architecture

```
Trey → POST /api/prompt
         ↓
     Kirsten classifies intent
         ↓
     Dispatch plan generated
         ↓
     Parallel agents → Promise.all()
     Sequential agents → ordered execution
         ↓
     All results collected
         ↓
     Kirsten synthesizes → response to Trey
```
