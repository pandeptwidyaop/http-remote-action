# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a GitHub Action for triggering deployments via [HTTP Remote](https://github.com/pandeptwidyaop/http-remote) API. It enables CI/CD pipelines to deploy to private servers that are only accessible via HTTP (port 80/443).

**Key characteristics:**
- Composite GitHub Action that installs dependencies at runtime
- Single-file implementation ([main.js](main.js))
- Uses Node.js built-in `http`/`https` modules (no external HTTP library like axios/got)
- No build step required - dependencies installed via `npm ci` when action runs

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   GitHub Actions                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │            http-remote-action                     │  │
│  │  ┌─────────┐    ┌─────────┐    ┌──────────────┐   │  │
│  │  │ Trigger │───▶│  Poll   │───▶│ Report Status│   │  │
│  │  │ Deploy  │    │ Status  │    │   & Output   │   │  │
│  │  └─────────┘    └─────────┘    └──────────────┘   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼ HTTP API
┌─────────────────────────────────────────────────────────┐
│                   HTTP Remote Server                    │
│              (Private Server via HTTP)                  │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
http-remote-action/
├── action.yml      # GitHub Action metadata, inputs, outputs
├── main.js         # Action implementation (Node.js 20)
├── package.json    # Node.js dependencies (@actions/core)
├── README.md       # User documentation
├── LICENSE         # MIT License
└── CLAUDE.md       # This file
```

## Key Files

### action.yml
Defines the action's interface:
- **Inputs**: `remote-url`, `app-id`, `deploy-token`, `command-id`, `path-prefix`, `wait`, `timeout`, `verbose`
- **Outputs**: `execution-id`, `status`, `exit-code`, `output`
- **Runtime**: Node.js 20

### main.js
Core implementation with these functions:
- `makeRequest()` - HTTP/HTTPS request wrapper
- `triggerDeploy()` - POST to `/deploy/{app_id}` endpoint
- `checkStatus()` - GET deployment status
- `waitForCompletion()` - Poll until complete or timeout
- `run()` - Main entry point

## API Endpoints Used

The action communicates with HTTP Remote server:

```
POST {remote-url}{path-prefix}/deploy/{app-id}
Headers: X-Deploy-Token: {token}
Body: {"command_id": "..."} (optional)

GET {remote-url}{path-prefix}/deploy/{app-id}/status/{execution-id}
Headers: X-Deploy-Token: {token}
```

## Development Commands

```bash
# Install dependencies
npm install

# Test locally (requires @actions/core mock or GitHub environment)
node main.js
```

**Action Type: Composite**
- This is a **composite action** (`using: 'composite'` in [action.yml](action.yml))
- Dependencies are installed at runtime via `npm ci --production`
- No build step required - commit [main.js](main.js) and [package.json](package.json) directly
- [action.yml](action.yml) defines steps that run when the action is used

**Note on Testing**: This action has no automated test suite. Testing requires:
- Running in actual GitHub Actions workflow, OR
- Mocking the `@actions/core` module to simulate GitHub Actions environment
- Access to a running HTTP Remote server for integration testing

## Common Modifications

### Adding New Input
1. Add to `action.yml` under `inputs:`
2. Read in `main.js` using `core.getInput("input-name")`

### Adding New Output
1. Add to `action.yml` under `outputs:`
2. Set in `main.js` using `core.setOutput("output-name", value)`

### Changing Poll Interval
Modify `pollInterval` constant in `waitForCompletion()` function (default: 5000ms)

## Publishing New Version

```bash
# 1. Make changes to main.js
# 2. Commit changes
git add .
git commit -m "Description of changes"

# 3. Tag and push
git tag -a v1.x.x -m "Version description"
git push origin main --tags
```

For major version updates, also update the `v1` tag:
```bash
git tag -fa v1 -m "Update v1 tag"
git push origin v1 --force
```

**Note**: As a composite action, no build step is needed. Just ensure [package.json](package.json) lists all required dependencies.

## Related Repository

- [HTTP Remote](https://github.com/pandeptwidyaop/http-remote) - The server component that this action communicates with
