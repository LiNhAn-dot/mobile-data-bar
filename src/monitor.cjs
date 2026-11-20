function createMonitor({ query, cached = null, now = () => new Date(), onChange = () => {} }) {
  let state = { status: cached ? 'cached' : 'idle', balance: cached };
  let inFlight;

  function publish(update) {
    state = update;
    onChange(state);
  }

  function refresh(mode) {
    if (inFlight) return inFlight;
    publish({ ...state, status: 'refreshing' });
    inFlight = Promise.resolve()
      .then(() => query(mode))
      .then(result => {
        const balance = result.status === 'ready'
          ? { ...result.balance, checkedAt: result.balance.queriedAt ?? now().toISOString() }
          : state.balance;
        publish({ status: result.status, balance });
      }, () => publish({ ...state, status: 'error' }))
      .finally(() => { inFlight = undefined; });
    return inFlight;
  }

  return { get state() { return state; }, refresh };
}

module.exports = { createMonitor };
