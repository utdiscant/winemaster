# Deploying to Railway

This guide will help you deploy your Wine Master application to Railway.

## Prerequisites

1. A [Railway account](https://railway.app/) (sign up with GitHub)
2. Git repository pushed to GitHub (Railway will deploy from your repo)
3. Your application code committed and pushed

## Step-by-Step Deployment

### 1. Create a New Project on Railway

1. Go to [railway.app](https://railway.app/) and log in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account
5. Select your `winemaster` repository

### 2. Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"**
3. Choose **"Add PostgreSQL"**
4. Railway will automatically provision a PostgreSQL database
5. The `DATABASE_URL` environment variable will be automatically set

### 3. Configure Environment Variables

In your Railway project dashboard:

1. Click on your web service
2. Go to the **"Variables"** tab
3. Add the following environment variables:

```
NODE_ENV=production
PORT=5000
SESSION_SECRET=<generate-a-random-secret-key>
GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
GOOGLE_CLIENT_SECRET=<your-google-oauth-client-secret>
APP_URL=https://your-app.up.railway.app
```

**Which of these are actually required:**
- `DATABASE_URL` — provided automatically once you add the PostgreSQL plugin (step 2). Don't set it by hand.
- `SESSION_SECRET` — **required.** The server won't start without it.
- `PORT` — optional. Railway injects this automatically and the app reads it; you don't need to set `5000`.
- `NODE_ENV` — optional. The `start` script already runs in production mode.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `APP_URL` — **optional.** Only needed for Google sign-in. Email/password signup works without them.

**To generate a secure SESSION_SECRET**, run this locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**To set up Google OAuth:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Go to "APIs & Services" → "Credentials"
4. Click "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure the OAuth consent screen if prompted
6. Set application type to "Web application"
7. Add authorized redirect URIs:
   - For production: `https://your-app.up.railway.app/api/auth/google/callback`
   - For local dev: `http://localhost:5000/api/auth/google/callback`
8. Click "Create" and copy the Client ID and Client Secret
9. Paste them into the Railway environment variables

### 4. Push Database Schema

After your database is provisioned and the app is deployed:

1. Go to the **"Variables"** tab in your Railway PostgreSQL service
2. Copy the `DATABASE_URL` value
3. Run locally to push your schema:

```bash
export DATABASE_URL="<paste-your-railway-database-url>"
npm run db:push
```

Alternatively, you can add a post-build script to do this automatically. Add to `package.json`:

```json
{
  "scripts": {
    "postbuild": "drizzle-kit push"
  }
}
```

### 5. Deploy

Railway will automatically:
- Install dependencies (`npm ci --include=dev`)
- Build your application (`npm run build`)
- Start your server (`npm start`)

> **Note:** the build command uses `--include=dev` on purpose. Build tools
> (`vite`, `esbuild`) live in `devDependencies`, and `npm` omits those when
> `NODE_ENV=production` is set. Without the flag the build would fail with
> `vite: not found`. This is already wired up in `railway.json` / `nixpacks.toml`.

Watch the deployment logs in the Railway dashboard.

### 6. Access Your Application

1. Once deployed, Railway will provide a URL
2. Click **"Settings"** → **"Generate Domain"** to get a public URL
3. Your app will be available at `https://your-app-name.up.railway.app`

## Automatic Deployments

Railway automatically deploys when you push to your GitHub repository's main branch.

## Monitoring

- View logs in the Railway dashboard under the **"Deployments"** tab
- Check metrics and resource usage in the **"Metrics"** tab

## Troubleshooting

### Build Fails
- Check the build logs in Railway dashboard
- Ensure all dependencies are in `package.json`
- Verify `npm run build` works locally
- `vite: not found` / `esbuild: not found` → the build is omitting
  `devDependencies`. Make sure the build command uses `npm ci --include=dev`
  (it does by default here) and avoid overriding it with a plain `npm install`.

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- **Ensure the schema is pushed** (`npm run db:push`). The app does **not**
  auto-create tables — until you run this once, the site loads but signup/login
  return 500s because the `users`/`sessions` tables don't exist yet.
- The app connects with the `pg` driver and enables SSL in production
  (`rejectUnauthorized: false`). If Railway's internal connection rejects SSL,
  use the connection string Railway provides as-is, or append `?sslmode=disable`
  for the internal host.

### Application Won't Start
- Check that `PORT` environment variable is set
- Verify the start command is correct: `npm start`
- Review application logs for errors

## Cost

- Railway offers $5 of free credit per month
- PostgreSQL database and web service usage will consume credits
- Monitor your usage in the Railway dashboard

## Local Development

To run locally with your Railway database:

1. Get your `DATABASE_URL` from Railway
2. Create a `.env` file (don't commit this):
```
DATABASE_URL=your-railway-database-url
SESSION_SECRET=your-secret-key
NODE_ENV=development
```

3. Run the development server:
```bash
npm run dev
```
