/* Only authenticated backend state confirms OAuth completion, across origins. */
function watchStripeConnection({ expiresAt, initialConnection, readConnection, onConnection, onComplete = () => {}, onStop = () => {}, isCurrent,
  events = window, visibility = typeof document === 'undefined' ? undefined : document,
  now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const deadline = Math.min(expiresAt * 1000, now() + 600000);
  let stopped = false, busy = false, queued = false, timer, deadlineTimer;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimer(timer); clearTimer(deadlineTimer);
    events.removeEventListener('focus', wake);
    visibility?.removeEventListener('visibilitychange', visible);
    onStop();
  };
  const tick = async () => {
    if (stopped) return;
    if (!isCurrent() || now() >= deadline) { stop(); return; }
    if (busy) { queued = true; return; }
    clearTimer(timer); busy = true;
    try {
      const value = await readConnection();
      if (!stopped && isCurrent() && now() < deadline) {
        onConnection(value);
        // Reconnect must observe a newly committed grant, not the old Connected status.
        if (value.connected && (initialConnection?.connected === false ||
            (initialConnection?.connected === true && typeof value.connectionRevision === 'string' && value.connectionRevision !== initialConnection.connectionRevision))) {
          stop(); onComplete(value);
        }
      }
    } catch { /* A transient request failure does not end the bounded watch. */ }
    finally {
      busy = false;
      if (!stopped) {
        if (!isCurrent() || now() >= deadline) stop();
        else { timer = setTimer(tick, queued ? 0 : 2000); queued = false; }
      }
    }
  };
  function wake() { void tick(); }
  function visible() { if (visibility.visibilityState === 'visible') wake(); }
  // COOP navigation may mark a WindowProxy closed while Stripe's tab is still open.
  // popup.closed is therefore not evidence of completion or cancellation.
  events.addEventListener('focus', wake);
  visibility?.addEventListener('visibilitychange', visible);
  deadlineTimer = setTimer(stop, Math.max(0, deadline - now()));
  timer = setTimer(tick, 1000);
  return stop;
}
module.exports = { watchStripeConnection };
