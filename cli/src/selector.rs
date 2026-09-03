// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The `<WINDOW>` selector shared by every command that acts on a window, and
//! the `list` filters.
//!
//! A numeric ID costs no D-Bus call, `focused` costs one `GetFocused`, and the
//! match options cost one `ListDetailed` that the calling command reuses from
//! the context cache. The argument-count check happens before any of that, so
//! a usage error never needs the extension.

use std::fmt;

use crate::fail::{Fail, Result};
use crate::model::{self, Ctx, Window};
use crate::table;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Id,
    Focused,
    Class,
    Title,
    Substring,
    Pid,
}

impl Kind {
    /// The name the extension and the error messages use.
    pub fn name(self) -> &'static str {
        match self {
            Kind::Id => "id",
            Kind::Focused => "focused",
            Kind::Class => "class",
            Kind::Title => "title",
            Kind::Substring => "substring",
            Kind::Pid => "pid",
        }
    }
}

impl fmt::Display for Kind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.name())
    }
}

#[derive(Debug)]
pub struct Selector {
    pub kind: Kind,
    pub value: String,
    /// How many arguments the selector occupied.
    pub shift: usize,
}

pub fn is_window_id(token: &str) -> bool {
    !token.is_empty() && token.chars().all(|c| c.is_ascii_digit())
}

pub fn validate_id(token: &str) -> Result<u64> {
    if !is_window_id(token) {
        return Err(Fail::error("Window ID must be a number"));
    }
    token
        .parse::<u64>()
        .map_err(|_| Fail::error("Window ID must be a number"))
}

/// Map a selector option to its kind. Shared by the resolver and `wait`.
pub fn kind_for_option(option: &str) -> Result<Kind> {
    match option {
        "-c" => Ok(Kind::Class),
        "-t" => Ok(Kind::Title),
        "-s" => Ok(Kind::Substring),
        "-p" => Ok(Kind::Pid),
        _ => Err(Fail::error(format!("Unknown selector option: {option}"))),
    }
}

/// Parse the selector at the front of the argument list. Pure: no D-Bus.
pub fn parse(args: &[String]) -> Result<Selector> {
    let first = args.first().map(String::as_str).unwrap_or("");

    match first {
        "focused" => Ok(Selector {
            kind: Kind::Focused,
            value: String::new(),
            shift: 1,
        }),
        "-c" | "-t" | "-s" | "-p" => {
            if args.len() < 2 {
                return Err(Fail::error(format!("Option {first} requires an argument")));
            }
            let kind = kind_for_option(first)?;
            let value = args[1].clone();
            if kind == Kind::Pid && !is_window_id(&value) {
                return Err(Fail::error("PID must be a number"));
            }
            Ok(Selector {
                kind,
                value,
                shift: 2,
            })
        }
        // A negative number is a bad window ID, not an unknown option. The bash
        // client reached validate_id for it and said so; reporting "Unknown
        // option: -1" instead would be a silent change to a message the suites
        // treat as a frozen contract.
        _ if first.starts_with('-')
            && first.len() > 1
            && first[1..].chars().all(|c| c.is_ascii_digit()) =>
        {
            Err(validate_id(first).expect_err("a negative token is never a valid window ID"))
        }
        _ if first.starts_with('-') => Err(Fail::error(format!("Unknown option: {first}"))),
        _ => {
            validate_id(first)?;
            Ok(Selector {
                kind: Kind::Id,
                value: first.to_string(),
                shift: 1,
            })
        }
    }
}

fn matches(window: &Window, kind: Kind, value: &str) -> bool {
    match kind {
        Kind::Class => model::text(window, "wm_class") == value,
        Kind::Title => model::text(window, "title") == value,
        Kind::Substring => model::text(window, "title").contains(value),
        Kind::Pid => value
            .parse::<i64>()
            .is_ok_and(|pid| model::number(window, "pid") == pid),
        Kind::Id | Kind::Focused => false,
    }
}

/// Pick the single window matching the selector, or explain why that failed.
pub fn select_id(windows: &[Window], kind: Kind, value: &str) -> Result<u64> {
    let found: Vec<&Window> = windows.iter().filter(|w| matches(w, kind, value)).collect();

    if found.is_empty() {
        return Err(Fail::error(format!("No window matches {kind} '{value}'")));
    }

    if found.len() > 1 {
        let rows: Vec<Vec<String>> = found
            .iter()
            .map(|w| {
                vec![
                    model::id(w).to_string(),
                    model::text(w, "wm_class").to_string(),
                    model::text(w, "title").to_string(),
                ]
            })
            .collect();
        let candidates = table::render(&rows);
        return Err(Fail::error(format!(
            "{kind} '{value}' matches {} windows; use an ID:\n{}",
            found.len(),
            candidates.trim_end_matches('\n')
        )));
    }

    Ok(model::id(found[0]))
}

/// Resolve the selector at the front of `args` to a window ID.
///
/// Returns the ID and how many arguments the selector occupied. `usage` is
/// reported when the selector is missing or fewer than `min_after` arguments
/// follow it -- checked before any D-Bus call.
pub fn resolve(
    ctx: &mut Ctx,
    min_after: usize,
    usage: &str,
    args: &[String],
) -> Result<(u64, usize)> {
    if args.is_empty() {
        return Err(Fail::error(usage));
    }
    let selector = parse(args)?;
    if args.len() - selector.shift < min_after {
        return Err(Fail::error(usage));
    }

    let id = match selector.kind {
        Kind::Id => validate_id(&selector.value)?,
        Kind::Focused => {
            let (id, _, _) = ctx.bus.get_focused()?;
            if id == 0 {
                return Err(Fail::error("No window focused"));
            }
            id
        }
        kind => {
            let windows = ctx.windows()?;
            select_id(&windows, kind, &selector.value)?
        }
    };

    Ok((id, selector.shift))
}

/// Apply the `list` filters. A workspace filter keeps sticky windows, which are
/// visible on every workspace; a monitor filter does not, because a sticky
/// window still lives on one monitor.
pub fn filter(
    windows: &[Window],
    workspace: Option<i64>,
    monitor: Option<i64>,
    class: Option<&str>,
) -> Vec<Window> {
    windows
        .iter()
        .filter(|w| {
            workspace.is_none_or(|ws| {
                model::number(w, "workspace_index") == ws || model::flag(w, "is_on_all_workspaces")
            }) && monitor.is_none_or(|mon| model::number(w, "monitor_index") == mon)
                && class.is_none_or(|c| model::text(w, "wm_class") == c)
        })
        .cloned()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    // Fixture: three windows; id 3 is sticky (workspace_index -1, on all
    // workspaces). Same fixture the bash suite used in tests/test-logic.sh.
    const WINDOWS: &str = r#"[
     {"id":1,"title":"Doc A","wm_class":"kitty","pid":100,"workspace_index":0,"monitor_index":0,"is_on_all_workspaces":false},
     {"id":2,"title":"Doc B","wm_class":"kitty","pid":200,"workspace_index":1,"monitor_index":1,"is_on_all_workspaces":false},
     {"id":3,"title":"Mail","wm_class":"thunderbird","pid":300,"workspace_index":-1,"monitor_index":0,"is_on_all_workspaces":true}
    ]"#;

    fn fixture() -> Vec<Value> {
        serde_json::from_str(WINDOWS).unwrap()
    }

    fn ids(windows: &[Window]) -> Vec<u64> {
        windows.iter().map(model::id).collect()
    }

    fn args(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn option_to_kind() {
        assert_eq!(kind_for_option("-c").unwrap(), Kind::Class);
        assert_eq!(kind_for_option("-t").unwrap(), Kind::Title);
        assert_eq!(kind_for_option("-s").unwrap(), Kind::Substring);
        assert_eq!(kind_for_option("-p").unwrap(), Kind::Pid);
        assert!(kind_for_option("-x").is_err());
    }

    #[test]
    fn parse_id_and_focused_occupy_one_argument() {
        let selector = parse(&args(&["12345", "left"])).unwrap();
        assert_eq!(selector.kind, Kind::Id);
        assert_eq!(selector.value, "12345");
        assert_eq!(selector.shift, 1);

        let selector = parse(&args(&["focused"])).unwrap();
        assert_eq!(selector.kind, Kind::Focused);
        assert_eq!(selector.shift, 1);
    }

    #[test]
    fn parse_match_options_occupy_two_arguments() {
        let selector = parse(&args(&["-c", "kitty", "left"])).unwrap();
        assert_eq!(
            (selector.kind, selector.value.as_str(), selector.shift),
            (Kind::Class, "kitty", 2)
        );

        let selector = parse(&args(&["-t", "My Doc - Editor", "1", "2"])).unwrap();
        assert_eq!(
            (selector.kind, selector.value.as_str(), selector.shift),
            (Kind::Title, "My Doc - Editor", 2)
        );

        let selector = parse(&args(&["-s", "Doc"])).unwrap();
        assert_eq!(
            (selector.kind, selector.value.as_str(), selector.shift),
            (Kind::Substring, "Doc", 2)
        );

        let selector = parse(&args(&["-p", "4242"])).unwrap();
        assert_eq!(
            (selector.kind, selector.value.as_str(), selector.shift),
            (Kind::Pid, "4242", 2)
        );
    }

    #[test]
    fn parse_rejects_bad_selectors() {
        assert_eq!(
            parse(&args(&["-p", "abc"])).unwrap_err().to_string(),
            "PID must be a number"
        );
        assert_eq!(
            parse(&args(&["-c"])).unwrap_err().to_string(),
            "Option -c requires an argument"
        );
        assert_eq!(
            parse(&args(&["-x", "foo"])).unwrap_err().to_string(),
            "Unknown option: -x"
        );
        assert_eq!(
            parse(&args(&["abc"])).unwrap_err().to_string(),
            "Window ID must be a number"
        );
        assert_eq!(
            parse(&args(&[""])).unwrap_err().to_string(),
            "Window ID must be a number"
        );
    }

    #[test]
    fn select_unique_matches() {
        let windows = fixture();
        assert_eq!(select_id(&windows, Kind::Class, "thunderbird").unwrap(), 3);
        assert_eq!(select_id(&windows, Kind::Title, "Doc B").unwrap(), 2);
        assert_eq!(select_id(&windows, Kind::Substring, "Mai").unwrap(), 3);
        assert_eq!(select_id(&windows, Kind::Pid, "200").unwrap(), 2);
    }

    #[test]
    fn select_reports_ambiguity_with_candidates() {
        let windows = fixture();
        let err = select_id(&windows, Kind::Class, "kitty")
            .unwrap_err()
            .to_string();
        assert!(err.contains("matches 2 windows"), "{err}");
        assert!(err.contains("use an ID:"), "{err}");
        assert!(err.contains("Doc A"), "{err}");
        assert!(err.contains("Doc B"), "{err}");

        assert!(select_id(&windows, Kind::Substring, "Doc").is_err());
    }

    #[test]
    fn select_reports_no_match() {
        let windows = fixture();
        let err = select_id(&windows, Kind::Class, "nope")
            .unwrap_err()
            .to_string();
        assert_eq!(err, "No window matches class 'nope'");
    }

    #[test]
    fn filters() {
        let windows = fixture();
        assert_eq!(ids(&filter(&windows, None, None, None)), vec![1, 2, 3]);
        // A workspace filter includes sticky windows.
        assert_eq!(ids(&filter(&windows, Some(1), None, None)), vec![2, 3]);
        assert_eq!(ids(&filter(&windows, Some(0), None, None)), vec![1, 3]);
        assert_eq!(ids(&filter(&windows, None, Some(0), None)), vec![1, 3]);
        assert_eq!(
            ids(&filter(&windows, None, None, Some("kitty"))),
            vec![1, 2]
        );
        // Filters combine with AND.
        assert_eq!(
            ids(&filter(&windows, Some(0), None, Some("kitty"))),
            vec![1]
        );
        // An unknown workspace keeps only the sticky windows.
        assert_eq!(ids(&filter(&windows, Some(7), None, None)), vec![3]);
    }
}
