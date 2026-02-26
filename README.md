# Python REPL

A lightweight and responsive VS Code extension for interactive Python development using IPython REPL. Send code cells, selections, or entire files to an integrated terminal without the overhead of Jupyter kernels.

Made by [Astrapios](https://github.com/astrapios) | Inspired by [select-by](https://github.com/rioj7/select-by) and [vscode-ipython](https://github.com/pancho111203/vscode-ipython)

## Why Python REPL?

This extension was created out of frustration with the heavy and sometimes unresponsive Jupyter kernel communication in VS Code's default Python extension. Python REPL provides:

- **Faster startup**: No kernel to initialize, just an IPython REPL in the terminal
- **Lower resource usage**: Terminal-based execution is lightweight
- **Better reliability**: Direct terminal communication is more stable
- **Full IPython features**: Access to all IPython magic commands and features
- **Transparency**: See exactly what's being executed in the terminal

## Requirements

- Python 3.x installed
- IPython recommended (install with `pip install ipython`)
- Optional: VS Code Vim extension for vim-mode keybindings

## Features

- **Cell-based execution**: Define code cells with `# %%` delimiters (Jupyter-style)
- **Flexible code sending**: Execute selections, cells, entire files, or everything above cursor
- **Cell navigation**: Jump between cells without executing them
- **Auto environment detection**: Automatically detects and activates conda environments, works seamlessly with pixi, poetry, uv, and venv
- **Lightweight**: Uses integrated terminal with IPython instead of Jupyter kernel
- **Vim-friendly**: Suggested keybindings compatible with vim mode

## Available Commands

### Execution Commands

- **Python REPL: Activate/Initialize Python** (`pythonREPL.activatePython`)
  - Initialize Python REPL (automatically initialized by other commands if needed)

- **Python REPL: Send File Contents** (`pythonREPL.sendFileContents`)
  - Send and run entire file in Python REPL

- **Python REPL: Send Selected Text** (`pythonREPL.sendSelected`)
  - Send and run selected code (or current line if no selection)

- **Python REPL: Send Cell** (`pythonREPL.sendCell`)
  - Send and run current cell, cursor stays in place

- **Python REPL: Send Cell and Move** (`pythonREPL.sendCellAndMove`)
  - Send and run current cell, then move cursor to next cell

- **Python REPL: Send Everything Above** (`pythonREPL.sendAllAbove`)
  - Send and run all code above current cursor position

### Navigation Commands

- **Python REPL: Go to Next Cell** (`pythonREPL.goToNextCell`)
  - Navigate to the next code cell

- **Python REPL: Go to Previous Cell** (`pythonREPL.goToPreviousCell`)
  - Navigate to the previous code cell

- **Python REPL: Go to Cell Start** (`pythonREPL.goToCellStart`)
  - Jump to the beginning of current cell

- **Python REPL: Go to Cell End** (`pythonREPL.goToCellEnd`)
  - Jump to the end of current cell

## Configuration

All settings can be accessed from VS Code's Extension Settings page or configured in `settings.json`.

### Key Settings

```json
{
  "pythonREPL.pythonRunCommand": "ipython --matplotlib",
  "pythonREPL.cell.blockSymbol": "#.*%%.*",
  "pythonREPL.sendTextDirectly": false,
  "pythonREPL.runInCurrentDirectory": true,
  "pythonREPL.saveFileBeforeSend": true
}
```

### Environment Detection

The extension automatically detects your Python environment:

- **Conda environments**: Automatically runs `conda activate <env>` when detected
- **Pixi, Poetry, uv, venv**: Uses the interpreter path directly without activation
- **Manual override**: Use `pythonREPL.customEnvironmentActivationCommand` to specify custom activation

### Platform-Specific Settings

**macOS**: Keep `pythonREPL.sendTextDirectly` set to `false` (default). This uses IPython's `%load -r` magic command to send code, which is more reliable for multi-line code blocks on macOS. The file must be saved before sending code.

**Windows**: You can set `pythonREPL.sendTextDirectly` to `true` for more responsive direct code sending.

**Advanced Windows Setup**: If using `cmd.exe` with conda causes terminal focus issues, configure:
```json
{
  "pythonREPL.customTerminalCommand": "",
  "pythonREPL.customEnvironmentActivationCommand": "conda activate myenv"
}
```

## Suggested Keybindings

Add these to your `keybindings.json` (File → Preferences → Keyboard Shortcuts → Open Keyboard Shortcuts (JSON)):

### Execution Keybindings

```json
{
  "key": "ctrl+enter",
  "command": "pythonREPL.sendCell",
  "when": "editorLangId == python"
},
{
  "key": "shift+enter",
  "command": "pythonREPL.sendCellAndMove",
  "when": "editorLangId == python && vim.mode == 'Normal'"
},
{
  "key": "shift+enter",
  "command": "pythonREPL.sendSelected",
  "when": "editorLangId == python && vim.mode != 'Normal' && vim.mode != 'Insert'"
},
{
  "key": "ctrl+shift+enter",
  "command": "pythonREPL.sendAllAbove",
  "when": "editorLangId == python"
},
{
  "key": "f5",
  "command": "pythonREPL.sendFileContents",
  "when": "editorLangId == python"
}
```

**Summary**:
- `Ctrl+Enter` - Execute current cell
- `Shift+Enter` - Execute cell and move to next (Normal mode) / Execute selection (Visual mode)
- `Ctrl+Shift+Enter` - Execute all cells above cursor
- `F5` - Execute entire file

### Navigation Keybindings (Vim-Compatible)

```json
{
  "key": "] ]",
  "command": "pythonREPL.goToNextCell",
  "when": "editorLangId == python && vim.mode == 'Normal'"
},
{
  "key": "[ [",
  "command": "pythonREPL.goToPreviousCell",
  "when": "editorLangId == python && vim.mode == 'Normal'"
},
{
  "key": "] s",
  "command": "pythonREPL.goToCellStart",
  "when": "editorLangId == python && vim.mode == 'Normal'"
},
{
  "key": "] e",
  "command": "pythonREPL.goToCellEnd",
  "when": "editorLangId == python && vim.mode == 'Normal'"
}
```

**Summary**:
- `]]` - Go to next cell
- `[[` - Go to previous cell
- `]s` - Go to cell start
- `]e` - Go to cell end

These follow vim conventions where `]` and `[` are used for forward/backward navigation (similar to `]]`/`[[` for sections and `]m`/`[m` for methods).

## Example Usage

1. **Define cells** in your Python file using `# %%`:
   ```python
   # %% Cell 1
   import numpy as np
   x = np.arange(10)

   # %% Cell 2
   print(x.mean())
   ```

2. **Execute cells** with `Ctrl+Enter` or `Shift+Enter`

3. **Navigate between cells** with `]c` and `[c` (vim mode)

4. The extension automatically activates your Python environment and starts IPython in the integrated terminal

## Troubleshooting

**IPython not found**: Install IPython with `pip install ipython` or configure a different REPL with `pythonREPL.pythonRunCommand`.

**Environment not activating**: Set `pythonREPL.customEnvironmentActivationCommand` manually or check that the VS Code Python extension is installed and has selected the correct interpreter.

**Code not executing on macOS**: Ensure `pythonREPL.sendTextDirectly` is `false` (default) and `pythonREPL.saveFileBeforeSend` is `true`.

**Terminal focus issues on Windows**: See the Advanced Windows Setup section in Configuration.

## Contributing

Issues and pull requests welcome at [github.com/Astrapios/vscode_python_repl](https://github.com/Astrapios/vscode_python_repl)

## License

MIT License - see [LICENSE](LICENSE) file for details