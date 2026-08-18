import { NextResponse } from 'next/server';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function launchCookie(value) {
  return {
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/sessions',
    maxAge: 15 * 60
  };
}

export async function POST(request) {
  const form = await request.formData();
  const browserToken = form.get('browserToken');
  const sessionId = form.get('sessionId');
  const livenessChallengeId = form.get('livenessChallengeId');
  const returnUrl = form.get('returnUrl');

  if (
    typeof browserToken !== 'string' || browserToken.length === 0 ||
    !isUuid(sessionId) ||
    !isUuid(livenessChallengeId) ||
    !isHttpsUrl(returnUrl)
  ) {
    return NextResponse.json({ error: 'Invalid launch request' }, { status: 400 });
  }

  const response = NextResponse.redirect(new URL('/sessions/preparation', request.url), 303);
  response.cookies.set({ name: 'proctoring_browser_token', ...launchCookie(browserToken) });
  response.cookies.set({ name: 'proctoring_session_id', ...launchCookie(sessionId) });
  response.cookies.set({ name: 'proctoring_liveness_challenge_id', ...launchCookie(livenessChallengeId) });
  response.cookies.set({ name: 'proctoring_return_url', ...launchCookie(returnUrl) });
  return response;
}
