(function() {
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const btnRefresh = document.getElementById('btnRefresh');
  const refreshIcon = document.getElementById('refreshIcon');

  const userAvatar = document.getElementById('userAvatar');
  const avatarFallback = document.getElementById('avatarFallback');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userTier = document.getElementById('userTier');

  const queueBadge = document.getElementById('queueBadge');
  const cursorModelPct = document.getElementById('cursorModelPct');
  const cursorModelBar = document.getElementById('cursorModelBar');
  const otherModelPct = document.getElementById('otherModelPct');
  const otherModelBar = document.getElementById('otherModelBar');
  const queueStatusBanner = document.getElementById('queueStatusBanner');
  const queueAlertTitle = document.getElementById('queueAlertTitle');
  const queueAlertDesc = document.getElementById('queueAlertDesc');
  const bonusSpendVal = document.getElementById('bonusSpendVal');

  const daysResetPill = document.getElementById('daysResetPill');
  const daysCount = document.getElementById('daysCount');
  const cycleProgress = document.getElementById('cycleProgress');
  const cycleStart = document.getElementById('cycleStart');
  const cycleEnd = document.getElementById('cycleEnd');

  const sandPercentBadge = document.getElementById('sandPercentBadge');
  const sandUsedVal = document.getElementById('sandUsedVal');
  const sandProgress = document.getElementById('sandProgress');
  const sandResetDate = document.getElementById('sandResetDate');

  const todayCostBadge = document.getElementById('todayCostBadge');
  const todayTokens = document.getElementById('todayTokens');
  const cacheHitRatio = document.getElementById('cacheHitRatio');
  const segInput = document.getElementById('segInput');
  const segCache = document.getElementById('segCache');
  const segOutput = document.getElementById('segOutput');
  const todayInput = document.getElementById('todayInput');
  const todayCache = document.getElementById('todayCache');
  const todayOutput = document.getElementById('todayOutput');
  const todayRequestsCount = document.getElementById('todayRequestsCount');

  const totalEventsCount = document.getElementById('totalEventsCount');
  const modelsList = document.getElementById('modelsList');

  const heatStatActive = document.getElementById('heatStatActive');
  const heatStatPeak = document.getElementById('heatStatPeak');
  const heatStatTotal = document.getElementById('heatStatTotal');
  const heatmapGrid = document.getElementById('heatmapGrid');
  const heatmapTooltip = document.getElementById('heatmapTooltip');
  const heatHoverDate = document.getElementById('heatHoverDate');

  const eventsTbody = document.getElementById('eventsTbody');

  const MODEL_COLORS = [
    '#38bdf8', '#818cf8', '#a855f7', '#ec4899', '#f97316', '#22c55e', '#eab308', '#06b6d4'
  ];

  // Refresh button click
  btnRefresh.addEventListener('click', () => {
    btnRefresh.classList.add('spinning');
    vscode.postMessage({ command: 'refresh' });
  });

  // Listen for messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
      render(message.data);
      btnRefresh.classList.remove('spinning');
    } else if (message.type === 'loading') {
      btnRefresh.classList.add('spinning');
    }
  });

  // Tell extension we are ready
  vscode.postMessage({ command: 'ready' });

  function formatCompact(num) {
    if (!num || num <= 0) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return String(num);
  }

  function formatNumber(num) {
    return (num || 0).toLocaleString();
  }

  function render(data) {
    if (!data) return;

    // 1. Account Profile
    if (data.profile) {
      userName.textContent = data.profile.name || 'Cursor 用户';
      userEmail.textContent = data.profile.email || '';
      userTier.textContent = (data.profile.membershipType || 'PRO').toUpperCase() + ' $20/MO';

      if (data.profile.avatarUrl) {
        userAvatar.src = data.profile.avatarUrl;
        userAvatar.style.display = 'block';
        avatarFallback.style.display = 'none';
      } else {
        userAvatar.style.display = 'none';
        avatarFallback.style.display = 'inline';
        avatarFallback.textContent = (data.profile.name || 'C').charAt(0).toUpperCase();
      }
    }

    // 2. Quota Main Card (Included in Pro)
    if (data.quota) {
      const q = data.quota;
      const autoPct = q.autoPercentUsed !== undefined ? q.autoPercentUsed : q.percentUsed;
      const apiPct = q.apiPercentUsed !== undefined ? q.apiPercentUsed : q.percentUsed;

      cursorModelPct.textContent = `${autoPct}% used`;
      cursorModelBar.style.width = `${Math.min(100, Math.max(0, autoPct))}%`;

      otherModelPct.textContent = `${apiPct}% used`;
      otherModelBar.style.width = `${Math.min(100, Math.max(0, apiPct))}%`;

      const isSlow = q.isQueueSlow ?? (autoPct >= 100 && !q.onDemandEnabled);

      if (isSlow) {
        queueBadge.textContent = '慢速队列中';
        queueBadge.className = 'status-pill pill-amber';
        queueStatusBanner.className = 'queue-alert-banner';
        queueStatusBanner.querySelector('.queue-alert-icon').textContent = '🐢';
        queueAlertTitle.textContent = '当前处于慢速响应排队队列 (Slow Queue)';
        queueAlertDesc.textContent = '基础额度已满且按量付费未开启。代码会话可继续正常使用，如需高速响应可升级 Pro+ 或开启按量付费。';
      } else {
        queueBadge.textContent = '高速通道';
        queueBadge.className = 'status-pill pill-green';
        queueStatusBanner.className = 'queue-alert-banner fast';
        queueStatusBanner.querySelector('.queue-alert-icon').textContent = '⚡';
        queueAlertTitle.textContent = '高速通道正常生效中 (Fast Mode)';
        queueAlertDesc.textContent = '当前请求享有官方最高优先级高速模型算力响应。';
      }

      // Bonus spend
      const bSpend = q.bonusSpend || 0;
      if (bonusSpendVal) {
        bonusSpendVal.textContent = `${formatNumber(bSpend)} 点 · 全额免密抵扣`;
      }

      // Billing Cycle
      const days = q.daysUntilReset || 0;
      daysCount.textContent = String(days);
      daysResetPill.textContent = `${days} 天`;
      if (cycleStart) cycleStart.textContent = q.billingCycleStart ? `起始: ${q.billingCycleStart}` : '起始: --';
      if (cycleEnd) cycleEnd.textContent = q.resetDateStr ? `重置: ${q.resetDateStr}` : '重置: --';

      const daysPassed = Math.max(0, 30 - days);
      const cycleProgPct = Math.min(100, Math.max(0, Math.round((daysPassed / 30) * 100)));
      if (cycleProgress) cycleProgress.style.width = `${cycleProgPct}%`;
    }

    // 3. Sand / Grok Weekly Quota
    if (data.sandUsage) {
      const s = data.sandUsage;
      const sPct = s.usagePercent || 0;
      sandPercentBadge.textContent = `${sPct}% 已用`;
      sandUsedVal.textContent = `${sPct}%`;
      sandProgress.style.width = `${Math.min(100, Math.max(0, sPct))}%`;
      if (s.resetDateStr && sandResetDate) {
        sandResetDate.textContent = `刷新: ${s.resetDateStr}`;
      }
    }

    // 4. Today Tokens & Metrics
    if (data.tokens && data.tokens.today) {
      const td = data.tokens.today;
      todayTokens.textContent = formatCompact(td.totalTokens);
      todayInput.textContent = formatCompact(td.inputTokens);
      todayCache.textContent = formatCompact(td.cacheTokens);
      todayOutput.textContent = formatCompact(td.outputTokens);
      todayRequestsCount.textContent = `${formatNumber(td.requestsCount || 0)} 次`;

      const costDollars = (td.costCents / 100).toFixed(2);
      todayCostBadge.textContent = `$${costDollars} (免密全额抵扣)`;

      // Calculate cache hit ratio
      const denom = (td.inputTokens + td.cacheTokens);
      const hitPct = denom > 0 ? ((td.cacheTokens / denom) * 100).toFixed(1) : '0.0';
      if (cacheHitRatio) cacheHitRatio.textContent = `${hitPct}%`;

      // Segmented bar
      const sum = td.inputTokens + td.cacheTokens + td.outputTokens;
      if (sum > 0) {
        const inPct = Math.max(2, (td.inputTokens / sum) * 100);
        const cachePct = Math.max(2, (td.cacheTokens / sum) * 100);
        const outPct = Math.max(2, (td.outputTokens / sum) * 100);
        segInput.style.width = `${inPct}%`;
        segCache.style.width = `${cachePct}%`;
        segOutput.style.width = `${outPct}%`;
      }
    }

    // 5. Models Distribution
    if (data.models && Array.isArray(data.models)) {
      totalEventsCount.textContent = `累计记录 ${formatNumber(data.tokens?.totalCount || 0)} 次`;
      modelsList.innerHTML = '';

      data.models.forEach((m, idx) => {
        const color = MODEL_COLORS[idx % MODEL_COLORS.length];
        const row = document.createElement('div');
        row.className = 'model-row';
        row.innerHTML = `
          <div class="model-info-row">
            <div class="model-left">
              <span class="model-dot" style="background: ${color};"></span>
              <span class="model-title">${escapeHtml(m.name)}</span>
            </div>
            <div class="model-right">
              <span class="model-tok">${formatCompact(m.totalTokens)} tok</span>
              <span class="model-pct-text">${m.percent}%</span>
            </div>
          </div>
          <div class="model-bar-bg">
            <div class="model-bar-fill" style="width: ${m.percent}%; background: ${color};"></div>
          </div>
        `;
        modelsList.appendChild(row);
      });
    }

    // 6. GitHub Activity Heatmap
    if (data.dailyMap) {
      renderHeatmap(data.dailyMap);
    }

    // 7. Recent Requests Table
    if (data.recentEvents && Array.isArray(data.recentEvents)) {
      eventsTbody.innerHTML = '';
      data.recentEvents.slice(0, 25).forEach(ev => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="color: var(--text-muted);">${ev.timeStr}</td>
          <td style="font-weight: 600;">${escapeHtml(ev.model)}</td>
          <td>
            <span style="color: var(--input-color);">${formatCompact(ev.inputTokens)}</span> /
            <span style="color: var(--output-color);">${formatCompact(ev.outputTokens)}</span> /
            <span style="color: var(--cache-color);">${formatCompact(ev.cacheTokens)}</span>
          </td>
          <td style="color: #10b981; font-weight: 600;">${ev.costStr}</td>
        `;
        eventsTbody.appendChild(tr);
      });
    }
  }

  function renderHeatmap(dailyMap) {
    heatmapGrid.innerHTML = '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const past90 = new Date(today);
    past90.setDate(past90.getDate() - 90);

    // Find Sunday on or before past90
    const startSunday = new Date(past90);
    startSunday.setDate(startSunday.getDate() - startSunday.getDay());

    let maxTokens = 0;
    let activeDays = 0;
    let totalTokens = 0;

    const daysList = [];
    const curr = new Date(startSunday);
    while (curr <= today) {
      const dateKey = `${curr.getFullYear()}-${String(curr.getMonth() + 1).padStart(2, '0')}-${String(curr.getDate()).padStart(2, '0')}`;
      const dayData = dailyMap[dateKey];
      const tok = dayData ? dayData.totalTokens : 0;
      if (tok > 0) {
        activeDays++;
        totalTokens += tok;
        if (tok > maxTokens) maxTokens = tok;
      }
      daysList.push({
        date: dateKey,
        tokens: tok,
        requests: dayData ? dayData.requestsCount : 0
      });
      curr.setDate(curr.getDate() + 1);
    }

    heatStatActive.textContent = `${activeDays} 天`;
    heatStatPeak.textContent = `${formatCompact(maxTokens)} tok`;
    heatStatTotal.textContent = `${formatCompact(totalTokens)} tok`;

    daysList.forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'heat-cell';

      let lvl = 0;
      if (item.tokens > 0 && maxTokens > 0) {
        const ratio = item.tokens / maxTokens;
        if (ratio > 0.6) lvl = 4;
        else if (ratio > 0.3) lvl = 3;
        else if (ratio > 0.1) lvl = 2;
        else lvl = 1;
        cell.classList.add(`lvl-${lvl}`);
      }

      cell.addEventListener('mouseenter', e => {
        heatHoverDate.textContent = `${item.date}: ${formatNumber(item.tokens)} Tokens (${item.requests} 次会话)`;
        heatmapTooltip.innerHTML = `<strong>${item.date}</strong><br/>${formatNumber(item.tokens)} Tokens<br/>${item.requests} 次请求`;
        heatmapTooltip.style.opacity = '1';
        const rect = cell.getBoundingClientRect();
        heatmapTooltip.style.left = `${rect.left}px`;
        heatmapTooltip.style.top = `${rect.top - 48}px`;
      });

      cell.addEventListener('mouseleave', () => {
        heatmapTooltip.style.opacity = '0';
        heatHoverDate.textContent = '鼠标悬停方块查看详情';
      });

      heatmapGrid.appendChild(cell);
    });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
