# Security

Report a vulnerability through [GitHub private security advisories](https://github.com/madeinusmate/altair/security/advisories/new) on this repository.

Altair keeps financial records in an encrypted database on the local machine. Please report vulnerabilities privately until a fix is released. Do not open a public GitHub issue for a security bug.

Leave secrets out of issues and pull requests. That includes passphrases, the per-launch API token, `.env.local`, and `OPENAI_API_KEY`.

Include steps to reproduce, the affected version, and whether the issue needs a local process, a machine on the same network, or a remote attacker.

## What is in scope

- Reaching `/api` without the per-launch token
- Binding or proxying the local server beyond loopback
- Passphrase brute force that bypasses the shared rate limit
- Distinguishing a wrong passphrase from an unreadable database through the API
- Path traversal or unsafe writes in import and export
- Secrets written to logs, crash dialogs, or files in the user-data directory

## What is out of scope

- A person with access to an unlocked session on the same OS user account
- Physical access to an unlocked computer
- Attacks that require a leaked `.env.local`
- Social engineering of the account holder

## Supported setup

The supported way to run Altair is the Electron app, with the server bound to `127.0.0.1`. Hosting the Next.js app as a public website is not a supported configuration.
