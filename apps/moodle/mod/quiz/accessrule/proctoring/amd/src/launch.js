export const redirect = (attemptId) => {
  const launchUrl = new URL('accessrule/proctoring/launch.php', window.location.href);
  launchUrl.searchParams.set('attemptid', attemptId);
  window.location.assign(launchUrl.toString());
};
