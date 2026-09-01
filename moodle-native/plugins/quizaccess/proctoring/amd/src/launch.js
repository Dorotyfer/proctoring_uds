define(['local_proctoring/preparation'], function(preparation) {
  return {
    start: function(config) {
      return preparation.start(config);
    }
  };
});
