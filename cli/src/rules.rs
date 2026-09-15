// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The rules.json document format: parsing, validation and the resolved shape
//! of one rule.
//!
//! This is a SECOND implementation of a grammar the extension already has in
//! `window-control@carlo9890.github.io/rules-format.js`. That is deliberate --
//! `wctl` cannot load GJS, and the whole point of `wctl rules check` is to give
//! the same verdict without a running shell. The two are kept honest by
//! `tests/vectors/rules-spec.json`, which both read: the `rules_spec_vectors`
//! test below asserts every case, and `tests/check-rules-format.js` asserts the
//! same ones against the extension.
//!
//! So the error strings here are not this file's to choose. They are the
//! extension's messages, reproduced exactly, and `docs/specs/RULES-JSON.md` is
//! the normative definition of both. Change one, change all four.
//!
//! The action tokens are NOT revalidated here: `geometry::resolve_place_rect`
//! and `geometry::tile_cells` already own that grammar for `wctl place` and
//! `wctl tile`, and a rule must accept exactly what those accept.

use serde_json::{Map, Value};

use crate::geometry::{self, Rect};

/// The workarea `place` tokens are resolved against at validation time, so a
/// grammar error is reported when the file is read rather than when a window
/// first appears. Mirrors PROBE_WORKAREA in rules-format.js.
pub const PROBE_WORKAREA: Rect = Rect {
    x: 0,
    y: 0,
    width: 1000,
    height: 1000,
};

/// Every key a rule object may carry, in the order the message lists them.
pub const RULE_KEYS: [&str; 6] = ["match", "place", "tile", "center", "workspace", "monitor"];

/// Every `match` key, mapped to the selector kind it means.
pub const MATCH_KEYS: [(&str, &str); 3] = [
    ("class", "class"),
    ("title", "title"),
    ("substr", "substring"),
];

pub const CENTER_AXES: [&str; 3] = ["horizontal", "vertical", "both"];

/// The tile positions, in grid order. `geometry::tile_cells` decides which are
/// valid; this list only builds the message, which names them in this order.
pub const TILE_POSITIONS: [&str; 9] = [
    "top-left",
    "top-center",
    "top-right",
    "left",
    "center",
    "right",
    "bottom-left",
    "bottom-center",
    "bottom-right",
];

/// One `match` predicate: a selector kind and the value it compares against.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Match {
    /// The rules.json key: `class`, `title` or `substr`.
    pub key: String,
    /// The selector kind it maps to: `class`, `title` or `substring`.
    pub kind: String,
    pub value: String,
}

/// The geometry action of a rule, if it has one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Action {
    Place([String; 4]),
    Tile(String),
    Center(String),
}

/// One validated rule.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Rule {
    pub matches: Vec<Match>,
    pub action: Option<Action>,
    pub workspace: Option<i64>,
    pub monitor: Option<i64>,
}

impl Rule {
    /// Does every predicate hold for this window? An empty match list is
    /// impossible -- validation refuses it -- so this is never vacuously true.
    pub fn matches_window(&self, wm_class: &str, title: &str) -> bool {
        self.matches.iter().all(|m| match m.kind.as_str() {
            "class" => wm_class == m.value,
            "title" => title == m.value,
            "substring" => title.contains(&m.value),
            _ => false,
        })
    }

    /// The rectangle this rule's action resolves to on a workarea, or None
    /// when it has no geometry action. `frame` is the window's current frame,
    /// which only `center` reads.
    pub fn resolve(&self, workarea: Rect, frame: Rect) -> Option<Rect> {
        match self.action.as_ref()? {
            Action::Place(tokens) => {
                let refs = [
                    tokens[0].as_str(),
                    tokens[1].as_str(),
                    tokens[2].as_str(),
                    tokens[3].as_str(),
                ];
                geometry::resolve_place_rect(refs, workarea).ok()
            }
            Action::Tile(position) => geometry::tile_cells(position)
                .ok()
                .map(|cells| geometry::tile_rect(cells, workarea)),
            Action::Center(axis) => Some(center_rect(axis, frame, workarea)),
        }
    }
}

/// The centring formula `center` shares with `place center`. Mirrors
/// centerRect in rules-format.js.
pub fn center_rect(axis: &str, frame: Rect, workarea: Rect) -> Rect {
    let horizontal = axis == "horizontal" || axis == "both";
    let vertical = axis == "vertical" || axis == "both";
    Rect {
        x: if horizontal {
            workarea.x + (workarea.width - frame.width) / 2
        } else {
            frame.x
        },
        y: if vertical {
            workarea.y + (workarea.height - frame.height) / 2
        } else {
            frame.y
        },
        width: frame.width,
        height: frame.height,
    }
}

/// A `place` token as JavaScript's `String()` would render it.
///
/// rules-format.js does `tokens.map(String)` before matching the token
/// grammar, so `"place": [0, 0, 800, 600]` is as valid as the string form.
/// Reproducing that conversion is what makes the two agree on a document with
/// JSON numbers in it.
///
/// Only integer-valued numbers can produce a valid token: every other shape
/// fails the `^[1-9][0-9]*$` and `^-?[0-9]+$` grammars in both languages, so
/// the fallbacks need only be unambiguously invalid, not byte-identical to V8.
fn js_string(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        Value::Number(number) => {
            if let Some(int) = number.as_i64() {
                return int.to_string();
            }
            match number.as_f64() {
                // JSON's 800.0 parses to the same JS number as 800, and
                // String() renders it "800". serde_json would say "800.0".
                Some(float) if float.fract() == 0.0 && float.abs() < 1e21 => {
                    format!("{}", float as i64)
                }
                _ => number.to_string(),
            }
        }
        Value::Bool(true) => "true".to_string(),
        Value::Bool(false) => "false".to_string(),
        Value::Null => "null".to_string(),
        Value::Array(_) => "[array]".to_string(),
        Value::Object(_) => "[object Object]".to_string(),
    }
}

fn place_usage(label: &str) -> String {
    format!(
        "{label}.place: X is a number or left|center|right, \
         Y a number or top|center|bottom, \
         WIDTH and HEIGHT a positive number or a percentage"
    )
}

/// Validate a `workspace` or `monitor` index. Absent is Ok(None).
fn compile_index(rule: &Map<String, Value>, key: &str, label: &str) -> Result<Option<i64>, String> {
    let Some(value) = rule.get(key) else {
        return Ok(None);
    };
    // as_i64 is None for a float, so 1.5 and 1e300 are both refused here the
    // way Number.isInteger refuses them.
    match value.as_i64() {
        Some(index) if index >= 0 => Ok(Some(index)),
        _ => Err(format!("{label}.{key}: must be a non-negative integer")),
    }
}

/// Validate one rule, or return the message naming the offending key.
///
/// The order of the checks is part of the contract: a document with two
/// problems must report the same one the extension reports.
pub fn compile_rule(rule: &Value, index: usize) -> Result<Rule, String> {
    let label = format!("rules[{index}]");
    let Some(rule) = rule.as_object() else {
        return Err(format!("{label}: must be an object"));
    };

    for key in rule.keys() {
        if !RULE_KEYS.contains(&key.as_str()) {
            return Err(format!(
                "{label}.{key}: unknown key (use {})",
                RULE_KEYS.join(", ")
            ));
        }
    }

    let Some(match_block) = rule.get("match").and_then(Value::as_object) else {
        return Err(format!("{label}.match: must be an object"));
    };

    let mut matches = Vec::new();
    for (key, value) in match_block {
        let Some((_, kind)) = MATCH_KEYS.iter().find(|(name, _)| name == key) else {
            return Err(format!(
                "{label}.match.{key}: unknown key (use class, title, substr)"
            ));
        };
        let Some(text) = value.as_str() else {
            return Err(format!("{label}.match.{key}: must be a string"));
        };
        if text.is_empty() {
            return Err(format!("{label}.match.{key}: must not be empty"));
        }
        matches.push(Match {
            key: key.clone(),
            kind: (*kind).to_string(),
            value: text.to_string(),
        });
    }
    if matches.is_empty() {
        return Err(format!(
            "{label}.match: must name at least one of class, title, substr"
        ));
    }

    let present: Vec<&str> = ["place", "tile", "center"]
        .into_iter()
        .filter(|key| rule.contains_key(*key))
        .collect();
    if present.len() > 1 {
        return Err(format!(
            "{label}: place, tile and center are mutually exclusive"
        ));
    }

    let action = if let Some(place) = rule.get("place") {
        let tokens = place
            .as_array()
            .filter(|items| items.len() == 4)
            .ok_or_else(|| format!("{label}.place: must be [X, Y, WIDTH, HEIGHT]"))?;
        let tokens: [String; 4] = [
            js_string(&tokens[0]),
            js_string(&tokens[1]),
            js_string(&tokens[2]),
            js_string(&tokens[3]),
        ];
        let refs = [
            tokens[0].as_str(),
            tokens[1].as_str(),
            tokens[2].as_str(),
            tokens[3].as_str(),
        ];
        // Resolved against the probe workarea, not merely pattern-matched, so
        // a percentage that cannot produce a pixel is caught here too.
        geometry::resolve_place_rect(refs, PROBE_WORKAREA).map_err(|_| place_usage(&label))?;
        Some(Action::Place(tokens))
    } else if let Some(tile) = rule.get("tile") {
        let position = tile
            .as_str()
            .filter(|position| geometry::tile_cells(position).is_ok())
            .ok_or_else(|| format!("{label}.tile: must be one of {}", TILE_POSITIONS.join(", ")))?;
        Some(Action::Tile(position.to_string()))
    } else if let Some(center) = rule.get("center") {
        let axis = center
            .as_str()
            .filter(|axis| CENTER_AXES.contains(axis))
            .ok_or_else(|| format!("{label}.center: must be one of {}", CENTER_AXES.join(", ")))?;
        Some(Action::Center(axis.to_string()))
    } else {
        None
    };

    let workspace = compile_index(rule, "workspace", &label)?;
    let monitor = compile_index(rule, "monitor", &label)?;
    if action.is_none() && workspace.is_none() && monitor.is_none() {
        return Err(format!(
            "{label}: has nothing to do (add place, tile, center, workspace or monitor)"
        ));
    }

    Ok(Rule {
        matches,
        action,
        workspace,
        monitor,
    })
}

/// Validate a whole parsed document.
///
/// The first problem wins and nothing is returned: a file with one bad rule
/// loads no rules at all in the extension, so a check that reported the rest as
/// usable would be lying about what the shell will do with the file.
pub fn compile_rules(document: &Value) -> Result<Vec<Rule>, String> {
    let Some(rules) = document.as_array() else {
        return Err("the top-level value must be an array of rules".to_string());
    };
    rules
        .iter()
        .enumerate()
        .map(|(index, rule)| compile_rule(rule, index))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The shared vectors, read from the repository rather than restated here:
    /// tests/check-rules-format.js asserts the same file against the
    /// extension's implementation, and that is the whole point of it.
    fn vectors() -> Value {
        let path = concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../tests/vectors/rules-spec.json"
        );
        let text =
            std::fs::read_to_string(path).unwrap_or_else(|e| panic!("cannot read {path}: {e}"));
        serde_json::from_str(&text).expect("the vectors are valid JSON")
    }

    fn rect(value: &Value) -> Rect {
        Rect {
            x: value["x"].as_i64().unwrap(),
            y: value["y"].as_i64().unwrap(),
            width: value["width"].as_i64().unwrap(),
            height: value["height"].as_i64().unwrap(),
        }
    }

    /// The geometry vectors, through the same `Rule::resolve` a rule uses.
    /// `geometry.rs` pins these numbers too, from its own unit tests; this
    /// asserts the rules layer reaches them rather than its own arithmetic.
    #[test]
    fn geometry_vectors() {
        let vectors = vectors();

        for case in vectors["geometry"]["place"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let tokens: Vec<String> = case["tokens"]
                .as_array()
                .unwrap()
                .iter()
                .map(js_string)
                .collect();
            let rule = Rule {
                matches: vec![],
                action: Some(Action::Place([
                    tokens[0].clone(),
                    tokens[1].clone(),
                    tokens[2].clone(),
                    tokens[3].clone(),
                ])),
                workspace: None,
                monitor: None,
            };
            assert_eq!(
                rule.resolve(rect(&case["workarea"]), PROBE_WORKAREA),
                Some(rect(&case["rect"])),
                "place: {name}"
            );
        }

        for group in vectors["geometry"]["tile"].as_array().unwrap() {
            let workarea = rect(&group["workarea"]);
            for (position, expected) in group["cells"].as_object().unwrap() {
                let rule = Rule {
                    matches: vec![],
                    action: Some(Action::Tile(position.clone())),
                    workspace: None,
                    monitor: None,
                };
                assert_eq!(
                    rule.resolve(workarea, PROBE_WORKAREA),
                    Some(rect(expected)),
                    "tile: {position}"
                );
            }
        }

        for case in vectors["geometry"]["center"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let rule = Rule {
                matches: vec![],
                action: Some(Action::Center(case["axis"].as_str().unwrap().to_string())),
                workspace: None,
                monitor: None,
            };
            assert_eq!(
                rule.resolve(rect(&case["workarea"]), rect(&case["frame"])),
                Some(rect(&case["rect"])),
                "center: {name}"
            );
        }
    }

    /// The match vectors, against `Rule::matches_window`. `pid` is not a
    /// rules.json key, so only the three that are reach this.
    #[test]
    fn match_vectors() {
        let vectors = vectors();
        for case in vectors["match"]["cases"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let kind = case["kind"].as_str().unwrap();
            if kind == "pid" {
                continue;
            }
            let rule = Rule {
                matches: vec![Match {
                    key: kind.to_string(),
                    kind: kind.to_string(),
                    value: case["value"].as_str().unwrap().to_string(),
                }],
                action: Some(Action::Tile("left".to_string())),
                workspace: None,
                monitor: None,
            };
            // A null class or title is the empty string on the wire: the
            // extension's document carries "" for a window with neither.
            let window = &case["window"];
            assert_eq!(
                rule.matches_window(
                    window["wm_class"].as_str().unwrap_or(""),
                    window["title"].as_str().unwrap_or(""),
                ),
                case["matches"].as_bool().unwrap(),
                "match: {name}"
            );
        }
    }

    /// Every validation case in the shared vectors, verdict and message.
    ///
    /// This is the parity gate. A message reworded here without being reworded
    /// in rules-format.js (and in the vectors, and in the spec) fails here.
    #[test]
    fn rules_spec_vectors() {
        let vectors = vectors();
        let cases = vectors["validation"].as_array().expect("validation cases");
        assert!(cases.len() > 40, "the vector file looks truncated");

        for case in cases {
            let name = case["name"].as_str().unwrap();
            let result = compile_rules(&case["document"]);
            let expected_valid = case["valid"].as_bool().unwrap();

            match (result, expected_valid) {
                (Ok(rules), true) => {
                    let expected = case["document"].as_array().map_or(0, Vec::len);
                    assert_eq!(rules.len(), expected, "{name}: rule count");
                }
                (Ok(_), false) => panic!(
                    "{name}: expected it to be refused with: {}",
                    case["message"].as_str().unwrap()
                ),
                (Err(message), true) => {
                    panic!("{name}: expected it to be accepted, got: {message}")
                }
                (Err(message), false) => {
                    assert_eq!(message, case["message"].as_str().unwrap(), "{name}");
                }
            }
        }
    }

    /// The geometry vectors, through the same `Rule::resolve` a rule uses.
    #[test]
    fn js_string_renders_numbers_the_way_javascript_does() {
        assert_eq!(js_string(&serde_json::json!(800)), "800");
        assert_eq!(js_string(&serde_json::json!(-50)), "-50");
        assert_eq!(js_string(&serde_json::json!(800.0)), "800");
        assert_eq!(js_string(&serde_json::json!("50%")), "50%");
        assert_eq!(js_string(&serde_json::json!(null)), "null");
        assert_eq!(js_string(&serde_json::json!(true)), "true");
    }

    /// A JSON number and its string form must produce the same verdict, which
    /// is the only reason js_string exists.
    #[test]
    fn place_accepts_json_numbers_and_strings_alike() {
        let numbers = serde_json::json!([{"match": {"class": "a"}, "place": [0, 0, 800, 600]}]);
        let strings =
            serde_json::json!([{"match": {"class": "a"}, "place": ["0", "0", "800", "600"]}]);
        assert_eq!(
            compile_rules(&numbers).unwrap(),
            compile_rules(&strings).unwrap()
        );
    }

    /// The whole file is refused, not just the bad rule.
    #[test]
    fn one_bad_rule_refuses_the_whole_document() {
        let document = serde_json::json!([
            {"match": {"class": "a"}, "tile": "left"},
            {"match": {"class": "b"}, "tile": "nowhere"},
        ]);
        assert!(compile_rules(&document).is_err());
    }
}
