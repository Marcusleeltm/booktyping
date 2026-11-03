/* app.js – EPUB Type main logic */
(function () {
  'use strict';

  const $  = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const escapeHtml = (s) => { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

  // ---------- DOM ----------
  const views = {
    library: $('#view-library'),
    picker:  $('#view-picker'),
    typing:  $('#view-typing'),
    stats:   $('#view-stats'),
    settings:$('#view-settings'),
  };
  const typingInput = $('#typingInput');
  const textDisplay = $('#textDisplay');
  const toastEl = $('#toast');

  // ---------- State ----------
  const state = {
    activeView: 'library',
    currentBook: null,
    currentSections: [],
    sectionIndex: 0,
    text: '',
    charIndex: 0,
    typedChars: [],
    correctCount: 0,
    errorCount: 0,
    totalTyped: 0,
    startTime: null,
    pausedAt: null,
    elapsedMs: 0,
    timerInterval: null,
    paused: false,
    currentSectionEl: null,
  };

  const settings = () => Store.get().settings;

  // ---------- Toast ----------
  function toast(msg, ms = 2200) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => (toastEl.hidden = true), ms);
  }

  // ---------- Theme & settings application ----------
  function applyTheme() {
    const t = settings().theme;
    document.documentElement.removeAttribute('data-theme');
    if (t === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'dark');
  }
  function applyTypography() {
    const s = settings();
    const root = document.documentElement.style;
    root.setProperty('--typing-size', s.fontSize + 'px');
    root.setProperty('--typing-line', (s.lineHeight / 10).toString());
    root.setProperty('--typing-font',
      s.fontFamily === 'serif' ? "'Georgia','Times New Roman',serif"
      : s.fontFamily === 'mono' ? "'JetBrains Mono',ui-monospace,monospace"
      : "system-ui,-apple-system,'Segoe UI',sans-serif");
    root.setProperty('--accent', s.accent);
    root.setProperty('--accent-hover', shade(s.accent, -15));
  }
  function shade(hex, pct) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + pct));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + pct));
    const b = Math.max(0, Math.min(255, (n & 255) + pct));
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }
  function applySound() {
    Sound.setEnabled(settings().sound);
    Sound.setVolume(settings().volume / 100);
  }

  // ---------- Navigation ----------
  function showView(name) {
    Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
    state.activeView = name;
    if (name === 'library') refreshLibrary();
    if (name === 'stats')    refreshStats();
    if (name === 'settings') refreshSettingsForm();
    if (name === 'typing') {
      setTimeout(() => typingInput.focus(), 50);
    } else {
      typingInput.blur();
      if (state.timerInterval) clearInterval(state.timerInterval);
    }
    $$('.tabs button').forEach(b => b.classList.toggle('active',
      b.dataset.tab === name || (name === 'picker' && b.dataset.tab === 'library')));
  }

  $$('.tabs button').forEach((btn) =>
    btn.addEventListener('click', () => showView(btn.dataset.tab)));

  // ---------- Library ----------
  function refreshLibrary() {
    const search = ($('#libSearch').value || '').toLowerCase();
    const list = $('#bookList');
    const empty = $('#emptyLibrary');
    const books = Store.get().books
      .filter(b => !search || b.title.toLowerCase().includes(search)
                       || (b.author || '').toLowerCase().includes(search));
    list.innerHTML = '';
    empty.hidden = books.length !== 0;
    books.forEach((book) => {
      const completed = (Store.get().completed[book.id] || []).length;
      const pct = book.sections.length ? Math.round(completed / book.sections.length * 100) : 0;
      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = `
        <h3>${escapeHtml(book.title)}</h3>
        <div class="meta">${escapeHtml(book.author || 'Unknown author')}</div>
        <div class="meta">${book.sections.length} sections · ${completed} completed · ${pct}%</div>
        <div class="progress-mini"><div style="width:${pct}%"></div></div>
        <div class="actions">
          <button data-action="open" data-id="${book.id}">Open</button>
          <button data-action="reset" data-id="${book.id}">↻</button>
          <button data-action="delete" data-id="${book.id}">🗑</button>
        </div>`;
      list.appendChild(card);
    });
    list.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        const { action, id } = btn.dataset;
        if (action === 'open')   openPickerFor(id);
        if (action === 'delete') deleteBook(id);
        if (action === 'reset')  resetBookProgress(id);
      });
    });
  }
  $('#libSearch').addEventListener('input', refreshLibrary);

  function deleteBook(id) {
    if (!confirm('Delete this book and all its progress?')) return;
    const d = Store.get();
    d.books = d.books.filter(b => b.id !== id);
    delete d.progress[id];
    delete d.completed[id];
    Store.save();
    refreshLibrary();
    toast('Book deleted');
  }
  function resetBookProgress(id) {
    if (!confirm('Reset progress for this book?')) return;
    delete Store.get().progress[id];
    delete Store.get().completed[id];
    Store.save();
    refreshLibrary();
    toast('Progress reset');
  }

  // ---------- EPUB upload ----------
  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.epub')) { toast('Please choose an .epub file'); return; }
    toast('Parsing EPUB…', 1500);
    try {
      const { title, author, sections } = await EPUBParser.parseEPUB(file);
      if (!sections.length) { toast('No readable text found in this EPUB'); return; }
      const book = {
        id: 'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: title || file.name.replace(/\.epub$/i, ''),
        author,
        sections,
        addedAt: Date.now(),
      };
      Store.get().books.push(book);
      Store.save();
      checkAchievement('first_book');
      refreshLibrary();
      toast(`Added "${book.title}" (${sections.length} sections)`);
    } catch (err) {
      console.error(err);
      toast('Failed to parse EPUB — see console');
    }
  }

  $('#fileInput').addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) handleFile(f);
    e.target.value = '';
  });
  const dz = $('#dropZone');
  ['dragover', 'dragenter'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => {
    e.preventDefault(); dz.classList.remove('dragover');
  }));
  dz.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // ---------- Picker ----------
  function openPickerFor(bookId) {
    const book = Store.get().books.find(b => b.id === bookId);
    if (!book) return;
    state.currentBook = book;
    $('#pickerTitle').textContent = `Sections — "${book.title}"`;
    renderSectionList(book);
    showView('picker');
  }
  function renderSectionList(book) {
    const completed = new Set(Store.get().completed[book.id] || []);
    const list = $('#sectionList');
    list.innerHTML = '';
    book.sections.forEach((sec) => {
      const li = document.createElement('li');
      li.innerHTML = `
        <input type="checkbox" data-id="${sec.id}" ${completed.has(sec.id) ? '' : 'checked'} />
        <span class="label" title="${escapeHtml(sec.label)}">${escapeHtml(sec.label)}</span>
        ${completed.has(sec.id) ? '<span class="badge">✓ done</span>' : ''}
        <span class="badge">${sec.text.split(/\s+/).length} words</span>`;
      list.appendChild(li);
    });
    list.querySelectorAll('input').forEach((cb) =>
      cb.addEventListener('change', updatePickerCount));
    updatePickerCount();
  }
  function updatePickerCount() {
    const total = $$('#sectionList input').length;
    const checked = $$('#sectionList input:checked').length;
    $('#pickerCount').textContent = `${checked} of ${total} selected`;
  }
  $('#selectAllBtn').addEventListener('click', () => {
    $$('#sectionList input').forEach(cb => cb.checked = true);
    updatePickerCount();
  });
  $('#selectNoneBtn').addEventListener('click', () => {
    $$('#sectionList input').forEach(cb => cb.checked = false);
    updatePickerCount();
  });
  $('#autoSkipBtn').addEventListener('click', () => {
    const re = /^(cover|title page|copyright|toc|table of contents|contents|preface|foreword|introduction|acknowledg|dedication|epigraph|half title|frontispiece|about the author|also by)/i;
    $$('#sectionList li').forEach((li) => {
      const label = li.querySelector('.label').textContent;
      const cb = li.querySelector('input');
      if (cb) cb.checked = !re.test(label);
    });
    updatePickerCount();
    toast('Front matter skipped');
  });
  $('#cancelPickerBtn').addEventListener('click', () => showView('library'));
  $('#startTypingBtn').addEventListener('click', () => {
    const ids = $$('#sectionList input:checked').map(cb => cb.dataset.id);
    if (!ids.length) { toast('Select at least one section'); return; }
    state.currentSections = state.currentBook.sections.filter(s => ids.includes(s.id));
    state.sectionIndex = 0;
    loadSection(0);
    showView('typing');
  });

  // ---------- Typing engine ----------
  function loadSection(index) {
    if (index >= state.currentSections.length) {
      toast('🎉 All selected sections completed!');
      showView('library');
      return;
    }
    state.sectionIndex = index;
    const sec = state.currentSections[index];
    state.text = sec.text;
    state.typedChars = [];
    state.correctCount = 0;
    state.errorCount = 0;
    state.totalTyped = 0;
    state.startTime = null;
    state.pausedAt = null;
    state.elapsedMs = 0;
    state.paused = false;
    $('#pauseBtn').textContent = '⏸';

    // Resume saved progress
    const saved = Store.get().progress[state.currentBook.id]?.[sec.id] || 0;
    state.charIndex = Math.min(saved, sec.text.length);

    // Pre-populate typedChars for resumed positions so they render green
state.typedChars = [];
for (let i = 0; i < state.charIndex; i++) {
  state.typedChars[i] = { expected: sec.text[i], actual: sec.text[i], correct: true };
}

    $('#chapterTitle').textContent = sec.label;
    $('#progressText').textContent = `Section ${index + 1} / ${state.currentSections.length}`;
    updateStatsUI();
    renderText();
    updateCursor();
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(tickTimer, 500);
    setTimeout(() => typingInput.focus(), 40);
  }

  function renderText() {
    textDisplay.innerHTML = '';
    textDisplay.className = 'text-display';
    const hl = settings().highlight;
    const txt = state.text;
    const frag = document.createDocumentFragment();

    if (hl === 'word') {
      // Wrap each word in a span, then chars inside
      const tokens = txt.match(/\S+|\s+/g) || [];
      let global = 0;
      tokens.forEach((tok) => {
        const wordEl = document.createElement('span');
        wordEl.className = 'word';
        if (/^\s+$/.test(tok)) { wordEl.textContent = tok; global += tok.length; frag.appendChild(wordEl); return; }
        for (const ch of tok) {
          const s = document.createElement('span');
          s.textContent = ch;
          s.className = 'pending';
          s.dataset.index = global++;
          wordEl.appendChild(s);
        }
        frag.appendChild(wordEl);
      });
    } else {
      for (let i = 0; i < txt.length; i++) {
        const s = document.createElement('span');
        s.textContent = txt[i];
        s.className = 'pending';
        s.dataset.index = i;
        frag.appendChild(s);
      }
    }
    textDisplay.appendChild(frag);

    // Focus mode classes
    const fm = $('#focusSelect').value;
    if (fm === 'line') textDisplay.classList.add('focus-line');
  }
  
function persistProgress() {
  const d = Store.get();
  const sec = state.currentSections[state.sectionIndex];
  if (!sec) return;
  d.progress[state.currentBook.id] ||= {};
  d.progress[state.currentBook.id][sec.id] = state.charIndex;
  Store.save();
}

function flashIncorrect() {
  const cur = textDisplay.querySelector('span.current');
  if (!cur) return;
  // Clear any prior flash on the same span
  if (cur._flashTimer) clearTimeout(cur._flashTimer);
  cur.classList.add('incorrect');
  cur._flashTimer = setTimeout(() => {
    cur.classList.remove('incorrect');
    // Only restore "current" if the user hasn't advanced past this char
    if (+cur.dataset.index === state.charIndex) cur.classList.add('current');
  }, 220);
}
  
  function updateCursor() {
    const spans = textDisplay.querySelectorAll('span[data-index]');
    spans.forEach((s) => {
      const i = +s.dataset.index;
      s.classList.remove('current', 'correct', 'incorrect');
      if (i < state.charIndex) {
        s.classList.add(state.typedChars[i]?.correct ? 'correct' : 'incorrect');
      } else if (i === state.charIndex) {
        s.classList.add('current');
      } else {
        s.classList.add('pending');
      }
    });
    const total = state.text.length || 1;
    $('#progressFill').style.width = (state.charIndex / total * 100) + '%';

    // Word highlight mode: highlight current word
    if (settings().highlight === 'word') {
      textDisplay.querySelectorAll('.word.current-word').forEach(el => el.classList.remove('current-word'));
      const cur = textDisplay.querySelector('span.current');
      cur?.closest('.word')?.classList.add('current-word');
    }

    // Focus modes
    if (textDisplay.classList.contains('focus-line')) {
      // handled by CSS - current char auto-highlighted
    }

    // Auto-scroll
    if (settings().autoScroll) {
      const cur = textDisplay.querySelector('span.current');
      if (cur) {
        const rect = cur.getBoundingClientRect();
        const box = textDisplay.getBoundingClientRect();
        if (rect.top < box.top + 40 || rect.bottom > box.bottom - 40) {
          cur.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    }
  }

function processChar(ch) {
  if (state.paused) return;
  if (state.charIndex >= state.text.length) return;

  const expected = state.text[state.charIndex];
  const strict = $('#strictMode').checked || settings().strictPunctuation;
  const norm = (c) =>
    c.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
  const correct = strict ? ch === expected : norm(ch) === norm(expected);

  if (!state.startTime) state.startTime = Date.now();

  // ── WRONG KEY ─────────────────────────────────────────────
  if (!correct) {
    state.errorCount++;
    state.totalTyped++;
    Sound.error();

    if (settings().stopOnMistake) {
      // STRICT: do NOT advance; flash the current character red briefly.
      flashIncorrect();
      updateStatsUI();
      return;                            // ← cursor stays on same char
    }
    // FREE-TYPE fallback: advance but mark red
    state.typedChars[state.charIndex] = { expected, actual: ch, correct: false };
    state.charIndex++;
    persistProgress();
    updateCursor();
    updateStatsUI();
    if (state.charIndex >= state.text.length) finishSection();
    return;
  }

  // ── CORRECT KEY ───────────────────────────────────────────
  state.typedChars[state.charIndex] = { expected, actual: ch, correct: true };
  state.correctCount++;
  state.totalTyped++;
  Sound.key();

  state.charIndex++;
  persistProgress();
  updateCursor();
  updateStatsUI();
  checkAchievementsLive();

  if (state.charIndex >= state.text.length) finishSection();
}
  function processBackspace() {
  if (state.paused || state.charIndex <= 0) return;
  state.charIndex--;
  const prev = state.typedChars[state.charIndex];
  if (prev && prev.correct) state.correctCount = Math.max(0, state.correctCount - 1);
  state.typedChars.pop();
  state.totalTyped = Math.max(0, state.totalTyped - 1);
  persistProgress();
  updateCursor();
  updateStatsUI();
}

  function processSkip() {
    if (state.paused || state.charIndex >= state.text.length) return;
    const expected = state.text[state.charIndex];
    state.typedChars[state.charIndex] = { expected, actual: null, correct: true };
    state.correctCount++;
    state.totalTyped++;
    state.charIndex++;
    updateCursor();
    updateStatsUI();
    if (state.charIndex >= state.text.length) finishSection();
  }

  function finishSection() {
    const sec = state.currentSections[state.sectionIndex];
    const d = Store.get();
    d.completed[state.currentBook.id] ||= [];
    if (!d.completed[state.currentBook.id].includes(sec.id))
      d.completed[state.currentBook.id].push(sec.id);

    const elapsedMin = Math.max(state.elapsedMs, (Date.now() - (state.startTime || Date.now()))) / 60000;
    const wpm = elapsedMin > 0 ? Math.round(state.correctCount / 5 / elapsedMin) : 0;
    const accuracy = state.totalTyped > 0 ? Math.round(state.correctCount / state.totalTyped * 100) : 100;
    const duration = Math.round((state.elapsedMs || (Date.now() - (state.startTime || Date.now()))) / 1000);

    Store.recordSession({
      bookId: state.currentBook.id,
      bookTitle: state.currentBook.title,
      sectionId: sec.id,
      sectionLabel: sec.label,
      wpm, accuracy, chars: sec.text.length, duration,
      errors: state.errorCount,
    });
    checkAchievement('first_section');
    checkSessionAchievements(wpm, duration);

    if (state.timerInterval) clearInterval(state.timerInterval);
    Sound.complete();
    toast('✅ Section complete!');

    setTimeout(() => {
      if (state.sectionIndex + 1 < state.currentSections.length)
        loadSection(state.sectionIndex + 1);
      else
        showView('library');
    }, 700);
  }

  function tickTimer() {
    if (!state.startTime || state.paused) return;
    state.elapsedMs = Date.now() - state.startTime;
    updateStatsUI();
  }

  function updateStatsUI() {
    const elapsedMin = state.elapsedMs / 60000;
    const wpm = elapsedMin > 0 ? Math.round(state.correctCount / 5 / elapsedMin) : 0;
    const cpm = elapsedMin > 0 ? Math.round(state.correctCount / elapsedMin) : 0;
    const acc = state.totalTyped > 0
      ? Math.round(state.correctCount / state.totalTyped * 100) : 100;
    $('#wpmDisplay').textContent = wpm;
    $('#cpmDisplay').textContent = cpm;
    $('#accuracyDisplay').textContent = acc;
    $('#errorsDisplay').textContent = state.errorCount;
    $('#charsDisplay').textContent = state.correctCount;
    const s = Math.floor(state.elapsedMs / 1000);
    $('#timeDisplay').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // ---------- Input handling ----------
  typingInput.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'insertText' && e.data) {
      e.preventDefault();
      for (const ch of e.data) processChar(ch);
    } else if (e.inputType === 'insertCompositionText') {
      e.preventDefault();
    }
  });
  typingInput.addEventListener('input', () => {
    // Fallback for edge cases
    const v = typingInput.value;
    if (v) {
      typingInput.value = '';
      for (const ch of v) processChar(ch);
    }
  });
  typingInput.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') { e.preventDefault(); processBackspace(); }
    else if (e.key === 'Tab') { e.preventDefault(); processSkip(); }
    else if (e.key === 'Escape') { e.preventDefault(); showView('library'); }
  });
  // Ensure input is focused during typing
  document.addEventListener('keydown', (e) => {
    if (state.activeView === 'typing' && document.activeElement !== typingInput
        && e.key.length === 1) {
      typingInput.focus();
    }
  });
  textDisplay.addEventListener('click', () => typingInput.focus());
  textDisplay.addEventListener('touchstart', () => typingInput.focus(), { passive: true });

  // Pause / restart / next
  $('#pauseBtn').addEventListener('click', () => {
    if (state.paused) {
      state.paused = false;
      if (state.startTime) state.startTime = Date.now() - state.elapsedMs;
      $('#pauseBtn').textContent = '⏸';
      typingInput.focus();
    } else {
      state.paused = true;
      $('#pauseBtn').textContent = '▶';
      typingInput.blur();
    }
  });
  $('#restartBtn').addEventListener('click', () => {
    if (!state.currentBook) return;
    const sec = state.currentSections[state.sectionIndex];
    Store.get().progress[state.currentBook.id] ||= {};
    Store.get().progress[state.currentBook.id][sec.id] = 0;
    Store.save();
    loadSection(state.sectionIndex);
  });
  $('#nextSectionBtn').addEventListener('click', () => {
    if (state.sectionIndex + 1 < state.currentSections.length) loadSection(state.sectionIndex + 1);
    else showView('library');
  });
  $('#exitTypingBtn').addEventListener('click', () => showView('library'));
  $('#zenMode').addEventListener('change', (e) => document.body.classList.toggle('zen', e.target.checked));
  $('#focusSelect').addEventListener('change', () => {
    textDisplay.classList.remove('focus-line', 'focus-para');
    const v = $('#focusSelect').value;
    if (v === 'line') textDisplay.classList.add('focus-line');
  });

  // ---------- Stats ----------
  function refreshStats() {
    const d = Store.get();
    const sessions = d.sessions;
    const totalSessions = sessions.length;
    const totalTimeSec = sessions.reduce((a, s) => a + s.duration, 0);
    const totalChars = sessions.reduce((a, s) => a + s.chars, 0);
    const avgWpm = totalSessions ? Math.round(sessions.reduce((a, s) => a + s.wpm, 0) / totalSessions) : 0;
    const bestWpm = totalSessions ? Math.max(...sessions.map(s => s.wpm)) : 0;
    const today = new Date().toISOString().slice(0, 10);
    const todayChars = d.streak.todayDate === today ? d.streak.todayChars : 0;
    const goalPct = Math.min(100, Math.round(todayChars / d.settings.dailyGoal * 100));

    $('#statTotalSessions').textContent = totalSessions;
    $('#statTotalTime').textContent = fmtTime(totalTimeSec);
    $('#statTotalChars').textContent = totalChars.toLocaleString();
    $('#statAvgWpm').textContent = avgWpm;
    $('#statBestWpm').textContent = bestWpm;
    $('#statStreak').textContent = d.streak.current;
    $('#statLongestStreak').textContent = d.streak.longest;
    $('#statGoal').textContent = goalPct + '%';

    // Chart
    const last20 = sessions.slice(-20).map(s => s.wpm);
    Charts.barChart($('#wpmChart'), last20);

    // Achievements
    renderAchievements();

    // Recent sessions
    const list = $('#recentSessions');
    list.innerHTML = '';
    [...sessions].reverse().slice(0, 15).forEach((s) => {
      const row = document.createElement('div');
      row.className = 'session-row';
      row.innerHTML = `
        <div><b>${escapeHtml(s.sectionLabel)}</b><br><span class="date">${new Date(s.date).toLocaleString()}</span></div>
        <div class="num">${s.wpm} WPM</div>
        <div class="num">${s.accuracy}%</div>
        <div>${s.chars} chars</div>
        <div class="date">${fmtTime(s.duration)}</div>`;
      list.appendChild(row);
    });
    if (!sessions.length) list.innerHTML = '<div style="padding:1rem" class="muted">No sessions yet.</div>';
  }
  function fmtTime(sec) {
    if (sec < 60) return sec + 's';
    if (sec < 3600) return Math.round(sec / 60) + 'm';
    return Math.round(sec / 3600) + 'h';
  }

  // ---------- Achievements ----------
  const ACHIEVEMENTS = [
    { id: 'first_book',      name: 'First Upload',   icon: '📚', desc: 'Upload your first EPUB' },
    { id: 'first_section',   name: 'First Section',  icon: '✍️', desc: 'Complete one section' },
    { id: 'sections_10',     name: 'Getting Going',  icon: '🔟', desc: 'Complete 10 sections' },
    { id: 'sections_50',     name: 'Halfway Hero',   icon: '⚡', desc: 'Complete 50 sections' },
    { id: 'chars_10k',       name: '10K Club',       icon: '💪', desc: 'Type 10,000 characters' },
    { id: 'chars_100k',      name: '100K Club',      icon: '🏆', desc: 'Type 100,000 characters' },
    { id: 'wpm_40',          name: 'Fast Fingers',   icon: '🔥', desc: 'Reach 40 WPM' },
    { id: 'wpm_60',          name: 'Speed Demon',    icon: '🚀', desc: 'Reach 60 WPM' },
    { id: 'wpm_80',          name: 'Keyboard Wizard',icon: '🧙', desc: 'Reach 80 WPM' },
    { id: 'acc_98',          name: 'Precision',      icon: '🎯', desc: 'Finish a section ≥98% accuracy' },
    { id: 'streak_7',        name: '7-Day Streak',   icon: '📅', desc: 'Type 7 days in a row' },
    { id: 'streak_30',       name: '30-Day Streak',  icon: '🗓️', desc: 'Type 30 days in a row' },
  ];
  function checkAchievement(id) {
    const d = Store.get();
    if (d.achievements[id]) return;
    d.achievements[id] = true;
    Store.save();
    toast('🏅 Achievement unlocked!');
  }
  function checkSessionAchievements(wpm, duration) {
    if (wpm >= 40) checkAchievement('wpm_40');
    if (wpm >= 60) checkAchievement('wpm_60');
    if (wpm >= 80) checkAchievement('wpm_80');
    const d = Store.get();
    const totalChars = d.sessions.reduce((a, s) => a + s.chars, 0);
    if (totalChars >= 10000) checkAchievement('chars_10k');
    if (totalChars >= 100000) checkAchievement('chars_100k');
    const completedSections = Object.values(d.completed).reduce((a, arr) => a + arr.length, 0);
    if (completedSections >= 10) checkAchievement('sections_10');
    if (completedSections >= 50) checkAchievement('sections_50');
    if (d.streak.current >= 7) checkAchievement('streak_7');
    if (d.streak.current >= 30) checkAchievement('streak_30');
  }
  function checkAchievementsLive() {
    if (state.totalTyped > 0) {
      const acc = state.correctCount / state.totalTyped * 100;
      if (acc >= 98 && state.totalTyped > 100) checkAchievement('acc_98');
    }
  }
  function renderAchievements() {
    const d = Store.get();
    const grid = $('#achievementGrid');
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach((a) => {
      const el = document.createElement('div');
      el.className = 'badge' + (d.achievements[a.id] ? ' unlocked' : '');
      el.innerHTML = `
        <div class="icon">${a.icon}</div>
        <div class="name">${a.name}</div>
        <div class="desc">${a.desc}</div>`;
      grid.appendChild(el);
    });
  }

  // ---------- Settings ----------
  function refreshSettingsForm() {
    const s = settings();
    $('#setTheme').value = s.theme;
    $('#setAccent').value = s.accent;
    $('#setFontSize').value = s.fontSize;
    $('#lblFontSize').textContent = s.fontSize;
    $('#setLineHeight').value = s.lineHeight;
    $('#lblLineHeight').textContent = (s.lineHeight / 10).toFixed(1);
    $('#setFontFamily').value = s.fontFamily;
    $('#setStrict').checked = s.strictPunctuation;
    $('#setAutoScroll').checked = s.autoScroll;
    $('#setSkipMode').value = s.skipMode;
    $('#setHighlight').value = s.highlight;
    $('#setSound').checked = s.sound;
    $('#setVolume').value = s.volume;
    $('#lblVolume').textContent = s.volume;
    $('#setDailyGoal').value = s.dailyGoal;
  }
  function bindSetting(el, key, applyFn) {
    el.addEventListener('input', () => {
      const s = settings();
      let val;
      if (el.type === 'checkbox') val = el.checked;
      else if (el.type === 'range' || el.type === 'number') val = +el.value;
      else val = el.value;
      s[key] = val;
      Store.save();
      applyFn && applyFn(val);
    });
  }
  bindSetting($('#setTheme'), 'theme', applyTheme);
  bindSetting($('#setAccent'), 'accent', applyTypography);
  bindSetting($('#setFontSize'), 'fontSize', (v) => {
    $('#lblFontSize').textContent = v; applyTypography();
  });
  bindSetting($('#setLineHeight'), 'lineHeight', (v) => {
    $('#lblLineHeight').textContent = (v / 10).toFixed(1); applyTypography();
  });
  bindSetting($('#setFontFamily'), 'fontFamily', applyTypography);
  bindSetting($('#setStrict'), 'strictPunctuation');
  bindSetting($('#setAutoScroll'), 'autoScroll');
  bindSetting($('#setSkipMode'), 'skipMode');
  bindSetting($('#setHighlight'), 'highlight');
  bindSetting($('#setSound'), 'sound', applySound);
  bindSetting($('#setVolume'), 'volume', (v) => {
    $('#lblVolume').textContent = v; applySound();
  });
  bindSetting($('#setDailyGoal'), 'dailyGoal');

  // Export / import / reset
  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([Store.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `epubtype-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#importInput').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      Store.importAll(await f.text());
      applyTheme(); applyTypography(); applySound();
      toast('Data imported');
      refreshLibrary(); refreshStats();
    } catch (err) { console.error(err); toast('Invalid backup file'); }
    e.target.value = '';
  });
  $('#resetBtn').addEventListener('click', () => {
    if (!confirm('Erase ALL books, sessions, progress, and settings?')) return;
    Store.reset();
    applyTheme(); applyTypography(); applySound();
    refreshLibrary(); refreshStats(); refreshSettingsForm();
    toast('All data reset');
  });

  // ---------- PWA install ----------
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e; $('#installBtn').hidden = false;
  });
  $('#installBtn').addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') $('#installBtn').hidden = true;
    deferredPrompt = null;
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () =>
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e)));
  }

  // ---------- Init ----------
  applyTheme();
  applyTypography();
  applySound();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings().theme === 'auto') applyTheme();
  });
  refreshLibrary();
})();
