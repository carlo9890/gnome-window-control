// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
// Validation for the rules editor: the extension's own compileRules, plus the
// line the first error is on, so the editor can mark it. Imports only
// rules-format.js, which imports nothing.

import { compileRules } from '../rules-format.js';

export function rulesLabel(count) {
    return count === 1 ? '1 rule' : `${count} rules`;
}

// The subtitle of a drop-in file's row.
export function ruleSummary(text) {
    const result = checkRules(text);
    return result.ok ? rulesLabel(result.count) : result.message;
}

// { ok: true, count } or { ok: false, message, line }, with `line` 1-based, or
// null when the message names no place in the text.
export function checkRules(text) {
    try {
        return { ok: true, count: compileRules(text).length };
    } catch (e) {
        return { ok: false, message: e.message, line: errorLine(text, e.message) };
    }
}

function errorLine(text, message) {
    const json = /at line (\d+) column \d+/.exec(message);
    if (json)
        return Number(json[1]);
    const rule = /^rules\[(\d+)\]/.exec(message);
    if (rule) {
        const offset = elementOffsets(text)[Number(rule[1])];
        if (offset !== undefined)
            return text.slice(0, offset).split('\n').length;
    }
    return null;
}

// The offset of each element of the top-level array. Called only on text that
// JSON.parse accepted.
export function elementOffsets(text) {
    const offsets = [];
    let depth = 0;
    let inString = false;
    let escaped = false;
    let expectElement = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inString) {
            if (escaped)
                escaped = false;
            else if (c === '\\')
                escaped = true;
            else if (c === '"')
                inString = false;
            continue;
        }
        if (/\s/.test(c))
            continue;
        if (depth === 1 && expectElement) {
            expectElement = false;
            if (c !== ']')
                offsets.push(i);
        }
        if (c === '"') {
            inString = true;
        } else if (c === '[' || c === '{') {
            depth++;
            if (depth === 1)
                expectElement = true;
        } else if (c === ']' || c === '}') {
            depth--;
        } else if (c === ',' && depth === 1) {
            expectElement = true;
        }
    }
    return offsets;
}
