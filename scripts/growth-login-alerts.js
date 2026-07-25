const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STATE_DIR = path.join(os.homedir(), '.hermes', 'state', 'elevatoriq-growth');
const STATE_FILE = path.join(STATE_DIR, 'login-alerts.json');
const DEFAULT_COOLDOWN_MS = Number(process.env.GROWTH_LOGIN_ALERT_COOLDOWN_MS || 30 * 60 * 1000);
const TARGET = process.env.GROWTH_LOGIN_ALERT_TARGET || 'telegram';
const HERMES_BIN = process.env.HERMES_BIN || path.join(os.homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'hermes');

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch (_) { return {}; }
}

function writeState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function normalizeKey(service, reason) {
  return `${String(service || 'unknown').toLowerCase()}:${String(reason || 'login_required').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

function shouldSend(key, cooldownMs = DEFAULT_COOLDOWN_MS) {
  if (String(process.env.GROWTH_LOGIN_ALERTS_ENABLED || 'true').toLowerCase() === 'false') return false;
  const state = readState();
  const last = Number(state[key]?.last_sent_at_ms || 0);
  return Date.now() - last >= cooldownMs;
}

function markSent(key, meta = {}) {
  const state = readState();
  state[key] = { last_sent_at_ms: Date.now(), last_sent_at: new Date().toISOString(), ...meta };
  writeState(state);
}

function sendTelegram(message, { service = 'unknown', reason = 'login_required', cooldownMs = DEFAULT_COOLDOWN_MS } = {}) {
  const key = normalizeKey(service, reason);
  if (!shouldSend(key, cooldownMs)) return { sent: false, skipped: 'cooldown', key };
  const result = spawnSync(HERMES_BIN, ['send', '--to', TARGET, message], { encoding: 'utf8', timeout: 30_000 });
  const ok = result.status === 0;
  if (ok) markSent(key, { service, reason, target: TARGET });
  return {
    sent: ok,
    key,
    target: TARGET,
    exitCode: result.status,
    stdout: result.stdout ? result.stdout.slice(0, 1000) : '',
    stderr: result.stderr ? result.stderr.slice(0, 1000) : '',
  };
}

function loginRequiredMessage(service, context) {
  const label = service === 'apollo' ? 'Apollo' : service === 'linkedin' ? 'LinkedIn' : service;
  const action = service === 'apollo'
    ? 'Please open the Apollo tab in Chrome and log back in so Growth Command can pull verified leads.'
    : service === 'linkedin'
      ? 'Please open the LinkedIn tab in Chrome and log back in / confirm ElevatorIQ page admin access so Growth Command can publish approved posts.'
      : 'Please log back in so Growth Command can continue.';
  return [
    `🔴 Growth Command needs ${label} login.`,
    action,
    context ? `Context: ${context}` : null,
    'I will keep running safe internal steps, but this lane is paused until login is restored.',
  ].filter(Boolean).join('\n');
}

function alertLoginRequired(service, context, options = {}) {
  return sendTelegram(loginRequiredMessage(service, context), { service, reason: 'login_required', ...options });
}

module.exports = { alertLoginRequired, sendTelegram, loginRequiredMessage };
