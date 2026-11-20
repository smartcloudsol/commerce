// Use the shared Hub decryption reader and canonical workspace transport.
// A signed snapshot can be displayed offline; a live revision is required to save.
function createConfigurationLoader({
  readCached,
  remote,
  onValue,
  onError,
  isCurrent,
}) {
  let generation = 0;
  return {
    async load() {
      const request = ++generation;
      const current = () => request === generation && isCurrent();
      let live = false;
      let cached = false;
      const cachedRead = Promise.resolve()
        .then(readCached)
        .then((raw) => {
          const settings = remote.normalizeCached(raw);
          if (settings && current() && !live) {
            cached = true;
            onValue(settings, { source: "cached", canSave: false });
          }
        })
        .catch(() => {});
      const liveRead = remote.load().then((settings) => {
        if (current()) {
          live = true;
          onValue(settings, { source: "workspace", canSave: true });
        }
      });
      const [workspace] = await Promise.allSettled([liveRead, cachedRead]);
      if (current() && workspace.status === "rejected")
        onError({ hasCached: cached });
    },
    reset() {
      ++generation;
      remote.reset();
    },
  };
}
module.exports = { createConfigurationLoader };
