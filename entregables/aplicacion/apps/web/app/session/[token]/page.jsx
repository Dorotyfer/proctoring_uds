import { PreparationFlow } from '@/components/PreparationFlow';

function getSafeReturnUrl(value) {
  if (!value || !process.env.MOODLE_ORIGIN) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.origin === new URL(process.env.MOODLE_ORIGIN).origin ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function SessionPage({ params, searchParams }) {
  const { token } = await params;
  const query = await searchParams;

  return (
    <PreparationFlow
      monitorMode={query.mode === 'monitor'}
      returnUrl={getSafeReturnUrl(query.returnUrl)}
      token={token}
    />
  );
}
