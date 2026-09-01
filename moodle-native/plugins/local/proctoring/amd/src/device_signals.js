define([], function() {
  const EVENTS = [
    ['visibilitychange', () => ({type: 'page_visibility_changed', metadata: {state: document.visibilityState}})],
    ['blur', () => ({type: 'window_blur', metadata: {}})],
    ['focus', () => ({type: 'window_focus', metadata: {}})],
    ['fullscreenchange', () => ({type: document.fullscreenElement ? 'window_focus' : 'fullscreen_exit', metadata: {}})]
  ];

  function attach(onSignal) {
    const listeners = EVENTS.map(([event, factory]) => {
      const listener = () => onSignal({...factory(), occurredat: Date.now(), clienteventid: `${event}-${Date.now()}`});
      window.addEventListener(event, listener);
      return [event, listener];
    });
    return () => listeners.forEach(([event, listener]) => window.removeEventListener(event, listener));
  }

  return {attach};
});
