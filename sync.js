/* sync.js – GitHub Gist cross-device sync */
window.Sync = (function () {
  const TOKEN_KEY = 'epubtype_sync_token';
  const GIST_KEY  = 'epubtype_sync_gist_id';
  const AUTO_KEY  = 'epubtype_sync_auto';
  const FILENAME  = 'epubtype-data.json';
  const DESCRIPTION = 'EPUB Type — private sync';

  let autoSync = true;
  let pushTimer = null;
  let syncing = false;

  const getToken  = () => localStorage.getItem(TOKEN_KEY);
  const getGistId = () => localStorage.getItem(GIST_KEY);
  const isConnected = () => !!getToken() && !!getGistId();

  async function api(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error('Not connected');
    const res = await fetch('https://api.github.com' + path, {
      ...opts,
      headers: {
        Authorization: 'token ' + token,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'GitHub API ' + res.status);
    }
    return res.json();
  }

  async function findExistingGist() {
    try {
      const gists = await api('/gists?per_page=100');
      const match = (gists || []).find((g) => g.description === DESCRIPTION);
      return match ? match.id : null;
    } catch (e) {
      console.warn('Gist lookup failed', e);
      return null;
    }
  }

  async function createGist(data) {
    const gist = await api('/gists', {
      method: 'POST',
      body: JSON.stringify({
        description: DESCRIPTION,
        public: false,
        files: { [FILENAME]: { content: JSON.stringify(data, null, 2) } },
      }),
    });
    return gist.id;
  }

  async function updateGist(gistId, data) {
    await api('/gists/' + gistId, {
      method: 'PATCH',
      body: JSON.stringify({
        files: { [FILENAME]: { content: JSON.stringify(data, null, 2) } },
      }),
    });
  }

  async function fetchGist(gistId) {
    const gist = await api('/gists/' + gistId);
    const file = gist.files[FILENAME];
    if (!file) return null;
    const raw = file.truncated
      ? await (await fetch(file.raw_url)).text()
      : file.content;
    return JSON.parse(raw);
  }

  async function connect(token) {
    localStorage.setItem(TOKEN_KEY, token);
    let gistId = getGistId();

    if (!gistId) gistId = await findExistingGist();

    if (gistId) {
      try { await fetchGist(gistId); }
      catch (_) { gistId = null; }
    }

    if (!gistId) gistId = await createGist(Store.get());

    localStorage.setItem(GIST_KEY, gistId);
    return gistId;
  }

  async function pull() {
    if (!isConnected()) throw new Error('Not connected');
    const remote = await fetchGist(getGistId());
    if (!remote) return Store.get();

    const local = Store.get();
    const merged = mergeData(local, remote);

    Object.keys(Store.get()).forEach((k) => { delete Store.get()[k]; });
    Object.assign(Store.get(), merged);
    Store.save();
    return merged;
  }

  async function push() {
    if (!isConnected()) throw new Error('Not connected');
    if (syncing) return;
    syncing = true;
    try {
      await updateGist(getGistId(), Store.get());
    } finally {
      syncing = false;
    }
  }

  function mergeData(local, remote) {
    const out = JSON.parse(JSON.stringify(local));

    // Books — union by id, prefer the version with more sections
    const byId = new Map(out.books.map((b) => [b.id, b]));
    (remote.books || []).forEach((rb) => {
      const lb = byId.get(rb.id);
      if (!lb) byId.set(rb.id, rb);
      else if (rb.sections.length > lb.sections.length) byId.set(rb.id, rb);
    });
    out.books = [...byId.values()];

    // Progress — max per section
    out.progress = out.progress || {};
    const allBookIds = new Set([
      ...Object.keys(out.progress),
      ...Object.keys(remote.progress || {}),
    ]);
    allBookIds.forEach((bid) => {
      const lp = out.progress[bid] || {};
      const rp = remote.progress?.[bid] || {};
      const merged = { ...lp };
      Object.keys(rp).forEach((sid) => {
        merged[sid] = Math.max(lp[sid] || 0, rp[sid] || 0);
      });
      out.progress[bid] = merged;
    });

    // Completed — union
    out.completed = out.completed || {};
    const allCompletedBooks = new Set([
      ...Object.keys(out.completed),
      ...Object.keys(remote.completed || {}),
    ]);
    allCompletedBooks.forEach((bid) => {
      const set = new Set([
        ...(out.completed[bid] || []),
        ...(remote.completed?.[bid] || []),
      ]);
      out.completed[bid] = [...set];
    });

    // Sessions — union by composite key
    const sessionKey = (s) => s.bookId + '|' + s.sectionId + '|' + s.date;
    const sessionMap = new Map();
    [...(out.sessions || []), ...(remote.sessions || [])].forEach((s) => {
      if (!sessionMap.has(sessionKey(s))) sessionMap.set(sessionKey(s), s);
    });
    out.sessions = [...sessionMap.values()].sort((a, b) => a.date - b.date);

    // Streak — max
    const ls = out.streak || {};
    const rs = remote.streak || {};
    out.streak = {
      current: Math.max(ls.current || 0, rs.current || 0),
      longest: Math.max(ls.longest || 0, rs.longest || 0),
      lastDate: ls.lastDate || rs.lastDate,
      todayDate: ls.todayDate || rs.todayDate,
      todayChars: Math.max(ls.todayChars || 0, rs.todayChars || 0),
    };

    // Achievements — union
    out.achievements = { ...(remote.achievements || {}), ...(out.achievements || {}) };

    // Settings — newer side wins
    if ((remote.lastModified || 0) > (out.lastModified || 0)) {
      out.settings = remote.settings || out.settings;
    }

    out.lastModified = Date.now();
    return out;
  }

  function schedulePush() {
    if (!autoSync || !isConnected() || syncing) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      push().catch((e) => console.warn('Auto-push failed', e));
    }, 3000);
  }

  function setAutoSync(v) {
    autoSync = !!v;
    localStorage.setItem(AUTO_KEY, autoSync ? '1' : '0');
  }

  function disconnect() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(GIST_KEY);
  }

  function init() {
    const saved = localStorage.getItem(AUTO_KEY);
    if (saved !== null) autoSync = saved === '1';
  }

  return {
    init, connect, pull, push, schedulePush, disconnect,
    isConnected, setAutoSync, getGistId,
  };
})();
