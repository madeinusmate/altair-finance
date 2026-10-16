# Altair

Altair is a personal finance app whose books stay on this computer.

## Language

**Books**:
The encrypted ledger on this Mac.
_Avoid_: database, vault

**Passphrase**:
The secret you type in Altair to open the books. An agent grant keeps a keychain copy for the books owner. The agent never receives it.
_Avoid_: password, encryption key

**Books owner**:
The one local server that holds the books open. The window and the altair command both talk to it.
_Avoid_: daemon, local API

**Agent grant**:
Permission for this macOS user to use the altair command. There is one grant. It starts the books owner at login and leaves the books open for that login session.
_Avoid_: connection, API key

**Intent confirm**:
A macOS dialog the person at the Mac must answer before the books are deleted, an account is deleted, or the books are exported. The calling program cannot answer it.
_Avoid_: prompt, --yes
