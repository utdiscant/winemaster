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
```

**To generate a secure SESSION_SECRET**, run this locally:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Optional** (only if you're using Replit OAuth):
```
REPL_ID=your-repl-id
ISSUER_URL=https://replit.com/oidc
```

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
- Install dependencies (`npm install`)
- Build your application (`npm run build`)
- Start your server (`npm start`)

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

### Database Connection Issues
- Verify `DATABASE_URL` is set correctly
- Ensure database schema is pushed (`npm run db:push`)
- Check that `@neondatabase/serverless` package is installed

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
