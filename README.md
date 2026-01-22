# Tennis Plan Scheduler

A mobile-friendly web app to schedule and run browser automation scripts.

## Setup

1. Update `lib/browser.ts` with your target site details:
   - `targetUrl`: The login URL
   - `username` / `password`: Your credentials
   - `selectors`: DOM selectors for the form fields and buttons
   - `successUrl`: URL that indicates successful completion

2. Deploy to Railway:
   ```bash
   railway login
   railway init
   railway up
   ```

3. Access the web UI from your phone to schedule runs.

## Local Development

```bash
npm install
npx playwright install chromium
npm run dev
```

## API Endpoints

- `GET /api/status` - Get current schedule and logs
- `POST /api/schedule` - Schedule a run `{ date: "2024-01-15", time: "09:30" }`
- `DELETE /api/schedule` - Cancel scheduled run
- `POST /api/run` - Trigger immediate run
