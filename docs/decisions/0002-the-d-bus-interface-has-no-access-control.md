# 0002: The D-Bus interface has no access control

Processes of one user have no trust boundary on the session bus, so nothing inside the extension
can keep a caller out. `docs/user-guide/security.md` states the exposure, and the user decides
whether to enable the extension.

Rejected: a PID allowlist, because the caller is whatever program ran the client (confused deputy).

Rejected: a shared secret in a file, because anything that reads the user's files reads it.
