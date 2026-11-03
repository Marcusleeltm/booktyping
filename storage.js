/* storage.js – persistent data layer with export/import */
window.Store = (function () {
  const KEY = 'epubtype_v2';
  let data = null;
  let saveListeners = [];

  function defaults() {
    return {
      version: 2,
      lastModified: 0,
      books: [],
      progress: {},
      completed: {},
      sessions: [],
      settings: {
        theme: 'auto',
        accent: '#6366f1',
        fontSize: 20,
        lineHeight: 18,
        fontFamily: 'serif',
        sound: true,
        volume: 30,
        strictPunctuation: false,
        stopOnMistake: true,
        autoScroll: true,
        skipMode: 'tab',
        highlight: 'char',
        dailyGoal: 1000,
      },
      achievements: {},
      streak: { current: 0, longest: 0, lastDate: null, todayChars: 0, todayDate: null },
    };
  }

  function load() {
    try { data = JSON.parse(localStorage.getItem(KEY)) || defaults(); }
    catch (_) { data = defaults(); }
    const d = defaults();
    data.settings = Object.assign(d.settings, data.settings || {});
    data.streak   = Object.assign(d.streak,   data.streak   || {});
    if (typeof data.lastModified !== 'number') data.lastModified = 0;
    return data;
  }

  function save() {
    if (!data) return;
    data.lastModified = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (_) {}
    saveListeners.forEach((fn) => { try { fn(); } catch (_) {} });
  }

  function get() { return data; }

  function exportAll() { return JSON.stringify(data, null, 2); }

  function importAll(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !parsed.books) throw new Error('Invalid backup file');
    data = parsed;
    save();
  }

  function reset() {
    localStorage.removeItem(KEY);
    data = defaults();
    save();
  }

  function recordSession(session) {
    data.sessions.push({ ...session, date: Date.now() });
    const today = new Date().toISOString().slice(0, 10);
    if (data.streak.todayDate !== today) {
      data.streak.todayDate = today;
      data.streak.todayChars = 0;
    }
    data.streak.todayChars += session.chars;
    updateStreak();
    save();
  }

  function updateStreak() {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const last = data.streak.lastDate;
    if (last === today) return;
    if (last === yesterday || last === null) data.streak.current += 1;
    else data.streak.current = 1;
    data.streak.lastDate = today;
    if (data.streak.current > data.streak.longest)
      data.streak.longest = data.streak.current;
    save();
  }

  load();
  return {
    get, save, exportAll, importAll, reset, recordSession, defaults,
    onSave(fn) { saveListeners.push(fn); },
  };
})();
