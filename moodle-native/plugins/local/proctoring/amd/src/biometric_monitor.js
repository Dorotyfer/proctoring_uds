define(['local_proctoring/session_api'], function(sessionApi) {
  function start(config) {
    const interval = config.interval || 30000;
    let stopped = false;
    const timer = window.setInterval(async () => {
      if (stopped) {
        return;
      }
      const samples = await config.samplesProvider();
      const result = await sessionApi.recordBiometricCheck(config.attemptid, samples);
      config.onResult?.(result);
    }, interval);
    return {
      stop: () => {
        stopped = true;
        window.clearInterval(timer);
      }
    };
  }

  return {start};
});
