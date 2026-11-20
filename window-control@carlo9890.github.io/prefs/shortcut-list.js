// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// The shortcut rows of the preferences window, in numpad order, and the rule
// for a key the capture accepts. Imports nothing, so a plain gjs check can
// test it.

export const SHORTCUT_GROUPS = [
    {
        title: 'Tile the Focused Window',
        description: 'The 4x2 grid that rules.json and wctl tile use',
        keys: [
            ['tile-top-left', 'Top Left'],
            ['tile-top-center', 'Top Center'],
            ['tile-top-right', 'Top Right'],
            ['tile-left', 'Left'],
            ['tile-center', 'Center'],
            ['tile-right', 'Right'],
            ['tile-bottom-left', 'Bottom Left'],
            ['tile-bottom-center', 'Bottom Center'],
            ['tile-bottom-right', 'Bottom Right'],
            ['cycle-wide', 'Wide Right, Then Wide Left'],
        ],
    },
    {
        title: 'Rules',
        keys: [
            ['apply-rules', 'Apply Rules Again to All Windows'],
        ],
    },
];

// GNOME Shell takes a bound key from every app, so a key without a modifier
// other than Shift would stop that key from typing anywhere.
export function needsModifier(mods, shiftMask) {
    return (mods & ~shiftMask) === 0;
}
