import crypto from 'crypto';

const PROJECT = 'paid';
const REQ_COOKIE = 'soreq';
const REQ_TTL_SECONDS = 15 * 60;
const DEFAULT_GATEY_OTP_URL = 'https://kwftlkfvtglnugxsyjci.supabase.co/functions/v1/b2b-slack-otp-v2';

function json(res, status, body, extraHeaders = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });

  const secret = process.env.OTP_SIGNING_SECRET;
  if (!secret || secret.length < 16) {
    return json(res, 500, { error: 'OTP_SIGNING_SECRET is missing or too short' });
  }

  const gateyUrl = process.env.SLACK_OTP_FUNCTION_URL || DEFAULT_GATEY_OTP_URL;
  let gateyEmail = process.env.SLACK_DEFAULT_EMAIL || '';
  let gateyStatus = 'ok';
  let gateyError = '';

  try {
    const otpResp = await fetch(gateyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ project: PROJECT })
    });
    const otpJson = await otpResp.json().catch(() => ({}));
    if (!otpResp.ok || otpJson?.error) {
      gateyStatus = 'degraded';
      gateyError = String(otpJson?.error || `HTTP ${otpResp.status}`);
    } else if (otpJson?.email) {
      gateyEmail = otpJson.email;
    }
  } catch (e) {
    gateyStatus = 'degraded';
    gateyError = String(e?.message || e || 'unknown_error');
  }

  const issuedAt = Date.now();
  const requestId = crypto.randomBytes(12).toString('hex');
  const payloadEncoded = Buffer.from(JSON.stringify({
    iat: issuedAt,
    rid: requestId,
    p: PROJECT,
    email: gateyEmail
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(payloadEncoded).digest('hex');
  const cookie = `${REQ_COOKIE}=${payloadEncoded}.${sig}; Max-Age=${REQ_TTL_SECONDS}; Path=/; HttpOnly; Secure; SameSite=Lax`;

  return json(res, 200, {
    ok: true,
    project: PROJECT,
    request_id: requestId,
    issued_at: issuedAt,
    gatey_status: gateyStatus,
    gatey_error: gateyError,
    message: 'Open @gatey in Slack, send "otp paid", then paste the code here.'
  }, { 'Set-Cookie': cookie });
}

