export function getSafeExamBrowserMetadata() {
  const version = globalThis.SafeExamBrowser?.version;
  if (typeof version !== 'string' || version.trim() === '') {
    return null;
  }
  return {
    source: 'safe-exam-browser',
    version: version.slice(0, 128)
  };
}
