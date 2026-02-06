# Deployment Questionnaire

Use this checklist before generating the workflow.

## Required inputs

1. Repository root path
2. Web directory (default: `apps/web`)
3. API directory (default: `apps/mock-api`)
4. API entry script relative to API dir (default: `src/server.js`)
5. API port (default: `8080`)
6. Web port (default: `3001`)
7. API health path (default: `/health`)
8. Aliyun public host (default: `112.124.103.65`)
9. SSH user (default: `root`)
10. Deploy root on server (default: `/opt/<repo-name>`)
11. PM2 API process name (default: `app-api`)
12. PM2 web process name (default: `app-web`)
13. Keep how many releases (default: `5`)
14. Whether to run API tests in CI (default: yes)

## Required GitHub secrets

- `ALIYUN_SSH_KEY` (preferred) or `ALIYUN_SSH_KEY_B64`

## Optional GitHub secrets

- `ALIYUN_HOST`
- `ALIYUN_USER`
- `APP_DIR`
- `VITE_API_URL`
- `APP_ENV_B64` (base64 of API `.env` for first deploy)

## Fast conversation template

- "Use defaults for directories and ports?"
- "Do you want API tests on each deployment run?"
- "Will the server already have API .env, or should I use APP_ENV_B64?"
- "What should PM2 process names be?"
