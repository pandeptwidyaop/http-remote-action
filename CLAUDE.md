# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project Overview

This is a GitHub Action for triggering deployments via [HTTP Remote](https://github.com/pandeptwidyaop/http-remote) API. It enables CI/CD pipelines to deploy to private servers that are only accessible via HTTP (port 80/443).

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
git add .
git commit -m "Description of changes"
git tag -a v1.x.x -m "Version description"
git push origin main --tags
```

For major version updates, also update the `v1` tag:
```bash
git tag -fa v1 -m "Update v1 tag"
git push origin v1 --force
```

## Related Repository

- [HTTP Remote](https://github.com/pandeptwidyaop/http-remote) - The server component that this action communicates with
