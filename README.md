# Arena

Compare Claude, ChatGPT, Gemini, Grok, and DeepSeek side by side on the same
prompt. A small Express backend calls each provider's API using server-side
keys (so end users never need their own), stores history/stats in a JSON
file, and serves the static frontend.

```
arena-app/
├── backend/        Express API + JSON-file storage
├── frontend/        Static HTML/CSS/JS UI
├── Dockerfile
├── docker-compose.yml
└── .gitignore
```

## 1. Configure API keys

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in whichever provider keys you have:

| Variable             | Provider          | Where to get it                              |
|----------------------|--------------------|-----------------------------------------------|
| `ANTHROPIC_API_KEY`  | Claude              | https://console.anthropic.com/                |
| `OPENAI_API_KEY`     | ChatGPT             | https://platform.openai.com/api-keys          |
| `GEMINI_API_KEY`     | Gemini              | https://aistudio.google.com/app/apikey        |
| `XAI_API_KEY`        | Grok                | https://console.x.ai/                         |
| `DEEPSEEK_API_KEY`   | DeepSeek            | https://platform.deepseek.com/                |

Any key you leave blank just shows "missing key" for that model — everything
else keeps working.

## 2. Run locally

### Option A — Node directly

```bash
cd backend
npm install
npm start
```

Open http://localhost:3000

### Option B — Docker

```bash
docker compose up --build
```

Open http://localhost:3000

History is stored in `backend/data/history.json` (or in the `arena-data`
Docker volume), so it survives restarts.

## 3. Deploy to AWS

The app is a single Docker container exposing port 3000, so any
container-friendly AWS service works. A few options, simplest first:

### Option A — EC2 (or Lightsail) with Docker Compose

Good for a quick, low-cost single-instance deployment.

1. Launch a small EC2 instance (e.g. `t3.micro`/`t3.small`, Amazon Linux or
   Ubuntu) and open inbound port **80** (and 443 if adding HTTPS) and 22 in
   its security group.
2. SSH in, install Docker and the Compose plugin:
   ```bash
   sudo yum update -y && sudo yum install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker $USER   # log out/in after this
   ```
   (On Ubuntu use `apt` instead of `yum`, and install
   `docker-compose-plugin` from Docker's apt repo.)
3. Copy this project to the instance (e.g. `git clone` your repo, or `scp`).
4. Create `backend/.env` with your keys (step 1 above).
5. Run it:
   ```bash
   docker compose up -d --build
   ```
6. Put it behind port 80: either change `"3000:3000"` to `"80:3000"` in
   `docker-compose.yml`, or put nginx/Caddy in front for HTTPS via Let's
   Encrypt.

The history data persists in the `arena-data` volume on the instance's
disk — fine for a single instance, but it won't survive the instance being
replaced unless the volume/disk is preserved (e.g. an EBS volume).

### Option B — AWS App Runner

Good if you want a managed service with auto-scaling and HTTPS out of the
box, with minimal ops.

1. Push the image to **Amazon ECR**:
   ```bash
   aws ecr create-repository --repository-name arena
   aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com
   docker build -t arena .
   docker tag arena:latest <account>.dkr.ecr.<region>.amazonaws.com/arena:latest
   docker push <account>.dkr.ecr.<region>.amazonaws.com/arena:latest
   ```
2. Create an App Runner service from that ECR image, port `3000`.
3. Add the API keys as **environment variables** in the App Runner service
   configuration (instead of a `.env` file).

**Note:** App Runner's filesystem is ephemeral, so the JSON-file history
won't persist across deploys/restarts. For persistent history on App Runner
(or any serverless/Fargate setup), swap the file reads/writes in
`backend/db.js` for **Amazon RDS** (Postgres/MySQL) or **DynamoDB** — the
rest of the app doesn't need to change, only `db.js`.

### Option C — ECS Fargate

Same container, run as an ECS Fargate service behind an Application Load
Balancer. Same persistence caveat as App Runner applies — use EFS (mounted at
`/app/backend/data`) if you want to keep the JSON history, or move to
RDS/DynamoDB.

## API reference

| Endpoint              | Method | Description                                              |
|-----------------------|--------|-----------------------------------------------------------|
| `/api/config`         | GET    | Lists models and whether each has a server-side key set   |
| `/api/compare`        | POST   | `{ "prompt": "..." }` → streams NDJSON, one line per model |
| `/api/history`        | GET    | `?limit=25` recent prompts with results                    |
| `/api/history`        | DELETE | Clears all stored history                                  |
| `/api/stats`          | GET    | Aggregate success rate / avg response time per model       |

## Notes

- Each provider call has a 45-second timeout; a slow/erroring model won't
  block the others — results stream back to the UI as each model finishes.
- The frontend never sees any API keys — all provider calls happen
  server-side.
- Response text is capped at 1000 tokens per model (`MAX_TOKENS` in
  `backend/providers.js`) — adjust as needed.
