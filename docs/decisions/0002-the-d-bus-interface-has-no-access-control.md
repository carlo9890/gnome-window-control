# 0002: The D-Bus interface has no access control

Processes of the same user have no trust boundary on the session bus, so no mechanism inside the
extension can keep a caller out. `docs/user-guide/security.md` states the exposure, and the user
decides whether to enable the extension.

Rejected: an allowlist keyed on the caller's PID, because the caller is whatever program invoked
the client, and the confused deputy defeats it.

Rejected: a shared secret in a file, because anything that can read the user's files can read it.
