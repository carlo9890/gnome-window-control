# Documenting

Call the Skill tool with `instruction-writing:writing-project-docs` for the
standard. **Local delta:** everything below wins where the two disagree.

## Four trees, four owners

| Tree | Owns | Reader | Register |
|---|---|---|---|
| `docs/*.md` | How to work on this repository now | Agents | Command register: imperative, one instruction per line |
| `docs/decisions/` | One decision in force per file | Agents and people | The standard's record: at most 8 lines under the heading |
| `docs/specs/` | One format per file: what an implementation MUST do | Agents only | Normative: MUST, MUST NOT |
| `docs/user-guide/` | How to use the product as it is built, one task per page | Users | Task prose, second person: "to do X, do Y" |

`README.md` is the product page: what the product is, how to install a
release, a short first use, and links into `docs/user-guide/`. `CONTRIBUTING.md`
is the front door for human contributors; it links the `docs/` topic that owns
each step and restates none.

## What goes in no doc

- A fact the code, a source comment, a test or `--help` holds. Before you cut a
  fact from a doc, find where one of them holds it; if none does, write it as a
  comment beside the code it describes.
- In `docs/user-guide/` and `docs/specs/`: a private symbol, a line number, a
  log message or a mechanism. Name a file, a D-Bus method or a `wctl` command
  instead. In `docs/*.md`, name a private symbol or a log line only when an
  agent must type it or grep for it (MONITORING.md, CODING.md); never a line
  number.
- A dated status ("runs green on 46.0"), an incident story or other history.
  Git holds it.
- A breaking change of a past version, unless a user can still meet it.
- X11. The project supports Wayland only; the X11 code paths stay undocumented.

## `docs/decisions/`

- Cite a record in `docs/` as a link with its number:
  `([0005](decisions/0005-….md))`.

## `docs/specs/`

- `RULES-JSON.md` holds the keys and their values, the files and their merge
  order, and which rule applies when several match.
- It holds no validation message and no edge case:
  `tests/vectors/rules-spec.json` pins those, and both implementations test
  against it.
- It holds no runtime mechanism, timing or function list. The code holds them.

## `docs/user-guide/`

- Write for someone who installed the product and never opens this
  repository. A page says how to do one thing, with an example.
- Leave out what `--help` or an error message tells the user when it happens.
- Name no source path. Cite no decision record. Link no file under `docs/`
  outside `docs/user-guide/` and `docs/images/`. Where the user needs a reason,
  give it in one sentence.
- Each user-facing fact has one page; another page links to it.
- `wctl.md` names every `wctl` command with one line each. Flag detail stays
  with `wctl --help`, except a flag a task needs.
- `rules.md` names each key with one line, and is the only home of the table
  of keys that need a newer extension.
- Where a page quotes a value that a source constant holds, the constant's
  comment names the page.
- `install.md` and `README.md` give GitHub Releases as the first install path
  and extensions.gnome.org as the second.

## Images

- `docs/images/overview.svg` and `icon.svg`: edit and run
  `docs/images/generate.py`, as its header says, when a fact they show changes.
- `docs/images/demo-*.gif`: record them again after a change a GIF shows, as
  [RUNNING.md](RUNNING.md#record-the-demo-gifs) says.

## Checks

- No check runs on Markdown. Check links and anchors by hand.
- Source comments cite docs by path, such as `docs/specs/RULES-JSON.md`. When
  you rename or remove a heading, `grep -rn` the old anchor and the file name
  across the tree.
