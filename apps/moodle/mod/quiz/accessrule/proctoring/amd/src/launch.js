define([], function() {
  return {
    init: function(launchUrl) {
      window.open(launchUrl, 'proctoring-launch', 'noopener');
    }
  };
});
