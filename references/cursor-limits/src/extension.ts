import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { openCursorStatsPanel, type StatsPanelData } from './statsPanel';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { fetchUserAnalyticsLineEdits } from './userAnalytics';

// Cursor dashboard APIs (must match cookie format the site expects; see cursor.com network tab)
const CURSOR_USAGE_SUMMARY_API = 'https://cursor.com/api/usage-summary';
const CURSOR_USAGE_API = 'https://cursor.com/api/usage';
const CURSOR_PLAN_INFO_API = 'https://cursor.com/api/dashboard/get-plan-info';
const CURSOR_SPENDING_DASHBOARD_URL = 'https://cursor.com/dashboard/spending';

let statusBarItem: vscode.StatusBarItem;
let pollTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    // 1. Create the UI Element
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);

    const openDashboardCommandId = 'cursorStatusline.openDashboard';
    context.subscriptions.push(
        vscode.commands.registerCommand(openDashboardCommandId, () => {
            openCursorStatsPanel(context, fetchUsageDisplayState);
        }),
    );
    statusBarItem.command = openDashboardCommandId;

    context.subscriptions.push(statusBarItem);

    // 2. Start Polling Loop
    startPolling();
}

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    updateUsageStats();
    // Poll every 5 minutes
    pollTimer = setInterval(updateUsageStats, 5 * 60 * 1000);
}

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

function getCursorStateDbPath(): string {
    if (process.platform === 'darwin') {
        return path.join(os.homedir(), 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    }
    if (process.platform === 'win32') {
        return path.join(process.env.APPDATA || '', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
    }
    return path.join(os.homedir(), '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb');
}

function parseStoredAccessToken(raw: string): string | null {
    let s = raw.trim();
    if (s.startsWith('"')) {
        try {
            s = JSON.parse(s) as string;
        } catch {
            s = s.replace(/^"|"$/g, '');
        }
    }
    return s || null;
}

/**
 * Reads the auth token from Cursor's local SQLite DB using sql.js (WASM).
 * We no longer shell out to the `sqlite3` CLI: it ships with macOS but is not on PATH on typical Windows installs.
 */
async function getCursorAuthToken(): Promise<string | null> {
    const dbPath = getCursorStateDbPath();
    if (!dbPath || !fs.existsSync(dbPath)) {
        return null;
    }

    try {
        if (!sqlJsPromise) {
            sqlJsPromise = initSqlJs();
        }
        const SQL = await sqlJsPromise;
        const fileBuffer = fs.readFileSync(dbPath);
        const db = new SQL.Database(new Uint8Array(fileBuffer));
        try {
            const stmt = db.prepare(
                "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken' LIMIT 1",
            );
            let raw: string | null = null;
            if (stmt.step()) {
                const row = stmt.getAsObject() as { value?: unknown };
                const v = row.value;
                if (typeof v === 'string') {
                    raw = v;
                } else if (v instanceof Uint8Array) {
                    raw = new TextDecoder().decode(v);
                } else if (v != null) {
                    raw = String(v);
                }
            }
            stmt.free();
            return raw ? parseStoredAccessToken(raw) : null;
        } finally {
            db.close();
        }
    } catch (e) {
        console.error('Failed to extract Cursor token from SQLite:', e);
        return null;
    }
}

/** Decode JWT payload (unsigned) to read `sub` for WorkOS session cookie. */
function decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split('.');
        if (parts.length < 2) {
            return null;
        }
        let b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        while (b64.length % 4) {
            b64 += '=';
        }
        const json = Buffer.from(b64, 'base64').toString('utf8');
        return JSON.parse(json) as Record<string, unknown>;
    } catch {
        return null;
    }
}

/**
 * Cookie value must be `userId%3A%3A<accessToken>` (same as the browser dashboard).
 * See open-source extensions that track Cursor usage for reference.
 */
function buildWorkosSessionCookie(accessToken: string): { sessionToken: string; userId: string } | null {
    const payload = decodeJwtPayload(accessToken);
    const sub = payload?.sub;
    if (typeof sub !== 'string' || !sub.length) {
        return null;
    }
    const pipe = sub.indexOf('|');
    const userId = pipe >= 0 ? sub.slice(pipe + 1) : sub;
    if (!userId) {
        return null;
    }
    const sessionToken = `${userId}%3A%3A${accessToken}`;
    return { sessionToken, userId };
}

/**
 * Generates a visual progress bar string. e.g. [██████░░░░]
 */
function generateProgressBar(used: number, total: number, length: number = 10): string {
    const ratio = Math.min(Math.max(used / (total || 1), 0), 1);
    const filledLength = used > 0 ? Math.max(1, Math.round(length * ratio)) : 0;
    const emptyLength = length - filledLength;
    return `[${'█'.repeat(filledLength)}${'░'.repeat(emptyLength)}]`;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return null;
}

function formatPercent(value: number | null): string {
    return value === null ? 'N/A' : `${Math.round(value)}%`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function firstString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim().length > 0) {
            return value.trim();
        }
    }
    return null;
}

function formatDate(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }

    let date: Date | null = null;

    if (typeof value === 'number' && Number.isFinite(value)) {
        // Handle both seconds and milliseconds epoch values.
        const epochMs = value > 1_000_000_000_000 ? value : value * 1000;
        date = new Date(epochMs);
    } else if (typeof value === 'string' && value.trim().length > 0) {
        const numeric = Number(value);
        if (Number.isFinite(numeric)) {
            const epochMs = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
            date = new Date(epochMs);
        } else {
            date = new Date(value);
        }
    }

    if (!date || Number.isNaN(date.getTime())) {
        return null;
    }

    return new Intl.DateTimeFormat(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
    }).format(date);
}

function buildStatusTooltipFromData(data: Extract<StatsPanelData, { status: 'ok' }>): vscode.MarkdownString {
    const tooltip = new vscode.MarkdownString();
    tooltip.isTrusted = true;
    tooltip.appendMarkdown(`### Cursor Usage Dashboard\n\n`);
    tooltip.appendMarkdown(`--- \n\n`);
    tooltip.appendMarkdown(`**Current Plan:** ${data.planName ?? 'N/A'} \n\n`);
    tooltip.appendMarkdown(`**Plan Expiry:** ${data.planExpiry ?? 'N/A'} \n\n`);
    tooltip.appendMarkdown(`--- \n\n`);

    if (data.variant === 'summary') {
        tooltip.appendMarkdown(`**Included in Pro (Total):** ${formatPercent(data.totalPercent)} \n\n`);
        tooltip.appendMarkdown(`**Auto + Composer:** ${formatPercent(data.autoPercent)} \n\n`);
        tooltip.appendMarkdown(`**API:** ${formatPercent(data.apiPercent)} \n\n`);
        if (data.includedUsed !== null && data.includedLimit !== null) {
            tooltip.appendMarkdown(`**Included Usage Units:** ${data.includedUsed} / ${data.includedLimit} \n\n`);
        }
    } else {
        tooltip.appendMarkdown(`**Premium Requests:** ${data.premiumUsed} / ${data.premiumLimit ?? 'N/A'} \n\n`);
        tooltip.appendMarkdown(`**Auto/Composer:** ${data.autoUsed} / ${data.autoLimit ?? 'N/A'} \n\n`);
    }

    tooltip.appendMarkdown(`--- \n\n`);
    tooltip.appendMarkdown(`*Click to open usage details*`);
    return tooltip;
}

function applyStatusBarFromData(data: StatsPanelData): void {
    if (data.status === 'no-auth') {
        statusBarItem.text = `$(warning) Cursor: Auth Missing`;
        statusBarItem.tooltip =
            data.detail ?? 'Could not automatically read Cursor Auth DB. Please log into Cursor.';
        statusBarItem.color = undefined;
        statusBarItem.show();
        return;
    }
    if (data.status === 'error') {
        statusBarItem.text = `$(error) Cursor Ping Failed`;
        statusBarItem.tooltip = data.message;
        statusBarItem.color = undefined;
        statusBarItem.show();
        return;
    }

    const ratio = data.progressRatio;
    if (ratio >= 0.95) {
        statusBarItem.color = new vscode.ThemeColor('statusBarItem.errorForeground');
    } else if (ratio >= 0.8) {
        statusBarItem.color = new vscode.ThemeColor('statusBarItem.warningForeground');
    } else {
        statusBarItem.color = new vscode.ThemeColor('statusBarItem.foreground');
    }

    if (data.variant === 'summary') {
        const primaryPercent = data.totalPercent ?? data.autoPercent ?? data.apiPercent ?? 0;
        const progressBar = generateProgressBar(primaryPercent, 100, 8);
        statusBarItem.text = `$(zap) ${progressBar} ${formatPercent(data.totalPercent)}`;
    } else {
        const progressBar = generateProgressBar(data.premiumUsed, data.premiumLimit ?? 1, 8);
        statusBarItem.text =
            data.premiumLimit && data.premiumLimit > 0
                ? `$(zap) ${progressBar} ${data.premiumUsed}/${data.premiumLimit}`
                : `$(zap) ${progressBar} ${data.premiumUsed}/N/A`;
    }

    statusBarItem.tooltip = buildStatusTooltipFromData(data);
    statusBarItem.show();
}

async function fetchUsageDisplayState(): Promise<StatsPanelData> {
    const accessToken = await getCursorAuthToken();

    if (!accessToken) {
        return { status: 'no-auth' };
    }

    const session = buildWorkosSessionCookie(accessToken);
    if (!session) {
        return {
            status: 'no-auth',
            detail:
                'Found access token but could not parse it for the dashboard session. Try signing out of Cursor and signing in again.',
        };
    }

    try {
        const baseHeaders = {
            Accept: 'application/json',
            Cookie: `WorkosCursorSessionToken=${session.sessionToken}`,
            Origin: 'https://cursor.com',
            Referer: CURSOR_SPENDING_DASHBOARD_URL,
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        };

        let subscriptionDetails: { planName: string | null; planExpiry: string | null } = {
            planName: null,
            planExpiry: null,
        };

        const [planInfoResponse, summaryResponse, lineEdits] = await Promise.all([
            fetch(CURSOR_PLAN_INFO_API, {
                method: 'POST',
                headers: {
                    ...baseHeaders,
                    Accept: '*/*',
                    'Content-Type': 'application/json',
                },
                body: '{}',
            }),
            fetch(CURSOR_USAGE_SUMMARY_API, {
                headers: {
                    ...baseHeaders,
                },
            }),
            fetchUserAnalyticsLineEdits(session.sessionToken),
        ]);

        if (planInfoResponse.ok) {
            const planInfoData = (await planInfoResponse.json()) as Record<string, unknown>;
            const planInfo = asRecord(planInfoData.planInfo);
            if (planInfo) {
                subscriptionDetails.planName = firstString(
                    planInfo.planName,
                    planInfo.name,
                    planInfo.tier,
                );
                subscriptionDetails.planExpiry = formatDate(
                    planInfo.billingCycleEnd ??
                        planInfo.expiresAt ??
                        planInfo.expirationDate ??
                        planInfo.currentPeriodEnd ??
                        planInfo.renewsAt,
                );
            }
        }

        if (summaryResponse.ok) {
            const summaryData = (await summaryResponse.json()) as Record<string, unknown>;
            const summarySubscriptionDetails = extractSubscriptionDetails(summaryData);
            subscriptionDetails = {
                planName: subscriptionDetails.planName ?? summarySubscriptionDetails.planName,
                planExpiry: subscriptionDetails.planExpiry ?? summarySubscriptionDetails.planExpiry,
            };
            const individualUsage = asRecord(summaryData.individualUsage);
            const plan = asRecord(individualUsage?.plan);

            const totalPercent = toFiniteNumber(plan?.totalPercentUsed);
            const autoPercent = toFiniteNumber(plan?.autoPercentUsed);
            const apiPercent = toFiniteNumber(plan?.apiPercentUsed);
            const includedUsed = toFiniteNumber(plan?.used);
            const includedLimit = toFiniteNumber(plan?.limit);

            const hasSummaryData = totalPercent !== null || autoPercent !== null || apiPercent !== null;

            if (hasSummaryData) {
                const primaryPercent = totalPercent ?? autoPercent ?? apiPercent ?? 0;
                const usageRatio = Math.min(Math.max(primaryPercent / 100, 0), 1);

                return {
                    status: 'ok' as const,
                    variant: 'summary' as const,
                    planName: subscriptionDetails.planName,
                    planExpiry: subscriptionDetails.planExpiry,
                    totalPercent,
                    autoPercent,
                    apiPercent,
                    includedUsed,
                    includedLimit,
                    progressRatio: usageRatio,
                    lineEdits: lineEdits ?? null,
                };
            }
        }

        const usageUrl = new URL(CURSOR_USAGE_API);
        usageUrl.searchParams.set('user', session.userId);

        const response = await fetch(usageUrl.toString(), {
            headers: {
                ...baseHeaders,
            },
        });

        if (!response.ok) {
            const errStr = await response.text();
            throw new Error(`API Error: ${response.status} - ${errStr.substring(0, 100)}`);
        }
        const data: Record<string, any> = await response.json();

        const g4 = data['gpt-4'] ?? data?.usage?.gpt_4;
        const premiumUsed = toFiniteNumber(g4?.numRequests ?? g4?.num_requests) ?? 0;
        const premiumLimit = toFiniteNumber(g4?.maxRequestUsage ?? g4?.max_requests);

        const g32 = data['gpt-4-32k'] ?? data?.usage?.composer;
        const autoUsed = toFiniteNumber(g32?.numRequests ?? g32?.num_requests) ?? 0;
        const autoLimit = toFiniteNumber(g32?.maxRequestUsage ?? g32?.max_requests);

        const usageRatio = premiumLimit && premiumLimit > 0 ? premiumUsed / premiumLimit : 0;

        return {
            status: 'ok' as const,
            variant: 'legacy' as const,
            planName: subscriptionDetails.planName,
            planExpiry: subscriptionDetails.planExpiry,
            premiumUsed,
            premiumLimit,
            autoUsed,
            autoLimit,
            progressRatio: usageRatio,
            lineEdits: lineEdits ?? null,
        };
    } catch (error: any) {
        return { status: 'error', message: `Failed to fetch usage: ${error.message}` };
    }
}

function extractSubscriptionDetails(summaryData: Record<string, unknown>): { planName: string | null; planExpiry: string | null } {
    const individualUsage = asRecord(summaryData.individualUsage);
    const plan = asRecord(individualUsage?.plan);
    const subscription = asRecord(individualUsage?.subscription);

    const planName = firstString(
        plan?.displayName,
        plan?.name,
        plan?.planName,
        plan?.tier,
        plan?.type,
        subscription?.name,
        subscription?.planName,
        individualUsage?.planName,
        summaryData.planName,
    );

    const planExpiry = formatDate(
        plan?.expiresAt ??
        plan?.expiry ??
        plan?.expiration ??
        plan?.expirationDate ??
        plan?.currentPeriodEnd ??
        plan?.renewsAt ??
        plan?.renewalDate ??
        plan?.nextBillingDate ??
        subscription?.expiresAt ??
        subscription?.expirationDate ??
        subscription?.currentPeriodEnd ??
        subscription?.renewsAt ??
        individualUsage?.expiresAt ??
        individualUsage?.expirationDate ??
        summaryData.expiresAt ??
        summaryData.expirationDate
    );

    return { planName, planExpiry };
}

async function updateUsageStats() {
    statusBarItem.text = `$(sync~spin) Fetching Limits...`;
    statusBarItem.tooltip = 'Fetching Cursor usage…';
    statusBarItem.show();

    const data = await fetchUsageDisplayState();
    applyStatusBarFromData(data);
}

export function deactivate() {
    if (pollTimer) clearInterval(pollTimer);
}
