(function() {
  const vscode = acquireVsCodeApi();

  // DOM Elements
  const userAvatar = document.getElementById('userAvatar');
  const avatarFallback = document.getElementById('avatarFallback');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userTier = document.getElementById('userTier');
  const btnRefresh = document.getElementById('btnRefresh');

  const gaugeRing = document.getElementById('gaugeRing');
  const gaugeValue = document.getElementById('gaugeValue');
  const quotaUsed = document.getElementById('quotaUsed');
  const quotaLimit = document.getElementById('quotaLimit');
  const quotaPercentBadge = document.getElementById('quotaPercentBadge');

  const cursorModelPct = document.getElementById('cursorModelPct');
  const cursorModelBar = document.getElementById('cursorModelBar');
  const otherModelPct = document.getElementById('otherModelPct');
  const otherModelBar = document.getElementById('otherModelBar');
  const bonusGrantRow = document.getElementById('bonusGrantRow');
  const bonusGrantVal = document.getElementById('bonusGrantVal');
  const queueStatusBanner = document.getElementById('queueStatusBanner');
  const queueStatusText = document.getElementById('queueStatusText');

  const daysCount = document.getElementById('daysCount');
  const daysResetPill = document.getElementById('daysResetPill');
  const cycleProgress = document.getElementById('cycleProgress');
  const cycleStart = document.getElementById('cycleStart');
  const cycleEnd = document.getElementById('cycleEnd');

  const todayTokens = document.getElementById('todayTokens');
  const todayCostBadge = document.getElementById('todayCostBadge');
  const todayInput = document.getElementById('todayInput');
  const todayOutput = document.getElementById('todayOutput');
  const todayCache = document.getElementById('todayCache');

  const sandCard = document.getElementById('sandCard');
  const sandUsedVal = document.getElementById('sandUsedVal');
  const sandPercentBadge = document.getElementById('sandPercentBadge');
  const sandProgress = document.getElementById('sandProgress');
  const sandResetDate = document.getElementById('sandResetDate');

  const donutSvg = document.getElementById('donutSvg');
  const modelsList = document.getElementById('modelsList');
  const totalEventsCount = document.getElementById('totalEventsCount');

  const heatmapGrid = document.getElementById('heatmapGrid');
  const heatmapTooltip = document.getElementById('heatmapTooltip');

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

    // 1. Profile
    if (data.profile) {
      userName.textContent = data.profile.name || 'Cursor 用户';
      userEmail.textContent = data.profile.email || '';
      userTier.textContent = (data.profile.membershipType || 'PRO').toUpperCase() + ' 会员';

      if (data.profile.avatarUrl) {
        userAvatar.src = data.profile.avatarUrl;
        userAvatar.style.display = 'block';
        avatarFallback.style.display = 'none';
      } else {
        userAvatar.style.display = 'none';
        avatarFallback.style.display = 'flex';
        avatarFallback.textContent = (data.profile.name || 'C').charAt(0).toUpperCase();
      }
    }

    // 2. Fast Requests Gauge
    if (data.quota) {
      const { used, limit, remaining, percentUsed, daysUntilReset } = data.quota;
      gaugeValue.textContent = formatCompact(remaining);
      quotaUsed.textContent = formatNumber(used);
      quotaLimit.textContent = formatNumber(limit);
      quotaPercentBadge.textContent = `已用 ${percentUsed}%`;

      const circumference = 2 * Math.PI * 40; // r=40 -> 251.32
      const remPercent = limit > 0 ? (remaining / limit) : 0;
      const offset = circumference * (1 - remPercent);
      gaugeRing.style.strokeDashoffset = String(offset);

      if (remPercent <= 0.15) {
        gaugeRing.style.stroke = 'var(--accent-red)';
      } else if (remPercent <= 0.35) {
        gaugeRing.style.stroke = 'var(--accent-orange)';
      } else {
        gaugeRing.style.stroke = 'var(--accent-blue)';
      }

      // Official sub-bars (Cursor Models & Other Models)
      const autoPct = data.quota.autoPercentUsed !== undefined ? data.quota.autoPercentUsed : percentUsed;
      const apiPct = data.quota.apiPercentUsed !== undefined ? data.quota.apiPercentUsed : percentUsed;

      if (cursorModelPct && cursorModelBar) {
        cursorModelPct.textContent = `${autoPct}% used`;
        cursorModelBar.style.width = `${Math.min(100, autoPct)}%`;
      }
      if (otherModelPct && otherModelBar) {
        otherModelPct.textContent = `${apiPct}% used`;
        otherModelBar.style.width = `${Math.min(100, apiPct)}%`;
      }

      const bonus = data.quota.bonus || 0;
      if (bonusGrantRow && bonusGrantVal) {
        if (bonus > 0) {
          bonusGrantRow.style.display = 'flex';
          bonusGrantVal.textContent = `${bonus.toLocaleString()} 次可用 · 官方赠送抵扣`;
        } else {
          bonusGrantRow.style.display = 'none';
        }
      }

      if (queueStatusBanner && queueStatusText) {
        const qIcon = queueStatusBanner.querySelector('.queue-icon');
        if (bonus > 0) {
          queueStatusBanner.className = 'queue-status-banner bonus';
          if (qIcon) qIcon.textContent = '🎁';
          queueStatusText.textContent = `基础额度已用满 · 当前由官方 Credit Grant (${bonus.toLocaleString()}次) 免费兜底`;
        } else if (remaining <= 0) {
          queueStatusBanner.className = 'queue-status-banner';
          if (qIcon) qIcon.textContent = '⚠️';
          queueStatusText.textContent = '基础与赠送配额已用完 · 需开启按量付费或等待重置';
        } else {
          queueStatusBanner.className = 'queue-status-banner fast';
          if (qIcon) qIcon.textContent = '⚡';
          queueStatusText.textContent = `高速可用模式 · 剩余 ${remaining.toLocaleString()} 次基础请求`;
        }
      }

      // Billing cycle
      daysCount.textContent = String(daysUntilReset);
      daysResetPill.textContent = `${daysUntilReset} 天`;
      cycleStart.textContent = data.quota.billingCycleStart ? `周期起始: ${data.quota.billingCycleStart}` : '';
      cycleEnd.textContent = data.quota.billingCycleEnd ? `重置日期: ${data.quota.billingCycleEnd}` : '';

      // Estimate cycle progress (typical 30 days)
      const daysPassed = Math.max(0, 30 - daysUntilReset);
      const cycleProgPercent = Math.min(100, Math.max(0, Math.round((daysPassed / 30) * 100)));
      cycleProgress.style.width = `${cycleProgPercent}%`;
    }

    // 3. Today's Activity
    if (data.tokens && data.tokens.today) {
      const td = data.tokens.today;
      todayTokens.textContent = formatCompact(td.totalTokens);
      todayInput.textContent = formatCompact(td.inputTokens);
      todayOutput.textContent = formatCompact(td.outputTokens);
      todayCache.textContent = formatCompact(td.cacheTokens);

      const costDollars = (td.costCents / 100).toFixed(2);
      todayCostBadge.textContent = `$${costDollars}`;
    }

    // 4. Weekly Allowance (Sand / Grok)
    if (data.sandUsage) {
      const su = data.sandUsage;
      sandUsedVal.textContent = `${su.usagePercent}%`;
      sandPercentBadge.textContent = `已用 ${su.usagePercent}%`;
      sandProgress.style.width = `${Math.min(100, su.usagePercent)}%`;
      if (su.nextResetUtc) {
        const d = new Date(su.nextResetUtc);
        sandResetDate.textContent = `重置时间: ${d.toLocaleDateString([], { month: 'numeric', day: 'numeric' })}`;
      }
    }

    // 5. Model Breakdown & Donut Chart
    renderModels(data.models || [], data.tokens?.totalCount || 0);

    // 6. Heatmap Grid
    renderHeatmap(data.dailyMap || {});

    // 7. Recent Events Table
    renderRecentEvents(data.recentEvents || []);
  }

  function renderModels(models, totalCount) {
    totalEventsCount.textContent = `累计记录 ${formatNumber(totalCount)} 次请求`;
    modelsList.innerHTML = '';

    if (!models || models.length === 0) {
      modelsList.innerHTML = '<div class="empty-state">暂无模型使用记录</div>';
      return;
    }

    // Build Donut Segments
    const circumference = 2 * Math.PI * 38; // r=38 -> 238.76
    donutSvg.innerHTML = '<circle cx="50" cy="50" r="38" fill="transparent" stroke="rgba(255,255,255,0.06)" stroke-width="12"/>';

    let accumulatedPercent = 0;
    models.forEach((m, idx) => {
      const color = MODEL_COLORS[idx % MODEL_COLORS.length];
      const pct = parseFloat(m.percent) || 0;

      if (pct > 0) {
        const strokeLength = (pct / 100) * circumference;
        const strokeOffset = circumference - (accumulatedPercent / 100) * circumference;

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', '50');
        circle.setAttribute('cy', '50');
        circle.setAttribute('r', '38');
        circle.setAttribute('fill', 'transparent');
        circle.setAttribute('stroke', color);
        circle.setAttribute('stroke-width', '12');
        circle.setAttribute('stroke-dasharray', `${strokeLength} ${circumference}`);
        circle.setAttribute('stroke-dashoffset', String(strokeOffset));
        donutSvg.appendChild(circle);

        accumulatedPercent += pct;
      }

      // Add to list
      const row = document.createElement('div');
      row.className = 'model-row';
      row.innerHTML = `
        <div class="model-header-row">
          <div class="model-name-group">
            <span class="model-dot" style="background-color: ${color};"></span>
            <span class="model-name">${m.name}</span>
          </div>
          <span class="model-stat-val">${formatCompact(m.totalTokens)} Token (${m.percent}%)</span>
        </div>
        <div class="model-bar-bg">
          <div class="model-bar-fill" style="width: ${m.percent}%; background-color: ${color};"></div>
        </div>
      `;
      modelsList.appendChild(row);
    });
  }

  function renderHeatmap(dailyMap) {
    heatmapGrid.innerHTML = '';

    // Generate past 90 days date sequence
    const dates = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dates.push({ date: d, key });
    }

    // Find max tokens for leveling
    let maxTokens = 1;
    for (const d of dates) {
      const stat = dailyMap[d.key];
      if (stat && stat.totalTokens > maxTokens) {
        maxTokens = stat.totalTokens;
      }
    }

    // Render cells
    dates.forEach(d => {
      const stat = dailyMap[d.key];
      const tokens = stat?.totalTokens || 0;
      const count = stat?.requestsCount || 0;
      const cost = stat?.costCents ? `$${(stat.costCents / 100).toFixed(2)}` : '$0.00';

      let lvl = 0;
      if (tokens > 0) {
        const ratio = tokens / maxTokens;
        if (ratio > 0.7) lvl = 4;
        else if (ratio > 0.4) lvl = 3;
        else if (ratio > 0.15) lvl = 2;
        else lvl = 1;
      }

      const cell = document.createElement('div');
      cell.className = `heatmap-cell lvl-${lvl}`;

      // Mouse events for tooltip
      cell.addEventListener('mouseenter', (e) => {
        const rect = cell.getBoundingClientRect();
        heatmapTooltip.innerHTML = `
          <strong>📅 ${d.key}</strong><br/>
          消耗总量: <strong>${formatNumber(tokens)} Token</strong><br/>
          调用次数: ${count} 次 | 费用: ${cost}
        `;
        heatmapTooltip.style.display = 'block';
        heatmapTooltip.style.left = `${rect.left + window.scrollX - 40}px`;
        heatmapTooltip.style.top = `${rect.top + window.scrollY - 55}px`;
      });

      cell.addEventListener('mouseleave', () => {
        heatmapTooltip.style.display = 'none';
      });

      heatmapGrid.appendChild(cell);
    });
  }

  function renderRecentEvents(events) {
    eventsTbody.innerHTML = '';

    if (!events || events.length === 0) {
      eventsTbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无近期调用记录</td></tr>';
      return;
    }

    events.forEach(ev => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${ev.timeStr}</td>
        <td><strong style="color: var(--text-primary);">${ev.model}</strong></td>
        <td>${formatNumber(ev.inputTokens + ev.outputTokens)}</td>
        <td>${formatCompact(ev.cacheTokens)}</td>
        <td><span style="color: var(--accent-green); font-weight: 600;">${ev.costStr}</span></td>
      `;
      eventsTbody.appendChild(tr);
    });
  }
})();
