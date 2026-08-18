import React from 'react';
import { cookies } from 'next/headers';

import { PreparationFlow } from '../../../components/PreparationFlow.jsx';

export default async function PreparationPage() {
  const cookieStore = await cookies();
  const browserToken = cookieStore.get('proctoring_browser_token')?.value;
  const sessionId = cookieStore.get('proctoring_session_id')?.value;
  const livenessChallengeId = cookieStore.get('proctoring_liveness_challenge_id')?.value;
  const returnUrl = cookieStore.get('proctoring_return_url')?.value;
  const apiUrl = process.env.PROCTORING_API_URL || process.env.NEXT_PUBLIC_PROCTORING_API_URL;

  if (!browserToken || !sessionId || !livenessChallengeId || !returnUrl || !apiUrl) {
    return <main><p>Preparation launch is incomplete.</p></main>;
  }

  return (
    <PreparationFlow
      apiUrl={apiUrl}
      browserToken={browserToken}
      sessionId={sessionId}
      livenessChallengeId={livenessChallengeId}
      returnUrl={returnUrl}
    />
  );
}
