const status = document.querySelector('#verification-status');
const parameters = new URLSearchParams(location.search);
const nonce = parameters.get('nonce');
const action = parameters.get('action');
const valid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(nonce ?? '') && ['bug_report', 'demo_survey'].includes(action);
window.waterHoleVerificationReady = () => {
  if (!valid || window.parent === window) { status.textContent = 'Open verification from the game feedback panel.'; return; }
  window.turnstile.render('#challenge', {
    sitekey: document.documentElement.dataset.sitekey,
    action,
    callback(token) {
      if (typeof token !== 'string' || token.length > 2048) return;
      status.textContent = 'Verified. You can submit your feedback.';
      window.parent.postMessage({ type: 'water-hole-feedback-verified', nonce, action, token }, '*');
    },
    'expired-callback'() { status.textContent = 'Verification expired. Please try again.'; },
    'error-callback'() { status.textContent = 'Verification is unavailable. Please try again later.'; },
  });
};
