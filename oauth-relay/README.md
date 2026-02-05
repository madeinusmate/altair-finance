# Netly OAuth Redirect Relay

A minimal Vercel Edge Function that acts as a redirect relay for Finverse OAuth callbacks.

## Purpose

Finverse requires a publicly accessible HTTPS redirect URL, but Netly runs locally (localhost:8528) in both development and Electron production modes. This relay receives the OAuth callback from Finverse and redirects it to the local application.

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
5. Relay extracts target URL from state parameter and redirects to localhost:8528
6. Netly app receives the callback and exchanges code for tokens

## Security

- Stateless: No data is stored, no secrets are kept
- Only forwards URL parameters via browser redirect
- State parameter prevents CSRF attacks
- All sensitive token operations happen directly between Netly and Finverse
