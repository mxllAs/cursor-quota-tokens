const vscode = require('vscode');

class StatusBarManager {
  constructor(context) {
    this.context = context;
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 95);
    this.item.command = 'cursorQuota.openDashboard';
    this.context.subscriptions.push(this.item);
  }

  /**
   * Format numbers into compact human-readable units (K, M, B)
   */
  formatCompactNumber(num) {
    if (!num || num <= 0) return '0';
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return String(num);
  }

  /**
   * Update status bar with latest aggregated data
   */
  update(data) {
    if (!data || !data.quota) {
      this.item.text = '$(dashboard) Cursor: --';
      this.item.tooltip = 'Click to open Cursor Quota Dashboard';
      this.item.show();
      return;
    }

    const config = vscode.workspace.getConfiguration('cursorQuota');
    const format = config.get('statusBarFormat', 'requests_and_tokens');
    const lowThreshold = config.get('lowQuotaThreshold', 15);

    const { used, limit, remaining, percentUsed, daysUntilReset } = data.quota;
    const todayTokens = data.tokens?.today?.totalTokens || 0;
    const todayTokensStr = this.formatCompactNumber(todayTokens);

    let label = '';
    switch (format) {
      case 'requests_only':
        label = `⚡ ${remaining}/${limit}`;
        break;
      case 'percent_only':
        label = `⚡ ${Math.max(0, 100 - percentUsed)}% rem`;
        break;
      case 'tokens_only':
        label = `⚡ ${todayTokensStr} tok`;
        break;
      case 'requests_and_tokens':
      default:
        label = `⚡ ${remaining}/${limit} | ${todayTokensStr} tok`;
        break;
    }

    this.item.text = label;

    // Severity color
    const remainingPercent = limit > 0 ? (remaining / limit) * 100 : 0;
    if (remaining <= 0) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    } else if (remainingPercent <= lowThreshold) {
      this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
      this.item.backgroundColor = undefined;
    }

    // Rich Markdown Tooltip
    const md = new vscode.MarkdownString();
    md.isTrusted = true;
    md.supportHtml = true;

    md.appendMarkdown(`### **Cursor Usage & Quota**\n\n`);
    md.appendMarkdown(`👤 **User**: ${data.profile?.name || 'Cursor User'} (${(data.profile?.membershipType || 'pro').toUpperCase()})\n\n`);
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`⚡ **Fast Requests**: **${used.toLocaleString()}** / **${limit.toLocaleString()}** (${percentUsed}% used)\n\n`);
    md.appendMarkdown(`🟢 **Remaining**: **${remaining.toLocaleString()}** requests\n\n`);
    if (data.quota.billingCycleEnd) {
      md.appendMarkdown(`⏳ **Resets in**: **${daysUntilReset} days** (${data.quota.billingCycleEnd})\n\n`);
    }
    if (data.sandUsage && data.sandUsage.usagePercent > 0) {
      md.appendMarkdown(`🤖 **Weekly Quota**: ${data.sandUsage.usagePercent}% used\n\n`);
    }
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`📊 **Today's Tokens**: **${todayTokens.toLocaleString()}**\n\n`);
    if (data.tokens?.today?.costCents > 0) {
      md.appendMarkdown(`💰 **Today's Cost**: **$${(data.tokens.today.costCents / 100).toFixed(2)}**\n\n`);
    }
    md.appendMarkdown(`---\n\n`);
    md.appendMarkdown(`[👉 Click to Open Dashboard](command:cursorQuota.openDashboard)`);

    this.item.tooltip = md;
    this.item.show();
  }

  showLoading() {
    this.item.text = '$(sync~spin) Cursor Quota...';
    this.item.show();
  }

  showError(msg) {
    this.item.text = '$(warning) Cursor: Auth Error';
    this.item.tooltip = `Error: ${msg}\nClick to retry or set token.`;
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
    this.item.show();
  }
}

module.exports = { StatusBarManager };
