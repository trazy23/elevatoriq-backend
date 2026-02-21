/**
 * openclaw-server.js
 * Express API wrapper for the Kirsten engine
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { readFileSync, existsSync, unlinkSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  runOpenClaw,
  spawnAgent,
  agentToAgentCall,
  loadRegistry,
  readMemory,
  writeMemory,
} from './kirsten-engine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', 'text/csv', 'application/json'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type'));
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readUploadedFile(filePath, mimetype) {
  try {
    if (mimetype === 'application/pdf') {
      // Basic text extraction — for richer PDF support, use pdf-parse
      return `[PDF uploaded — ${filePath}]`;
    }
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function cleanUpload(filePath) {
  try { if (filePath && existsSync(filePath)) unlinkSync(filePath); } catch {}
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    kirsten: 'active',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// GET /api/agents
app.get('/api/agents', (req, res) => {
  try {
    const registry = loadRegistry();
    res.json({ agents: registry.agents, count: registry.agents.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prompt — Primary endpoint
app.post('/api/prompt', upload.single('doc'), async (req, res) => {
  const filePath = req.file?.path;
  try {
    const prompt = req.body?.prompt;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let documentContent = '';
    if (req.file) {
      documentContent = readUploadedFile(req.file.path, req.file.mimetype);
    }

    const result = await runOpenClaw({ prompt, documentContent });
    res.json(result);
  } catch (err) {
    console.error('[/api/prompt]', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    cleanUpload(filePath);
  }
});

// POST /api/spawn-agent
app.post('/api/spawn-agent', async (req, res) => {
  try {
    const { description } = req.body;
    if (!description) return res.status(400).json({ error: 'description is required' });
    const newAgent = await spawnAgent(description);
    res.json({ success: true, agent: newAgent });
  } catch (err) {
    console.error('[/api/spawn-agent]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent-call — Direct agent-to-agent call (internal use)
app.post('/api/agent-call', async (req, res) => {
  try {
    const { from, to, task, context, session_id } = req.body;
    if (!from || !to || !task) return res.status(400).json({ error: 'from, to, and task are required' });
    const result = await agentToAgentCall({ from, to, task, context, sessionId: session_id });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/memory/:id
app.get('/api/memory/:id', (req, res) => {
  try {
    const memory = readMemory(req.params.id);
    res.json({ memory_key: req.params.id, data: memory });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/memory/:id
app.post('/api/memory/:id', (req, res) => {
  try {
    const updated = writeMemory(req.params.id, req.body);
    res.json({ success: true, memory_key: req.params.id, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/audit
app.get('/api/audit', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const log = readMemory('audit_log');
    const entries = Array.isArray(log) ? log.slice(0, limit) : [];
    res.json({ entries, count: entries.length });
  } catch {
    res.json({ entries: [], count: 0 });
  }
});

// GET /api/tasks
app.get('/api/tasks', (req, res) => {
  try {
    const tasks = readMemory('tasks_master');
    res.json({ tasks: tasks.tasks || [] });
  } catch {
    res.json({ tasks: [] });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[OpenClaw] Kirsten online — http://localhost:${PORT}`);
  console.log(`[OpenClaw] Health: http://localhost:${PORT}/api/health`);
  console.log(`[OpenClaw] Agents: http://localhost:${PORT}/api/agents`);
});
