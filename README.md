This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:8528](http://localhost:8528) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Open Banking OAuth Relay Setup

Netly uses Finverse for open banking connections. Since Finverse requires a publicly accessible HTTPS redirect URL, but the app runs locally (localhost:8528), an OAuth redirect relay is needed.

### Initial Setup

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Deploy the relay**:
   ```bash
   cd oauth-relay
   vercel link
   vercel --prod
   ```
   
   When linking:
   - Select your Vercel account
   - Create a new project or link to existing
   - **Important**: Set Root Directory to `oauth-relay` when configuring

3. **Register callback URL in Finverse dashboard**:
   - Use the Vercel deployment URL: `https://your-project.vercel.app/callback`
   - Add this as an authorized redirect URI in your Finverse dashboard

4. **Configure environment variable**:
   - Add `NEXT_PUBLIC_OAUTH_RELAY_URL=https://your-project.vercel.app` to your `.env` file
   - See `.env.example` for reference

### Custom Domain (Optional)

To use your own subdomain (e.g., `auth.yourdomain.com`):

1. In Vercel project settings, add `auth.yourdomain.com` as a custom domain
2. Add DNS CNAME: `auth` -> `cname.vercel-dns.com`
3. Update `NEXT_PUBLIC_OAUTH_RELAY_URL` in `.env` to `https://auth.yourdomain.com`

### How It Works

The relay receives OAuth callbacks from Finverse and redirects them to your local application. The target URL is encoded in the state parameter, allowing the relay to forward callbacks to the correct localhost address.

For more details, see [`oauth-relay/README.md`](oauth-relay/README.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
