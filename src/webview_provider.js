const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

class WebviewProvider {
  constructor(context, aggregator, statusBar) {
    this.context = context;
    this.aggregator = aggregator;
    this.statusBar = statusBar;
    this.view = null;
    this.panel = null;
  }

  /**
   * Called by VS Code when sidebar webview is created
   */
  resolveWebviewView(webviewView, _context, _token) {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'views'))
      ]
    };

    webviewView.webview.html = this.getHtmlContent(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message, webviewView.webview);
    });

    // Auto-update on visibility change
    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) {
        this.updateWebview(webviewView.webview, false);
      }
    });
  }

  /**
   * Open full dashboard in a separate editor tab
   */
  async openTabPanel() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      this.updateWebview(this.panel.webview, false);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'cursorQuotaDashboardTab',
      'Cursor Quota & Usage Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'views'))
        ]
      }
    );

    this.panel.webview.html = this.getHtmlContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (message) => {
      await this.handleMessage(message, this.panel.webview);
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    await this.updateWebview(this.panel.webview, false);
  }

  /**
   * Handle incoming messages from frontend
   */
  async handleMessage(message, targetWebview) {
    switch (message.command) {
      case 'ready':
        await this.updateWebview(targetWebview, false);
        break;
      case 'refresh':
        await this.refreshAll(true, targetWebview);
        break;
    }
  }

  /**
   * Refresh both status bar and all active webviews
   */
  async refreshAll(force = false, targetWebview = null) {
    if (this.statusBar) {
      this.statusBar.showLoading();
    }
    if (targetWebview) {
      try { targetWebview.postMessage({ type: 'loading' }); } catch (e) {}
    }
    this.postToAll({ type: 'loading' });

    try {
      const data = await this.aggregator.getDashboardData(force);
      if (this.statusBar) {
        this.statusBar.update(data);
      }
      if (targetWebview) {
        try { targetWebview.postMessage({ type: 'update', data }); } catch (e) {}
      }
      this.postToAll({ type: 'update', data });
      return data;
    } catch (e) {
      console.error('[WebviewProvider] Refresh error:', e);
      if (targetWebview) {
        try { targetWebview.postMessage({ type: 'error', error: e.message }); } catch (err) {}
      }
      this.postToAll({ type: 'error', error: e.message });
      if (this.statusBar) {
        this.statusBar.showError(e.message);
      }
      vscode.window.showErrorMessage(`Cursor Quota refresh failed: ${e.message}`);
    }
  }

  /**
   * Update a specific webview
   */
  async updateWebview(targetWebview, force = false) {
    try {
      const data = await this.aggregator.getDashboardData(force);
      targetWebview.postMessage({ type: 'update', data });
      if (this.statusBar) {
        this.statusBar.update(data);
      }
    } catch (e) {
      console.error('[WebviewProvider] UpdateWebview error:', e);
      try { targetWebview.postMessage({ type: 'error', error: e.message }); } catch (err) {}
    }
  }

  /**
   * Send message to all active webviews
   */
  postToAll(msg) {
    if (this.view) {
      try {
        this.view.webview.postMessage(msg);
      } catch (e) {}
    }
    if (this.panel) {
      try {
        this.panel.webview.postMessage(msg);
      } catch (e) {}
    }
  }

  /**
   * Load panel.html and inject resource URIs
   */
  getHtmlContent(webview) {
    const htmlPath = path.join(this.context.extensionPath, 'src', 'views', 'panel.html');
    const cssUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'views', 'panel.css')));
    const jsUri = webview.asWebviewUri(vscode.Uri.file(path.join(this.context.extensionPath, 'src', 'views', 'panel.js')));

    let html = fs.readFileSync(htmlPath, 'utf-8');
    html = html.replace('{{cssUri}}', cssUri.toString());
    html = html.replace('<link rel="stylesheet" href="./panel.css">', `<link rel="stylesheet" href="${cssUri}">`);

    html = html.replace('{{jsUri}}', jsUri.toString());
    html = html.replace('<script src="./panel.js"></script>', `<script src="${jsUri}"></script>`);

    return html;
  }
}

module.exports = { WebviewProvider };
