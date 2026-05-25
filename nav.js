/* Motracker shared nav — bottom tabs + date pill + calendar modal
 *
 * Each page calls MotrackerNav.init({ active }) on load. The init function:
 *   - Reads ?date= from URL → window.MT_VIEW_DATE (used by all pages)
 *   - Injects header (title + today-jump + date pill) at top of <body>
 *   - Injects finance sub-tabs (only when active === 'finance')
 *   - Injects bottom tab bar
 *   - Injects calendar modal
 *   - Wires all interactions
 *
 * Pages should:
 *   1. Include <link rel="stylesheet" href="./nav.css">
 *   2. Include <script src="./nav.js" defer></script>
 *   3. Replace their own <header> with no header — nav will inject one
 *   4. Read window.MT_VIEW_DATE for the active date
 *   5. Read window.MT_IS_PAST for whether viewing a past date
 *   6. Call MotrackerNav.init({ active: 'today' | 'finance' | 'captures', sub: 'dash' | 'spend' | 'budget', title: '...' })
 */

(function() {
  'use strict';

  // ---------- date helpers ----------
  function todayBP() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Budapest',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
  }

  function getViewDate() {
    const today = todayBP();
    const urlDate = new URLSearchParams(window.location.search).get('date');
    if (urlDate && /^\d{4}-\d{2}-\d{2}$/.test(urlDate) && urlDate <= today) {
      return urlDate;
    }
    return today;
  }

  function fmtShortDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toLowerCase();
  }
  function fmtLongDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toLowerCase();
  }
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  // ---------- URL state ----------
  const TODAY = todayBP();
  const VIEW_DATE = getViewDate();
  const IS_PAST = VIEW_DATE !== TODAY;

  // Expose globally so pages can read them
  window.MT_TODAY = TODAY;
  window.MT_VIEW_DATE = VIEW_DATE;
  window.MT_IS_PAST = IS_PAST;

  // ---------- navigation builders ----------
  function buildDateQuery(target) {
    // returns '' for today, '?date=YYYY-MM-DD' otherwise
    return target === TODAY ? '' : `?date=${target}`;
  }

  function navigateTo(path, date) {
    const d = date || VIEW_DATE;
    window.location.href = path + buildDateQuery(d);
  }

  function navigateToDate(iso) {
    // keep current page, change date
    const path = window.location.pathname.endsWith('/')
      ? './'
      : window.location.pathname.split('/').pop();
    window.location.href = (path || './') + buildDateQuery(iso);
  }

  // ---------- finance sub-tab session memory ----------
  const FINANCE_SUB_KEY = 'mt_finance_sub';
  function getFinanceSub() {
    try {
      return sessionStorage.getItem(FINANCE_SUB_KEY) || 'dash';
    } catch { return 'dash'; }
  }
  function setFinanceSub(sub) {
    try { sessionStorage.setItem(FINANCE_SUB_KEY, sub); } catch {}
  }

  // ---------- markup ----------
  const PAGES = {
    today: { path: './', label: 'today', icon: '☀' },
    finance: {
      // path resolved dynamically based on sub
      label: 'finance',
      icon: '⊙',
    },
    captures: { path: './capture.html', label: 'captures', icon: '⊞' },
  };

  const FINANCE_SUBS = {
    dash:   { path: './dashboard.html', label: 'dashboard' },
    spend:  { path: './spend.html',     label: 'spend' },
    budget: { path: './budget.html',    label: 'budget' },
  };

  function buildHeader(title) {
    const dateLabel = IS_PAST ? fmtLongDate(VIEW_DATE) : fmtShortDate(TODAY);
    return `
      <header class="mt-header">
        <h1 class="${IS_PAST ? 'past' : ''}">${escapeHtml(title || 'motracker')}</h1>
        <div class="mt-header-right">
          <button class="mt-today-btn ${IS_PAST ? 'show' : ''}" id="mt-today-btn" type="button">
            <span>↺ today</span>
          </button>
          <button class="mt-date-pill ${IS_PAST ? 'past' : ''}" id="mt-date-pill" type="button">
            <span class="icon">▦</span>
            <span id="mt-date-label">${dateLabel}</span>
          </button>
        </div>
      </header>`;
  }

  function buildSubtabs(activeSub) {
    const items = Object.entries(FINANCE_SUBS).map(([key, info]) => `
      <a class="mt-subtab ${key === activeSub ? 'active' : ''}"
         href="${info.path}${buildDateQuery(VIEW_DATE)}"
         data-sub="${key}">${info.label}</a>`).join('');
    return `<div class="mt-subtabs show">${items}</div>`;
  }

  function buildTabbar(active) {
    const financePath = FINANCE_SUBS[getFinanceSub()].path;
    const tabs = [
      { key: 'today',    path: PAGES.today.path,    label: 'today',    icon: '☀' },
      { key: 'finance',  path: financePath,         label: 'finance',  icon: '⊙' },
      { key: 'captures', path: PAGES.captures.path, label: 'captures', icon: '⊞' },
    ];
    const html = tabs.map(t => `
      <a class="mt-tab ${t.key === active ? 'active' : ''}"
         href="${t.path}${buildDateQuery(VIEW_DATE)}"
         data-tab="${t.key}">
        <span class="icon">${t.icon}</span>
        <span>${t.label}</span>
      </a>`).join('');
    return `<nav class="mt-tabbar"><div class="mt-tabbar-inner">${html}</div></nav>`;
  }

  function buildCalendar() {
    return `
      <div class="mt-cal-backdrop" id="mt-cal-backdrop">
        <div class="mt-cal-modal">
          <div class="mt-cal-title">
            <span>pick a day</span>
            <button class="mt-cal-close" id="mt-cal-close" type="button">✕</button>
          </div>
          <div class="mt-cal-nav">
            <button class="mt-cal-nav-btn" id="mt-cal-prev" type="button">‹</button>
            <span class="mt-cal-month-label" id="mt-cal-month-label">—</span>
            <button class="mt-cal-nav-btn" id="mt-cal-next" type="button">›</button>
          </div>
          <div class="mt-cal-grid" id="mt-cal-grid"></div>
          <div class="mt-cal-foot">
            <button id="mt-cal-today" type="button">jump to today</button>
          </div>
        </div>
      </div>`;
  }

  // ---------- calendar logic ----------
  const DOW_LABELS = ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'];
  let CAL_MONTH = null;

  function openCalendar() {
    const [y, m] = VIEW_DATE.split('-').map(Number);
    CAL_MONTH = { year: y, month: m - 1 };
    renderCalendar();
    document.getElementById('mt-cal-backdrop').classList.add('show');
  }
  function closeCalendar() {
    document.getElementById('mt-cal-backdrop').classList.remove('show');
  }
  function renderCalendar() {
    const { year, month } = CAL_MONTH;
    const monthName = new Date(year, month, 1)
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }).toLowerCase();
    document.getElementById('mt-cal-month-label').textContent = monthName;

    const grid = document.getElementById('mt-cal-grid');
    let html = DOW_LABELS.map(d => `<div class="mt-cal-dow">${d}</div>`).join('');

    const firstDay = new Date(year, month, 1);
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev = new Date(year, month, 0).getDate();

    for (let i = startOffset - 1; i >= 0; i--) {
      html += `<button class="mt-cal-day other-month" disabled>${daysInPrev - i}</button>`;
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isFuture = iso > TODAY;
      const isToday = iso === TODAY;
      const isSelected = iso === VIEW_DATE;
      const cls = ['mt-cal-day',
        isToday ? 'today' : '',
        isSelected ? 'selected' : '',
        isFuture ? 'future' : ''].filter(Boolean).join(' ');
      html += `<button class="${cls}" data-date="${iso}" ${isFuture ? 'disabled' : ''}>${d}</button>`;
    }
    const totalCells = startOffset + daysInMonth;
    const remaining = (Math.ceil(totalCells / 7) * 7) - totalCells;
    for (let i = 1; i <= remaining; i++) {
      html += `<button class="mt-cal-day other-month" disabled>${i}</button>`;
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.mt-cal-day[data-date]').forEach(btn => {
      btn.addEventListener('click', () => navigateToDate(btn.dataset.date));
    });
  }

  // ---------- public API ----------
  const MotrackerNav = {
    TODAY, VIEW_DATE, IS_PAST,

    init(opts) {
      opts = opts || {};
      const active = opts.active || 'today';
      const title = opts.title || 'motracker';

      // Remember finance sub-tab for cross-page session memory
      if (active === 'finance' && opts.sub) {
        setFinanceSub(opts.sub);
      }
      const activeSub = (active === 'finance') ? (opts.sub || getFinanceSub()) : null;

      // Build markup
      const headerHTML = buildHeader(title);
      const subtabsHTML = (active === 'finance') ? buildSubtabs(activeSub) : '';
      const tabbarHTML = buildTabbar(active);
      const calHTML = buildCalendar();

      // Inject header at the top of body (before any existing content)
      const existingHeader = document.querySelector('header');
      if (existingHeader) {
        existingHeader.outerHTML = headerHTML + subtabsHTML;
      } else {
        document.body.insertAdjacentHTML('afterbegin', headerHTML + subtabsHTML);
      }

      // Inject tab bar + calendar at end of body
      document.body.insertAdjacentHTML('beforeend', tabbarHTML + calHTML);
      document.body.classList.add('mt-has-tabbar');

      // Wire date pill + today button
      document.getElementById('mt-date-pill').addEventListener('click', openCalendar);
      const todayBtn = document.getElementById('mt-today-btn');
      if (todayBtn) {
        todayBtn.addEventListener('click', () => navigateToDate(TODAY));
      }

      // Wire calendar
      document.getElementById('mt-cal-close').addEventListener('click', closeCalendar);
      document.getElementById('mt-cal-backdrop').addEventListener('click', e => {
        if (e.target.id === 'mt-cal-backdrop') closeCalendar();
      });
      document.getElementById('mt-cal-prev').addEventListener('click', () => {
        CAL_MONTH.month--;
        if (CAL_MONTH.month < 0) { CAL_MONTH.month = 11; CAL_MONTH.year--; }
        renderCalendar();
      });
      document.getElementById('mt-cal-next').addEventListener('click', () => {
        CAL_MONTH.month++;
        if (CAL_MONTH.month > 11) { CAL_MONTH.month = 0; CAL_MONTH.year++; }
        renderCalendar();
      });
      document.getElementById('mt-cal-today').addEventListener('click', () => navigateToDate(TODAY));
    },
  };

  window.MotrackerNav = MotrackerNav;
})();
