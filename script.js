/**
 * RepoRater - Software Repository Analyzer
 * IT110 Midterm Project - Main Application Script (script.js)
 *
 * Interacts with the public GitHub REST API using async/await to evaluate
 * open-source repository maintenance health, issue density, and recent activity.
 */

const GITHUB_API_BASE = 'https://api.github.com/repos';
const STORAGE_KEY = 'reporater_recent_scans';
const MAX_HISTORY_ITEMS = 5;

// DOM Element References
const elements = {
    form: document.getElementById('repoSearchForm'),
    ownerInput: document.getElementById('ownerInput'),
    repoInput: document.getElementById('repoInput'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    presetBtns: document.querySelectorAll('.preset-btn'),
    
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
    repoLink: document.getElementById('repoLink'),

    // Health Grade Elements
    gradeCard: document.getElementById('gradeCard'),
    healthGrade: document.getElementById('healthGrade'),
    healthScore: document.getElementById('healthScore'),
    healthVerdict: document.getElementById('healthVerdict'),
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
 * Initializes event listeners and loads recent search history on startup.
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

    // Render saved history from localStorage
    renderSearchHistory();
}

/**
 * Detects if a user pasted "owner/repo" or "https://github.com/owner/repo"
 * into the owner input field and splits it across both fields automatically.
 */
function handleSmartInputSplit() {
    const rawValue = elements.ownerInput.value.trim();
    if (!rawValue.includes('/')) return;

    // Strip protocol and domain if full URL was pasted
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
 * Fetches repository metadata and recent commits from the GitHub REST API
 * using async/await and updates the DOM dynamically.
 *
 * @param {string} owner - The GitHub username or organization name.
 * @param {string} repo - The repository name.
 */
async function analyzeRepository(owner, repo) {
    setUIState('loading');

    const repoEndpoint = `${GITHUB_API_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
    const commitsEndpoint = `${repoEndpoint}/commits?per_page=5`;

    try {
        // Fetch repository details and latest 5 commits concurrently
        const [repoResponse, commitsResponse] = await Promise.all([
            fetch(repoEndpoint, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }),
            fetch(commitsEndpoint, {
                headers: { 'Accept': 'application/vnd.github.v3+json' }
            }).catch(() => null) // Prevent commit fetch failure from breaking main report
        ]);

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

        // Calculate custom Health Grade and diagnostic notes
        const diagnostics = calculateHealthMetrics(repoData);

        // Dynamically update the DOM with parsed data
        renderRepositoryOverview(repoData);
        renderHealthReport(diagnostics);
        renderTelemetryMetrics(repoData);
        renderRecentCommits(commitsData);

        // Save valid lookup to localStorage history
        saveToSearchHistory(repoData.owner.login, repoData.name, diagnostics.grade);

        setUIState('results');
    } catch (error) {
        const detailText = error.message === 'Failed to fetch'
            ? 'Network error detected. Please check your internet connection.'
            : error.message;

        displayError('Could not fetch data. Please try again.', detailText);
    }
}

/**
 * Evaluates repository metrics across three weighted categories:
 * 1. Maintenance Recency (Max 45 pts)
 * 2. Issue Backlog Density (Max 30 pts)
 * 3. Governance & Community Traction (Max 25 pts)
 *
 * @param {Object} repo - Parsed JSON object from GitHub API.
 * @returns {Object} Calculated grade, numerical score, verdict, and breakdown notes.
 */
function calculateHealthMetrics(repo) {
    const notes = [];
    let score = 0;

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
            notes: [
                { type: 'critical', text: 'This repository is archived by the owner and no longer receives updates or security patches.' },
                { type: 'info', text: `Last push occurred ${daysSinceLastPush} days ago.` }
            ]
        };
    }

    // 1. Maintenance Recency Evaluation (0 - 45 points)
    if (daysSinceLastPush <= 7) {
        score += 45;
        notes.push({ type: 'good', text: `Actively maintained: code pushed within the last week (${daysSinceLastPush} days ago).` });
    } else if (daysSinceLastPush <= 30) {
        score += 40;
        notes.push({ type: 'good', text: `Healthy activity: updated within the last month (${daysSinceLastPush} days ago).` });
    } else if (daysSinceLastPush <= 90) {
        score += 30;
        notes.push({ type: 'good', text: `Moderate activity: last code push was ${daysSinceLastPush} days ago.` });
    } else if (daysSinceLastPush <= 180) {
        score += 20;
        notes.push({ type: 'warning', text: `Slowing momentum: no updates in ${daysSinceLastPush} days (3–6 months).` });
    } else if (daysSinceLastPush <= 365) {
        score += 10;
        notes.push({ type: 'warning', text: `Stale codebase: no updates in ${daysSinceLastPush} days (over 6 months).` });
    } else {
        score += 0;
        notes.push({ type: 'critical', text: `Dormant repository: last push was ${daysSinceLastPush} days ago (over 1 year).` });
    }

    // 2. Issue Density Evaluation (0 - 30 points)
    const stars = repo.stargazers_count || 0;
    const openIssues = repo.open_issues_count || 0;

    if (!repo.has_issues) {
        score += 20;
        notes.push({ type: 'info', text: 'Issue tracker is disabled on this repository.' });
    } else if (openIssues === 0) {
        score += 30;
        notes.push({ type: 'good', text: 'Zero open issues currently logged in the tracker.' });
    } else {
        const issueToStarRatio = openIssues / Math.max(stars, 1);

        if (issueToStarRatio <= 0.02 || (openIssues <= 10 && stars >= 50)) {
            score += 30;
            notes.push({ type: 'good', text: `Low issue density (${openIssues.toLocaleString()} open issues vs. ${stars.toLocaleString()} stars).` });
        } else if (issueToStarRatio <= 0.08) {
            score += 24;
            notes.push({ type: 'good', text: `Manageable issue backlog (${openIssues.toLocaleString()} open issues).` });
        } else if (issueToStarRatio <= 0.20) {
            score += 15;
            notes.push({ type: 'warning', text: `Elevated open issue backlog relative to stars (${(issueToStarRatio * 100).toFixed(1)}% ratio).` });
        } else {
            score += 5;
            notes.push({ type: 'critical', text: `High density of unresolved issues (${openIssues.toLocaleString()} open issues vs. ${stars.toLocaleString()} stars).` });
        }
    }

    // 3. Governance & Community Traction (0 - 25 points)
    // 3a. License check (10 points)
    if (repo.license && repo.license.spdx_id && repo.license.spdx_id !== 'NOASSERTION') {
        score += 10;
        notes.push({ type: 'good', text: `Clear legal governance: licensed under ${repo.license.spdx_id}.` });
    } else {
        notes.push({ type: 'warning', text: 'No standard open-source license detected (risky for production adoption).' });
    }

    // 3b. Documentation/Description check (5 points)
    if (repo.description && repo.description.trim().length > 10) {
        score += 5;
    } else {
        notes.push({ type: 'warning', text: 'Repository lacks a clear summary description.' });
    }

    // 3c. Community Adoption (10 points)
    if (stars >= 1000 || repo.forks_count >= 200) {
        score += 10;
        notes.push({ type: 'good', text: `Strong community adoption (${stars.toLocaleString()} stars, ${repo.forks_count.toLocaleString()} forks).` });
    } else if (stars >= 100 || repo.forks_count >= 20) {
        score += 8;
        notes.push({ type: 'good', text: `Established community traction (${stars.toLocaleString()} stars).` });
    } else if (stars >= 10) {
        score += 5;
        notes.push({ type: 'info', text: `Small community footprint (${stars.toLocaleString()} stars).` });
    } else {
        score += 2;
        notes.push({ type: 'info', text: `Early-stage or niche project (${stars} stars).` });
    }

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

    return { score, grade, statusClass, verdict, notes };
}

/**
 * Populates the Repository Identity Card in the DOM.
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
}

/**
 * Populates the Health Grade Card and Diagnostic Breakdown List.
 *
 * @param {Object} diagnostics - Result from calculateHealthMetrics().
 */
function renderHealthReport(diagnostics) {
    // Reset grade styling classes on card
    elements.gradeCard.className = `grade-card ${diagnostics.statusClass}`;
    elements.healthGrade.textContent = diagnostics.grade;
    elements.healthScore.textContent = `Score: ${diagnostics.score} / 100`;
    elements.healthVerdict.textContent = diagnostics.verdict;

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
            ? entry.commit.message.split('\n')[0] // First line of commit message
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

        // Remove duplicate if already in history
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