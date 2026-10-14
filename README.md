# RepoRater

> **IT 110 — Web Systems and Technologies Midterm Project**
>
> An open-source software repository diagnostic utility for reviewing public GitHub repositories.

## Overview

**RepoRater** is a browser-based utility that uses the GitHub REST API to retrieve public repository information and recent commit data. It provides a single-page workspace for evaluating repositories through an asynchronous JavaScript grading engine.

The project also includes a portfolio homepage introducing the developer, project roles, and project scope.

## Developer Information

| Field | Details |
|---|---|
| **Project type** | Individual / Solo Project |
| **Developer** | Chris Jowil S. Casillano |
| **Program** | BS in Information Technology (BSIT) |
| **Institution** | Caraga State University — Main Campus (CCIS) |

### Assigned Roles

All project roles were executed by **Chris Jowil S. Casillano**:

- **HTML structure and semantics** — `index.html`, `app.html`
- **CSS styling and layout** — `styles.css`, including the dark-mode developer dashboard and HCI design
- **JavaScript logic and API integration** — `script.js`, including `async`/`await` and the grading engine
- **Project management and documentation** — `README.txt` and repository setup

## External API

RepoRater uses the **GitHub REST API v3** to access public repository and commit information.

| Item | Details |
|---|---|
| **API** | GitHub REST API v3 |
| **Base endpoint** | `https://api.github.com/repos/{owner}/{repo}` |
| **Commits endpoint** | `https://api.github.com/repos/{owner}/{repo}/commits?per_page=5` |
| **Documentation** | [GitHub REST API documentation](https://docs.github.com/en/rest) |
| **Authentication** | None required for public repositories |
| **Rate limit** | 60 requests per hour per IP address |

## Project Structure

| File | Description |
|---|---|
| `index.html` | Portfolio homepage introducing the developer, roles, and project scope. |
| `app.html` | Single-page application (SPA) workspace for RepoRater. |
| `styles.css` | Unified responsive stylesheet applying HCI principles. |
| `script.js` | Asynchronous API fetch logic, DOM rendering, and error handling. |
| `profile.jpg` | Optional developer profile photo with an automatic SVG fallback. |
| `README.txt` | Project documentation and execution instructions. |

## Running the Application

1. **Clone or download** this repository to your local machine.
2. Make sure you have an **active internet connection** so `fetch()` can reach `api.github.com`.
3. Open `index.html` in a modern web browser such as **Chrome, Edge, or Firefox**.
4. From the portfolio homepage, select **Launch RepoRater** to open `app.html`.
5. In the RepoRater workspace, enter a GitHub repository owner and repository name.

   Example:

   - Owner: `facebook`
   - Repository: `react`

6. Alternatively, select any available **Quick Demo Preset** button.

## Input Tip

You can paste a complete GitHub repository URL into the first input box. RepoRater will automatically split the URL into the repository owner and name.

```text
https://github.com/twbs/bootstrap
```

---

*Created as an IT 110 midterm project for Caraga State University — Main Campus (CCIS).* 
