# Python REPL
Made by [Astrapios](https://github.com/astrapios)

Inspired by [select-by](https://github.com/rioj7/select-by) and [vscode-ipython](https://github.com/pancho111203/vscode-ipython)

This extension allows simple and responsive Python REPL (default: `ipython`) interface to send selected codes or codes within user defined cell (default: `'# %%'`). The extension resulted from frustration with heavy and sometimes unresponsive communication with Jupyter kernel used in default Python extension.

## Available Commands
Python REPL: Activate/Initialize Python REPL ( `pythonREPL.activatePython` )
- Initialize Python REPL. Python REPL should be automatically initialized from other commands if it does not already exist

Python REPL: Send File Contents ( `pythonREPL.sendFileContents` )
- Send and run full file contents in Python REPL 

Python REPL: Send Selected Text (or current line) ( `pythonREPL.sendSelected` )
- Send and run selected code in Python REPL 

Python REPL: Send Cell ( `pythonREPL.sendCell` )
- Send and run current Python cell in Python REPL. Cursor position is unmodified.

Python REPL: Send Cell and Move to Next Cell ( `pythonREPL.sendCellAndMove` )
- Send and run current Python cell in Python REPL. Then, the cursor is moved to the next cell.

Python REPL: Send Everything Above Current Cell ( `pythonREPL.sendAllAbove` )
- Send and run everything above current cell in Python REPL

## Setup Guide
All Python REPL settings can be accessed from `Extension Settings` page.

Example custom `settings.json`:
```json
"pythonREPL.customTerminalCommand": "", //run a custom command on terminal creation
"pythonREPL.customEnvironmentActivationCommand": "", //run a custom environment activation command
"pythonREPL.pythonRunCommand": "ipython", //these are default values
"pythonREPL.cell.blockSymbol": "#.*%%.*\r", //these are default values
```
The `pythonREPL.customTerminalCommand` and `pythonREPL.environmentActivationCommand` is for an advanced user who wants to circumvent a bug on Windows using default Microsoft Python extension. When using `cmd.exe` as `terminal.integrated.shell.windows` along with `conda` Python envrionment, creation of new integrated terminal steals a cursor focus. Changing `"python.terminal.activateEnvironment": false`, fixes the focus problem but requires user to set the environment manually. The two options are for such cases but can be ignored if initial terminal focus is not bothersome.

Directly sending code to terminal has issues in OS X, where instead of entire code block being sent as a whole, each line separated by new line or carriage return are executed sequencially. To circumvent this issue, `pythonREPL.sendTextDirectly` set to `false` as a default. This utilizes `%load -r` *Ipython* magic command, which allows user to send specific lines of from a *Python* script. For responsiveness, this requires users to save the script before sending code blocks. For Windows users, this option should be turned on in the settings.

Example custom `keybindings.json`:
```json
"keybindings": [
    {   //activate Python REPL without sending any code
        //this command is not needed. All other command automatically
        //activates Python REPL if it does not exist
        "key": "ctrl+c ctrl+p",
        "command": "pythonREPL.activatePython"
    },

    {   //send current cell and leave cursor where it is
        "key": "ctrl+enter",
        "command": "pythonREPL.sendCell",
        "when": "editorLangId == python"
    },

    {   //send all cells above current cell
        "key": "ctrl+c ctrl+enter",
        "command": "pythonREPL.sendAllAbove",
        "when": "editorLangId == python"
    },

    {   //send cell and move to next cell when in vim Normal mode
        "key": "shift+enter",
        "command": "pythonREPL.sendCellAndMove",
        "when": "editorLangId == python && vim.mode == 'Normal'"
    },

    {   //send only what is selected when in vim Visual Mode
        "key": "shift+enter",
        "command": "pythonREPL.sendSelected",
        "when": "vim.mode != 'Normal' && vim.mode != 'Insert"
    },

    {   // send all file contents
        "key": "f5",
        "command": "pythonREPL.sendFileContents",
        "when": "editorLangId == python"
    }
]
```