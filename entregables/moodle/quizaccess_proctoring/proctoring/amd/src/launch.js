export const start = (attemptId, ready) => {
  const launchUrl = new URL('accessrule/proctoring/launch.php', window.location.href);
  launchUrl.searchParams.set('attemptid', attemptId);
  if (!ready) {
    window.location.assign(launchUrl.toString());
    return;
  }

  launchUrl.searchParams.set('mode', 'monitor');
  const frame = document.createElement('iframe');
  frame.allow = 'camera';
  frame.src = launchUrl.toString();
  frame.title = 'Estado de supervisión';
  frame.style.border = '1px solid #d8dde6';
  frame.style.height = '52px';
  frame.style.width = '100%';
  const container = document.querySelector('[role="main"]') ?? document.querySelector('#page-content') ?? document.body;
  container.prepend(frame);
};
