define(['local_proctoring/camera', 'local_proctoring/face_analysis', 'local_proctoring/environment_analysis', 'local_proctoring/device_signals'], function(camera, faceAnalysis, environmentAnalysis, deviceSignals) {
  function start(config) {
    const stream = config.stream;
    const video = config.video;
    const onSignal = config.onSignal || (() => {});
    const interval = config.interval || 5000;
    let stopped = false;
    const deviceCleanup = deviceSignals.attach(onSignal);
    const timer = window.setInterval(async () => {
      if (stopped) {
        return;
      }
      const face = await faceAnalysis.analyze(video, config.faceDetector);
      face.signals.forEach(onSignal);
      const environment = await environmentAnalysis.analyze(video, config.environmentDetector);
      environment.signals.forEach(onSignal);
    }, interval);
    return {
      stop: () => {
        stopped = true;
        window.clearInterval(timer);
        deviceCleanup();
        camera.stop(stream);
      }
    };
  }

  return {start};
});
