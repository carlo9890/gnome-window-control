# 0008: A client learns what the extension supports from a capability name

`GetCapabilities` reports a list of feature names. `wctl` asks for the name before it calls a
feature that the oldest extension it works with does not have.

Rejected: gating a call on a version number, because an extension before v25 installed from
extensions.gnome.org reports that site's upload number, which is not this project's release number.
