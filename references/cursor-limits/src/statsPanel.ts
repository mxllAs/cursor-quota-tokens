import * as vscode from 'vscode';
import type { LineEditsViewModel } from './userAnalytics';

/** Serializable payload for the stats webview (postMessage / refresh). */
export type StatsPanelData =
    | { status: 'no-auth'; detail?: string }
    | { status: 'error'; message: string }
    | {
          status: 'ok';
          variant: 'summary';
          planName: string | null;
          planExpiry: string | null;
          totalPercent: number | null;
          autoPercent: number | null;
          apiPercent: number | null;
          includedUsed: number | null;
          includedLimit: number | null;
          progressRatio: number;
          lineEdits: LineEditsViewModel | null;
      }
    | {
          status: 'ok';
          variant: 'legacy';
          planName: string | null;
          planExpiry: string | null;
          premiumUsed: number;
          premiumLimit: number | null;
          autoUsed: number;
          autoLimit: number | null;
          progressRatio: number;
          lineEdits: LineEditsViewModel | null;
      };

const VIEW_TYPE = 'cursorLimits.stats';

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

function statsWebviewHtml(nonce: string): string {
    const csp = [
        "default-src 'none'",
        "style-src 'unsafe-inline'",
        `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cursor usage</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-foreground);
      --muted: var(--vscode-descriptionForeground);
      --border: var(--vscode-widget-border, var(--vscode-panel-border));
      --card: var(--vscode-sideBar-background, var(--vscode-editor-background));
      --link: var(--vscode-textLink-foreground);
      --err: var(--vscode-errorForeground);
      --warn: var(--vscode-editorWarning-foreground);
    }
    body {
      font-family: var(--vscode-font-family);
      font-size: 13px;
      color: var(--fg);
      background: var(--bg);
      margin: 0;
      padding: 16px 20px 24px;
      line-height: 1.45;
    }
    h1 {
      font-size: 15px;
      font-weight: 600;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .sub {
      color: var(--muted);
      font-size: 12px;
      margin-bottom: 16px;
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;
    }
    button {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      padding: 6px 12px;
      font-size: 12px;
      cursor: pointer;
      border-radius: 2px;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    button:disabled { opacity: 0.5; cursor: default; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 12px;
      margin: 6px 0;
    }
    .label { color: var(--muted); }
    .bar-wrap {
      height: 8px;
      background: var(--vscode-progressBar-background, rgba(128,128,128,0.25));
      border-radius: 4px;
      overflow: hidden;
      margin-top: 12px;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.2s ease;
    }
    .bar-fill.low { background: var(--vscode-charts-green, #3fb950); }
    .bar-fill.mid { background: var(--vscode-charts-yellow, #d29922); }
    .bar-fill.high { background: var(--vscode-charts-red, #f85149); }
    .msg { color: var(--muted); }
    .msg.err { color: var(--err); }
    a { color: var(--link); text-decoration: none; font-size: 12px; }
    a:hover { text-decoration: underline; }
    .footer { margin-top: 20px; padding-top: 12px; border-top: 1px solid var(--border); }

    /* Skeleton loader */
    @keyframes sk-shimmer {
      0% { background-position: 100% 0; }
      100% { background-position: -100% 0; }
    }
    .sk {
      border-radius: 4px;
      background: linear-gradient(
        90deg,
        var(--vscode-input-background, rgba(120, 120, 120, 0.14)) 0%,
        var(--vscode-toolbar-hoverBackground, rgba(160, 160, 160, 0.22)) 45%,
        var(--vscode-input-background, rgba(120, 120, 120, 0.14)) 90%
      );
      background-size: 220% 100%;
      animation: sk-shimmer 1.15s ease-in-out infinite;
    }
    .sk-card {
      pointer-events: none;
    }
    .sk-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
      margin: 10px 0;
    }
    .sk-line {
      height: 11px;
      display: block;
    }
    .sk-line--label { width: 32%; max-width: 120px; min-width: 72px; }
    .sk-line--value { width: 22%; max-width: 72px; min-width: 48px; flex-shrink: 0; }
    .sk-bar {
      height: 8px;
      width: 100%;
      margin-top: 14px;
      border-radius: 4px;
    }

    .le-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 8px;
    }
    .le-title {
      font-size: 11px;
      color: var(--muted);
      text-transform: none;
      letter-spacing: 0.02em;
      margin: 0 0 2px 0;
    }
    .le-total {
      font-size: 22px;
      font-weight: 600;
      line-height: 1.1;
      margin: 0;
    }
    .le-seg {
      display: flex;
      border: 1px solid var(--border);
      border-radius: 6px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .le-seg button {
      background: transparent;
      color: var(--fg);
      border: none;
      padding: 5px 10px;
      font-size: 11px;
      cursor: pointer;
      border-radius: 0;
    }
    .le-seg button:hover { background: var(--vscode-toolbar-hoverBackground); }
    .le-seg button.active {
      background: var(--vscode-input-background);
      font-weight: 500;
    }
    .hm-wrap { margin-top: 10px; overflow-x: auto; }
    .hm-months {
      display: flex;
      gap: 3px;
      margin: 0 0 4px 18px;
      min-height: 14px;
    }
    .hm-months span {
      width: 14px;
      font-size: 9px;
      color: var(--muted);
      text-align: center;
      flex-shrink: 0;
    }
    .hm-body { display: flex; gap: 6px; align-items: stretch; }
    .hm-yaxis {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      font-size: 9px;
      color: var(--muted);
      padding: 0 2px 0 0;
      width: 12px;
      flex-shrink: 0;
    }
    .hm-yaxis span { line-height: 11px; height: 11px; }
    .hm-grid {
      display: grid;
      grid-auto-flow: column;
      grid-template-rows: repeat(7, 11px);
      grid-auto-columns: 11px;
      gap: 3px;
    }
    .hm-cell {
      width: 11px;
      height: 11px;
      border-radius: 2px;
    }
    .hm-l0 { background: var(--vscode-input-background, rgba(120,120,120,0.14)); }
    .hm-l1 { background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 35%, var(--vscode-input-background)); }
    .hm-l2 { background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 55%, transparent); }
    .hm-l3 { background: color-mix(in srgb, var(--vscode-charts-green, #3fb950) 75%, transparent); }
    .hm-l4 { background: var(--vscode-charts-green, #3fb950); }
    .le-stats {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px 16px;
      margin-top: 14px;
      font-size: 12px;
    }
    .le-stats dt { color: var(--muted); font-size: 11px; margin: 0; }
    .le-stats dd { margin: 2px 0 0 0; font-weight: 500; }
    .le-legend {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 12px;
      font-size: 10px;
      color: var(--muted);
    }
    .le-legend .sw { display: flex; gap: 2px; }
    .le-legend .sw span { width: 11px; height: 11px; border-radius: 2px; }
    .le-unavailable { color: var(--muted); font-size: 12px; margin: 8px 0 0 0; }
    .footer-links { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
  </style>
</head>
<body>
  <h1>Cursor usage</h1>
  <div class="toolbar">
    <button type="button" id="refresh">Refresh</button>
    <span class="msg" id="status"></span>
  </div>
  <div id="root"></div>
  <div class="footer footer-links">
    <a href="#" id="openDashboard">Open Cursor dashboard</a>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const root = document.getElementById('root');
    const refreshBtn = document.getElementById('refresh');
    const statusEl = document.getElementById('status');
    const openSpending = document.getElementById('openSpending');
    const openDashboard = document.getElementById('openDashboard');

    var lastPayload = null;
    var lineFilter = 'all';

    function pct(n) {
      if (n === null || n === undefined || typeof n !== 'number' || !isFinite(n)) return 'N/A';
      return Math.round(n) + '%';
    }

    function barClass(ratio) {
      if (ratio >= 0.95) return 'high';
      if (ratio >= 0.80) return 'mid';
      return 'low';
    }

    function esc(s) {
      if (s == null) return '';
      const d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    }

    function skeletonMarkup() {
      var u =
        '<div class="card sk-card" aria-hidden="true">' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '<div class="sk sk-bar"></div>' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '</div>';
      var le =
        '<div class="card sk-card" aria-hidden="true" style="margin-top:12px">' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '<div class="sk sk-bar" style="height:80px;margin-top:12px"></div>' +
        '<div class="sk-row"><span class="sk sk-line sk-line--label"></span><span class="sk sk-line sk-line--value"></span></div>' +
        '</div>';
      return u + le;
    }

    function showSkeleton() {
      root.setAttribute('aria-busy', 'true');
      root.innerHTML = skeletonMarkup();
    }

    function pad2(n) { return n < 10 ? '0' + n : String(n); }
    function fmtKey(dt) {
      return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1) + '-' + pad2(dt.getDate());
    }
    function countForDay(d, mode) {
      if (mode === 'tab') return d.tab;
      if (mode === 'agent') return d.agent;
      return d.all;
    }
    function monthInitial(dt) {
      return dt.toLocaleString('en-US', { month: 'short' }).charAt(0);
    }
    function renderLineEditsCard(le, mode) {
      var card = document.createElement('div');
      card.className = 'card';
      if (!le || !le.days || !le.days.length) {
        var miss = document.createElement('p');
        miss.className = 'le-unavailable';
        miss.textContent =
          'AI line edits could not be loaded or parsed. Confirm you are signed into Cursor; the dashboard API shape may have changed.';
        card.appendChild(miss);
        return card;
      }

      var map = new Map();
      var maxV = 0;
      le.days.forEach(function (d) {
        var v = countForDay(d, mode);
        map.set(d.date, v);
        if (v > maxV) maxV = v;
      });
      function cellLevel(v) {
        if (v <= 0) return 0;
        if (maxV <= 0) return 0;
        var lv = Math.ceil((v / maxV) * 4);
        return Math.min(4, Math.max(1, lv));
      }

      var total =
        mode === 'tab' ? le.totals.tab : mode === 'agent' ? le.totals.agent : le.totals.all;

      var head = document.createElement('div');
      head.className = 'le-header';
      var left = document.createElement('div');
      var title = document.createElement('p');
      title.className = 'le-title';
      title.textContent = 'AI Line Edits';
      var big = document.createElement('p');
      big.className = 'le-total';
      big.textContent = Number(total).toLocaleString();
      left.appendChild(title);
      left.appendChild(big);
      head.appendChild(left);

      var seg = document.createElement('div');
      seg.className = 'le-seg';
      [['all', 'All'], ['tab', 'Tab'], ['agent', 'Agent']].forEach(function (pair) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = pair[1];
        if (pair[0] === mode) b.classList.add('active');
        b.addEventListener('click', function () {
          lineFilter = pair[0];
          if (lastPayload && lastPayload.status === 'ok') render(lastPayload);
        });
        seg.appendChild(b);
      });
      head.appendChild(seg);
      card.appendChild(head);

      var end = new Date();
      end.setHours(0, 0, 0, 0);
      var start = new Date(end);
      start.setDate(start.getDate() - 371);
      while (start.getDay() !== 0) start.setDate(start.getDate() - 1);

      var weeks = [];
      var cur = new Date(start);
      while (cur <= end) {
        var vals = [];
        for (var r = 0; r < 7; r++) {
          var cell = new Date(cur);
          cell.setDate(cell.getDate() + r);
          if (cell > end) vals.push(0);
          else vals.push(map.get(fmtKey(cell)) || 0);
        }
        weeks.push({ start: new Date(cur), values: vals });
        cur.setDate(cur.getDate() + 7);
      }

      var monthsRow = document.createElement('div');
      monthsRow.className = 'hm-months';
      var prevM = -1;
      weeks.forEach(function (w) {
        var sp = document.createElement('span');
        var m = w.start.getMonth();
        sp.textContent = m !== prevM ? monthInitial(w.start) : '';
        prevM = m;
        monthsRow.appendChild(sp);
      });

      var body = document.createElement('div');
      body.className = 'hm-body';
      var yax = document.createElement('div');
      yax.className = 'hm-yaxis';
      ['', 'M', '', 'W', '', 'F', ''].forEach(function (t) {
        var s = document.createElement('span');
        s.textContent = t;
        yax.appendChild(s);
      });
      var grid = document.createElement('div');
      grid.className = 'hm-grid';
      weeks.forEach(function (w) {
        w.values.forEach(function (v) {
          var c = document.createElement('div');
          c.className = 'hm-cell hm-l' + cellLevel(v);
          c.title = String(v) + ' lines';
          grid.appendChild(c);
        });
      });
      body.appendChild(yax);
      body.appendChild(grid);

      var wrap = document.createElement('div');
      wrap.className = 'hm-wrap';
      wrap.appendChild(monthsRow);
      wrap.appendChild(body);
      card.appendChild(wrap);

      var dl = document.createElement('dl');
      dl.className = 'le-stats';
      [
        ['Most active month', le.mostActiveMonth || 'N/A'],
        ['Most active day', le.mostActiveDayDisplay || 'N/A'],
        ['Longest streak', (le.longestStreakDays || 0) + 'd'],
        ['Current streak', (le.currentStreakDays || 0) + 'd'],
      ].forEach(function (pair) {
        var dt = document.createElement('dt');
        dt.textContent = pair[0];
        var dd = document.createElement('dd');
        dd.textContent = pair[1];
        dl.appendChild(dt);
        dl.appendChild(dd);
      });
      card.appendChild(dl);

      var note = document.createElement('p');
      note.className = 'le-unavailable';
      note.style.marginTop = '6px';
      note.textContent = 'Streaks and “most active” use total AI lines (All), not the selected tab.';
      card.appendChild(note);

      var leg = document.createElement('div');
      leg.className = 'le-legend';
      leg.appendChild(document.createTextNode('Fewer'));
      var sw = document.createElement('span');
      sw.className = 'sw';
      for (var L = 0; L <= 4; L++) {
        var e = document.createElement('span');
        e.className = 'hm-cell hm-l' + L;
        sw.appendChild(e);
      }
      leg.appendChild(sw);
      leg.appendChild(document.createTextNode('More'));
      card.appendChild(leg);

      return card;
    }

    function render(data) {
      lastPayload = data;
      root.removeAttribute('aria-busy');
      root.innerHTML = '';
      statusEl.textContent = '';

      if (data.status === 'no-auth') {
        const p = document.createElement('p');
        p.className = 'msg err';
        p.textContent = data.detail || 'Could not read Cursor auth. Sign in to Cursor.';
        root.appendChild(p);
        return;
      }
      if (data.status === 'error') {
        const p = document.createElement('p');
        p.className = 'msg err';
        p.textContent = data.message;
        root.appendChild(p);
        return;
      }

      const card = document.createElement('div');
      card.className = 'card';

      const planRow = document.createElement('div');
      planRow.className = 'row';
      planRow.innerHTML = '<span class="label">Plan</span><span>' + esc(data.planName || 'N/A') + '</span>';
      card.appendChild(planRow);

      const expRow = document.createElement('div');
      expRow.className = 'row';
      expRow.innerHTML = '<span class="label">Renews / expiry</span><span>' + esc(data.planExpiry || 'N/A') + '</span>';
      card.appendChild(expRow);

      const barWrap = document.createElement('div');
      barWrap.className = 'bar-wrap';
      const fill = document.createElement('div');
      fill.className = 'bar-fill ' + barClass(data.progressRatio);
      fill.style.width = Math.min(100, Math.max(0, data.progressRatio * 100)) + '%';
      barWrap.appendChild(fill);
      card.appendChild(barWrap);

      if (data.variant === 'summary') {
        [['Included (total)', pct(data.totalPercent)], ['Auto + Composer', pct(data.autoPercent)], ['API', pct(data.apiPercent)]].forEach(function (pair) {
          const r = document.createElement('div');
          r.className = 'row';
          r.innerHTML = '<span class="label">' + esc(pair[0]) + '</span><span>' + esc(pair[1]) + '</span>';
          card.appendChild(r);
        });
        if (data.includedUsed != null && data.includedLimit != null) {
          const r = document.createElement('div');
          r.className = 'row';
          r.innerHTML = '<span class="label">Included units</span><span>' + esc(String(data.includedUsed)) + ' / ' + esc(String(data.includedLimit)) + '</span>';
          card.appendChild(r);
        }
      } else {
        const pr = document.createElement('div');
        pr.className = 'row';
        pr.innerHTML = '<span class="label">Premium requests</span><span>' + esc(String(data.premiumUsed)) + ' / ' + esc(data.premiumLimit != null ? String(data.premiumLimit) : 'N/A') + '</span>';
        card.appendChild(pr);
        const ar = document.createElement('div');
        ar.className = 'row';
        ar.innerHTML = '<span class="label">Auto / Composer</span><span>' + esc(String(data.autoUsed)) + ' / ' + esc(data.autoLimit != null ? String(data.autoLimit) : 'N/A') + '</span>';
        card.appendChild(ar);
      }

      root.appendChild(card);
      root.appendChild(renderLineEditsCard(data.lineEdits, lineFilter));
    }

    window.addEventListener('message', function (e) {
      const m = e.data;
      if (m && m.type === 'update') {
        refreshBtn.disabled = false;
        render(m.payload);
      }
      if (m && m.type === 'loading') {
        refreshBtn.disabled = true;
        statusEl.textContent = '';
        showSkeleton();
      }
    });

    refreshBtn.addEventListener('click', function () {
      vscode.postMessage({ type: 'refresh' });
    });

    if (openSpending) {
      openSpending.addEventListener('click', function (ev) {
        ev.preventDefault();
        vscode.postMessage({ type: 'openSpending' });
      });
    }

    openDashboard.addEventListener('click', function (ev) {
      ev.preventDefault();
      vscode.postMessage({ type: 'openDashboard' });
    });

    showSkeleton();
    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
}

let panelSingleton: vscode.WebviewPanel | undefined;

export function openCursorStatsPanel(
    context: vscode.ExtensionContext,
    fetchData: () => Promise<StatsPanelData>,
): void {
    if (panelSingleton) {
        panelSingleton.reveal(vscode.ViewColumn.Active);
        void pushUpdate(panelSingleton, fetchData);
        return;
    }

    panelSingleton = vscode.window.createWebviewPanel(
        VIEW_TYPE,
        'Cursor usage',
        vscode.ViewColumn.Active,
        {
            enableScripts: true,
            retainContextWhenHidden: true,
        },
    );

    const nonce = getNonce();
    panelSingleton.webview.html = statsWebviewHtml(nonce);

    panelSingleton.onDidDispose(() => {
        panelSingleton = undefined;
    });

    panelSingleton.webview.onDidReceiveMessage(
        (msg: { type?: string }) => {
            if (msg?.type === 'ready') {
                void pushUpdate(panelSingleton!, fetchData);
                return;
            }
            if (msg?.type === 'refresh') {
                void pushUpdate(panelSingleton!, fetchData, true);
                return;
            }
            if (msg?.type === 'openSpending') {
                vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/dashboard/spending'));
            }
            if (msg?.type === 'openDashboard') {
                vscode.env.openExternal(vscode.Uri.parse('https://cursor.com/dashboard'));
            }
        },
        undefined,
        context.subscriptions,
    );
}

async function pushUpdate(
    panel: vscode.WebviewPanel,
    fetchData: () => Promise<StatsPanelData>,
    showLoading = false,
): Promise<void> {
    if (showLoading) {
        await panel.webview.postMessage({ type: 'loading' });
    }
    const payload = await fetchData();
    await panel.webview.postMessage({ type: 'update', payload });
}
