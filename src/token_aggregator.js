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
      // 1. Fetch summary, profile, sand usage in parallel
      const [summaryRes, profileRes, sandRes] = await Promise.allSettled([
        this.api.getUsageSummary(),
        this.api.getUserProfile(),
        this.api.getSandUsage()
      ]);

      const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
      const profile = profileRes.status === 'fulfilled' ? profileRes.value : null;
      const sand = sandRes.status === 'fulfilled' ? sandRes.value : null;

      // 2. Fetch recent usage events for today & recent history
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStartMs = today.getTime();

      // Query past 90 days for the heatmap
      const past90Days = new Date();
      past90Days.setDate(past90Days.getDate() - 90);
      past90Days.setHours(0, 0, 0, 0);
      const past90DaysMs = past90Days.getTime();

      // Fetch page 1 (up to 100 recent events)
      const eventsRes = await this.api.getFilteredEvents({
        startDate: past90DaysMs,
        endDate: now,
        page: 1,
        pageSize: 100
      });

      const totalEventsCount = eventsRes?.totalUsageEventsCount || 0;
      const events = eventsRes?.usageEventsDisplay || [];

      // 3. Aggregate statistics
      const todayStats = {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        costCents: 0,
        requestsCount: 0
      };

      const monthStats = {
        inputTokens: 0,
        outputTokens: 0,
        cacheTokens: 0,
        totalTokens: 0,
        costCents: 0,
        requestsCount: 0
      };

      const modelMap = {};
      const dailyMap = {};

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

        const rawModel = ev.model || 'default';
        const modelName = this.formatModelName(rawModel);

        // Daily Heatmap map
        if (!dailyMap[dateKey]) {
          dailyMap[dateKey] = {
            date: dateKey,
            inputTokens: 0,
            outputTokens: 0,
            cacheTokens: 0,
            totalTokens: 0,
            costCents: 0,
            requestsCount: 0
          };
        }
        dailyMap[dateKey].inputTokens += input;
        dailyMap[dateKey].outputTokens += output;
        dailyMap[dateKey].cacheTokens += cache;
        dailyMap[dateKey].totalTokens += total;
        dailyMap[dateKey].costCents += costCents;
        dailyMap[dateKey].requestsCount += 1;

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
        }

        // Current Month
        if (evDate.getMonth() === nowMonth && evDate.getFullYear() === nowYear) {
          monthStats.inputTokens += input;
          monthStats.outputTokens += output;
          monthStats.cacheTokens += cache;
          monthStats.totalTokens += total;
          monthStats.costCents += costCents;
          monthStats.requestsCount += 1;
        }
      }

      // Format models array
      const modelsList = Object.values(modelMap).sort((a, b) => b.totalTokens - a.totalTokens);
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
        return {
          timestamp: ts,
          timeStr: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          dateStr: `${d.getMonth() + 1}/${d.getDate()}`,
          model: this.formatModelName(ev.model || 'default'),
          inputTokens: inTok,
          outputTokens: outTok,
          cacheTokens: cacheTok,
          totalTokens: inTok + outTok + cacheTok,
          costStr: `$${(costCents / 100).toFixed(4)}`,
          conversationId: ev.conversationId || ''
        };
      });

      // Assemble final data structure
      const planUsage = summary?.individualUsage?.plan || {};
      const planUsed = planUsage.used || 0;
      const planLimit = planUsage.limit || (summary?.membershipType === 'pro' ? 2000 : 500);
      const planRemaining = planUsage.remaining !== undefined ? planUsage.remaining : Math.max(0, planLimit - planUsed);
      const planPercent = planLimit > 0 ? Math.min(100, Math.round((planUsed / planLimit) * 100)) : 0;

      const cycleStart = summary?.billingCycleStart ? new Date(summary.billingCycleStart) : null;
      const cycleEnd = summary?.billingCycleEnd ? new Date(summary.billingCycleEnd) : null;

      let daysUntilReset = 0;
      if (cycleEnd) {
        const diffMs = cycleEnd.getTime() - now;
        daysUntilReset = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
      }

      const aggregated = {
        timestamp: now,
        profile: {
          name: profile?.name || 'Cursor User',
          email: profile?.email || '',
          avatarUrl: profile?.picture || '',
          membershipType: summary?.membershipType || 'pro',
          isUnlimited: summary?.isUnlimited || false
        },
        quota: {
          used: planUsed,
          limit: planLimit,
          remaining: planRemaining,
          percentUsed: planPercent,
          autoPercentUsed: planUsage.autoPercentUsed ?? planPercent,
          apiPercentUsed: planUsage.apiPercentUsed ?? planPercent,
          cursorModelsMsg: summary?.autoModelSelectedDisplayMessage || '',
          otherModelsMsg: summary?.namedModelSelectedDisplayMessage || '',
          isQueueSlow: planRemaining <= 0,
          onDemandEnabled: summary?.individualUsage?.onDemand?.enabled ?? false,
          bonus: planUsage.breakdown?.bonus || 0,
          totalAvailable: planUsage.breakdown?.total || planLimit,
          billingCycleStart: cycleStart ? cycleStart.toLocaleDateString() : '',
          billingCycleEnd: cycleEnd ? cycleEnd.toLocaleDateString() : '',
          daysUntilReset
        },
        sandUsage: {
          usagePercent: sand ? Math.round((sand.usagePercent || 0) * 100) : 0,
          nextResetUtc: sand?.nextResetTimestampUtc || null,
          hasAvailableUsage: sand?.hasAvailableUsage ?? true
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

  /**
   * Prettify model identifiers
   */
  formatModelName(model) {
    if (!model) return 'Default';
    const m = model.toLowerCase();
    if (m === 'default') return 'Default (Composer/Agent)';
    if (m.includes('claude-3-5-sonnet') || m.includes('claude-3.5-sonnet')) return 'Claude 3.5 Sonnet';
    if (m.includes('claude-3-7-sonnet') || m.includes('claude-3.7-sonnet')) return 'Claude 3.7 Sonnet';
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
}

module.exports = { TokenAggregator };
