/* app.js – EPUB Type main logic */
(function () {
  'use strict';

  // ---------- DOM refs ----------
  const $ = (sel) => document.querySelector(sel);
  const libraryView = $('#libraryView');
  const pickerView = $('#pickerView');
  const typingView = $('#typingView');
  const fileInput = $('#fileInput');
  const dropZone = $('#dropZone');
  const bookList = $('#bookList');
  const emptyLibrary = $('#emptyLibrary');
  const sectionList = $('#sectionList');
  const pickerTitle = $('#pickerTitle');
  const textDisplay = $('#textDisplay');
  const chapterTitle = $('#chapterTitle');
  const progressText = $('#progressText');
  const wpmDisplay = $('#wpmDisplay');
  const accuracyDisplay = $('#accuracyDisplay');
  const errorsDisplay = $('#errorsDisplay');
  const timeDisplay = $('#timeDisplay');
  const progressFill = $('#progressFill');
  const toastEl = $('#toast');
  const themeToggle = $('#themeToggle');
  const installBtn = $('#installBtn');
  const backToLibrary = $('#backToLibrary');

  // ---------- State ----------
  let library = [];          // [{ id, title, author, sections:[{id,label,text}], addedAt }]
  let currentBook = null;    // book being typed
  let currentSections = [];  // selected sections for current session
  let sectionIndex = 0;
  let charIndex = 0;
  let typedChars = [];       // array of {expected, actual, correct}
  let startTime = null;
  let timerInterval = null;
  let errorCount = 0;
  let correctCount = 0;
  let totalTyped = 0;

  // ---------- Utilities ----------
  function toast(msg, ms = 2000) {
    toastEl.textContent = msg;
    toastEl.hidden = false;
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => (toastEl.hidden = true), ms);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function saveLibrary() {
    localStorage.setItem('epubtype_library', JSON.stringify(library));
  }

  function loadLibrary() {
    try {
      const raw = localStorage.getItem('epubtype_library');
      if (raw) library = JSON.parse(raw);
    } catch (_) { library = []; }
  }

  function saveProgress(bookId, sectionId, charIdx) {
    const key = `epubtype_progress_${bookId}`;
    const prog = JSON.parse(localStorage.getItem(key) || '{}');
    prog[sectionId] = charIdx;
    localStorage.setItem(key, JSON.stringify(prog));
  }

  function getProgress(bookId, sectionId) {
    const key = `epubtype_progress_${bookId}`;
    const prog = JSON.parse(localStorage.getItem(key) || '{}');
    return prog[sectionId] || 0;
  }

  // ---------- Theme ----------
  function initTheme() {
    const saved = localStorage.getItem('epubtype_theme');
    if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else if (saved === 'light') document.documentElement.removeAttribute('data-theme');
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.setAttribute('data-theme', 'dark');
  }
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('epubtype_theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('epubtype_theme', 'dark');
    }
  });

  // ---------- Library rendering ----------
  function renderLibrary() {
    bookList.innerHTML = '';
    if (library.length === 0) {
      emptyLibrary.hidden = false;
      return;
    }
    emptyLibrary.hidden = true;
    library.forEach((book) => {
      const card = document.createElement('div');
      card.className = 'book-card';
      card.innerHTML = `
        <h3>${escapeHtml(book.title)}</h3>
        <div class="meta">${escapeHtml(book.author || 'Unknown author')}</div>
        <div class="meta">${book.sections.length} sections · added ${new Date(book.addedAt).toLocaleDateString()}</div>
        <div class="actions">
          <button data-action="open" data-id="${book.id}">Open</button>
          <button data-action="delete" data-id="${book.id}">🗑</button>
        </div>
      `;
      bookList.appendChild(card);
    });
    bookList.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const id = btn.dataset.id;
        if (action === 'open') openBook(id);
        else if (action === 'delete') deleteBook(id);
      });
    });
  }

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function deleteBook(id) {
    if (!confirm('Delete this book and its progress?')) return;
    library = library.filter((b) => b.id !== id);
    localStorage.removeItem(`epubtype_progress_${id}`);
    saveLibrary();
    renderLibrary();
    toast('Book deleted');
  }

  function openBook(id) {
    const book = library.find((b) => b.id === id);
    if (!book) return;
    currentBook = book;
    pickerTitle.textContent = `Select sections from “${book.title}”`;
    renderSectionList(book);
    showView('picker');
  }

  // ---------- Section picker ----------
  function renderSectionList(book) {
    sectionList.innerHTML = '';
    book.sections.forEach((sec) => {
      const li = document.createElement('li');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.dataset.sectionId = sec.id;
      const span = document.createElement('span');
      span.className = 'label';
      span.textContent = sec.label;
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${sec.text.split(/\s+/).length} words`;
      li.append(cb, span, badge);
      sectionList.appendChild(li);
    });
  }

  function getSelectedSectionIds() {
    return [...sectionList.querySelectorAll('input[type="checkbox"]:checked')].map(
      (cb) => cb.dataset.sectionId
    );
  }

  // Auto‑skip common front‑matter labels
  function autoSkipFrontMatter() {
    const skipKeywords = /^(cover|title|copyright|toc|table of contents|preface|foreword|introduction|acknowledg|dedication|epigraph|half title|frontispiece|contents)/i;
    sectionList.querySelectorAll('li').forEach((li) => {
      const label = li.querySelector('.label').textContent;
      const cb = li.querySelector('input[type="checkbox"]');
      cb.checked = !skipKeywords.test(label);
    });
  }

  // ---------- Typing engine ----------
  function startTyping(sectionIds) {
    if (!currentBook) return;
    currentSections = currentBook.sections.filter((s) => sectionIds.includes(s.id));
    if (currentSections.length === 0) {
      toast('Select at least one section');
      return;
    }
    sectionIndex = 0;
    loadSection(0);
    showView('typing');
  }

  function loadSection(index) {
    if (index >= currentSections.length) {
      toast('🎉 All selected sections completed!');
      showView('library');
      return;
    }
    sectionIndex = index;
    const sec = currentSections[index];
    chapterTitle.textContent = sec.label;
    progressText.textContent = `Section ${index + 1} of ${currentSections.length}`;

    // Restore saved progress for this section
    const saved = getProgress(currentBook.id, sec.id);
    charIndex = saved < sec.text.length ? saved : 0;
    typedChars = [];
    errorCount = 0;
    correctCount = 0;
    totalTyped = 0;
    startTime = null;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    wpmDisplay.textContent = '0';
    accuracyDisplay.textContent = '100';
    errorsDisplay.textContent = '0';
    timeDisplay.textContent = '0:00';
    progressFill.style.width = '0%';

    renderText(sec.text);
    textDisplay.focus();
  }

  function renderText(fullText) {
    // Build spans for each character (simple, no virtualisation – fine for chapters)
    textDisplay.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i < fullText.length; i++) {
      const span = document.createElement('span');
      span.textContent = fullText[i];
      span.className = 'pending';
      span.dataset.index = i;
      frag.appendChild(span);
    }
    textDisplay.appendChild(frag);
    updateCursor();
  }

  function updateCursor() {
    const spans = textDisplay.querySelectorAll('span');
    spans.forEach((s, i) => {
      s.classList.remove('current', 'correct', 'incorrect');
      if (i < charIndex) {
        s.classList.add(
          typedChars[i] && typedChars[i].correct ? 'correct' : 'incorrect'
        );
      } else if (i === charIndex) {
        s.classList.add('current');
      }
    });
    const pct = (charIndex / spans.length) * 100;
    progressFill.style.width = pct + '%';
  }

  function handleKey(e) {
    if (typingView.hidden) return;
    const sec = currentSections[sectionIndex];
    if (!sec) return;

    if (e.key === 'Tab') {
      e.preventDefault();
      skipChar();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (charIndex > 0) {
        charIndex--;
        typedChars.pop();
        totalTyped = Math.max(0, totalTyped - 1);
        updateCursor();
      }
      return;
    }
    if (e.key.length !== 1) return; // ignore modifiers, arrows etc.

    e.preventDefault();
    const expected = sec.text[charIndex];
    const actual = e.key;
    const strict = $('#strictMode').checked;
    let correct;

    if (strict) {
      correct = actual === expected;
    } else {
      // Lenient: accept straight quotes for curly quotes, hyphen for en/em dash
      const norm = (c) =>
        c.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
      correct = norm(actual) === norm(expected);
    }

    typedChars[charIndex] = { expected, actual, correct };
    if (correct) {
      correctCount++;
    } else {
      errorCount++;
    }
    totalTyped++;

    if (!startTime) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
    }

    charIndex++;
    saveProgress(currentBook.id, sec.id, charIndex);
    updateCursor();
    updateStats();

    if (charIndex >= sec.text.length) {
      clearInterval(timerInterval);
      timerInterval = null;
      toast('✅ Section complete!');
      if (sectionIndex + 1 < currentSections.length) {
        setTimeout(() => loadSection(sectionIndex + 1), 800);
      } else {
        setTimeout(() => showView('library'), 1200);
      }
    }
  }

  function skipChar() {
    const sec = currentSections[sectionIndex];
    if (charIndex < sec.text.length) {
      typedChars[charIndex] = { expected: sec.text[charIndex], actual: null, correct: true };
      charIndex++;
      updateCursor();
      updateStats();
      saveProgress(currentBook.id, sec.id, charIndex);
    }
  }

  function updateTimer() {
    if (!startTime) return;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    timeDisplay.textContent = `${m}:${String(s).padStart(2, '0')}`;
    updateStats();
  }

  function updateStats() {
    const elapsedMin = startTime ? (Date.now() - startTime) / 60000 : 0;
    const wpm = elapsedMin > 0 ? Math.round(correctCount / 5 / elapsedMin) : 0;
    wpmDisplay.textContent = wpm;
    const acc = totalTyped > 0 ? Math.round((correctCount / totalTyped) * 100) : 100;
    accuracyDisplay.textContent = acc;
    errorsDisplay.textContent = errorCount;
  }

  // ---------- View switching ----------
  function showView(name) {
    libraryView.hidden = name !== 'library';
    pickerView.hidden = name !== 'picker';
    typingView.hidden = name !== 'typing';
    backToLibrary.hidden = name === 'library';
    if (name === 'library') {
      backToLibrary.hidden = true;
      if (timerInterval) clearInterval(timerInterval);
    }
  }

  // ---------- EPUB upload ----------
  async function handleFile(file) {
    if (!file.name.toLowerCase().endsWith('.epub')) {
      toast('Please upload an .epub file');
      return;
    }
    toast('Parsing EPUB…', 1500);
    try {
      const { title, author, sections } = await EPUBParser.parseEPUB(file);
      if (!sections.length) {
        toast('No readable text sections found in this EPUB');
        return;
      }
      const book = {
        id: uid(),
        title: title || file.name.replace(/\.epub$/i, ''),
        author,
        sections,
        addedAt: Date.now(),
      };
      library.push(book);
      saveLibrary();
      renderLibrary();
      toast(`Added “${book.title}” (${sections.length} sections)`);
    } catch (err) {
      console.error(err);
      toast('Failed to parse EPUB – see console');
    }
  }

  // ---------- Event listeners ----------
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
    fileInput.value = '';
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  // Section picker buttons
  $('#selectAllBtn').addEventListener('click', () => {
    sectionList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = true));
  });
  $('#selectNoneBtn').addEventListener('click', () => {
    sectionList.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  });
  $('#autoSkipBtn').addEventListener('click', autoSkipFrontMatter);
  $('#cancelPickerBtn').addEventListener('click', () => showView('library'));
  $('#startTypingBtn').addEventListener('click', () => {
    const ids = getSelectedSectionIds();
    startTyping(ids);
  });

  // Typing controls
  backToLibrary.addEventListener('click', () => showView('library'));
  $('#exitTypingBtn').addEventListener('click', () => showView('library'));
  $('#restartBtn').addEventListener('click', () => {
    if (currentBook && currentSections[sectionIndex]) {
      const sec = currentSections[sectionIndex];
      saveProgress(currentBook.id, sec.id, 0);
      loadSection(sectionIndex);
    }
  });
  $('#nextSectionBtn').addEventListener('click', () => {
    if (sectionIndex + 1 < currentSections.length) loadSection(sectionIndex + 1);
    else showView('library');
  });
  $('#zenMode').addEventListener('change', (e) => {
    document.body.classList.toggle('zen', e.target.checked);
  });
  $('#strictMode').addEventListener('change', () => {
    // no immediate action – read at keypress
  });

  // Global key handler for typing
  document.addEventListener('keydown', (e) => {
    if (!typingView.hidden) handleKey(e);
  });

  // ---------- PWA install ----------
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    installBtn.hidden = false;
  });
  installBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') installBtn.hidden = true;
    deferredPrompt = null;
  });

  // ---------- Service worker ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((err) => console.warn('SW failed', err));
    });
  }

  // ---------- Init ----------
  initTheme();
  loadLibrary();
  renderLibrary();
})();
