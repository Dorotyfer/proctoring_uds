define(['core/ajax'], function(Ajax) {
  function call(methodname, args) {
    return Ajax.call([{methodname, args}])[0].then((payload) => JSON.parse(payload));
  }

  function init() {
    const root = document.querySelector('[data-region="panel"]');
    if (!root) {
      return;
    }
    const status = root.querySelector('[data-region="panel-status"]');
    call('local_proctoring_list_courses', {search: ''}).then((result) => {
      root.querySelector('[data-region="course-list"]').textContent = JSON.stringify(result.courses);
      status.textContent = `${result.total} cursos con actividad de proctoring.`;
    }).catch(() => {
      status.textContent = 'No fue posible cargar el panel.';
    });
  }

  return {init, call};
});
