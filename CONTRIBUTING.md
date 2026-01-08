# Contributing to GNOME Window Control

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR-USERNAME/stop-gap.git
   cd stop-gap
   ```
3. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development Setup

### Prerequisites

- GNOME Shell 45, 46, or 47
- `gnome-extensions` CLI tool
- Basic knowledge of GJS (GNOME JavaScript)

### Installing for Development

```bash
# Link extension to GNOME extensions directory
ln -sf "$(pwd)/window-control@hko9890" ~/.local/share/gnome-shell/extensions/

# Enable the extension
gnome-extensions enable window-control@hko9890
```

### Viewing Logs

```bash
# Follow GNOME Shell logs
journalctl -f -o cat /usr/bin/gnome-shell

# Or with filtering
journalctl -f -o cat /usr/bin/gnome-shell 2>&1 | grep -i window-control
```

### Reloading Changes

After modifying `extension.js`:

```bash
gnome-extensions disable window-control@hko9890
gnome-extensions enable window-control@hko9890
```

On Wayland, you may need to log out and back in for some changes.

## Code Style

### JavaScript (extension.js)

- Use ES modules (ESM) syntax
- Use `const` and `let`, not `var`
- Use template literals for string interpolation
- Wrap D-Bus method implementations in try/catch
- Log errors with `console.error()`
- Return graceful defaults on error (empty arrays, `false`, etc.)

Example:
```javascript
SomeMethod(param) {
    try {
        const window = this._findWindowById(param);
        if (!window) return false;
        
        window.someAction();
        return true;
    } catch (e) {
        console.error(`[WindowControl] SomeMethod failed: ${e.message}`);
        return false;
    }
}
```

### Bash (wctl)

- Use `#!/usr/bin/env bash` shebang
- Quote variables: `"$var"` not `$var`
- Use `[[ ]]` for conditionals
- Validate arguments before D-Bus calls
- Provide helpful error messages

## Pull Request Process

1. **Test your changes** - Ensure the extension loads without errors
2. **Update documentation** - Update README.md if adding new features
3. **Keep commits focused** - One logical change per commit
4. **Write clear commit messages** - Describe what and why

### Commit Message Format

```
<type>: <short description>

<optional longer description>
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `chore`: Maintenance tasks

Examples:
```
feat: Add GetWorkspaces D-Bus method

Exposes workspace enumeration through D-Bus for scripts that need
to know available workspaces.
```

```
fix: Handle null window title gracefully

Some windows (like Steam popups) return null for get_title().
Now returns empty string instead of crashing.
```

## Adding New D-Bus Methods

1. Add the method signature to the D-Bus XML in `extension.js`:
   ```javascript
   const DBusInterface = `
   <node>
     <interface name="org.gnome.Shell.Extensions.WindowControl">
       <!-- existing methods -->
       <method name="YourNewMethod">
         <arg type="t" direction="in" name="windowId"/>
         <arg type="b" direction="out" name="success"/>
       </method>
     </interface>
   </node>
   `;
   ```

2. Add the implementation in `WindowControlService` class:
   ```javascript
   YourNewMethod(windowId) {
       try {
           const window = this._findWindowById(windowId);
           if (!window) return false;
           
           // Your implementation
           return true;
       } catch (e) {
           console.error(`[WindowControl] YourNewMethod failed: ${e.message}`);
           return false;
       }
   }
   ```

3. Add the corresponding command to `wctl`:
   ```bash
   your-new-command)
       validate_args 2 "$@"
       call_dbus "YourNewMethod" "uint64:$2"
       ;;
   ```

4. Update help text in `wctl`

5. Update README.md with the new method/command

## Reporting Issues

When reporting bugs, please include:

- GNOME Shell version (`gnome-shell --version`)
- Distribution and version
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output from `journalctl`

## Feature Requests

Feature requests are welcome! Please describe:

- The use case / problem you're trying to solve
- Your proposed solution (if any)
- Any alternatives you've considered

## Questions?

Open an issue with the "question" label if you need help or clarification.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
