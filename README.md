# Python REPL
Made by [Astrapios](https://github.com/astrapios)

Based on [select-by](https://github.com/rioj7/select-by) and [vscode-ipython](https://github.com/pancho111203/vscode-ipython)

This extension allows simple and responsive Python REPL interface to send selected codes or codes within user defined cell (default: `'# %%'`). The extension resulted from frustration with heavy and sometimes unresponsive communication with Jupyter kernel used in default Python extension.

## Available Commands
Python REPL: Send File Contents To Python ( `pythonREPL.sendFileContents` )

Python REPL: Send Selected Text (or current line) To IPython ( `pythonREPL.sendSelected` )

Python REPL: Activate/Initialize Python ( `pythonREPL.activateIPython` )

Python REPL: Send Cell ( `pythonREPL.sendCell` )

Python REPL: Send Cell and Move to Next Cell ( `pythonREPL.sendCellAndMove` )

Python REPL: Send Everything Above Current Cell ( `pythonREPL.sendAllAbove` )

## Setup Guide
Example `settings.json`:
```json
"pythonREPL.customTerminalCommand": "C:\\Users\\ryuj\\Miniconda3\\Scripts\\activate", //this is custom setup for setting correct environment on my machine
"pythonREPL.environmentActivationCommand": "conda activate base", //set a custom environment
"pythonREPL.pythonRunCommand": "ipython --pylab", //these are default values
"pythonREPL.cell.blockSymbol": "#.*%%.*\r", //these are default values
```
All of the above settings are optional. The `pythonREPL.customTerminalCommand` and `pythonREPL.environmentActivationCommand` is for an advanced user who wants to circumvent a bug on Windows using default Microsoft Python extension. When using `cmd.exe` as `terminal.integrated.shell.windows` along with `conda` Python envrionment, creation of new integrated terminal steals a cursor focus. Changing `"python.terminal.activateEnvironment": false`, fixes the focus problem but requires user to set the environment manually. The two options are for such cases but can be ignored if initial terminal focus is not bothersome.

Example `keybindings.json`:
```json
"keybindings": [
    {   //activate Python REPL without sending any code
        //this command is not needed. All other command automatically
        //activates Python REPL if it does not exist
        "key": "ctrl+c ctrl+p",
        "command": "pythonREPL.activateIPython"
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

    {   // send all file contetns
        "key": "f5",
        "command": "pythonREPL.sendFileContents",
        "when": "editorLangId == python"
    }
]
```