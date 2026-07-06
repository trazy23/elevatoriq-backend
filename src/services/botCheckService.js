async function verifyTurnstileToken(token, remoteIp) {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProduction) {
      return {
        ok: false,
        status: 503,
        code: 'bot_check_not_configured',
        message: 'Submission protection is not configured. Please try again later.',
      };
    }
    return { ok: true, skipped: true };
  }

  if (!token || typeof token !== 'string') {
    return {
      ok: false,
      status: 400,
      code: 'bot_check_required',
      message: 'Please complete the verification challenge before submitting.',
    };
  }

  const formData = new URLSearchParams();
  formData.set('secret', secret);
  formData.set('response', token);
  if (remoteIp) formData.set('remoteip', remoteIp);

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok && body.success === true) {
      return { ok: true };
    }
    return {
      ok: false,
      status: 403,
      code: 'bot_check_failed',
      message: 'Verification failed. Please try again.',
    };
  } catch (err) {
    console.warn('[BotCheck] Turnstile verification failed:', err.message);
    return {
      ok: false,
      status: 503,
      code: 'bot_check_unavailable',
      message: 'Verification service is temporarily unavailable. Please try again.',
    };
  }
}

module.exports = { verifyTurnstileToken };
