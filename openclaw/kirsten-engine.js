/**
 * kirsten-engine.js
 * OpenClaw Core Engine — orchestrated by Kirsten
 * Four-stage execution: Classify → Dispatch → Execute → Synthesize
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(__dirname, 'memory');
const REGISTRY_PATH = path.join(__dirname, 'agent-registry.json');

// ─── Model Clients ────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─── Shell Exec (for Builder agentic loop) ────────────────────────────────────

function safeExec(command, timeoutMs = 30000) {
  try {
    const output = execSync(command, {
      timeout: timeoutMs,
      encoding: 'utf8',
      cwd: process.env.WORKSPACE || process.env.HOME,
      env: { ...process.env, PATH: process.env.PATH },
    });
    return { success: true, output: output.substring(0, 3000) };
  } catch (err) {
    return { success: false, output: (err.stdout || '') + (err.stderr || ''), error: err.message };
  }
}

// ─── Model Clients ─────────────────────────────────────────────────────────────

const MODEL_CLIENTS = {
  // Anthropic — Claude Sonnet / Haiku
  anthropic: async ({ model, systemPrompt, userMessage, maxTokens = 4096 }) => {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    return response.content[0].text;
  },

  // Anthropic (Builder) — Agentic loop with exec capability
  anthropic_builder: async ({ model, systemPrompt, userMessage, maxTokens = 8096 }) => {
    const messages = [{ role: 'user', content: userMessage }];
    const builderSystem = `${systemPrompt}

EXECUTION CAPABILITY: You can run shell commands by including blocks in your response formatted as:
<exec>command here</exec>

When you include an exec block, the command will be run and output returned to you so you can iterate.
Use this to: write files, run tests, install packages, verify your code works.
Max 8 exec calls per task. Always verify code runs before declaring success.`;

    let finalResult = '';
    let execCount = 0;

    // Agentic loop — up to 8 iterations
    while (execCount < 8) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system: builderSystem,
        messages,
      });

      const text = response.content[0].text;
      messages.push({ role: 'assistant', content: text });

      // Check for exec blocks
      const execMatch = text.match(/<exec>([\s\S]*?)<\/exec>/);
      if (!execMatch || response.stop_reason === 'end_turn' && !execMatch) {
        finalResult = text;
        break;
      }

      if (execMatch) {
        execCount++;
        const cmd = execMatch[1].trim();
        console.log(`[Builder] Executing (${execCount}/8): ${cmd.substring(0, 80)}`);
        const result = safeExec(cmd);
        const execOutput = result.success
          ? `<exec_result success="true">${result.output}</exec_result>`
          : `<exec_result success="false" error="${result.error}">${result.output}</exec_result>`;
        messages.push({ role: 'user', content: execOutput });
        finalResult = text.replace(/<exec>[\s\S]*?<\/exec>/g, '').trim();
      } else {
        finalResult = text;
        break;
      }
    }

    return finalResult;
  },

  // Ollama — local models (OpenAI-compatible API)
  ollama: async ({ model, systemPrompt, userMessage, maxTokens = 4096 }) => {
    const ollamaClient = new OpenAI({
      baseURL: 'http://localhost:11434/v1',
      apiKey: 'ollama', // required by client but not used
    });
    const response = await ollamaClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
    });
    return response.choices[0].message.content;
  },

  // Gemini — via Google AI API (OpenAI-compatible endpoint)
  gemini: async ({ model, systemPrompt, userMessage, maxTokens = 4096 }) => {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY not configured — Gemini agents unavailable');
    }
    const geminiClient = new OpenAI({
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      apiKey: process.env.GOOGLE_AI_API_KEY,
    });
    const response = await geminiClient.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: maxTokens,
    });
    return response.choices[0].message.content;
  },

  // Gemini Image Generation (Imagen 3)
  gemini_image: async ({ userMessage }) => {
    if (!process.env.GOOGLE_AI_API_KEY) {
      throw new Error('GOOGLE_AI_API_KEY not configured — Designer agent unavailable');
    }
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${process.env.GOOGLE_AI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instances: [{ prompt: userMessage }],
          parameters: { sampleCount: 1 },
        }),
      }
    );
    const data = await response.json();
    if (data.predictions?.[0]?.bytesBase64Encoded) {
      return JSON.stringify({ image_base64: data.predictions[0].bytesBase64Encoded, mimeType: 'image/png' });
    }
    throw new Error('Imagen 3 returned no image: ' + JSON.stringify(data));
  },

  // OpenAI (fallback for DALL-E if needed)
  openai: async ({ model, systemPrompt, userMessage }) => {
    if (!openai) throw new Error('OpenAI API key not configured');
    if (model === 'dall-e-3') {
      const response = await openai.images.generate({
        model: 'dall-e-3', prompt: userMessage, n: 1, size: '1024x1024', quality: 'standard',
      });
      return JSON.stringify({ image_url: response.data[0].url, revised_prompt: response.data[0].revised_prompt });
    }
    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
    });
    return response.choices[0].message.content;
  },
};

// ─── Registry ─────────────────────────────────────────────────────────────────

export function loadRegistry() {
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  return JSON.parse(raw);
}

export function saveRegistry(registry) {
  writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
}

export function getAgent(agentId) {
  const registry = loadRegistry();
  return registry.agents.find(a => a.id === agentId);
}

// ─── Memory ───────────────────────────────────────────────────────────────────

export function readMemory(memoryKey) {
  const filePath = path.join(MEMORY_DIR, `${memoryKey}.json`);
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

export function writeMemory(memoryKey, data) {
  if (!existsSync(MEMORY_DIR)) mkdirSync(MEMORY_DIR, { recursive: true });
  const filePath = path.join(MEMORY_DIR, `${memoryKey}.json`);
  const existing = readMemory(memoryKey);
  const updated = { ...existing, ...data, last_updated: new Date().toISOString() };
  writeFileSync(filePath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

// ─── Audit Log ────────────────────────────────────────────────────────────────

export function appendAuditLog(entry) {
  const logPath = path.join(MEMORY_DIR, 'audit_log.json');
  let log = [];
  if (existsSync(logPath)) {
    try { log = JSON.parse(readFileSync(logPath, 'utf8')); } catch { log = []; }
  }
  log.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > 500) log = log.slice(0, 500); // cap at 500 entries
  writeFileSync(logPath, JSON.stringify(log, null, 2), 'utf8');
}

// ─── Context Builder ──────────────────────────────────────────────────────────

function buildContextBlock(agent, sessionId) {
  const agentMemory = readMemory(agent.memory_key);
  const globalMemory = readMemory('kirsten_global');

  const lines = [
    `--- CONTEXT BLOCK ---`,
    `Agent: ${agent.name} (${agent.id})`,
    `Session ID: ${sessionId}`,
    `Time: ${new Date().toISOString()}`,
    `Projects: ${agent.projects.join(', ')}`,
  ];

  if (Object.keys(agentMemory).length > 0) {
    lines.push(`\nYour Memory:`);
    lines.push(JSON.stringify(agentMemory, null, 2));
  }

  if (Object.keys(globalMemory).length > 0) {
    lines.push(`\nGlobal Context (Kirsten's awareness):`);
    const summary = globalMemory.session_summary || globalMemory;
    lines.push(typeof summary === 'string' ? summary : JSON.stringify(summary, null, 2));
  }

  lines.push(`--- END CONTEXT ---\n`);
  return lines.join('\n');
}

// ─── Agent Executor ───────────────────────────────────────────────────────────

async function executeAgent(agent, task, sessionId, additionalContext = '') {
  const contextBlock = buildContextBlock(agent, sessionId);
  const caller = MODEL_CLIENTS[agent.model_api];
  if (!caller) throw new Error(`No model client for api: ${agent.model_api}`);

  const systemPrompt = `${agent.system_prompt}\n\n${contextBlock}`;
  const userMessage = additionalContext
    ? `${task}\n\nAdditional context:\n${additionalContext}`
    : task;

  const result = await caller({
    model: agent.model,
    systemPrompt,
    userMessage,
    maxTokens: 4096,
  });

  appendAuditLog({
    session_id: sessionId,
    agent_id: agent.id,
    agent_name: agent.name,
    task: task.substring(0, 200),
    result_preview: result.substring(0, 200),
    from: 'kirsten',
    type: 'agent_call',
  });

  return { agent_id: agent.id, agent_name: agent.name, emoji: agent.emoji, result };
}

// ─── Agent-to-Agent Calls ─────────────────────────────────────────────────────

export async function agentToAgentCall({ from, to, task, context = '', sessionId }) {
  const fromAgent = getAgent(from);
  const toAgent = getAgent(to);

  if (!fromAgent) throw new Error(`Unknown source agent: ${from}`);
  if (!toAgent) throw new Error(`Unknown target agent: ${to}`);

  // Permission check
  if (!fromAgent.can_call.includes(to)) {
    throw new Error(`Agent ${from} does not have permission to call ${to}. Route through Kirsten.`);
  }

  // Check if requires_kirsten_for blocks this call
  if (toAgent.requires_kirsten_for?.includes('all')) {
    throw new Error(`Agent ${to} requires all calls to route through Kirsten.`);
  }

  const result = await executeAgent(toAgent, task, sessionId, context);

  // Audit if cc_kirsten is set on source agent
  if (fromAgent.cc_kirsten_on_calls) {
    appendAuditLog({
      session_id: sessionId,
      from,
      to,
      task: task.substring(0, 200),
      type: 'agent_to_agent',
      cc_kirsten: true,
    });
  }

  return result;
}

// ─── Stage 1: Classification ──────────────────────────────────────────────────

async function classifyIntent(prompt, documentContent = '') {
  const registry = loadRegistry();
  const agentList = registry.agents
    .filter(a => a.id !== 'kirsten')
    .map(a => `${a.id}: ${a.role} — ${a.capabilities.slice(0, 3).join(', ')}`)
    .join('\n');

  const classificationPrompt = `
You are classifying a user request to build an agent dispatch plan.

Available agents:
${agentList}

User prompt: "${prompt}"
${documentContent ? `\nDocument content:\n${documentContent.substring(0, 2000)}` : ''}

Return ONLY valid JSON in this exact shape:
{
  "intent": "one sentence of what the user wants",
  "complexity": "simple | moderate | complex",
  "agents": [
    {
      "id": "agent_id",
      "task": "specific task description for this agent",
      "priority": 1,
      "can_run_parallel": true
    }
  ],
  "synthesis_instruction": "how to combine the results into a final response",
  "notes": "any assumptions or flags"
}

Rules:
- Only include agents that are genuinely needed
- Set can_run_parallel: false for agents that depend on a prior agent's output
- Order sequential agents by priority (1 = first)
- For simple prompts, 1 agent is fine
- Do not include kirsten in the agents array
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: classificationPrompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Classification returned invalid JSON');
  return JSON.parse(jsonMatch[0]);
}

// ─── Stage 2 & 3: Dispatch + Execute ─────────────────────────────────────────

async function dispatchAgents(plan, sessionId, documentContent = '') {
  const parallelAgents = plan.agents.filter(a => a.can_run_parallel !== false);
  const sequentialAgents = plan.agents
    .filter(a => a.can_run_parallel === false)
    .sort((a, b) => a.priority - b.priority);

  const results = [];

  // Fire parallel agents simultaneously
  if (parallelAgents.length > 0) {
    const parallelResults = await Promise.all(
      parallelAgents.map(agentTask => {
        const agent = getAgent(agentTask.id);
        if (!agent) return Promise.resolve({ agent_id: agentTask.id, error: 'Agent not found' });
        const task = documentContent
          ? `${agentTask.task}\n\nDocument content:\n${documentContent.substring(0, 3000)}`
          : agentTask.task;
        return executeAgent(agent, task, sessionId);
      })
    );
    results.push(...parallelResults);
  }

  // Fire sequential agents with prior results as context
  for (const agentTask of sequentialAgents) {
    const agent = getAgent(agentTask.id);
    if (!agent) { results.push({ agent_id: agentTask.id, error: 'Agent not found' }); continue; }
    const priorContext = results.map(r => `${r.agent_name}: ${r.result?.substring(0, 500)}`).join('\n\n');
    const task = documentContent
      ? `${agentTask.task}\n\nDocument content:\n${documentContent.substring(0, 2000)}`
      : agentTask.task;
    const result = await executeAgent(agent, task, sessionId, priorContext);
    results.push(result);
  }

  return results;
}

// ─── Stage 4: Synthesis ───────────────────────────────────────────────────────

async function synthesize(prompt, plan, agentResults, sessionId) {
  const kirstenAgent = getAgent('kirsten');
  const contextBlock = buildContextBlock(kirstenAgent, sessionId);

  const resultsText = agentResults
    .map(r => `## ${r.emoji || ''} ${r.agent_name}\n${r.result || r.error || 'No result'}`)
    .join('\n\n---\n\n');

  const synthesisPrompt = `
Original request from Trey: "${prompt}"

Intent identified: ${plan.intent}

Agent results:
${resultsText}

Synthesis instruction: ${plan.synthesis_instruction}

${contextBlock}

Produce a single, clear response for Trey structured as:
1. PRIMARY OUTPUT — the direct answer or deliverable
2. SUPPORTING DETAIL — relevant context (keep tight)
3. NEXT ACTIONS — numbered list of clear next steps
4. ASSUMPTIONS — only if you made any significant ones

Be direct. Skip preamble. Trey values speed and clarity.
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: kirstenAgent.system_prompt,
    messages: [{ role: 'user', content: synthesisPrompt }],
  });

  const synthesis = response.content[0].text;

  // Update global memory with session summary
  writeMemory('kirsten_global', {
    last_session: {
      session_id: sessionId,
      prompt: prompt.substring(0, 200),
      intent: plan.intent,
      agents_used: agentResults.map(r => r.agent_id),
      timestamp: new Date().toISOString(),
    }
  });

  return synthesis;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function runOpenClaw({ prompt, documentContent = '' }) {
  const sessionId = uuidv4();

  // Stage 1: Classify
  const plan = await classifyIntent(prompt, documentContent);

  // Stage 2 & 3: Dispatch + Execute
  const agentResults = plan.agents.length > 0
    ? await dispatchAgents(plan, sessionId, documentContent)
    : [];

  // Stage 4: Synthesize
  const synthesis = await synthesize(prompt, plan, agentResults, sessionId);

  return {
    session_id: sessionId,
    intent: plan.intent,
    complexity: plan.complexity,
    dispatch_plan: plan,
    agent_results: agentResults,
    synthesis,
    notes: plan.notes || null,
  };
}

// ─── Spawn New Agent ──────────────────────────────────────────────────────────

export async function spawnAgent(description) {
  const registry = loadRegistry();
  const existingIds = registry.agents.map(a => a.id).join(', ');

  const spawnPrompt = `
You are generating a new agent spec for the OpenClaw system.

Description: "${description}"
Existing agent IDs (do not duplicate): ${existingIds}

Generate a complete agent spec as valid JSON:
{
  "id": "snake_case_id",
  "name": "Display Name",
  "emoji": "appropriate emoji",
  "role": "Role description",
  "model": "claude-sonnet-4-6 OR claude-haiku-4-5 OR dall-e-3",
  "model_api": "anthropic OR openai",
  "memory_key": "id_context",
  "can_call": [],
  "requires_kirsten_for": [],
  "cc_kirsten_on_calls": true,
  "capabilities": ["capability 1", "capability 2"],
  "projects": ["relevant", "projects"],
  "system_prompt": "Full system prompt for this agent, encoding domain knowledge and behavioral rules."
}

Model selection: complex reasoning/writing → claude-sonnet-4-6, simple/fast tasks → claude-haiku-4-5, images → dall-e-3
Return ONLY the JSON object.
`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    messages: [{ role: 'user', content: spawnPrompt }],
  });

  const text = response.content[0].text;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Spawn returned invalid JSON');
  const newAgent = JSON.parse(jsonMatch[0]);

  // Add to registry
  registry.agents.push(newAgent);
  registry.updated = new Date().toISOString();
  saveRegistry(registry);

  // Initialize memory file
  writeMemory(newAgent.memory_key, { created: new Date().toISOString(), description });

  appendAuditLog({
    type: 'agent_spawned',
    agent_id: newAgent.id,
    agent_name: newAgent.name,
    description: description.substring(0, 200),
  });

  return newAgent;
}
