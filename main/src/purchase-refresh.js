/* Recheck verified entitlement and session state; a checkout marker grants nothing. */
function createPurchaseRefresh({ readEntitlements, readScopes, forceRefreshSession, isCurrent, onUpdate, onStop, setTimer = setTimeout, clearTimer = clearTimeout, now = () => Date.now(), durationMs = 60000, intervalMs = 2000, maxRefreshes = 3 }) {
  let active = false, started = false, timer, deadlineTimer, deadline = 0, refreshes = 0, running = false, refreshPending = false, checkoutWatch = false;
  const current = () => { if (active && !isCurrent()) stop('stopped'); return active; };
  function stop(reason = 'stopped') {
    if (!active) return;
    active = false;
    if (timer !== undefined) clearTimer(timer);
    if (deadlineTimer !== undefined) clearTimer(deadlineTimer);
    timer = undefined; deadlineTimer = undefined;
    if (isCurrent()) onStop(reason);
  }
  async function refresh() {
    if (!current() || refreshPending || refreshes >= maxRefreshes) return;
    refreshPending = true; refreshes++;
    try { await forceRefreshSession(); } catch { /* Retry is bounded; no credential or error is exposed. */ }
    finally { refreshPending = false; }
  }
  async function tick() {
    if (!current() || running) return;
    running = true;
    try {
      if (now() >= deadline) { stop('timeout'); return; }
      const result = await readEntitlements();
      if (!current()) return;
      if (!result || !['ready', 'pending'].includes(result.status) || !Array.isArray(result.entitlements)) throw new Error('Invalid entitlements');
      const required = result.status === 'ready' ? [...new Set(result.entitlements.flatMap(item => {
        if (!item || !Array.isArray(item.scopes) || item.scopes.some(scope => typeof scope !== 'string')) throw new Error('Invalid scopes');
        return item.scopes;
      }))] : [];
      let scopes = await readScopes();
      if (!current()) return;
      if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) throw new Error('Invalid session');
      let synchronized = result.status === 'ready' && required.every(scope => scopes.includes(scope));
      if (result.status === 'ready' && !synchronized && refreshes < maxRefreshes) {
        await refresh();
        if (!current()) return;
        scopes = await readScopes();
        if (!current()) return;
        if (!Array.isArray(scopes) || scopes.some(scope => typeof scope !== 'string')) throw new Error('Invalid session');
        synchronized = required.every(scope => scopes.includes(scope));
      }
      if (current()) onUpdate({ entitlements: result, synchronized });
      if (synchronized && !checkoutWatch) { stop('synchronized'); return; }
    } catch {
      if (current()) onUpdate({ synchronized: false });
    } finally {
      running = false;
      if (current()) {
        const remaining = deadline - now();
        if (remaining <= 0) stop('timeout');
        else timer = setTimer(() => { timer = undefined; void tick(); }, Math.min(intervalMs, remaining));
      }
    }
  }
  return {
    start({ checkoutReturn = false } = {}) {
      if (started || !isCurrent()) return;
      started = true; active = true; checkoutWatch = checkoutReturn; deadline = now() + durationMs;
      deadlineTimer = setTimer(() => { deadlineTimer = undefined; stop('timeout'); }, durationMs);
      void (async () => { if (checkoutReturn) await refresh(); if (current()) await tick(); })();
    },
    stop,
  };
}
module.exports = { createPurchaseRefresh };
