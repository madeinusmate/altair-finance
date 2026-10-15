# The Next server is the books owner

The `netly` command and the window both talk to the existing local Next.js server, and that server is the only process with the books open. After an agent grant, a login item starts it at login and quitting the window leaves it running. The command does not open the books file itself, and there is no second protocol beside the routes the window already uses.
