# 0006: One extension serves GNOME Shell 45 to 50

GNOME 49 removed part of the maximize API. The extension tests for the old API at run time, so one
code base runs on each version. shexli, the analyzer of extensions.gnome.org, reports the old calls
as errors on each run.

Rejected: narrowing `shell-version` to 45-48 to clear the findings, because it drops the users of
GNOME 49 and 50, and `shell-version` cannot widen again without a new review.
