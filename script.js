/**
 * RepoRater - Software Repository Analyzer
 * IT110 Midterm Project - Main Application Script (script.js)
 *
 * Interacts with the public GitHub REST API using async/await to evaluate
 * open-source repository maintenance health, issue density, and recent activity.
 * Includes sessionStorage caching, AbortController timeouts, rate-limit telemetry,
 * URL deep-linking, keyboard shortcuts, and clipboard report export.
 */

const GITHUB_API_BASE = 'https://api.github.com/repos';
const STORAGE_KEY = 'reporater_recent_scans';
const CACHE_PREFIX = 'reporater_cache_v1_';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache lifetime
const FETCH_TIMEOUT_MS = 8000;      // 8 seconds network timeout
const MAX_HISTORY_ITEMS = 5;

// Holds the latest analyzed report for one-click clipboard export
let currentReportSummary = null;

// DOM Element References
const elements = {
    form: document.getElementById('repoSearchForm'),
    ownerInput: document.getElementById('ownerInput'),
    repoInput: document.getElementById('repoInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    apiQuotaBadge: document.getElementById('apiQuotaBadge'),

    // History Elements
    recentSearches: document.getElementById('recentSearches'),
    recentList: document.getElementById('recentList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),

    // State Containers
    loadingState: document.getElementById('loadingState'),
    errorState: document.getElementById('errorState'),
    errorMessage: document.getElementById('errorMessage'),
    errorDetail: document.getElementById('errorDetail'),
    resultsSection: document.getElementById('resultsSection'),

    // Repo Identity Elements
    ownerAvatar: document.getElementById('ownerAvatar'),
    repoFullName: document.getElementById('repoFullName'),
    repoBadges: document.getElementById('repoBadges'),
    repoDescription: document.getElementById('repoDescription'),
    repoTopics: document.getElementById('repoTopics'),
    repoLink: document.getElementById('repoLink'),
    copyReportBtn: document.getElementById('copyReportBtn'),

    // Health Grade & Sub-score Elements
    gradeCard: document.getElementById('gradeCard'),
    healthGrade: document.getElementById('healthGrade'),
    healthScore: document.getElementById('healthScore'),
    healthVerdict: document.getElementById('healthVerdict'),
    recencyVal: document.getElementById('recencyVal'),
    recencyBar: document.getElementById('recencyBar'),
    issueVal: document.getElementById('issueVal'),
    issueBar: document.getElementById('issueBar'),
    govVal: document.getElementById('govVal'),
    govBar: document.getElementById('govBar'),
    diagnosticList: document.getElementById('diagnosticList'),

    // Telemetry Metric Elements
    metricStars: document.getElementById('metricStars'),
    metricIssues: document.getElementById('metricIssues'),
    metricForks: document.getElementById('metricForks'),
    metricWatchers: document.getElementById('metricWatchers'),
    metricLanguage: document.getElementById('metricLanguage'),
    metricLicense: document.getElementById('metricLicense'),
    metricLastPush: document.getElementById('metricLastPush'),
    metricCreated: document.getElementById('metricCreated'),
    metricSize: document.getElementById('metricSize'),

    // Commits Feed
    commitsList: document.getElementById('commitsList')
};

/**
 * Initializes event listeners, keyboard shortcuts, localStorage history,
 * and checks for URL query parameters (?repo=owner/name) on startup.
 */
function initApp() {
    // Handle form submission
    elements.form.addEventListener('submit', (event) => {
        event.preventDefault();
        handleSmartInputSplit();

        const owner = elements.ownerInput.value.trim();
        const repo = elements.repoInput.value.trim();

        if (!owner || !repo) {
            displayError(
                'Could not fetch data. Please try again.',
                'Both Repository Owner and Repository Name fields are required.'
            );
            return;
        }

        analyzeRepository(owner, repo);
    });

    // Smart paste support: splits "owner/repo" or full GitHub URLs automatically
    elements.ownerInput.addEventListener('input', handleSmartInputSplit);

    // Quick-select preset buttons
    elements.presetBtns.forEach((btn) => {
        btn.addEventListener('click', () => {
            const owner = btn.getAttribute('data-owner');
            const repo = btn.getAttribute('data-repo');
            elements.ownerInput.value = owner;
            elements.repoInput.value = repo;
            analyzeRepository(owner, repo);
        });
    });

    // Clear history button
    elements.clearHistoryBtn.addEventListener('click', clearSearchHistory);

    // Copy diagnostic report to clipboard button
    if (elements.copyReportBtn) {
        elements.copyReportBtn.addEventListener('click', copyDiagnosticReport);
    }

    // Global "/" keyboard shortcut to focus owner input (HCI efficiency)
    document.addEventListener('keydown', (event) => {
        const activeTag = document.activeElement ? document.activeElement.tagName : '';
        if (event.key === '/' && activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
            event.preventDefault();
            elements.ownerInput.focus();
            elements.ownerInput.select();
        }
    });

    // Render saved history from localStorage
    renderSearchHistory();

    // Check URL query parameter for deep-linking (e.g., app.html?repo=facebook/react)
    checkUrlQueryParam();
}

/**
 * Checks if the URL contains ?repo=owner/name and triggers an automatic scan.
 */
function checkUrlQueryParam() {
    const params = new URLSearchParams(window.location.search);
    const repoParam = params.get('repo');
    if (!repoParam || !repoParam.includes('/')) return;

    const parts = repoParam.split('/').filter(Boolean);
    if (parts.length >= 2) {
        elements.ownerInput.value = parts[0];
        elements.repoInput.value = parts[1];
        analyzeRepository(parts[0], parts[1]);
    }
}

/**
 * Detects if a user pasted "owner/repo" or "https://github.com/owner/repo"
 * into the owner input field and splits it across both fields automatically.
 */
function handleSmartInputSplit() {
    const rawValue = elements.ownerInput.value.trim();
    if (!rawValue.includes('/')) return;

    const cleaned = rawValue
        .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
        .replace(/\.git$/i, '');

    const parts = cleaned.split('/').filter(Boolean);
    if (parts.length >= 2) {
        elements.ownerInput.value = parts[0];
        elements.repoInput.value = parts[1];
    }
}

/**
 * Wrapper around fetch() that enforces an AbortController timeout.
 *
 * @param {string} url - Endpoint URL.
 * @param {Object} options - Fetch configuration options.
 * @param {number} timeoutMs - Timeout duration in milliseconds.
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        return response;
    } finally {
        clearTimeout(timerId);
    }
}

/**
 * Retrieves cached API payload from sessionStorage if still within TTL.
 */
function getCachedPayload(cacheKey) {
    try {
        const raw = sessionStorage.getItem(CACHE_PREFIX + cacheKey);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) {
            sessionStorage.removeItem(CACHE_PREFIX + cacheKey);
            return null;
        }
        return parsed;
    } catch (e) {
        return null;
    }
}

/**
 * Stores fetched API payload in sessionStorage to conserve rate-limit quota.
 */
function setCachedPayload(cacheKey, repoData, commitsData) {
    try {
        sessionStorage.setItem(
            CACHE_PREFIX + cacheKey,
            JSON.stringify({
                timestamp: Date.now(),
                repoData,
                commitsData
            })
        );
    } catch (e) {
        // Ignore storage quota errors
    }
}

/**
 * Updates the live GitHub API Rate-Limit badge in the header.
 */
function updateRateLimitBadge(headers, fromCache = false) {
    if (!elements.apiQuotaBadge) return;

    if (fromCache) {
        if (!elements.apiQuotaBadge.textContent.includes('(Cached)')) {
            elements.apiQuotaBadge.textContent += ' (Cached)';
        }
        return;
    }

    const remaining = headers.get('x-ratelimit-remaining');
    const limit = headers.get('x-ratelimit-limit');

    if (remaining !== null && limit !== null) {
        elements.apiQuotaBadge.textContent = `API Quota: ${remaining} / ${limit}`;
    }
}

/**
 * Fetches repository metadata and recent commits from the GitHub REST API
 * using async/await and updates the DOM dynamically.
 *
 * @param {string} owner - The GitHub username or organization name.
 * @param {string} repo - The repository name.
 */
async function analyzeRepository(owner, repo) {
    setUIState('loading');

    const normalizedKey = `${owner}/${repo}`.toLowerCase();

    // Update URL query parameter without reloading page for easy sharing
    try {
        const newUrl = `${window.location.pathname}?repo=${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
        window.history.replaceState({ path: newUrl }, '', newUrl);
    } catch (e) {
        // Ignore history update restrictions on file:// protocol
    }

    // 1. Check 5-minute sessionStorage cache first
    const cached = getCachedPayload(normalizedKey);
    if (cached) {
        updateRateLimitBadge(null, true);
        processAndRenderData(cached.repoData, cached.commitsData);
        return;
    }

    const repoEndpoint = `${GITHUB_API_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const commitsEndpoint = `${repoEndpoint}/commits?per_page=5`;

    try {
        // 2. Fetch repository details and latest 5 commits concurrently with timeout
        const [repoResponse, commitsResponse] = await Promise.all([
            fetchWithTimeout(repoEndpoint, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }),
            fetchWithTimeout(commitsEndpoint, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }).catch(() => null) // Prevent commit fetch failure from breaking main report
        ]);

        // Update rate-limit telemetry badge from HTTP headers
        updateRateLimitBadge(repoResponse.headers, false);

        // Handle non-200 HTTP responses gracefully
        if (!repoResponse.ok) {
            if (repoResponse.status === 404) {
                throw new Error(`Repository "${owner}/${repo}" was not found. Check spelling or ensure the repository is public.`);
            } else if (repoResponse.status === 403 || repoResponse.status === 429) {
                throw new Error('GitHub API rate limit exceeded (60 requests/hour for unauthenticated users). Please wait a few minutes and try again.');
            } else {
                throw new Error(`GitHub API responded with status code ${repoResponse.status}.`);
            }
        }

        const repoData = await repoResponse.json();
        let commitsData = [];

        if (commitsResponse && commitsResponse.ok) {
            commitsData = await commitsResponse.json();
        }

        // Save valid response to 5-minute sessionStorage cache
        setCachedPayload(normalizedKey, repoData, commitsData);

        // Render dashboard
        processAndRenderData(repoData, commitsData);
    } catch (error) {
        let detailText = error.message;
        if (error.name === 'AbortError') {
            detailText = 'Request timed out after 8 seconds. Please check your internet connection and try again.';
        } else if (error.message === 'Failed to fetch') {
            detailText = 'Network error detected. Please check your internet connection.';
        }

        displayError('Could not fetch data. Please try again.', detailText);
    }
}

/**
 * Computes health metrics, updates all DOM sections, and saves to scan history.
 */
function processAndRenderData(repoData, commitsData) {
    const diagnostics = calculateHealthMetrics(repoData);

    // Save current summary for clipboard export
    currentReportSummary = {
        fullName: repoData.full_name,
        url: repoData.html_url,
        grade: diagnostics.grade,
        score: diagnostics.score,
        verdict: diagnostics.verdict,
        subscores: diagnostics.subscores,
        stars: repoData.stargazers_count || 0,
        issues: repoData.open_issues_count || 0,
        forks: repoData.forks_count || 0,
        language: repoData.language || 'Not Specified',
        lastPush: formatRelativeDate(repoData.pushed_at),
        notes: diagnostics.notes
    };

    renderRepositoryOverview(repoData);
    renderHealthReport(diagnostics);
    renderTelemetryMetrics(repoData);
    renderRecentCommits(commitsData);

    saveToSearchHistory(repoData.owner.login, repoData.name, diagnostics.grade);
    setUIState('results');
}

/**
 * Evaluates repository metrics across three weighted categories:
 * 1. Maintenance Recency (Max 45 pts)
 * 2. Issue Backlog Density (Max 30 pts)
 * 3. Governance & Community Traction (Max 25 pts)
 *
 * @param {Object} repo - Parsed JSON object from GitHub API.
 * @returns {Object} Calculated grade, numerical score, subscores, verdict, and breakdown notes.
 */
function calculateHealthMetrics(repo) {
    const notes = [];
    let recencyScore = 0;
    let issueScore = 0;
    let governanceScore = 0;

    const now = new Date();
    const lastPushedDate = new Date(repo.pushed_at);
    const daysSinceLastPush = Math.max(0, Math.floor((now - lastPushedDate) / (1000 * 60 * 60 * 24)));

    // Immediate override if repository is officially archived by its owner
    if (repo.archived) {
        return {
            score: 15,
            grade: 'F',
            statusClass: 'grade-f',
            verdict: 'Archived / Read-Only',
            subscores: { recency: 0, issues: 5, governance: 10 },
            notes: [
                { type: 'critical', text: 'This repository is archived by the owner and no longer receives updates or security patches.' },
                { type: 'info', text: `Last push occurred ${daysSinceLastPush} days ago.` }
            ]
        };
    }

    // 1. Maintenance Recency Evaluation (0 - 45 points)
    if (daysSinceLastPush <= 7) {
        recencyScore = 45;
        notes.push({ type: 'good', text: `Actively maintained: code pushed within the last week (${daysSinceLastPush} days ago).` });
    } else if (daysSinceLastPush <= 30) {
        recencyScore = 40;
        notes.push({ type: 'good', text: `Healthy activity: updated within the last month (${daysSinceLastPush} days ago).` });
    } else if (daysSinceLastPush <= 90) {
        recencyScore = 30;
        notes.push({ type: 'good', text: `Moderate activity: last code push was ${daysSinceLastPush} days ago.` });
    } else if (daysSinceLastPush <= 180) {
        recencyScore = 20;
        notes.push({ type: 'warning', text: `Slowing momentum: no updates in ${daysSinceLastPush} days (3–6 months).` });
    } else if (daysSinceLastPush <= 365) {
        recencyScore = 10;
        notes.push({ type: 'warning', text: `Stale codebase: no updates in ${daysSinceLastPush} days (over 6 months).` });
    } else {
        recencyScore = 0;
        notes.push({ type: 'critical', text: `Dormant repository: last push was ${daysSinceLastPush} days ago (over 1 year).` });
    }

    // 2. Issue Density Evaluation (0 - 30 points)
    const stars = repo.stargazers_count || 0;
    const openIssues = repo.open_issues_count || 0;

    if (!repo.has_issues) {
        issueScore = 20;
        notes.push({ type: 'info', text: 'Issue tracker is disabled on this repository.' });
    } else if (openIssues === 0) {
        issueScore = 30;
        notes.push({ type: 'good', text: 'Zero open issues currently logged in the tracker.' });
    } else {
        const issueToStarRatio = openIssues / Math.max(stars, 1);

        if (issueToStarRatio <= 0.02 || (openIssues <= 10 && stars >= 50)) {
            issueScore = 30;
            notes.push({ type: 'good', text: `Low issue density (${openIssues.toLocaleString()} open issues vs. ${stars.toLocaleString()} stars).` });
        } else if (issueToStarRatio <= 0.08) {
            issueScore = 24;
            notes.push({ type: 'good', text: `Manageable issue backlog (${openIssues.toLocaleString()} open issues).` });
        } else if (issueToStarRatio <= 0.20) {
            issueScore = 15;
            notes.push({ type: 'warning', text: `Elevated open issue backlog relative to stars (${(issueToStarRatio * 100).toFixed(1)}% ratio).` });
        } else {
            issueScore = 5;
            notes.push({ type: 'critical', text: `High density of unresolved issues (${openIssues.toLocaleString()} open issues vs. ${stars.toLocaleString()} stars).` });
        }
    }

    // 3. Governance & Community Traction (0 - 25 points)
    // 3a. License check (10 points)
    if (repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION') {
        governanceScore += 10;
        notes.push({ type: 'good', text: `Clear legal governance: licensed under ${repo.license.spdx_id}.` });
    } else {
        notes.push({ type: 'warning', text: 'No standard open-source license detected (risky for production adoption).' });
    }

    // 3b. Documentation/Description check (5 points)
    if (repo.description && repo.description.trim().length > 10) {
        governanceScore += 5;
    } else {
        notes.push({ type: 'warning', text: 'Repository lacks a clear summary description.' });
    }

    // 3c. Community Adoption (10 points)
    if (stars >= 1000 || repo.forks_count >= 200) {
        governanceScore += 10;
        notes.push({ type: 'good', text: `Strong community adoption (${stars.toLocaleString()} stars, ${repo.forks_count.toLocaleString()} forks).` });
    } else if (stars >= 100 || repo.forks_count >= 20) {
        governanceScore += 8;
        notes.push({ type: 'good', text: `Established community traction (${stars.toLocaleString()} stars).` });
    } else if (stars >= 10) {
        governanceScore += 5;
        notes.push({ type: 'info', text: `Small community footprint (${stars.toLocaleString()} stars).` });
    } else {
        governanceScore += 2;
        notes.push({ type: 'info', text: `Early-stage or niche project (${stars} stars).` });
    }

    const score = recencyScore + issueScore + governanceScore;

    // Map final score to Letter Grade and Verdict
    let grade = 'F';
    let statusClass = 'grade-f';
    let verdict = 'Abandoned / High Risk';

    if (score >= 85) {
        grade = 'A';
        statusClass = 'grade-a';
        verdict = 'Actively Maintained';
    } else if (score >= 70) {
        grade = 'B';
        statusClass = 'grade-b';
        verdict = 'Healthy & Reliable';
    } else if (score >= 55) {
        grade = 'C';
        statusClass = 'grade-c';
        verdict = 'Proceed with Caution';
    } else if (score >= 40) {
        grade = 'D';
        statusClass = 'grade-d';
        verdict = 'Stale / Maintenance Risk';
    }

    return {
        score,
        grade,
        statusClass,
        verdict,
        subscores: {
            recency: recencyScore,
            issues: issueScore,
            governance: governanceScore
        },
        notes
    };
}

/**
 * Populates the Repository Identity Card and Topic Pills in the DOM.
 *
 * @param {Object} repo - GitHub API repository object.
 */
function renderRepositoryOverview(repo) {
    elements.ownerAvatar.src = repo.owner.avatar_url;
    elements.ownerAvatar.alt = `${repo.owner.login} avatar`;
    elements.repoFullName.textContent = repo.full_name;
    elements.repoDescription.textContent = repo.description || 'No description provided by the repository owner.';
    elements.repoLink.href = repo.html_url;

    // Render status badges (Public/Private, Fork, Archived)
    elements.repoBadges.innerHTML = '';

    const visibilityBadge = document.createElement('span');
    visibilityBadge.className = 'status-badge badge-neutral';
    visibilityBadge.textContent = repo.private ? 'Private' : 'Public';
    elements.repoBadges.appendChild(visibilityBadge);

    if (repo.fork) {
        const forkBadge = document.createElement('span');
        forkBadge.className = 'status-badge badge-info';
        forkBadge.textContent = 'Forked Repo';
        elements.repoBadges.appendChild(forkBadge);
    }

    if (repo.archived) {
        const archivedBadge = document.createElement('span');
        archivedBadge.className = 'status-badge badge-danger';
        archivedBadge.textContent = 'Archived';
        elements.repoBadges.appendChild(archivedBadge);
    }

    // Render GitHub repository topic tags (up to 8)
    if (elements.repoTopics) {
        elements.repoTopics.innerHTML = '';
        if (Array.isArray(repo.topics) && repo.topics.length > 0) {
            repo.topics.slice(0, 8).forEach((topic) => {
                const tag = document.createElement('span');
                tag.className = 'topic-pill';
                tag.textContent = `#${topic}`;
                elements.repoTopics.appendChild(tag);
            });
            elements.repoTopics.hidden = false;
        } else {
            elements.repoTopics.hidden = true;
        }
    }
}

/**
 * Populates the Health Grade Card, Sub-Score Progress Bars, and Diagnostic List.
 *
 * @param {Object} diagnostics - Result from calculateHealthMetrics().
 */
function renderHealthReport(diagnostics) {
    elements.gradeCard.className = `grade-card ${diagnostics.statusClass}`;
    elements.healthGrade.textContent = diagnostics.grade;
    elements.healthScore.textContent = `Score: ${diagnostics.score} / 100`;
    elements.healthVerdict.textContent = diagnostics.verdict;

    // Update 3 weighted sub-score meters
    const { recency, issues, governance } = diagnostics.subscores;
    if (elements.recencyVal && elements.recencyBar) {
        elements.recencyVal.textContent = `${recency} / 45`;
        elements.recencyBar.style.width = `${Math.round((recency / 45) * 100)}%`;
    }
    if (elements.issueVal && elements.issueBar) {
        elements.issueVal.textContent = `${issues} / 30`;
        elements.issueBar.style.width = `${Math.round((issues / 30) * 100)}%`;
    }
    if (elements.govVal && elements.govBar) {
        elements.govVal.textContent = `${governance} / 25`;
        elements.govBar.style.width = `${Math.round((governance / 25) * 100)}%`;
    }

    // Populate diagnostic bullet points safely using textContent
    elements.diagnosticList.innerHTML = '';
    diagnostics.notes.forEach((item) => {
        const li = document.createElement('li');
        li.className = `diag-item diag-${item.type}`;
        li.textContent = item.text;
        elements.diagnosticList.appendChild(li);
    });
}

/**
 * Populates the 9 quantitative telemetry boxes in the DOM.
 *
 * @param {Object} repo - GitHub API repository object.
 */
function renderTelemetryMetrics(repo) {
    elements.metricStars.textContent = Number(repo.stargazers_count || 0).toLocaleString();
    elements.metricIssues.textContent = Number(repo.open_issues_count || 0).toLocaleString();
    elements.metricForks.textContent = Number(repo.forks_count || 0).toLocaleString();
    elements.metricWatchers.textContent = Number(repo.subscribers_count || repo.watchers_count || 0).toLocaleString();
    elements.metricLanguage.textContent = repo.language || 'Not Specified';
    elements.metricLicense.textContent = (repo.license && repo.license.spdx_id !== 'NOASSERTION')
        ? repo.license.spdx_id
        : 'Unlicensed / Custom';

    elements.metricLastPush.textContent = formatRelativeDate(repo.pushed_at);
    elements.metricCreated.textContent = formatShortDate(repo.created_at);
    elements.metricSize.textContent = formatRepoSize(repo.size);
}

/**
 * Renders the last 5 commits fetched from the secondary /commits endpoint.
 *
 * @param {Array} commits - Array of commit objects from GitHub API.
 */
function renderRecentCommits(commits) {
    elements.commitsList.innerHTML = '';

    if (!Array.isArray(commits) || commits.length === 0) {
        const emptyLi = document.createElement('li');
        emptyLi.className = 'commit-item empty-commit';
        emptyLi.textContent = 'No recent commit history available for this repository.';
        elements.commitsList.appendChild(emptyLi);
        return;
    }

    commits.forEach((entry) => {
        const li = document.createElement('li');
        li.className = 'commit-item';

        const commitMessage = entry.commit && entry.commit.message
            ? entry.commit.message.split('\n')[0]
            : 'Commit message unavailable';

        const authorName = (entry.commit && entry.commit.author && entry.commit.author.name) || 'Unknown Author';
        const commitDate = (entry.commit && entry.commit.author && entry.commit.author.date)
            ? formatRelativeDate(entry.commit.author.date)
            : '';

        const msgLink = document.createElement('a');
        msgLink.href = entry.html_url || '#';
        msgLink.target = '_blank';
        msgLink.rel = 'noopener noreferrer';
        msgLink.className = 'commit-message';
        msgLink.textContent = commitMessage;

        const metaSpan = document.createElement('span');
        metaSpan.className = 'commit-meta';
        metaSpan.textContent = `by ${authorName} • ${commitDate}`;

        li.appendChild(msgLink);
        li.appendChild(metaSpan);
        elements.commitsList.appendChild(li);
    });
}

/**
 * Copies a formatted Markdown diagnostic report to the user's clipboard.
 */
async function copyDiagnosticReport() {
    if (!currentReportSummary || !elements.copyReportBtn) return;

    const r = currentReportSummary;
    const reportLines = [
        `# RepoRater Diagnostic Report: ${r.fullName}`,
        `- **Overall Grade:** ${r.grade} (${r.score}/100 - ${r.verdict})`,
        `- **Sub-Scores:** Recency ${r.subscores.recency}/45 | Issues ${r.subscores.issues}/30 | Governance ${r.subscores.governance}/25`,
        `- **Telemetry:** ⭐ ${r.stars.toLocaleString()} Stars | 🐛 ${r.issues.toLocaleString()} Open Issues | 🍴 ${r.forks.toLocaleString()} Forks`,
        `- **Primary Language:** ${r.language} | **Last Code Push:** ${r.lastPush}`,
        `- **Repository URL:** ${r.url}`,
        `\n## Diagnostic Findings:`,
        ...r.notes.map((n) => `- [${n.type.toUpperCase()}] ${n.text}`)
    ];

    try {
        await navigator.clipboard.writeText(reportLines.join('\n'));
        const originalText = elements.copyReportBtn.textContent;
        elements.copyReportBtn.textContent = 'Copied Report ✓';
        setTimeout(() => {
            elements.copyReportBtn.textContent = originalText;
        }, 2000);
    } catch (e) {
        elements.copyReportBtn.textContent = 'Copy Failed';
    }
}

/**
 * Manages visibility of Loading, Error, and Results sections.
 *
 * @param {'loading' | 'error' | 'results'} state - Active UI state.
 */
function setUIState(state) {
    elements.loadingState.hidden = (state !== 'loading');
    elements.errorState.hidden = (state !== 'error');
    elements.resultsSection.hidden = (state !== 'results');
    elements.analyzeBtn.disabled = (state === 'loading');
    elements.analyzeBtn.textContent = (state === 'loading') ? 'Analyzing...' : 'Analyze Repo';
}

/**
 * Displays a user-friendly error message when API calls or validations fail.
 *
 * @param {string} title - Primary error message required by rubric.
 * @param {string} detail - Specific explanation for the user.
 */
function displayError(title, detail) {
    elements.errorMessage.textContent = title;
    elements.errorDetail.textContent = detail;
    setUIState('error');
}

/**
 * Saves a scanned repository to localStorage for quick re-testing.
 */
function saveToSearchHistory(owner, repo, grade) {
    try {
        const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        const fullKey = `${owner}/${repo}`.toLowerCase();

        const filtered = existing.filter((item) => item.id !== fullKey);

        filtered.unshift({
            id: fullKey,
            owner,
            repo,
            grade
        });

        const trimmed = filtered.slice(0, MAX_HISTORY_ITEMS);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
        renderSearchHistory();
    } catch (e) {
        // Ignore storage errors if private browsing blocks localStorage
    }
}

/**
 * Renders clickable history pills from localStorage.
 */
function renderSearchHistory() {
    try {
        const history = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        elements.recentList.innerHTML = '';

        if (history.length === 0) {
            elements.recentSearches.hidden = true;
            return;
        }

        elements.recentSearches.hidden = false;

        history.forEach((item) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'recent-pill';
            btn.textContent = `${item.owner}/${item.repo} [${item.grade}]`;
            btn.addEventListener('click', () => {
                elements.ownerInput.value = item.owner;
                elements.repoInput.value = item.repo;
                analyzeRepository(item.owner, item.repo);
            });
            elements.recentList.appendChild(btn);
        });
    } catch (e) {
        elements.recentSearches.hidden = true;
    }
}

/**
 * Clears saved scan history from localStorage.
 */
function clearSearchHistory() {
    localStorage.removeItem(STORAGE_KEY);
    renderSearchHistory();
}

/**
 * Utility: Formats an ISO timestamp into a readable relative date (e.g., "4 days ago").
 */
function formatRelativeDate(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 30) return `${diffDays} days ago`;
    if (diffDays < 365) {
        const months = Math.floor(diffDays / 30);
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    const years = (diffDays / 365).toFixed(1);
    return `${years} years ago`;
}

/**
 * Utility: Formats an ISO timestamp into "MMM DD, YYYY".
 */
function formatShortDate(isoString) {
    if (!isoString) return 'N/A';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

/**
 * Utility: Converts GitHub's KB size metric into KB or MB.
 */
function formatRepoSize(sizeInKb) {
    if (!sizeInKb) return '0 KB';
    if (sizeInKb >= 1024) {
        return `${(sizeInKb / 1024).toFixed(1)} MB`;
    }
    return `${sizeInKb.toLocaleString()} KB`;
}

// Start application once DOM is ready
document.addEventListener('DOMContentLoaded', initApp);