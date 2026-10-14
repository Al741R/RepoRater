================================================================================
IT 110 (WEB SYSTEMS AND TECHNOLOGIES) - MIDTERM PROJECT
PROJECT TITLE: RepoRater v1.2 - Open-Source Software Repository Diagnostic Tool
================================================================================

1. GROUP / DEVELOPER INFORMATION
--------------------------------------------------------------------------------
Project Type : Individual (Solo Project)
Developer    : Chris Jowil S. Casillano
Program      : BS in Information Technology (BSIT)
Institution  : Caraga State University - Main Campus (CCIS)

Assigned Roles (All Executed by Chris Jowil S. Casillano):
- HTML Structure & Semantics (index.html, app.html)
- CSS Styling & Layout (styles.css - Dark Mode Developer Dashboard & HCI Design)
- JavaScript Logic & API Integration (script.js - Async/Await & Grading Engine)
- Project Management & Documentation (README.txt & Repository Setup)


2. EXTERNAL API UTILIZED
--------------------------------------------------------------------------------
API Name          : GitHub REST API v3 (Public Repositories & Commits Endpoints)
Base Endpoint     : https://api.github.com/repos/{owner}/{repo}
Commits Endpoint  : https://api.github.com/repos/{owner}/{repo}/commits?per_page=5
API Documentation : https://docs.github.com/en/rest
Authentication    : None required for public repositories (60 requests/hour/IP)


3. KEY TECHNICAL & HCI FEATURES (BEYOND BASIC REQUIREMENTS)
--------------------------------------------------------------------------------
- Concurrent Async/Await Pipeline: Uses Promise.all() with an 8-second
  AbortController timeout to fetch repository telemetry and recent commits.
- 100-Point Diagnostic Engine: Evaluates Maintenance Recency (45 pts), Issue
  Backlog Density (30 pts), and Governance/Adoption (25 pts) with visual meters.
- SessionStorage Response Caching: Caches valid API responses for 5 minutes to
  prevent redundant network calls and preserve API rate-limit quota.
- Live HTTP Rate-Limit Telemetry: Parses x-ratelimit-remaining headers directly
  from the GitHub API response.
- Developer UX Enhancements: Smart URL pasting, "/" keyboard shortcut to focus
  search, URL query deep-linking (?repo=owner/name), and Markdown clipboard export.


4. REPOSITORY FILE STRUCTURE
--------------------------------------------------------------------------------
- index.html  : Portfolio Homepage introducing the developer, roles, and scope.
- app.html    : Single-Page Application (SPA) workspace for RepoRater.
- styles.css  : Unified responsive stylesheet applying HCI principles.
- script.js   : Asynchronous API fetch logic, DOM rendering, and error handling.
- profile.jpg : Developer profile photo (with built-in SVG fallback).
- README.txt  : Official project documentation required by IT110 instructions.


5. SPECIAL INSTRUCTIONS TO RUN THE APPLICATION
--------------------------------------------------------------------------------
1. Clone or download this repository to your local machine.
2. Ensure an active internet connection so fetch() can reach api.github.com.
3. Open "index.html" in any modern web browser to view the Portfolio Homepage,
   then click "Launch RepoRater" (or any Instant Deep-Link button) to open "app.html".
4. In "app.html", enter a GitHub repository owner (e.g., "facebook") and
   repository name (e.g., "react"), or click any Quick Demo Preset button.
5. Press "/" at any time to focus the search bar, or click "Copy Diagnostic
   Report" on any result card to copy a Markdown summary to your clipboard.
================================================================================