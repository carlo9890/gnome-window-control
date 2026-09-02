// SPDX-FileCopyrightText: 2026 hko9890
// SPDX-License-Identifier: MIT
//! The read-only commands: list, focused, info, workspaces, monitors.

use std::io::IsTerminal;

use serde_json::Value;

use crate::commands::{cell, parse_json_flag};
use crate::fail::{Fail, Result};
use crate::model::{self, Ctx, Window};
use crate::selector;
use crate::table;

const BOLD: &str = "\x1b[1m";
const RESET: &str = "\x1b[0m";

/// Print a table, emboldening the header line when stdout is a terminal.
fn print_table(rows: &[Vec<String>]) {
    let rendered = table::render(rows);
    if !std::io::stdout().is_terminal() {
        print!("{rendered}");
        return;
    }
    let mut lines = rendered.lines();
    if let Some(header) = lines.next() {
        println!("{BOLD}{header}{RESET}");
    }
    for line in lines {
        println!("{line}");
    }
}

fn workspace_cell(window: &Window) -> String {
    let index = model::number(window, "workspace_index");
    if index == -1 {
        "all".to_string()
    } else {
        index.to_string()
    }
}

pub fn list(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let mut json_output = false;
    let mut workspace: Option<i64> = None;
    let mut monitor: Option<i64> = None;
    let mut class: Option<String> = None;

    let mut index = 0;
    while index < args.len() {
        let arg = args[index].as_str();
        match arg {
            "--json" => {
                json_output = true;
                index += 1;
            }
            "--workspace" | "--monitor" | "--class" => {
                let value = args
                    .get(index + 1)
                    .ok_or_else(|| Fail::error(format!("Option {arg} requires an argument")))?;
                match arg {
                    "--workspace" => {
                        if !selector::is_window_id(value) {
                            return Err(Fail::error("Workspace index must be a number"));
                        }
                        workspace = value.parse::<i64>().ok();
                    }
                    "--monitor" => {
                        if !selector::is_window_id(value) {
                            return Err(Fail::error("Monitor index must be a number"));
                        }
                        monitor = value.parse::<i64>().ok();
                    }
                    _ => class = Some(value.clone()),
                }
                index += 2;
            }
            other if other.starts_with('-') => {
                return Err(Fail::error(format!("Unknown option: {other}")))
            }
            other => return Err(Fail::error(format!("Unexpected argument: {other}"))),
        }
    }

    let windows = ctx.windows()?;
    let windows = selector::filter(&windows, workspace, monitor, class.as_deref());

    if json_output {
        println!("{}", Value::Array(windows));
        return Ok(());
    }

    if windows.is_empty() {
        println!("No windows found.");
        return Ok(());
    }

    let mut rows = vec![vec![
        "ID".into(),
        "TITLE".into(),
        "CLASS".into(),
        "WS".into(),
        "MON".into(),
        "F".into(),
    ]];
    for window in &windows {
        rows.push(vec![
            model::id(window).to_string(),
            table::truncate(model::text(window, "title"), 35, 32),
            model::text(window, "wm_class").to_string(),
            workspace_cell(window),
            model::number(window, "monitor_index").to_string(),
            if model::flag(window, "has_focus") {
                "*"
            } else {
                ""
            }
            .to_string(),
        ]);
    }
    print_table(&rows);
    Ok(())
}

pub fn focused(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let json_output = parse_json_flag(args)?;

    let windows = ctx.windows()?;
    let Some(window) = windows.iter().find(|w| model::flag(w, "has_focus")) else {
        println!("No window focused");
        return Ok(());
    };

    print_window(window, json_output);
    Ok(())
}

pub fn info(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let usage = "Usage: wctl info <WINDOW> [--json]";
    let (id, shift) = selector::resolve(ctx, 0, usage, args)?;
    let json_output = parse_json_flag(&args[shift..])?;

    let windows = ctx.windows()?;
    let Some(window) = windows.iter().find(|w| model::id(w) == id) else {
        // The bash client printed this one on stdout, not through die().
        return Err(Fail::plain(format!("Window not found: {id}")));
    };

    print_window(window, json_output);
    Ok(())
}

fn print_window(window: &Window, json_output: bool) {
    if json_output {
        println!(
            "{}",
            serde_json::to_string_pretty(window).unwrap_or_else(|_| window.to_string())
        );
        return;
    }

    let (x, y, width, height) = model::frame_rect(window);
    let mut states = Vec::new();
    for (key, name) in [
        ("is_maximized", "maximized"),
        ("is_minimized", "minimized"),
        ("is_fullscreen", "fullscreen"),
        ("is_above", "above"),
        ("is_on_all_workspaces", "sticky"),
    ] {
        if model::flag(window, key) {
            states.push(name);
        }
    }
    let states = if states.is_empty() {
        "none".to_string()
    } else {
        states.join(", ")
    };

    println!("Window:    {}", model::id(window));
    println!("Title:     {}", model::text(window, "title"));
    println!("Class:     {}", model::text(window, "wm_class"));
    println!("Instance:  {}", model::text(window, "wm_class_instance"));
    println!("PID:       {}", model::number(window, "pid"));
    println!("Workspace: {}", workspace_cell(window));
    println!("Monitor:   {}", model::number(window, "monitor_index"));
    println!(
        "Focused:   {}",
        if model::flag(window, "has_focus") {
            "yes"
        } else {
            "no"
        }
    );
    println!("Position:  {x}, {y}");
    println!("Size:      {width} x {height}");
    println!("States:    {states}");
}

pub fn workspaces(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let json_output = parse_json_flag(args)?;
    let json = ctx.bus.call_json("ListWorkspaces")?;

    if json_output {
        println!("{json}");
        return Ok(());
    }

    let items = model::parse_array(&json, "workspace list")?;
    let mut rows = vec![vec![
        "IDX".into(),
        "NAME".into(),
        "WINDOWS".into(),
        "ACTIVE".into(),
    ]];
    for item in &items {
        let name = model::text(item, "name");
        rows.push(vec![
            cell(item.get("index")),
            if name.is_empty() {
                "-".to_string()
            } else {
                name.to_string()
            },
            cell(item.get("window_count")),
            if model::flag(item, "is_active") {
                "*"
            } else {
                ""
            }
            .to_string(),
        ]);
    }
    print_table(&rows);
    Ok(())
}

pub fn monitors(ctx: &mut Ctx, args: &[String]) -> Result<()> {
    let json_output = parse_json_flag(args)?;
    let json = ctx.bus.call_json("ListMonitors")?;

    if json_output {
        println!("{json}");
        return Ok(());
    }

    let items = model::parse_array(&json, "monitor list")?;
    let mut rows = vec![vec![
        "IDX".into(),
        "X".into(),
        "Y".into(),
        "WIDTH".into(),
        "HEIGHT".into(),
        "SCALE".into(),
        "PRIMARY".into(),
    ]];
    for item in &items {
        rows.push(vec![
            cell(item.get("index")),
            cell(item.get("x")),
            cell(item.get("y")),
            cell(item.get("width")),
            cell(item.get("height")),
            cell(item.get("scale")),
            if model::flag(item, "is_primary") {
                "*"
            } else {
                ""
            }
            .to_string(),
        ]);
    }
    print_table(&rows);
    Ok(())
}
