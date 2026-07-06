# Releasing

**All releases MUST be created with the release script** — never by hand via
`gh release create` or the web UI.

```bash
./scripts/release.sh
```

The script guarantees all three assets are attached (extension zip, `wctl`,
`install-wctl.sh`), that the `metadata.json` and `wctl` versions match, that git
tags exist and are pushed, and that the release notes come from `CHANGELOG.md`.

## Release checklist

1. Update the version in `window-control@hko9890/metadata.json`.
2. Move the `CHANGELOG.md` `Unreleased` section under a new `vN` heading.
3. Commit: `git commit -am "chore: bump version to vN"`.
4. Tag: `git tag vN`.
5. Push: `git push && git push --tags`.
6. Run: `./scripts/release.sh`.

## Version format

Releases, git tags, and CHANGELOG entries use the integer form `vN` (e.g. `v7`).
`wctl --version` reports the zero-padded `0.N.0` form (e.g. `0.7.0`) for the same
release; `scripts/release.sh` enforces the `0.<N>.0 ↔ vN` mapping. So
`wctl --version` reporting `0.7.0` corresponds to GitHub release/tag `v7`.

## Automated releases (CI)

`.github/workflows/build.yml` has a `release` job that runs on every push to
`main` and **auto-creates the GitHub release** for the current `metadata.json`
version if one does not already exist. `release.sh` remains authoritative — it
publishes proper CHANGELOG-derived notes and all validated assets, and overwrites
any release CI created for the same tag.

The "do not create releases manually" rule refers to the web UI and ad-hoc
`gh release create`; it does not describe the CI job. Keep the two paths in sync.
