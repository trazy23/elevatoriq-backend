const db = require('../db');

// ─── Disposable / throwaway email domains ────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.net',
  'guerrillamail.org', 'guerrillamail.de', 'grr.la', 'sharklasers.com',
  'spam4.me', 'trashmail.com', 'trashmail.me', 'trashmail.net', 'trashmail.org',
  'trashmail.at', 'trashmail.io', 'trash-mail.com', 'trash-mail.de',
  'tempmail.com', 'tempemail.com', 'temp-mail.org', 'tempmail2.com',
  'throwam.com', 'throwaway.email', 'yopmail.com', 'yopmail.fr',
  'fakeinbox.com', 'maildrop.cc', 'mailnull.com', 'dispostable.com',
  'spamgourmet.com', 'spamgourmet.net', 'spambox.us', 'spamfree24.org',
  'spamhole.com', 'spaml.de', 'spammotel.com', 'spamnot.com',
  'spamoff.de', 'spamspot.com', 'spamstack.net', 'spam.la',
  'trbvm.com', 'getairmail.com', 'mailnew.com', 'mintemail.com',
  'nowmymail.com', 'objectmail.com', 'oneoffemail.com', 'pookmail.com',
  'quickinbox.com', 'rcpt.at', 'safetymail.info', 'shieldedmail.com',
  'sofort-mail.de', 'tempinbox.com', 'tempinbox.co.uk', 'wegwerfmail.de',
  'wegwerfmail.net', 'zehnminuten.de', 'zehnminutenmail.de', 'zippymail.info',
  'binkmail.com', 'bobmail.info', 'devnullmail.com', 'dingbone.com',
  'fleckens.hu', 'ichimail.com', 'maileater.com', 'nomail.pw',
  'proxymail.eu', 'regbypass.com', 'safetypost.de', 'skeefmail.com',
  'slopsbox.com', 'sogetthis.com', 'tempe-mail.com', 'tradermail.info',
  'uggsrock.com', 'willhackforfood.biz', 'xagloo.com', 'xcode.ro',
  'yapped.net', 'za.com', 'zoemail.net', 'zomg.info',
]);

// ─── Email normalization for dedup ────────────────────────────────────────────
// Strips +alias (trey+test@gmail.com → trey@gmail.com), lowercases.
// Dots in Gmail local part are ignored by Google but we don't strip them —
// that would cause false positives on non-Gmail providers.
function normalizeEmailForDedup(email) {
  if (!email || typeof email !== 'string') return null;
  const lower = email.toLowerCase().trim();
  const atIdx = lower.lastIndexOf('@');
  if (atIdx < 1) return null;
  const local  = lower.slice(0, atIdx);
  const domain = lower.slice(atIdx + 1);
  if (!domain) return null;
  const cleanLocal = local.split('+')[0]; // strip +alias
  return `${cleanLocal}@${domain}`;
}

function isDisposableDomain(email) {
  if (!email) return false;
  const atIdx = email.lastIndexOf('@');
  if (atIdx < 0) return false;
  return DISPOSABLE_DOMAINS.has(email.slice(atIdx + 1).toLowerCase());
}

// ─── Main eligibility check ───────────────────────────────────────────────────
// Returns { eligible: true } or { eligible: false, reason, message }
async function checkFreeEligibility(email, clientIp) {
  // 1. Normalize
  const normalized = normalizeEmailForDedup(email);
  if (!normalized) return { eligible: false, reason: 'invalid_email', message: 'A valid email address is required.' };

  // 2. Block disposable domains
  if (isDisposableDomain(normalized)) {
    return {
      eligible: false,
      reason: 'disposable_email',
      message: 'Disposable email addresses are not eligible for a free review. Please use a work or personal email.',
    };
  }

  // 3. Check if this normalized email (with +alias stripped) already has a completed free case
  try {
    const emailCheck = await db.query(
      `SELECT COUNT(*) AS count
       FROM cases
       WHERE payment_status = 'free'
         AND status NOT IN ('failed', 'pending')
         AND LOWER(REGEXP_REPLACE(customer_email, '\\+[^@]*(@)', '\\1', 'g')) = $1`,
      [normalized]
    );
    if (parseInt(emailCheck.rows[0].count, 10) > 0) {
      return {
        eligible: false,
        reason: 'email_used',
        message: 'Your free review has already been used. Choose a plan to continue.',
      };
    }
  } catch (err) {
    // If the query fails, fail open — don't block a legitimate user over a DB hiccup
    console.warn('[FreeEligibility] Email check failed (failing open):', err.message);
  }

  // 4. Check IP — one free review per IP (catches email rotation on same device)
  if (clientIp) {
    try {
      const ipCheck = await db.query(
        `SELECT COUNT(*) AS count
         FROM cases
         WHERE payment_status = 'free'
           AND status NOT IN ('failed', 'pending')
           AND client_ip = $1`,
        [clientIp]
      );
      if (parseInt(ipCheck.rows[0].count, 10) > 0) {
        return {
          eligible: false,
          reason: 'ip_used',
          message: 'A free review has already been used from this network. Choose a plan to continue.',
        };
      }
    } catch (err) {
      console.warn('[FreeEligibility] IP check failed (failing open):', err.message);
    }
  }

  return { eligible: true };
}

module.exports = { checkFreeEligibility, normalizeEmailForDedup, isDisposableDomain };
