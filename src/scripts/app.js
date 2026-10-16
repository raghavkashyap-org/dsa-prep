(async () => {
  'use strict';
  const embeddedProblems = document.getElementById('problemData');
  const embeddedMeta = document.getElementById('siteMeta');
  const { problems, meta } = await loadProblemData(embeddedProblems, embeddedMeta);
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const topicOrder = [...new Set(problems.map((p) => p.topic))];
  const strategies = [...new Set(problems.map((p) => p.strategy))].sort();
  const ui = {
    page: 1,
    perPage: 36,
    view: 'grid',
    activeProblem: null,
    solutionVisible: false,
  };
  const emptyState = {
    solved: {},
    bookmarks: {},
    confidence: {},
    notes: {},
    lastOpened: null,
  };
  let tracker = loadTracker();
  function loadTracker() {
    try {
      return {
        ...emptyState,
        ...JSON.parse(localStorage.getItem('dsa-prep-progress') || '{}'),
      };
    } catch (e) {
      return structuredClone(emptyState);
    }
  }
  function saveTracker() {
    try {
      localStorage.setItem('dsa-prep-progress', JSON.stringify(tracker));
    } catch (e) {}
    renderProgress();
    renderTopicGrid();
  }
  function esc(v = '') {
    return String(v).replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;',
        })[c],
    );
  }
  function slugClass(v) {
    return 'diff-' + String(v).toLowerCase();
  }
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove('show'), 1800);
  }
  function populateSelect(el, values, label) {
    el.innerHTML =
      `<option value="">${label}</option>` +
      values.map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  }
  populateSelect($('#topicFilter'), topicOrder, 'All 16 topics');
  populateSelect($('#strategyFilter'), strategies, 'Any pattern');
  function updateSubtopics() {
    const topic = $('#topicFilter').value;
    const values = [
      ...new Set(problems.filter((p) => !topic || p.topic === topic).map((p) => p.subtopic)),
    ].sort();
    const old = $('#subtopicFilter').value;
    populateSelect($('#subtopicFilter'), values, 'All subtopics');
    if (values.includes(old)) $('#subtopicFilter').value = old;
  }
  updateSubtopics();
  const filterIds = [
    'topicFilter',
    'subtopicFilter',
    'difficultyFilter',
    'statusFilter',
    'linkFilter',
    'strategyFilter',
    'sortFilter',
  ];
  filterIds.forEach((id) =>
    $('#' + id).addEventListener('change', () => {
      if (id === 'topicFilter') updateSubtopics();
      ui.page = 1;
      renderProblems();
    }),
  );
  $('#notesOnly').addEventListener('change', () => {
    ui.page = 1;
    renderProblems();
  });
  let searchTimer;
  $('#searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      ui.page = 1;
      renderProblems();
    }, 100);
  });
  function filtered() {
    const q = $('#searchInput').value.trim().toLowerCase(),
      topic = $('#topicFilter').value,
      sub = $('#subtopicFilter').value,
      diff = $('#difficultyFilter').value,
      status = $('#statusFilter').value,
      link = $('#linkFilter').value,
      strategy = $('#strategyFilter').value;
    let rows = problems.filter((p) => {
      if (q) {
        const hay = [
          p.title,
          p.topic,
          p.subtopic,
          p.question,
          p.approach,
          p.strategy,
          p.repoPath,
          ...p.tags,
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (topic && p.topic !== topic) return false;
      if (sub && p.subtopic !== sub) return false;
      if (diff && p.difficulty !== diff) return false;
      if (link && p.leetcode.match !== link) return false;
      if (strategy && p.strategy !== strategy) return false;
      if (status === 'todo' && tracker.solved[p.id]) return false;
      if (status === 'solved' && !tracker.solved[p.id]) return false;
      if (status === 'bookmarked' && !tracker.bookmarks[p.id]) return false;
      if (status === 'review' && tracker.confidence[p.id] !== 'Practicing') return false;
      if ($('#notesOnly').checked && !String(tracker.notes[p.id] || '').trim()) return false;
      return true;
    });
    const sort = $('#sortFilter').value,
      rank = { Foundation: 0, Easy: 1, Medium: 2, Hard: 3 };
    if (sort === 'az') rows.sort((a, b) => a.title.localeCompare(b.title));
    else if (sort === 'difficulty')
      rows.sort((a, b) => rank[a.difficulty] - rank[b.difficulty] || a.index - b.index);
    else if (sort === 'unsolved')
      rows.sort((a, b) => !!tracker.solved[a.id] - !!tracker.solved[b.id] || a.index - b.index);
    else rows.sort((a, b) => a.index - b.index);
    return rows;
  }
  function card(p) {
    const solved = !!tracker.solved[p.id],
      bookmarked = !!tracker.bookmarks[p.id];
    return `<article class="problem-card ${solved ? 'solved' : ''}" data-id="${p.id}" tabindex="0"><div class="card-top"><span class="sheet-index">#${String(p.index).padStart(3, '0')}</span><div class="card-actions"><button class="icon-btn solved ${solved ? 'active' : ''}" data-action="solve" aria-label="Mark solved">${solved ? '✓' : '○'}</button><button class="icon-btn ${bookmarked ? 'active' : ''}" data-action="bookmark" aria-label="Bookmark">${bookmarked ? '★' : '☆'}</button></div></div><h3>${esc(p.title)}</h3><div class="crumb">${esc(p.topic)} / ${esc(p.subtopic)}</div><div class="badges"><span class="badge ${slugClass(p.difficulty)}">${esc(p.difficulty)}</span><span class="badge">${esc(p.strategy)}</span><span class="badge ${p.leetcode.match === 'exact' ? 'exact' : ''}">${p.leetcode.match === 'exact' ? 'LC exact' : 'LC related'}</span></div><div class="card-bottom"><span class="complexity">T · ${esc(p.time)}</span><span class="open-label">open →</span></div></article>`;
  }
  function renderProblems() {
    const rows = filtered(),
      visible = rows.slice(0, ui.page * ui.perPage),
      grid = $('#problemGrid');
    grid.className = 'problem-grid' + (ui.view === 'compact' ? ' compact' : '');
    grid.innerHTML = visible.length
      ? visible.map(card).join('')
      : `<div class="empty"><div class="kicker">// no matches</div><strong>Try a broader search or reset the filter list.</strong></div>`;
    $('#resultCount').textContent =
      `${rows.length} result${rows.length === 1 ? '' : 's'} · showing ${visible.length}`;
    $('#loadMore').style.display = visible.length < rows.length ? 'inline-flex' : 'none';
    observeReveals();
  }
  $('#loadMore').addEventListener('click', () => {
    ui.page++;
    renderProblems();
  });
  $('#problemGrid').addEventListener('click', (e) => {
    const card = e.target.closest('.problem-card');
    if (!card) return;
    const action = e.target.closest('[data-action]');
    if (action) {
      e.stopPropagation();
      toggleAction(card.dataset.id, action.dataset.action);
      return;
    }
    openProblem(card.dataset.id);
  });
  $('#problemGrid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('problem-card'))
      openProblem(e.target.dataset.id);
  });
  function toggleAction(id, action) {
    if (action === 'solve') tracker.solved[id] = !tracker.solved[id];
    else tracker.bookmarks[id] = !tracker.bookmarks[id];
    saveTracker();
    renderProblems();
    toast(
      action === 'solve'
        ? tracker.solved[id]
          ? 'Marked solved'
          : 'Moved to not solved'
        : tracker.bookmarks[id]
          ? 'Bookmarked'
          : 'Bookmark removed',
    );
  }
  $$('.view-switch button').forEach((btn) =>
    btn.addEventListener('click', () => {
      $$('.view-switch button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ui.view = btn.dataset.view;
      renderProblems();
    }),
  );
  function renderTopicGrid() {
    const grid = $('#topicGrid');
    grid.innerHTML = topicOrder
      .map((topic, i) => {
        const rows = problems.filter((p) => p.topic === topic),
          solved = rows.filter((p) => tracker.solved[p.id]).length,
          pct = Math.round((solved / rows.length) * 100);
        return `<button class="topic-card reveal" data-topic="${esc(topic)}"><span class="topic-num">${String(i + 1).padStart(2, '0')}</span><h3>${esc(topic)}</h3><div class="topic-meta"><span>${rows.length} problems</span><span>${solved}/${rows.length}</span></div><div class="topic-progress"><i style="width:${pct}%"></i></div></button>`;
      })
      .join('');
    observeReveals();
  }
  $('#topicGrid').addEventListener('click', (e) => {
    const card = e.target.closest('[data-topic]');
    if (!card) return;
    $('#topicFilter').value = card.dataset.topic;
    updateSubtopics();
    ui.page = 1;
    renderProblems();
    location.hash = 'problems';
  });
  function renderProgress() {
    const solved = problems.filter((p) => tracker.solved[p.id]).length,
      pct = Math.round((solved / problems.length) * 100);
    $('#overallPercent').textContent = pct + '%';
    $('#solvedCount').textContent = `${solved} of ${problems.length}`;
    $('#overallBar').style.width = pct + '%';
    $('#progressList').innerHTML = topicOrder
      .map((topic) => {
        const rows = problems.filter((p) => p.topic === topic),
          done = rows.filter((p) => tracker.solved[p.id]).length,
          part = Math.round((done / rows.length) * 100);
        return `<div class="progress-row"><span class="progress-name">${esc(topic)}</span><div class="bar"><i style="width:${part}%"></i></div><span class="progress-count">${done} / ${rows.length}</span></div>`;
      })
      .join('');
  }
  function detailMarkup(p) {
    const solved = !!tracker.solved[p.id],
      bookmark = !!tracker.bookmarks[p.id],
      confidence = tracker.confidence[p.id] || 'New';
    return `<div class="drawer-index">#${String(p.index).padStart(3, '0')} · ${esc(p.topic)} / ${esc(p.subtopic)}</div><h2 id="drawerTitle">${esc(p.title)}</h2><div class="badges"><span class="badge ${slugClass(p.difficulty)}">${esc(p.difficulty)}</span><span class="badge">${esc(p.strategy)}</span><span class="badge ${p.leetcode.match === 'exact' ? 'exact' : ''}">${p.leetcode.match === 'exact' ? 'Exact LeetCode match' : 'Related LeetCode practice'}</span><span class="badge">${p.codeLines} source lines</span></div><div class="drawer-links"><a class="btn btn-primary btn-small" href="${esc(p.leetcode.url)}" target="_blank" rel="noopener">${p.leetcode.match === 'exact' ? 'Open exact problem' : 'Try related problem'} ↗</a><a class="btn btn-ghost btn-small" href="${esc(p.sourceUrl)}" target="_blank" rel="noopener">GitHub source ↗</a><button class="btn btn-ghost btn-small" data-detail-action="share">Copy deep link</button></div><div class="tracker-strip"><button class="btn ${solved ? 'btn-primary' : 'btn-ghost'} btn-small" data-detail-action="solve">${solved ? '✓ Solved' : 'Mark solved'}</button><select class="select" id="confidenceSelect" aria-label="Confidence"><option ${confidence === 'New' ? 'selected' : ''}>New</option><option ${confidence === 'Practicing' ? 'selected' : ''}>Practicing</option><option ${confidence === 'Comfortable' ? 'selected' : ''}>Comfortable</option><option ${confidence === 'Mastered' ? 'selected' : ''}>Mastered</option></select><button class="btn btn-ghost btn-small" data-detail-action="bookmark">${bookmark ? '★ Bookmarked' : '☆ Bookmark'}</button><textarea id="problemNotes" placeholder="Private notes, mistakes, revisit cues…">${esc(tracker.notes[p.id] || '')}</textarea></div><section class="detail-section"><div class="kicker">// problem statement</div><h3>What you need to solve</h3><div class="detail-text">${esc(p.question)}</div></section><section class="detail-section"><div class="kicker">// suggested practice assumptions</div><h3>Constraints to reason against</h3><div class="callout">These are inferred practice constraints, not official judge constraints from the repository. Check the linked platform before submitting.</div><div class="constraint-grid">${p.constraints.map((x, i) => `<div class="mini-panel"><h4>0${i + 1}</h4><p>${esc(x)}</p></div>`).join('')}</div></section><section class="detail-section"><div class="kicker">// intuition</div><h3>The pattern behind it</h3><div class="detail-text">${esc(p.intuition)}</div></section><section class="detail-section"><div class="kicker">// repository approach</div><h3>How the source solves it</h3><div class="detail-text">${esc(p.approach)}</div></section><section class="detail-section"><div class="kicker">// complexity as documented</div><div class="complexity-grid"><div class="mini-panel"><h4>Time complexity</h4><p>${esc(p.time)}</p></div><div class="mini-panel"><h4>Space complexity</h4><p>${esc(p.space)}</p></div></div></section><section class="detail-section"><div class="notes-grid"><div class="mini-panel"><h4>Edge cases to test</h4><ul>${p.edgeCases.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="mini-panel"><h4>Common pitfalls</h4><ul>${p.pitfalls.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div></section><section class="detail-section"><div class="kicker">// implementation views</div><h3>Choose your reveal level</h3><div class="solution-gate" id="solutionGate"><p>Start with language-neutral pseudocode, or reveal the exact C++ repository file when you are ready.</p><div class="button-row" style="justify-content:center"><button class="btn btn-ghost" data-detail-action="pseudo">View pseudocode</button><button class="btn btn-primary" data-detail-action="reveal">Reveal C++ solution</button></div></div><div class="code-window" id="pseudoWindow" style="margin-top:14px"><div class="code-head"><div style="display:flex;align-items:center"><span class="traffic"><i></i><i></i><i></i></span><span class="code-title">${esc(p.id)}.pseudocode · generated from the repository approach</span></div><button class="btn btn-ghost btn-small" data-detail-action="copyPseudo">Copy</button></div><pre><code id="pseudoCode">${esc(p.pseudocode)}</code></pre></div><div class="code-window" id="codeWindow" style="margin-top:14px"><div class="code-head"><div style="display:flex;align-items:center"><span class="traffic"><i></i><i></i><i></i></span><span class="code-title">${esc(p.repoPath)}</span></div><button class="btn btn-ghost btn-small" data-detail-action="copy">Copy</button></div><pre><code id="sourceCode"></code></pre></div></section><section class="detail-section"><div class="kicker">// practice bridge</div><h3>${p.leetcode.match === 'exact' ? 'Same problem on LeetCode' : 'Closest useful LeetCode follow-up'}</h3><div class="mini-panel"><h4>${p.leetcode.match === 'exact' ? 'Exact match' : 'Related, not identical'}</h4><p><strong style="color:var(--fg)">${esc(p.leetcode.title)}</strong> · ${esc(p.leetcode.difficulty)}${p.leetcode.paid ? ' · Premium' : ''}</p><p>${p.leetcode.match === 'exact' ? 'The problem contract is confidently equivalent to this repository item.' : 'Use this to practise the nearest overlapping pattern; read its statement independently because the contract differs.'}</p><a class="btn btn-ghost btn-small" href="${esc(p.leetcode.url)}" target="_blank" rel="noopener">Open LeetCode ↗</a></div></section>`;
  }
  function openProblem(id, updateHash = true) {
    const p = problems.find((x) => x.id === id);
    if (!p) return;
    ui.activeProblem = p;
    ui.solutionVisible = false;
    tracker.lastOpened = id;
    saveTracker();
    $('#drawerBody').innerHTML = detailMarkup(p);
    $('#drawerOverlay').classList.add('open');
    $('#drawerOverlay').setAttribute('aria-hidden', 'false');
    document.body.classList.add('no-scroll');
    if (updateHash) history.replaceState(null, '', '#problem=' + id);
    setTimeout(() => $('#drawerClose').focus(), 50);
    bindDetail();
  }
  function closeProblem(updateHash = true) {
    $('#drawerOverlay').classList.remove('open');
    $('#drawerOverlay').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('no-scroll');
    ui.activeProblem = null;
    if (updateHash && location.hash.startsWith('#problem='))
      history.replaceState(null, '', '#problems');
  }
  $('#drawerClose').addEventListener('click', () => closeProblem());
  $('#drawerOverlay').addEventListener('click', (e) => {
    if (e.target === $('#drawerOverlay')) closeProblem();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.activeProblem) closeProblem();
    if (
      e.key === '/' &&
      !ui.activeProblem &&
      !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
    ) {
      e.preventDefault();
      $('#searchInput').focus();
      location.hash = 'problems';
    }
  });
  function bindDetail() {
    const p = ui.activeProblem;
    if (!p) return;
    $('#confidenceSelect').addEventListener('change', (e) => {
      tracker.confidence[p.id] = e.target.value;
      saveTracker();
      renderProblems();
      toast('Confidence saved');
    });
    let noteTimer;
    $('#problemNotes').addEventListener('input', (e) => {
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => {
        tracker.notes[p.id] = e.target.value;
        saveTracker();
      }, 220);
    });
    $('#drawerBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-detail-action]');
      if (!b) return;
      const action = b.dataset.detailAction;
      if (action === 'solve' || action === 'bookmark') {
        toggleAction(p.id, action);
        $('#drawerBody').innerHTML = detailMarkup(p);
        bindDetail();
      } else if (action === 'pseudo') {
        showImplementation('pseudo');
      } else if (action === 'reveal') {
        showImplementation('cpp');
      } else if (action === 'copyPseudo') {
        copyText(p.pseudocode).then(() => toast('Pseudocode copied'));
      } else if (action === 'copy') {
        copyText(p.code).then(() => toast('C++ source copied'));
      } else if (action === 'share') {
        copyText(location.href.split('#')[0] + '#problem=' + p.id).then(() =>
          toast('Deep link copied'),
        );
      }
    });
  }
  function showImplementation(kind) {
    const p = ui.activeProblem;
    if (!p) return;
    ui.solutionVisible = kind;
    const pseudo = $('#pseudoWindow'),
      cpp = $('#codeWindow');
    pseudo.classList.toggle('visible', kind === 'pseudo');
    cpp.classList.toggle('visible', kind === 'cpp');
    if (kind === 'cpp') $('#sourceCode').innerHTML = highlightCpp(p.code);
    const target = kind === 'pseudo' ? pseudo : cpp;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function highlightCpp(code) {
    const token = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|^\s*#[^\n]*/gm;
    let out = '',
      last = 0,
      m;
    const plain = (s) =>
      esc(s)
        .replace(
          /\b(alignas|alignof|and|asm|auto|bool|break|case|catch|char|class|const|continue|default|delete|do|double|else|enum|explicit|export|extern|false|float|for|friend|if|inline|int|long|namespace|new|nullptr|operator|or|private|protected|public|register|return|short|signed|sizeof|static|struct|switch|template|this|throw|true|try|typedef|typename|union|unsigned|using|virtual|void|volatile|while)\b/g,
          '<span class="tk-key">$1</span>',
        )
        .replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="tk-num">$1</span>');
    while ((m = token.exec(code))) {
      out += plain(code.slice(last, m.index));
      const t = m[0],
        cls = t.trimStart().startsWith('#') ? 'tk-pre' : t.startsWith('/') ? 'tk-com' : 'tk-str';
      out += `<span class="${cls}">${esc(t)}</span>`;
      last = m.index + t.length;
    }
    return out + plain(code.slice(last));
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
  }
  function resetFilters() {
    filterIds.forEach((id) => ($('#' + id).value = id === 'sortFilter' ? 'sheet' : ''));
    $('#notesOnly').checked = false;
    $('#searchInput').value = '';
    updateSubtopics();
    ui.page = 1;
    renderProblems();
  }
  $('#resetFilters').addEventListener('click', resetFilters);
  function randomProblem() {
    const rows = filtered();
    if (!rows.length) return toast('No problems match these filters');
    openProblem(rows[Math.floor(Math.random() * rows.length)].id);
  }
  $('#randomBtn').addEventListener('click', randomProblem);
  $('#heroRandom').addEventListener('click', randomProblem);
  $('#continueBtn').addEventListener('click', () => {
    const p =
      problems.find((x) => x.id === tracker.lastOpened && !tracker.solved[x.id]) ||
      problems.find((x) => !tracker.solved[x.id]) ||
      problems[0];
    openProblem(p.id);
  });
  $('#exportBtn').addEventListener('click', () => {
    const payload = {
      app: 'dsa-prep',
      version: 1,
      exportedAt: new Date().toISOString(),
      progress: tracker,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      }),
      a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'dsa-prep-progress.json';
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Progress exported');
  });
  $('#importBtn').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      tracker = { ...emptyState, ...(data.progress || data) };
      saveTracker();
      renderProblems();
      toast('Progress imported');
    } catch (err) {
      toast('That progress file is not valid');
    }
    e.target.value = '';
  });
  $('#resetProgress').addEventListener('click', () => {
    if (confirm('Reset all solved states, bookmarks, confidence and notes?')) {
      tracker = structuredClone(emptyState);
      saveTracker();
      renderProblems();
      toast('Tracker reset');
    }
  });
  $('#openFilters').addEventListener('click', () => $('#filtersPanel').classList.add('open'));
  $('#closeFilters').addEventListener('click', () => $('#filtersPanel').classList.remove('open'));
  function initTheme() {
    let theme = 'dark';
    try {
      theme = localStorage.getItem('dsa-prep-theme') || 'dark';
    } catch (e) {}
    setTheme(theme);
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    $$('.theme-btn').forEach((b) => b.classList.toggle('active', b.dataset.theme === theme));
    try {
      localStorage.setItem('dsa-prep-theme', theme);
    } catch (e) {}
  }
  $$('.theme-btn').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.theme)));
  initTheme();
  const phrases = ['master the pattern.', 'trace the invariant.', 'ship the solution.'];
  let pi = 0,
    ci = 0,
    deleting = false,
    paused = false;
  const typeEl = $('#typewriter');
  function typeLoop() {
    const word = phrases[pi];
    if (!deleting) {
      ci++;
      typeEl.textContent = word.slice(0, ci);
      if (ci === word.length) {
        deleting = true;
        return setTimeout(typeLoop, 1500);
      }
    } else {
      ci--;
      typeEl.textContent = word.slice(0, ci);
      if (ci === 0) {
        deleting = false;
        pi = (pi + 1) % phrases.length;
        return setTimeout(typeLoop, 350);
      }
    }
    setTimeout(typeLoop, deleting ? 38 : 72);
  }
  typeLoop();
  window.addEventListener(
    'scroll',
    () => {
      const max = document.documentElement.scrollHeight - innerHeight;
      $('#readingProgress').style.width = (max > 0 ? (scrollY / max) * 100 : 0) + '%';
    },
    { passive: true },
  );
  let observer;
  function observeReveals() {
    if (!('IntersectionObserver' in window)) {
      $$('.reveal').forEach((x) => x.classList.add('visible'));
      return;
    }
    if (!observer)
      observer = new IntersectionObserver(
        (entries) =>
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add('visible');
              observer.unobserve(e.target);
            }
          }),
        { threshold: 0.08 },
      );
    $$('.reveal:not(.visible)').forEach((x) => observer.observe(x));
  }
  function openHash() {
    if (location.hash.startsWith('#problem=')) {
      const id = location.hash.split('=')[1];
      if (problems.some((p) => p.id === id)) openProblem(id, false);
    }
  }
  renderTopicGrid();
  renderProgress();
  renderProblems();
  observeReveals();
  openHash();
  window.addEventListener('hashchange', openHash);
})();
