// ─── Access Code Service ──────────────────────────────────────────────────────
// Shared utility so both payments and cases routes can validate access codes
// without circular dependencies.
//
// Env var: ACCESS_CODES (comma-separated, case-insensitive)
// e.g.  ACCESS_CODES=PILOT2026,BETA123,TREYZTEST

function getValidCodes() {
  const raw = process.env.ACCESS_CODES || '';
  return raw.split(',').map(c => c.trim().toUpperCase()).filter(Boolean);
}

function isValidAccessCode(code) {
  if (!code || typeof code !== 'string') return false;
  const valid = getValidCodes();
  if (!valid.length) return false;
  return valid.includes(code.trim().toUpperCase());
}

module.exports = { isValidAccessCode, getValidCodes };
