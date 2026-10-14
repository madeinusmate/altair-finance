# Security policy

Netly keeps financial records in an encrypted database on the local machine. Please report vulnerabilities privately until a fix is released. Do not open a public GitHub issue for a security bug.

## Reporting

Email the maintainers, or use GitHub private vulnerability reporting on this repository once it is public. Include steps to reproduce, the affected version, and whether the issue needs a local process, a machine on the same network, or a remote attacker.

## What is in scope

- Reaching `/api` without the per-launch token
- Binding or proxying the local server beyond loopback
- Passphrase brute force that bypasses the shared rate limit
- Distinguishing a wrong passphrase from an unreadable database through the API
- Path traversal or unsafe writes in import and export
- Open redirects in the OAuth relay, including redirects off loopback or onto an unexpected port
- Bank windows receiving the API token, the preload bridge, or the clipboard helper
- Secrets written to logs, crash dialogs, or files in the user-data directory
- Sending the passphrase, or a hash of it, to Finverse, Plaid, or any other provider

## What is out of scope

- A person with access to an unlocked session on the same OS user account
- Physical access to an unlocked computer
- Attacks that require a leaked `.env.local` or provider secret
- Social engineering of the account holder

## Supported setup

The supported way to run Netly is the Electron app, with the server bound to `127.0.0.1` and the OAuth relay allowlist unchanged. Hosting the Next.js app as a public website is not a supported configuration.
