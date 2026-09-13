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
  const sectionQuotaTitle = document.getElementById('sectionQuotaTitle');

  const queueBadge = document.getElementById('queueBadge');
  const cursorModelPct = document.getElementById('cursorModelPct');
  const cursorModelBar = document.getElementById('cursorModelBar');
  const otherModelPct = document.getElementById('otherModelPct');
  const otherModelBar = document.getElementById('otherModelBar');
  const queueStatusBanner = document.getElementById('queueStatusBanner');
  const queueAlertTitle = document.getElementById('queueAlertTitle');
  const queueAlertDesc = document.getElementById('queueAlertDesc');
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
    if (refreshIcon) refreshIcon.classList.add('spinning');
    vscode.postMessage({ command: 'refresh' });
    setTimeout(() => {
      if (refreshIcon) refreshIcon.classList.remove('spinning');
    }, 4000);
  });

  // Listen for messages from extension
  window.addEventListener('message', event => {
    const message = event.data;
    if (message.type === 'update') {
      render(message.data);
      if (refreshIcon) refreshIcon.classList.remove('spinning');
    } else if (message.type === 'loading') {
      if (refreshIcon) refreshIcon.classList.add('spinning');
    } else if (message.type === 'error') {
      if (refreshIcon) refreshIcon.classList.remove('spinning');
    }
  });

  // Tell extension we are ready
  vscode.postMessage({ command: 'ready' });

  /**
   * Format token counts with intuitive Chinese units (万 / 亿) matching Antigravity
   */
  function formatTokens(num) {
    if (num == null || isNaN(num)) return '0';
    num = Number(num);
    if (num === 0) return '0';
    if (num >= 100000000) {
      const yi = num / 100000000;
      return parseFloat(yi.toFixed(yi >= 100 ? 1 : 2)) + ' 亿';
    }
    if (num >= 10000) {
      const wan = num / 10000;
      return parseFloat(wan.toFixed(wan >= 100 ? 1 : 2)) + ' 万';
    }
    return num.toLocaleString();
  }

  function formatNumber(num) {
    return (num || 0).toLocaleString();
  }

  /**
   * Format membership tier with accurate display name and class
   */
  function formatMembership(tier) {
    if (!tier) return { text: 'FREE 免费版', cls: 'tier-free', title: 'Free' };
    const t = String(tier).toLowerCase().trim();
    switch (t) {
      case 'free':
        return { text: 'FREE 免费版', cls: 'tier-free', title: 'Free' };
      case 'hobby':
        return { text: 'HOBBY 免费版', cls: 'tier-free', title: 'Hobby' };
      case 'pro':
        return { text: 'PRO $20/MO', cls: 'tier-pro', title: 'Pro' };
      case 'pro_plus':
      case 'pro+':
        return { text: 'PRO+ $60/MO', cls: 'tier-pro-plus', title: 'Pro+' };
      case 'business':
        return { text: 'BUSINESS $40/MO', cls: 'tier-business', title: 'Business' };
      case 'enterprise':
        return { text: 'ENTERPRISE 企业版', cls: 'tier-enterprise', title: 'Enterprise' };
      default:
        const capitalized = t.charAt(0).toUpperCase() + t.slice(1);
        return { text: t.toUpperCase(), cls: 'tier-pro', title: capitalized };
    }
  }

  function render(data) {
    if (!data) return;

    // 1. Account Profile
    if (data.profile) {
      userName.textContent = data.profile.name || 'Cursor 用户';
      userEmail.textContent = data.profile.email || '';

      const tierInfo = formatMembership(data.profile.membershipType);
      userTier.textContent = tierInfo.text;
      userTier.className = `account-tier ${tierInfo.cls}`;

      if (sectionQuotaTitle) {
        sectionQuotaTitle.textContent = `官方套餐配额 (Included in ${tierInfo.title})`;
      }

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
      todayTokens.textContent = formatTokens(td.totalTokens);
      todayInput.textContent = formatTokens(td.inputTokens);
      todayCache.textContent = formatTokens(td.cacheTokens);
      todayOutput.textContent = formatTokens(td.outputTokens);
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
              <span class="model-tok">${formatTokens(m.totalTokens)} tok</span>
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
            <span style="color: var(--input-color);">${formatTokens(ev.inputTokens)}</span> /
            <span style="color: var(--output-color);">${formatTokens(ev.outputTokens)}</span> /
            <span style="color: var(--cache-color);">${formatTokens(ev.cacheTokens)}</span>
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
    heatStatPeak.textContent = `${formatTokens(maxTokens)} tok`;
    heatStatTotal.textContent = `${formatTokens(totalTokens)} tok`;

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
