/**
 * Cursor dashboard: POST /api/dashboard/get-user-analytics
 * Undocumented; body matches browser dashboard (teamId/userId 0, ms range as strings).
 */

export const CURSOR_USER_ANALYTICS_API = 'https://cursor.com/api/dashboard/get-user-analytics';
export const CURSOR_DASHBOARD_URL = 'https://cursor.com/dashboard';

export type LineEditsDayPayload = {
    /** Local calendar date YYYY-MM-DD */
    date: string;
    tab: number;
    agent: number;
    all: number;
};

export type LineEditsViewModel = {
    days: LineEditsDayPayload[];
    totals: { all: number; tab: number; agent: number };
    mostActiveMonth: string | null;
    mostActiveDay: string | null;
    mostActiveDayDisplay: string | null;
    longestStreakDays: number;
    currentStreakDays: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}

function isLikelyEpochNumber(value: number): boolean {
    // Seconds, milliseconds, microseconds, or nanoseconds epoch-like magnitudes.
    const abs = Math.abs(value);
    return abs >= 1_000_000_000 && abs <= 99_999_999_999_999_999;
}

function isDateLikeKey(key: string): boolean {
    return /(?:^|_)(?:date|day|time|timestamp|ts|bucket|period)(?:$|_)/i.test(key);
}

function pad2(n: number): string {
    return n < 10 ? `0${n}` : String(n);
}

/** Local calendar YYYY-MM-DD */
export function formatLocalDateKey(d: Date): string {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseDateKeyFromValue(value: unknown): string | null {
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
        const ms = value > 1e12 ? value : value * 1000;
        return formatLocalDateKey(new Date(ms));
    }
    if (typeof value === 'string') {
        const t = value.trim();
        if (!t) {
            return null;
        }
        const isoDay = t.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) {
            return isoDay;
        }
        const n = Number(t);
        if (Number.isFinite(n)) {
            const ms = n > 1e12 ? n : n * 1000;
            return formatLocalDateKey(new Date(ms));
        }
        const d = new Date(t);
        if (!Number.isNaN(d.getTime())) {
            return formatLocalDateKey(d);
        }
    }
    return null;
}

function firstNumber(obj: Record<string, unknown>, keys: string[]): number | null {
    for (const k of keys) {
        const v = obj[k];
        const n = toFiniteNumber(v);
        if (n !== null && n >= 0) {
            return n;
        }
        const nested = asRecord(v);
        if (nested) {
            const inner = firstNumber(nested, keys);
            if (inner !== null) {
                return inner;
            }
        }
    }
    return null;
}

function extractTabAgentAll(obj: Record<string, unknown>): { tab: number; agent: number; all: number } {
    let tab =
        firstNumber(obj, [
            'tabLines',
            'tabLineEdits',
            'linesFromTabs',
            'linesFromTab',
            'tabLinesAccepted',
            'tabsAccepted',
            'tab',
            'tabCount',
            'linesTab',
        ]) ?? 0;

    let agent =
        firstNumber(obj, [
            'agentLines',
            'agentLineEdits',
            'linesFromAgents',
            'linesFromAgent',
            'composerLines',
            'composerLineEdits',
            'composer',
            'agent',
            'agentCount',
            'linesAgent',
            'linesComposer',
        ]) ?? 0;

    const nestedAccepted = asRecord(obj.linesAccepted);
    if (nestedAccepted) {
        if (tab === 0) {
            tab = firstNumber(nestedAccepted, ['tab', 'tabs', 'tabLines', 'accepted']) ?? 0;
        }
        if (agent === 0) {
            agent = firstNumber(nestedAccepted, ['agent', 'composer', 'agents', 'agentLines', 'composerLines']) ?? 0;
        }
    }

    let all =
        firstNumber(obj, [
            'totalLines',
            'totalLineEdits',
            'lineEdits',
            'lines',
            'linesAccepted',
            'total',
            'count',
        ]) ?? 0;

    if (all === 0 && (tab > 0 || agent > 0)) {
        all = tab + agent;
    }
    if (all === 0 && tab === 0 && agent === 0) {
        for (const [key, v] of Object.entries(obj)) {
            if (v === nestedAccepted) {
                continue;
            }
            if (isDateLikeKey(key)) {
                continue;
            }
            const n = toFiniteNumber(v);
            if (n !== null && n > all && !isLikelyEpochNumber(n)) {
                all = n;
            }
        }
    }

    return { tab, agent, all };
}

function extractDateFromObject(obj: Record<string, unknown>): string | null {
    const dateKeys = ['date', 'day', 'key', 'timestamp', 'ts', 'time', 'd', 'bucket', 'period'];
    for (const k of dateKeys) {
        if (k in obj) {
            const key = parseDateKeyFromValue(obj[k]);
            if (key) {
                return key;
            }
        }
    }
    return null;
}

function looksLikeDayRow(x: unknown): boolean {
    const r = asRecord(x);
    if (!r) {
        return false;
    }
    if (!extractDateFromObject(r)) {
        return false;
    }
    const { tab, agent, all } = extractTabAgentAll({ ...r });
    return tab > 0 || agent > 0 || all > 0;
}

function likelyDayRowsArray(arr: unknown[]): boolean {
    if (arr.length < 2) {
        return false;
    }
    let withDate = 0;
    const sample = Math.min(30, arr.length);
    for (let i = 0; i < sample; i++) {
        const r = asRecord(arr[i]);
        if (r && extractDateFromObject(r)) {
            withDate++;
        }
    }
    return withDate >= Math.max(2, Math.floor(sample * 0.35));
}

function findDailyArray(root: unknown, depth = 0): unknown[] | null {
    if (depth > 8) {
        return null;
    }
    if (Array.isArray(root)) {
        if (root.length > 0 && (root.some(looksLikeDayRow) || likelyDayRowsArray(root))) {
            return root;
        }
        for (const el of root) {
            const inner = findDailyArray(el, depth + 1);
            if (inner) {
                return inner;
            }
        }
        return null;
    }
    const rec = asRecord(root);
    if (!rec) {
        return null;
    }
    const preferredKeys = [
        'dailyStats',
        'dailyLineEdits',
        'lineEditDays',
        'heatmap',
        'byDay',
        'days',
        'series',
        'data',
        'result',
        'items',
        'records',
        'stats',
        'values',
        'points',
    ];
    for (const k of preferredKeys) {
        if (k in rec) {
            const inner = findDailyArray(rec[k], depth + 1);
            if (inner) {
                return inner;
            }
        }
    }
    for (const v of Object.values(rec)) {
        const inner = findDailyArray(v, depth + 1);
        if (inner) {
            return inner;
        }
    }
    return null;
}

function mergeDayMap(map: Map<string, LineEditsDayPayload>, date: string, tab: number, agent: number, all: number): void {
    const prev = map.get(date);
    if (!prev) {
        map.set(date, { date, tab, agent, all });
        return;
    }
    prev.tab += tab;
    prev.agent += agent;
    prev.all += all;
}

function parseFromDailyMetrics(root: unknown): LineEditsViewModel | null {
    const rec = asRecord(root);
    const arr = rec?.dailyMetrics;
    if (!Array.isArray(arr) || arr.length === 0) {
        return null;
    }

    const map = new Map<string, LineEditsDayPayload>();
    for (const row of arr) {
        const r = asRecord(row);
        if (!r) {
            continue;
        }

        const date = parseDateKeyFromValue(r.date) ?? extractDateFromObject(r);
        if (!date) {
            continue;
        }

        const acceptedAdded = toFiniteNumber(r.acceptedLinesAdded) ?? 0;
        const acceptedDeleted = toFiniteNumber(r.acceptedLinesDeleted) ?? 0;
        const all = Math.max(0, acceptedAdded + acceptedDeleted);

        // Keep tab/agent optional and bounded; the API does not currently expose exact line split.
        const { tab: maybeTab, agent: maybeAgent } = extractTabAgentAll(r);
        const tab = Math.min(Math.max(0, maybeTab), all);
        const agent = Math.min(Math.max(0, maybeAgent), Math.max(0, all - tab));

        if (all === 0 && tab === 0 && agent === 0) {
            continue;
        }
        mergeDayMap(map, date, tab, agent, all);
    }

    const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (days.length === 0) {
        return null;
    }
    return computeAggregates(days);
}

function computeAggregates(days: LineEditsDayPayload[]): LineEditsViewModel {
    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    let mostActiveDay: string | null = null;
    let maxAll = -1;
    const monthTotals = new Map<string, number>();

    const activeDates = new Set<string>();

    let totalAll = 0;
    let totalTab = 0;
    let totalAgent = 0;

    for (const d of sorted) {
        totalAll += d.all;
        totalTab += d.tab;
        totalAgent += d.agent;
        const all = d.all;
        if (all > maxAll) {
            maxAll = all;
            mostActiveDay = d.date;
        }
        const ym = d.date.slice(0, 7);
        monthTotals.set(ym, (monthTotals.get(ym) ?? 0) + all);
        if (all > 0) {
            activeDates.add(d.date);
        }
    }

    let mostActiveMonth: string | null = null;
    let maxMonth = -1;
    for (const [ym, sum] of monthTotals) {
        if (sum > maxMonth) {
            maxMonth = sum;
            mostActiveMonth = ym;
        }
    }

    let mostActiveDayDisplay: string | null = null;
    if (mostActiveDay && maxAll > 0) {
        const [yy, mm, dd] = mostActiveDay.split('-').map(Number);
        mostActiveDayDisplay = new Date(yy, mm - 1, dd).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    }

    if (mostActiveMonth) {
        const [y, m] = mostActiveMonth.split('-').map(Number);
        const label = new Date(y, m - 1, 1).toLocaleString(undefined, { month: 'long' });
        mostActiveMonth = label;
    }

    const sortedKeys = [...activeDates].sort();
    let longest = 0;
    let run = 0;
    let prevTime: number | null = null;
    for (const key of sortedKeys) {
        const [yy, mm, dd] = key.split('-').map(Number);
        const cur = new Date(yy, mm - 1, dd).getTime();
        if (prevTime !== null && (cur - prevTime) / 86400000 === 1) {
            run++;
        } else {
            run = 1;
        }
        longest = Math.max(longest, run);
        prevTime = cur;
    }

    const today = new Date();
    const todayKey = formatLocalDateKey(today);
    let startOffset = 0;
    if (!activeDates.has(todayKey)) {
        startOffset = 1;
    }
    let currentStreak = 0;
    for (let i = startOffset; i < 4000; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const k = formatLocalDateKey(d);
        if (activeDates.has(k)) {
            currentStreak++;
        } else {
            break;
        }
    }

    return {
        days: sorted,
        totals: { all: totalAll, tab: totalTab, agent: totalAgent },
        mostActiveMonth,
        mostActiveDay: mostActiveDay && maxAll > 0 ? mostActiveDay : null,
        mostActiveDayDisplay,
        longestStreakDays: longest,
        currentStreakDays: currentStreak,
    };
}

export function parseUserAnalyticsLineEdits(json: unknown): LineEditsViewModel | null {
    const dailyMetricsParsed = parseFromDailyMetrics(json);
    if (dailyMetricsParsed) {
        return dailyMetricsParsed;
    }

    const arr = findDailyArray(json);
    if (!arr || arr.length === 0) {
        return null;
    }

    const map = new Map<string, LineEditsDayPayload>();
    for (const row of arr) {
        const r = asRecord(row);
        if (!r) {
            continue;
        }
        const date = extractDateFromObject(r);
        if (!date) {
            continue;
        }
        const { tab, agent, all } = extractTabAgentAll(r);
        if (tab === 0 && agent === 0 && all === 0) {
            continue;
        }
        mergeDayMap(map, date, tab, agent, all);
    }

    const days = [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (days.length === 0) {
        return null;
    }

    return computeAggregates(days);
}

export async function fetchUserAnalyticsLineEdits(sessionToken: string): Promise<LineEditsViewModel | null> {
    const endDate = Date.now();
    const startDate = endDate - 365 * 24 * 60 * 60 * 1000;

    const res = await fetch(CURSOR_USER_ANALYTICS_API, {
        method: 'POST',
        headers: {
            Accept: '*/*',
            'Content-Type': 'application/json',
            Cookie: `WorkosCursorSessionToken=${sessionToken}`,
            Origin: 'https://cursor.com',
            Referer: `${CURSOR_DASHBOARD_URL}/`,
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
            teamId: 0,
            userId: 0,
            startDate: String(startDate),
            endDate: String(endDate),
        }),
    });

    if (!res.ok) {
        return null;
    }

    let json: unknown;
    try {
        json = await res.json();
    } catch {
        return null;
    }

    return parseUserAnalyticsLineEdits(json);
}
