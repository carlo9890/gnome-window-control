// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//
// The parts the gjs checks share: the repository root, the check tally and
// the report. It imports only gi://GLib, so check-rules-format.js still loads
// without the mutter typelib.

import GLib from 'gi://GLib';

export const ROOT = GLib.path_get_dirname(GLib.path_get_dirname(
    GLib.filename_from_uri(import.meta.url)[0]));

let passed = 0;
const failures = [];

export function check(name, condition, detail) {
    if (condition) {
        passed += 1;
        return;
    }
    failures.push(detail ? `${name}\n    ${detail}` : name);
}

// Print the tally. Exits 1 when any check failed.
export function report() {
    if (failures.length > 0) {
        print(`FAIL  ${failures.length} of ${passed + failures.length} checks failed\n`);
        for (const failure of failures)
            print(`  - ${failure}`);
        print('');
        imports.system.exit(1);
    }

    print(`PASS  ${passed} checks`);
}
