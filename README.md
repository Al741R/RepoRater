================================================================================
IT 110 (WEB SYSTEMS AND TECHNOLOGIES) - MIDTERM PROJECT
PROJECT TITLE: RepoRater - Open-Source Software Repository Diagnostic Utility
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


3. REPOSITORY FILE STRUCTURE
--------------------------------------------------------------------------------
- index.html  : Portfolio Homepage introducing the developer, roles, and scope.
- app.html    : Single-Page Application (SPA) workspace for RepoRater.
- styles.css  : Unified responsive stylesheet applying HCI principles.
- script.js   : Asynchronous API fetch logic, DOM rendering, and error handling.
- profile.jpg : Developer profile photo (optional; automatic SVG fallback built in).
- README.txt  : Project documentation and execution instructions.


4. SPECIAL INSTRUCTIONS TO RUN THE APPLICATION
--------------------------------------------------------------------------------
1. Clone or download this repository to your local machine.
2. Ensure an active internet connection so fetch() can reach api.github.com.
3. Open "index.html" in any modern web browser (Chrome, Edge, Firefox) to view
   the Portfolio Homepage, then click "Launch RepoRater" to open "app.html".
4. In "app.html", enter a GitHub repository owner (e.g., "facebook") and
   repository name (e.g., "react"), or click any Quick Demo Preset button.
5. Tip: You can also paste a full GitHub URL (e.g., https://github.com/twbs/bootstrap)
   directly into the first input box—RepoRater will automatically split it.
================================================================================
