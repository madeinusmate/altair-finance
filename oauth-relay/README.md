# Netly OAuth Redirect Relay

A minimal Vercel Edge Function that acts as a redirect relay for Finverse OAuth callbacks.

## Purpose

Finverse requires a publicly accessible HTTPS redirect URL. Netly binds to loopback only. This relay receives the OAuth callback and redirects to the loopback origin the desktop app put in `state`.

## Deployment

### Initial Setup

1. Install Vercel CLI (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. Link the project:
   ```bash
   cd oauth-relay
   vercel link
   ```
   
   When prompted:
   - Select your Vercel account
   - Create a new project or link to existing
   - **Important**: Set Root Directory to `oauth-relay` when configuring

3. Deploy:
   ```bash
   vercel --prod
   ```

### Vercel Dashboard Setup

If creating the project via Vercel dashboard:

1. Import the `netly` repository
2. In "Configure Project" step, set **Root Directory** to `oauth-relay`
3. Framework Preset: Other
4. No build command needed (Edge Functions auto-detected)
5. Deploy

### Custom Domain (Optional)

To use your own subdomain (e.g., `auth.yourdomain.com`):

1. In Vercel project settings, add `auth.yourdomain.com` as a custom domain
2. Add DNS CNAME: `auth` -> `cname.vercel-dns.com`
3. Update `NEXT_PUBLIC_OAUTH_RELAY_URL` in the main Netly app to `https://auth.yourdomain.com`

## Configuration

After deployment, note the deployment URL (e.g., `https://netly-oauth-relay.vercel.app`) and set it in the main Netly app's `.env`:

```bash
NEXT_PUBLIC_OAUTH_RELAY_URL=https://netly-oauth-relay.vercel.app
```

## How It Works

1. User initiates bank connection in Netly app
2. Netly requests Finverse Link UI with `redirect_uri` pointing to this relay
3. User completes authentication on Finverse
4. Finverse redirects to this relay with OAuth code
5. Relay reads the loopback origin from `state` and redirects only if it is allowlisted
6. The Netly bank window receives the callback and the app exchanges the code for tokens

The allowlist is `http://127.0.0.1` and `http://localhost`, port `8527` (dev) or `8528`–`8535` (the desktop app), path `/accounts/connect` only. Keep `oauth-relay/api/redirect-allowlist.ts` in sync with `lib/app-ports.ts`. Redeploy this function after changing the allowlist.

## Security

- Stateless: no data is stored and no secrets are kept
- The redirect target is rebuilt from the allowlist, not taken from the raw query string
- Token exchange happens between Netly and Finverse, not in this function
