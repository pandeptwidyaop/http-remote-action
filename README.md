# HTTP Remote Deploy Action

GitHub Action untuk trigger deployment via [HTTP Remote](https://github.com/pandeptwidyaop/http-remote) API. Cocok untuk CI/CD pipeline yang perlu deploy ke server private via HTTP.

## Features

- Trigger deployment via API dengan token authentication
- Support custom command execution
- Wait for completion dengan timeout
- Output streaming dan status reporting
- Configurable path prefix

## Quick Start

```yaml
- name: Deploy to Server
  uses: pandeptwidyaop/http-remote-action@v1
  with:
    remote-url: ${{ secrets.REMOTE_URL }}
    app-id: ${{ secrets.APP_ID }}
    deploy-token: ${{ secrets.DEPLOY_TOKEN }}
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `remote-url` | Yes | - | Base URL HTTP Remote server (e.g., `https://app.example.com`) |
| `app-id` | Yes | - | Application UUID dari HTTP Remote |
| `deploy-token` | Yes | - | Deploy token untuk aplikasi |
| `command-id` | No | - | Command UUID spesifik (opsional, gunakan default jika kosong) |
| `path-prefix` | No | `/devops` | Path prefix yang dikonfigurasi di server |
| `wait` | No | `true` | Tunggu deployment selesai |
| `timeout` | No | `600` | Timeout dalam detik |
| `verbose` | No | `false` | Enable verbose logging |

## Outputs

| Output | Description |
|--------|-------------|
| `execution-id` | Execution UUID dari HTTP Remote |
| `status` | Status akhir deployment (`success`/`failed`/`timeout`) |
| `exit-code` | Exit code dari command |
| `output` | Output dari command (truncated jika terlalu panjang) |

## Usage Examples

### Basic Deployment

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy to Server
        uses: pandeptwidyaop/http-remote-action@v1
        with:
          remote-url: ${{ secrets.REMOTE_URL }}
          app-id: ${{ secrets.APP_ID }}
          deploy-token: ${{ secrets.DEPLOY_TOKEN }}
```

### Deploy dengan Command Spesifik

```yaml
- name: Deploy with specific command
  uses: pandeptwidyaop/http-remote-action@v1
  with:
    remote-url: ${{ secrets.REMOTE_URL }}
    app-id: ${{ secrets.APP_ID }}
    deploy-token: ${{ secrets.DEPLOY_TOKEN }}
    command-id: "your-command-uuid"
```

### Fire and Forget (Tanpa Menunggu)

```yaml
- name: Trigger deployment
  uses: pandeptwidyaop/http-remote-action@v1
  with:
    remote-url: ${{ secrets.REMOTE_URL }}
    app-id: ${{ secrets.APP_ID }}
    deploy-token: ${{ secrets.DEPLOY_TOKEN }}
    wait: "false"
```

### Custom Timeout

```yaml
- name: Deploy with extended timeout
  uses: pandeptwidyaop/http-remote-action@v1
  with:
    remote-url: ${{ secrets.REMOTE_URL }}
    app-id: ${{ secrets.APP_ID }}
    deploy-token: ${{ secrets.DEPLOY_TOKEN }}
    timeout: "1200"  # 20 minutes
```

### Multi-Environment Deployment

```yaml
name: Multi-Environment Deploy

on:
  push:
    branches: [main]

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        uses: pandeptwidyaop/http-remote-action@v1
        with:
          remote-url: ${{ secrets.REMOTE_URL }}
          app-id: ${{ secrets.STAGING_APP_ID }}
          deploy-token: ${{ secrets.STAGING_DEPLOY_TOKEN }}

  deploy-production:
    runs-on: ubuntu-latest
    needs: deploy-staging
    environment: production
    steps:
      - name: Deploy to Production
        uses: pandeptwidyaop/http-remote-action@v1
        with:
          remote-url: ${{ secrets.REMOTE_URL }}
          app-id: ${{ secrets.PROD_APP_ID }}
          deploy-token: ${{ secrets.PROD_DEPLOY_TOKEN }}
```

### Menggunakan Output

```yaml
- name: Deploy
  id: deploy
  uses: pandeptwidyaop/http-remote-action@v1
  with:
    remote-url: ${{ secrets.REMOTE_URL }}
    app-id: ${{ secrets.APP_ID }}
    deploy-token: ${{ secrets.DEPLOY_TOKEN }}

- name: Check result
  run: |
    echo "Execution ID: ${{ steps.deploy.outputs.execution-id }}"
    echo "Status: ${{ steps.deploy.outputs.status }}"
    echo "Exit Code: ${{ steps.deploy.outputs.exit-code }}"
```

### Deploy setelah Docker Build

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Build and push Docker image
        run: |
          docker build -t myapp:latest .
          docker push myregistry/myapp:latest

      - name: Deploy to Server
        uses: pandeptwidyaop/http-remote-action@v1
        with:
          remote-url: ${{ secrets.REMOTE_URL }}
          app-id: ${{ secrets.APP_ID }}
          deploy-token: ${{ secrets.DEPLOY_TOKEN }}
```

## Setup Secrets

Di repository GitHub Anda, tambahkan secrets berikut:

1. **REMOTE_URL**: URL server HTTP Remote (e.g., `https://deploy.example.com`)
2. **APP_ID**: UUID aplikasi dari HTTP Remote
3. **DEPLOY_TOKEN**: Token deployment dari HTTP Remote

Untuk mendapatkan `APP_ID` dan `DEPLOY_TOKEN`:
1. Login ke HTTP Remote Web UI
2. Buka halaman detail aplikasi
3. Copy App ID dan Token

## Troubleshooting

### Connection refused
- Pastikan server HTTP Remote bisa diakses dari GitHub Actions runner
- Periksa firewall dan port

### 401 Unauthorized
- Periksa deploy token
- Regenerate token jika perlu

### Timeout
- Tingkatkan nilai `timeout`
- Periksa apakah command memang membutuhkan waktu lama

### Command not found
- Pastikan `command-id` valid
- Jika tidak menggunakan `command-id`, pastikan app memiliki minimal 1 command

## License

MIT
