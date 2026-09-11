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

    const { used, limit, remaining, percentUsed, daysUntilReset } = data.quota;
    const todayTokens = data.tokens?.today?.totalTokens || 0;
    const todayTokensStr = this.formatTokensChinese(todayTokens);

    let label = '';
    switch (format) {
      case 'requests_only':
        label = remaining <= 0 ? `🐢 慢速队列` : `⚡ ${remaining}/${limit}`;
        break;
      case 'percent_only':
        label = remaining <= 0 ? `🐢 慢速` : `⚡ 余 ${Math.max(0, 100 - percentUsed)}%`;
        break;
      case 'tokens_only':
        label = `⚡ ${todayTokensStr} tok`;
        break;
      case 'requests_and_tokens':
      default:
        label = remaining <= 0 
          ? `🐢 慢速队列 | ${todayTokensStr} tok`
          : `⚡ ${remaining}/${limit} | ${todayTokensStr} tok`;
        break;
    }

    this.item.text = label;

    // Severity color (gentle warning instead of alarming crash-red)
    const remainingPercent = limit > 0 ? (remaining / limit) * 100 : 0;
    if (remaining <= 0) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (remainingPercent <= lowThreshold) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    // Rich Markdown Tooltip in Chinese
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    const membership = (data.profile?.membershipType || 'pro').toUpperCase();
    md.appendMarkdown(`### **⚡ Cursor 额度与 Token 统计**\n\n`);
    md.appendMarkdown(`👤 **账户**: ${data.profile?.name || 'Cursor 用户'} (${membership} 会员)\n\n`);
    md.appendMarkdown(`---\n\n`);

    if (remaining <= 0) {
      md.appendMarkdown(`🐢 **当前模式**: **慢速队列模式** (高速配额已耗尽，请求免费排队)\n\n`);
    } else {
      md.appendMarkdown(`🚀 **当前模式**: **高速模式** (剩余 ${remaining.toLocaleString()} 次快速请求)\n\n`);
    }

    md.appendMarkdown(`🔹 **Cursor Models (含 Grok & Composer)**: **${data.quota.autoPercentUsed || 100}% used**\n\n`);
    md.appendMarkdown(`🔹 **Other Models (Claude 3.5 / GPT-4o 等)**: **${data.quota.apiPercentUsed || 100}% used**\n\n`);
    md.appendMarkdown(`⚡ **快速请求总配额**: **${used.toLocaleString()}** / **${limit.toLocaleString()}** (已用 ${percentUsed}%)\n\n`);
    if (data.quota.billingCycleEnd) {
      md.appendMarkdown(`⏳ **重置倒计时**: **${daysUntilReset} 天后重置** (${data.quota.billingCycleEnd})\n\n`);
    }
    if (data.sandUsage && data.sandUsage.usagePercent > 0) {
      md.appendMarkdown(`🤖 **每周配额 (Grok/思维)**: 已用 ${data.sandUsage.usagePercent}% (周重置)\n\n`);
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
