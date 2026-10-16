const fs = require('fs');
const path = require('path');

class TokenAggregator {
  constructor(api, storagePath = null) {
    this.api = api;
    this.storagePath = storagePath;
    this.cacheFile = storagePath ? path.join(storagePath, 'cursor_token_cache.json') : null;
    this.cachedData = null;
    this.lastFetchTime = 0;
    this.cacheTtlMs = 60 * 1000; // 1 minute in-memory TTL
  }

  /**
   * Load disk cache if available
   */
  loadDiskCache() {
    if (!this.cacheFile || !fs.existsSync(this.cacheFile)) {
      return null;
    }
    try {
      const content = fs.readFileSync(this.cacheFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {
      return null;
    }
  }

  /**
   * Save to disk cache
   */
  saveDiskCache(data) {
    if (!this.cacheFile) return;
    try {
      const dir = path.dirname(this.cacheFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify(data, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[TokenAggregator] Failed to save disk cache:', e.message);
    }
  }

  /**
   * Fetch full dashboard data
   */
  async getDashboardData(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && this.cachedData && (now - this.lastFetchTime < this.cacheTtlMs)) {
      return this.cachedData;
    }

    try {
      // 1. Fetch summary, profile, sand usage, current period in parallel
      const [summaryRes, profileRes, sandRes, currentPeriodRes] = await Promise.allSettled([
        this.api.getUsageSummary(),
        this.api.getUserProfile(),
        this.api.getSandUsage(),
        this.api.getCurrentPeriodUsage()
      ]);

      const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
      const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const sand = sandRes.status === 'fulfilled' ? sandRes.value : null;
      const currentPeriod = currentPeriodRes.status === 'fulfilled' ? currentPeriodRes.value : null;

      // 2. Fetch recent usage events for today & 90-day history with smart multi-page fetching
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStartMs = today.getTime();

      // Query past 90 days for the heatmap
      const past90Days = new Date();
      past90Days.setDate(past90Days.getDate() - 90);
      past90Days.setHours(0, 0, 0, 0);
      const past90DaysMs = past90Days.getTime();

      // Fetch page 1 with max supported pageSize (1000)
      const p1Res = await this.api.getFilteredEvents({
        startDate: past90DaysMs,
        endDate: now,
        page: 1,
        pageSize: 1000
      });

      const totalEventsCount = p1Res?.totalUsageEventsCount || 0;
      let events = p1Res?.usageEventsDisplay || [];

      // Check if we need to fetch deeper pages (2..5)
      // When page 1 is full (1000 items) and the oldest event timestamp is newer than 90 days ago
      const diskCache = this.loadDiskCache();
      const cachedDailyCount = diskCache?.dailyMap ? Object.keys(diskCache.dailyMap).length : 0;
      const needBackfill = forceRefresh || cachedDailyCount < 30;

      if (events.length === 1000 && needBackfill) {
        const oldestP1Ts = parseInt(events[events.length - 1].timestamp, 10);
        if (oldestP1Ts > past90DaysMs) {
          try {
            const extraPages = await Promise.all([
              this.api.getFilteredEvents({ startDate: past90DaysMs, endDate: now, page: 2, pageSize: 1000 }),
              this.api.getFilteredEvents({ startDate: past90DaysMs, endDate: now, page: 3, pageSize: 1000 }),
              this.api.getFilteredEvents({ startDate: past90DaysMs, endDate: now, page: 4, pageSize: 1000 }),
              this.api.getFilteredEvents({ startDate: past90DaysMs, endDate: now, page: 5, pageSize: 1000 })
            ]);
            for (const ep of extraPages) {
              const list = ep?.usageEventsDisplay || [];
              if (list.length > 0) {
                events = events.concat(list);
              }
            }
          } catch (e) {
            console.warn('[TokenAggregator] Fetching extra pages failed:', e.message);
          }
        }
      }

      // 3. Aggregate statistics
      const todayStats = {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        costCents: 0,
        requestsCount: 0,
        botRequestsCount: 0
      };

      const monthStats = {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        costCents: 0,
        requestsCount: 0,
        botRequestsCount: 0
      };

      const modelMap = {};
      const dailyMap = {};

      // Seed dailyMap with historical dates from disk cache if present
      if (diskCache && diskCache.dailyMap) {
        for (const [k, v] of Object.entries(diskCache.dailyMap)) {
          dailyMap[k] = { ...v };
        }
      }

      // Collect all dates that appear in the newly fetched events
      const datesInEvents = new Set();
      for (const ev of events) {
        const ts = parseInt(ev.timestamp, 10);
        const evDate = new Date(ts);
        const dateKey = `${evDate.getFullYear()}-${String(evDate.getMonth() + 1).padStart(2, '0')}-${String(evDate.getDate()).padStart(2, '0')}`;
        datesInEvents.add(dateKey);
      }

      // Reset the stats for dates in newly fetched events so they are accurately recalculated
      for (const dk of datesInEvents) {
        dailyMap[dk] = {
          date: dk,
          inputTokens: 0,
          outputTokens: 0,
          cacheTokens: 0,
          totalTokens: 0,
          costCents: 0,
          requestsCount: 0,
          botRequestsCount: 0
        };
      }

      const nowMonth = new Date().getMonth();
      const nowYear = new Date().getFullYear();

      for (const ev of events) {
        const ts = parseInt(ev.timestamp, 10);
        const evDate = new Date(ts);
        const dateKey = `${evDate.getFullYear()}-${String(evDate.getMonth() + 1).padStart(2, '0')}-${String(evDate.getDate()).padStart(2, '0')}`;

        const input = ev.tokenUsage?.inputTokens || 0;
        const output = ev.tokenUsage?.outputTokens || 0;
        const cache = ev.tokenUsage?.cacheReadTokens || 0;
        const costCents = ev.tokenUsage?.totalCents || 0;
        const total = input + output + cache;

        const isBot = !ev.isTokenBasedCall || ev.model === 'grok-bot-automation';

        const rawModel = ev.model || 'default';
        const modelName = this.formatModelName(rawModel);

        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            totalTokens: 0,
            costCents: 0,
            requestsCount: 0,
            botRequestsCount: 0
          };
        }
        dailyMap[dateKey].inputTokens += input;
        dailyMap[dateKey].outputTokens += output;
        dailyMap[dateKey].cacheTokens += cache;
        dailyMap[dateKey].totalTokens += total;
        dailyMap[dateKey].costCents += costCents;
        dailyMap[dateKey].requestsCount += 1;
        if (isBot) {
          dailyMap[dateKey].botRequestsCount = (dailyMap[dateKey].botRequestsCount || 0) + 1;
        }

        // Model breakdown
        if (!modelMap[modelName]) {
          modelMap[modelName] = {
            name: modelName,
            rawName: rawModel,
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            totalTokens: 0,
            costCents: 0,
            requestsCount: 0
          };
        }
        modelMap[modelName].inputTokens += input;
        modelMap[modelName].outputTokens += output;
        modelMap[modelName].cacheTokens += cache;
        modelMap[modelName].totalTokens += total;
        modelMap[modelName].costCents += costCents;
        modelMap[modelName].requestsCount += 1;

        // Today
        if (ts >= todayStartMs) {
          todayStats.inputTokens += input;
          todayStats.outputTokens += output;
          todayStats.cacheTokens += cache;
          todayStats.totalTokens += total;
          todayStats.costCents += costCents;
          todayStats.requestsCount += 1;
          if (isBot) {
            todayStats.botRequestsCount = (todayStats.botRequestsCount || 0) + 1;
          }
        }

        // Current Month
        if (evDate.getMonth() === nowMonth && evDate.getFullYear() === nowYear) {
          monthStats.inputTokens += input;
          monthStats.outputTokens += output;
          monthStats.cacheTokens += cache;
          monthStats.totalTokens += total;
          monthStats.costCents += costCents;
          monthStats.requestsCount += 1;
          if (isBot) {
            monthStats.botRequestsCount = (monthStats.botRequestsCount || 0) + 1;
          }
        }
      }

      // Format models array (sort models with tokens first, then by request count)
      const modelsList = Object.values(modelMap).sort((a, b) => {
        if (b.totalTokens !== a.totalTokens) return b.totalTokens - a.totalTokens;
        return b.requestsCount - a.requestsCount;
      });
      const grandTotalTokens = modelsList.reduce((acc, m) => acc + m.totalTokens, 0);
      for (const m of modelsList) {
        m.percent = grandTotalTokens > 0 ? ((m.totalTokens / grandTotalTokens) * 100).toFixed(1) : '0.0';
      }

      // Recent events formatted
      const recentEvents = events.slice(0, 30).map(ev => {
        const ts = parseInt(ev.timestamp, 10);
        const d = new Date(ts);
        const inTok = ev.tokenUsage?.inputTokens || 0;
        const outTok = ev.tokenUsage?.outputTokens || 0;
        const cacheTok = ev.tokenUsage?.cacheReadTokens || 0;
        const costCents = ev.tokenUsage?.totalCents || 0;
        const isBot = !ev.isTokenBasedCall || ev.model === 'grok-bot-automation';
        return {
          timestamp: ts,
          timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
          model: this.formatModelName(ev.model || 'default'),
          rawModel: ev.model || 'default',
          isTokenBasedCall: !isBot,
          inputTokens: inTok,
          outputTokens: outTok,
          cacheTokens: cacheTok,
          totalTokens: inTok + outTok + cacheTok,
          costStr: isBot ? '套餐沙盒' : `$${(costCents / 100).toFixed(4)}`,
          conversationId: ev.conversationId || ''
        };
      });

      // Assemble quota: usage-summary is what cursor.com Overview uses.
      // get-current-period-usage.displayMessage uses includedSpend/limit and
      // can read "0%" on Free even when included total usage is 34%.
      const summaryPlan = summary?.individualUsage?.plan || {};
      const periodPlan = currentPeriod?.planUsage || {};

      const autoPercentUsed = this.resolvePercent(
        summaryPlan.autoPercentUsed,
        periodPlan.autoPercentUsed
      );
      const apiPercentUsed = this.resolvePercent(
        summaryPlan.apiPercentUsed,
        this.parseDisplayPercent(summary?.namedModelSelectedDisplayMessage),
        periodPlan.apiPercentUsed
      );
      const totalPercentUsed = this.resolvePercent(
        summaryPlan.totalPercentUsed,
        this.parseDisplayPercent(summary?.autoModelSelectedDisplayMessage),
        periodPlan.totalPercentUsed
      );

      const includedSpend = this.firstNumber(periodPlan.includedSpend, summaryPlan.used, summaryPlan.breakdown?.included) ?? 0;
      const bonusSpend = this.firstNumber(periodPlan.bonusSpend, summaryPlan.breakdown?.bonus) ?? 0;
      const totalSpend = this.firstNumber(periodPlan.totalSpend, summaryPlan.breakdown?.total, includedSpend + bonusSpend) ?? 0;
      const planLimit = this.firstNumber(periodPlan.limit, summaryPlan.limit) ?? 0;
      const remainingBonus = periodPlan.remainingBonus ?? summaryPlan.remainingBonus ?? false;

      const membershipType = String(summary?.membershipType || 'free').toLowerCase();
      const { hasCursorModelsPool, hasOtherModelsPool } = this.detectUsagePools(membershipType);
      const onDemandEnabled = summary?.individualUsage?.onDemand?.enabled ?? false;
      const isQueueSlow = totalPercentUsed >= 100 && !onDemandEnabled;

      const cycleStart = summary?.billingCycleStart ? new Date(summary.billingCycleStart) : (currentPeriod?.billingCycleStart ? new Date(parseInt(currentPeriod.billingCycleStart, 10)) : null);
      const cycleEnd = summary?.billingCycleEnd ? new Date(summary.billingCycleEnd) : (currentPeriod?.billingCycleEnd ? new Date(parseInt(currentPeriod.billingCycleEnd, 10)) : null);

      let daysUntilReset = 0;
      let resetDateStr = '9月24日';
      if (cycleEnd) {
        const diffMs = cycleEnd.getTime() - now;
        daysUntilReset = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        resetDateStr = `${cycleEnd.getMonth() + 1}月${cycleEnd.getDate()}日`;
      }

      let sandResetDateStr = '每周自动刷新';
      if (sand?.nextResetTimestampUtc) {
        const sandD = new Date(sand.nextResetTimestampUtc);
        sandResetDateStr = `${sandD.getMonth() + 1}月${sandD.getDate()}日`;
      }

      const hasGrokBotWeekly = this.hasGrokBotWeekly(membershipType, sand);

      const aggregated = {
        timestamp: now,
        profile: {
          name: profile?.name || 'Cursor User',
          email: profile?.email || '',
          avatarUrl: profile?.picture || '',
          membershipType,
          isUnlimited: summary?.isUnlimited || false
        },
        quota: {
          used: includedSpend,
          limit: planLimit,
          remaining: planLimit > 0 ? Math.max(0, planLimit - includedSpend) : 0,
          hasNumericLimit: planLimit > 0,
          percentUsed: totalPercentUsed,
          autoPercentUsed,
          apiPercentUsed,
          totalPercentUsed,
          includedSpend,
          bonusSpend,
          totalSpend,
          remainingBonus,
          isQueueSlow,
          onDemandEnabled,
          hasCursorModelsPool,
          hasOtherModelsPool,
          billingCycleStart: cycleStart ? `${cycleStart.getMonth() + 1}月${cycleStart.getDate()}日` : '',
          billingCycleEnd: cycleEnd ? resetDateStr : '',
          resetDateStr,
          daysUntilReset
        },
        sandUsage: {
          included: hasGrokBotWeekly,
          usagePercent: hasGrokBotWeekly ? this.normalizeSandPercent(sand?.usagePercent) : 0,
          nextResetUtc: sand?.nextResetTimestampUtc || null,
          resetDateStr: sandResetDateStr,
          hasAvailableUsage: sand?.hasAvailableUsage ?? false
        },
        tokens: {
          today: todayStats,
          month: monthStats,
          totalCount: totalEventsCount
        },
        models: modelsList,
        dailyMap,
        recentEvents
      };

      this.cachedData = aggregated;
      this.lastFetchTime = now;
      this.saveDiskCache(aggregated);

      return aggregated;
    } catch (e) {
      console.error('[TokenAggregator] Aggregation error:', e);
      // Fallback to disk cache if available
      const disk = this.loadDiskCache();
      if (disk) {
        return disk;
      }
      throw e;
    }
  }

  hasGrokBotWeekly(membershipType, sand) {
    if (sand && sand.hasNonZeroIncludedLimit === true) return true;
    if (sand && sand.hasNonZeroIncludedLimit === false) return false;
    const m = String(membershipType || 'free').toLowerCase();
    return m !== 'free' && m !== 'hobby';
  }

  normalizeSandPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n <= 1) return Math.round(n * 100);
    return Math.round(n);
  }

  detectUsagePools(membershipType) {
    const m = String(membershipType || 'free').toLowerCase();
    const freeLike = m === 'free' || m === 'hobby';
    const startLike = m === 'start';
    return {
      // Official: Cursor Models pool is included on Pro / Pro+ / Ultra / Start, not Hobby.
      hasCursorModelsPool: !freeLike,
      // Official: Start does not include Other Models; Hobby/Pro do (Hobby is limited).
      hasOtherModelsPool: !startLike
    };
  }

  roundPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  }

  parseDisplayPercent(message) {
    if (!message || typeof message !== 'string') return null;
    const match = message.match(/used\s+(\d+(?:\.\d+)?)\s*%/i);
    return match ? this.roundPercent(match[1]) : null;
  }

  firstNumber(...values) {
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  resolvePercent(...values) {
    for (const value of values) {
      const pct = this.roundPercent(value);
      if (pct !== null) return pct;
    }
    return 0;
  }

  /**
   * Prettify model identifiers
   */
  formatModelName(model) {
    if (!model) return 'Default';
    const m = model.toLowerCase();
    if (m === 'default') return 'Default (Composer/Agent)';
    if (m.includes('grok-bot-automation')) return 'Grok Bot (沙盒/自动化)';
    if (m.includes('claude-3-7-sonnet') || m.includes('claude-3.7-sonnet')) return 'Claude 3.7 Sonnet';
    if (m.includes('claude-3-5-sonnet') || m.includes('claude-3.5-sonnet')) return 'Claude 3.5 Sonnet';
    if (m.includes('claude-3-5-haiku') || m.includes('claude-3.5-haiku')) return 'Claude 3.5 Haiku';
    if (m.includes('claude-3-opus')) return 'Claude 3 Opus';
    if (m.includes('gpt-4o-mini')) return 'GPT-4o Mini';
    if (m.includes('gpt-4o')) return 'GPT-4o';
    if (m.includes('gpt-4')) return 'GPT-4';
    if (m.includes('o1-mini')) return 'o1-mini';
    if (m.includes('o1-preview')) return 'o1-preview';
    if (m.includes('o1')) return 'o1';
    if (m.includes('o3-mini')) return 'o3-mini';
    if (m.includes('cursor-small')) return 'Cursor Small';
    if (m.includes('gemini-2.0') || m.includes('gemini-2')) return 'Gemini 2.0 Flash';
    if (m.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
    if (m.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
    return model;
  }

  /**
   * Prepares standard payload for remote cloud synchronization
   * @param {'full'|'anonymized'|'public'} [mode='full']
   * @returns {object} Payload matching SyncTokenStatsDto
   */
  exportDataForSync(mode = 'full') {
    const data = this.cachedData || this.loadDiskCache() || {};
    const dailyMap = data.dailyMap || {};
    const models = data.models || [];

    // Calculate all-time totals from dailyMap
    let allTimeTokens = 0;
    let totalTurns = 0;
    const allDaily = [];

    for (const [dateKey, dayData] of Object.entries(dailyMap)) {
      const tok = dayData.totalTokens || 0;
      const inTok = dayData.inputTokens || 0;
      const outTok = dayData.outputTokens || 0;
      const cacheTok = dayData.cacheTokens || 0;
      const reqs = dayData.requestsCount || 0;

      allTimeTokens += tok;
      totalTurns += reqs;

      allDaily.push({
        date: dateKey,
        total: tok,
        input: inTok,
        cached: cacheTok,
        output: outTok,
        thinking: 0,
        turns: reqs,
      });
    }

    allDaily.sort((a, b) => a.date.localeCompare(b.date));

    const totalSessions = data.tokens?.totalCount || totalTurns;

    const payload = {
      version: 1,
      updated_at: new Date().toISOString(),
      source: 'cursor', // Fixed platform identifier
      summary: {
        all_time_tokens: allTimeTokens,
        total_turns: totalTurns,
        total_sessions: totalSessions,
      },
      all_daily: allDaily,
    };

    if (mode === 'public') {
      return payload;
    }

    // Projects array mapped from models
    let mIdx = 1;
    const projects = models.map((m) => ({
      name: mode === 'anonymized' ? `Model ${mIdx++}` : m.name,
      total_tokens: m.totalTokens || 0,
      input_tokens: m.inputTokens || 0,
      cached_tokens: m.cacheTokens || 0,
      output_tokens: m.outputTokens || 0,
      thinking_tokens: 0,
      sessions_count: m.requestsCount || 0,
      is_archived: false,
    }));

    payload.projects = projects;
    return payload;
  }
}

module.exports = { TokenAggregator };
