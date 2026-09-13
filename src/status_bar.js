const vscode = require('vscode');

class StatusBarManager {
  constructor(context) {
    this.context = context;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    this.item.command = 'cursorQuota.openDashboard';
    this.context.subscriptions.push(this.item);
  }

  /**
   * Format token counts with intuitive Chinese units (万 / 亿) matching Antigravity
   */
  formatTokensChinese(num) {
    if (num == null || isNaN(num)) return '0';
    num = Number(num);
    if (num === 0) return '0';
    if (num >= 100000000) {
      const yi = num / 100000000;
      return parseFloat(yi.toFixed(yi >= 100 ? 1 : 2)) + '亿';
    }
    if (num >= 10000) {
      const wan = num / 10000;
      return parseFloat(wan.toFixed(wan >= 100 ? 1 : 2)) + '万';
    }
    return num.toLocaleString();
  }

  /**
   * Update status bar with latest aggregated data
   */
  update(data) {
    if (!data || !data.quota) {
      this.item.text = '$(dashboard) Cursor: --';
      this.item.tooltip = '点击打开 Cursor 额度大盘';
      this.item.show();
      return;
    }

    const config = vscode.workspace.getConfiguration('cursorQuota');
    const format = config.get('statusBarFormat', 'requests_and_tokens');
    const lowThreshold = config.get('lowQuotaThreshold', 15);

    const { used, limit, remaining, percentUsed, daysUntilReset, hasNumericLimit, isQueueSlow } = data.quota;
    const todayTokens = data.tokens?.today?.totalTokens || 0;
    const todayTokensStr = this.formatTokensChinese(todayTokens);
    const usedPct = Number.isFinite(Number(percentUsed)) ? Math.round(Number(percentUsed)) : 0;
    const remainingPct = Math.max(0, 100 - usedPct);
    const exhausted = !!(isQueueSlow || (hasNumericLimit && remaining <= 0 && usedPct >= 100));

    let label = '';
    switch (format) {
      case 'requests_only':
        label = exhausted
          ? `🐢 慢速队列`
          : (hasNumericLimit ? `⚡ ${remaining}/${limit}` : `⚡ ${usedPct}% used`);
        break;
      case 'percent_only':
        label = exhausted ? `🐢 慢速` : `⚡ 余 ${remainingPct}%`;
        break;
      case 'tokens_only':
        label = `⚡ ${todayTokensStr} tok`;
        break;
      case 'requests_and_tokens':
      default:
        label = exhausted
          ? `🐢 慢速队列 | ${todayTokensStr} tok`
          : (hasNumericLimit
            ? `⚡ ${remaining}/${limit} | ${todayTokensStr} tok`
            : `⚡ ${usedPct}% used | ${todayTokensStr} tok`);
        break;
    }

    this.item.text = label;

    // Severity color (gentle warning instead of alarming crash-red)
    if (exhausted || remainingPct <= lowThreshold) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    // Rich Markdown Tooltip in Chinese
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const membership = (data.profile?.membershipType || 'free').toUpperCase();
    md.appendMarkdown(`### **⚡ Cursor 额度与 Token 统计**\n\n`);
    md.appendMarkdown(`👤 **账户**: ${data.profile?.name || 'Cursor 用户'} (${membership} 会员)\n\n`);
    md.appendMarkdown(`---\n\n`);

    if (exhausted) {
      md.appendMarkdown(`🐢 **当前模式**: **慢速队列模式** (套餐内额度已用尽)\n\n`);
    } else {
      md.appendMarkdown(`🚀 **当前模式**: **高速模式** (套餐内用量已用 ${usedPct}%)\n\n`);
    }

    md.appendMarkdown(`🔹 **套餐内用量 (Overview)**: **${usedPct}% used**\n\n`);
    if (data.quota.hasCursorModelsPool) {
      md.appendMarkdown(`🔹 **Cursor Models**: **${data.quota.autoPercentUsed ?? 0}% used**\n\n`);
    } else {
      md.appendMarkdown(`🔹 **Cursor Models**: 当前套餐不包含此配额池\n\n`);
    }
    if (data.quota.hasOtherModelsPool !== false) {
      md.appendMarkdown(`🔹 **Other Models**: **${data.quota.apiPercentUsed ?? 0}% used**\n\n`);
    }
    if (hasNumericLimit) {
      md.appendMarkdown(`⚡ **套餐额度**: **${used.toLocaleString()}** / **${limit.toLocaleString()}**\n\n`);
    }
    if (data.quota.billingCycleEnd) {
      md.appendMarkdown(`⏳ **重置倒计时**: **${daysUntilReset} 天后重置** (${data.quota.billingCycleEnd})\n\n`);
    }
    if (data.sandUsage && data.sandUsage.included) {
      md.appendMarkdown(`🤖 **Grok Bot 周额度**: 已用 ${data.sandUsage.usagePercent}% (每周重置，非编辑器 Grok 模型)\n\n`);
    }
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`📊 **今日实际消耗 Token**: **${todayTokens.toLocaleString()}**\n\n`);
    if (data.tokens?.today?.costCents > 0) {
      md.appendMarkdown(`💰 **今日估算价值**: **$${(data.tokens.today.costCents / 100).toFixed(2)}**\n\n`);
    }
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[👉 点击打开 Cursor 用量大盘](command:cursorQuota.openDashboard)`);

    this.item.tooltip = md;
    this.item.show();
  }

  showLoading() {
    this.item.text = '$(sync~spin) Cursor 额度查询中...';
    this.item.show();
  }

  showError(msg) {
    this.item.text = '$(warning) Cursor: 认证失败';
    this.item.tooltip = `错误信息: ${msg}\n点击重试或手动设置 Token。`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.show();
  }
}

module.exports = { StatusBarManager };
