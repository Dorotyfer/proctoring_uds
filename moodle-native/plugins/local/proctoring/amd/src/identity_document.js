define([], function() {
  const MAX_BYTES = 200 * 1024;

  function validate(jpegDataUrl) {
    if (typeof jpegDataUrl !== 'string' || !jpegDataUrl.startsWith('data:image/jpeg;base64,')) {
      return {valid: false, reason: 'invalid_format'};
    }
    const base64 = jpegDataUrl.split(',', 2)[1] || '';
    const bytes = Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
    return bytes <= MAX_BYTES ? {valid: true, bytes} : {valid: false, reason: 'size_limit'};
  }

  return {validate, MAX_BYTES};
});
