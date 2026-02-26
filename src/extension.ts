// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const pythonTerminalName = 'Python REPL';

const isString = (obj: any) => typeof obj === 'string';
const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

let pythonTerminal: any = null;
let textQueue: string[];
let waitsQueue: number[];
let currentFilename: string = "";
let isrunning: boolean = false;

/**
 * @param {import("vscode").TextEditor} editor
 */
function processRegEx(editor: vscode.TextEditor, runAllAbove: boolean = false) {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL.cell');
    const regex = config.get("blockSymbol", "#.*%%.*");
    if (config.get("debugNotify", false)) {
        vscode.window.showInformationMessage(JSON.stringify(config));
    }
    const docText = editor.document.getText();
    const docEnd = editor.document.positionAt(docText.length);
    const lineEnd = new vscode.Position(docEnd.line, 0);
    const lineEndOffset = editor.document.offsetAt(lineEnd);

    // position of cursor is "start" of selection
    let offsetCursor = editor.document.offsetAt(editor.selection.start);
    let selectStartOffset = offsetCursor;
    let selectEndOffset = offsetCursor;
    let flags = config.get("regexFlags", "") + "g";
    let lineAdjust = 0;

    if (runAllAbove) {
        selectStartOffset = 0;
        selectEndOffset = offsetCursor;
    }
    // case for cursor at the beginning block symbol. In this case, if not at the last line of the script,
    // cell below the cursor is executed
    else {
        // find start offset
        let regexObj = new RegExp(regex, flags);
        let result;
        selectStartOffset = 0;
        regexObj.lastIndex = 0;
        while ((result = regexObj.exec(docText)) !== null) {
            if (result.index >= offsetCursor || result.index >= lineEndOffset) {
                break;
            }
            selectStartOffset = regexObj.lastIndex;
        }
        // find end offset
        selectEndOffset = editor.document.offsetAt(editor.selection.end);
        regexObj = new RegExp(regex, flags);
        regexObj.lastIndex = selectEndOffset;
        selectEndOffset = docText.length;
        while ((result = regexObj.exec(docText)) !== null) {
            if (result.index >= offsetCursor) {
                selectEndOffset = result.index;
                lineAdjust = 1; // adjust the line by 1 to get rid of regex comment line
                break;
            }
        }
    }
    if (!runAllAbove && ((offsetCursor === selectEndOffset && offsetCursor < lineEndOffset) || selectStartOffset === selectEndOffset)) {
        let regexObj = new RegExp(regex, flags);
        let result;
        selectStartOffset = offsetCursor;
        selectEndOffset = docText.length;
        regexObj.lastIndex = selectStartOffset;
        while ((result = regexObj.exec(docText)) !== null) {
            if (result.index >= offsetCursor + 1) {
                selectEndOffset = result.index;
                lineAdjust = 1; // adjust the line by 1 to get rid of regex comment line
                break;
            }
        }
    }

    let selectStart = editor.document.positionAt(selectStartOffset).line;
    let selectEnd = editor.document.positionAt(selectEndOffset).line - lineAdjust;

    return [selectStart, selectEnd];
}

async function getCurrentPythonInterpreter(): Promise<string | undefined> {
    try {
        // Try to get the current Python interpreter from VS Code's Python extension
        const pythonExtension = vscode.extensions.getExtension('ms-python.python');
        if (pythonExtension && pythonExtension.isActive) {
            const pythonApi = pythonExtension.exports;
            const interpreter = await pythonApi.environments.getActiveEnvironmentPath();

            if (interpreter && interpreter.path) {
                return interpreter.path;
            }
        }
    } catch (error) {
        // Silently fail if Python extension is not available
    }
    return undefined;
}

async function isCondaEnvironment(interpreterPath: string): Promise<string | null> {
    // Extract the environment root directory
    // Interpreter path typically looks like: /path/to/envs/myenv/bin/python
    // We need to go up to the env root
    let envPath = path.dirname(path.dirname(interpreterPath)); // Remove /bin/python

    // Exclude pixi environments - they also have conda-meta but shouldn't use conda activate
    // Pixi paths contain .pixi directory (e.g., /path/to/project/.pixi/envs/default)
    if (interpreterPath.includes('.pixi')) {
        return null;
    }

    // Check if conda-meta exists (definitive conda indicator)
    const condaMetaPath = path.join(envPath, 'conda-meta');
    if (fs.existsSync(condaMetaPath)) {
        // Extract environment name from path
        const envName = path.basename(envPath);
        return envName;
    }

    // Also check one level up for base conda environment
    // Base env has structure like: /path/to/miniconda3/bin/python
    const parentCondaMeta = path.join(path.dirname(envPath), 'conda-meta');
    if (fs.existsSync(parentCondaMeta)) {
        return 'base';
    }

    return null;
}

async function detectAndActivateEnvironment(): Promise<{envCommand: string, pythonPath: string}> {
    let envCommand = "";
    let pythonPath = "";

    // Try to get the current Python interpreter from VS Code's Python extension
    const interpreterPath = await getCurrentPythonInterpreter();

    if (interpreterPath) {
        pythonPath = interpreterPath;

        // Check if this is actually a conda environment by looking for conda-meta
        const condaEnvName = await isCondaEnvironment(interpreterPath);
        if (condaEnvName) {
            vscode.window.showInformationMessage(`Auto-detected conda environment: ${condaEnvName}`);
            envCommand = `conda activate ${condaEnvName}`;
        } else {
            // Not conda - use interpreter directly (works for pixi, poetry, uv, venv, etc.)
            vscode.window.showInformationMessage(`Using Python interpreter: ${interpreterPath}`);
        }
    }

    return {envCommand, pythonPath};
}

async function createPythonTerminal() {
    // create python terminal if it doesn't exist
    if (pythonTerminal === null) {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL');
        const terminalCommand = config.get("customTerminalCommand", "");
        const manualEnvCommand = config.get("customEnvironmentActivationCommand", "");

        textQueue = [];
        waitsQueue = [];

        const terminalOptions = {
            name: pythonTerminalName,
            hideFromUser: true
        };

        pythonTerminal = vscode.window.createTerminal(terminalOptions);
        pythonTerminal.show(true);  //defalt: true

        if (terminalCommand && isString(terminalCommand)) {
            pythonTerminal.sendText(terminalCommand);
        }

        // Auto-detect environment, or use manual command if provided
        let envCommand = manualEnvCommand;
        let pythonPath = "";

        if (!envCommand || !isString(envCommand)) {
            const detected = await detectAndActivateEnvironment();
            envCommand = detected.envCommand;
            pythonPath = detected.pythonPath;
        }

        if (envCommand && isString(envCommand)) {
            pythonTerminal.sendText(envCommand);
            await delay(config.get("terminalInitTimeout", 1000)); // Longer delay for environment activation
        }

        // Start Python - use full interpreter path if available, otherwise use configured command
        let pythonCommand = config.get("pythonRunCommand", "ipython --matplotlib");

        // If we have a specific interpreter path and it's not conda (which was activated),
        // use the interpreter directly with ipython module
        if (pythonPath && !envCommand) {
            // Try to use the interpreter's ipython if available
            pythonCommand = `"${pythonPath}" -m IPython --matplotlib`;
        }

        pythonTerminal.sendText(pythonCommand);
        await delay(config.get("pythonInitTimeout", 300));
    }
}

async function saveFileBeforeSend(editor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration('pythonREPL');
    if (editor.document.isDirty && config.get("saveFileBeforeSend")) {
        await editor.document.save();
    }
}

async function prepareForExecution(editor: vscode.TextEditor) {
    if (editor) {
        await createPythonTerminal();
        await saveFileBeforeSend(editor);

        return editor;
    }
    return null;
}

function removePythonTerminal() {
    pythonTerminal = null;
    currentFilename = "";
    textQueue = [];
    waitsQueue = [];
}

function updateFilename(filename: string, runInCurrentDirectory: boolean) {
    currentFilename = filename;
    sendQueuedText(`__file__ = r'${filename}'`);
    sendQueuedText('import sys');
    sendQueuedText('import os');
    if (runInCurrentDirectory) {
        sendQueuedText(`os.chdir(os.path.dirname(r'${filename}'))`);
    }
    sendQueuedText('sys.path.append(os.path.dirname(__file__))', 100);
}

function sendQueuedText(text: string, waitTime = 10) {
    textQueue.push(text);
    waitsQueue.push(waitTime);
}

function queueLoop() {
    const config = vscode.workspace.getConfiguration("pythonREPL");
    const directSend = config.get('sendTextDirectly');
    if (textQueue.length > 0 && pythonTerminal !== null) {
        isrunning = true;
        const text = textQueue.shift();
        const waitTime = waitsQueue.shift();
        pythonTerminal.sendText(text);
        setTimeout(queueLoop, waitTime!);
    } else {
        if (isrunning) {
            if (textQueue.length === 0 && pythonTerminal !== null) {
                isrunning = false;
            };
        } else {
            if (!directSend) {
                pythonTerminal.sendText('\n', false);
            }
            return;
        };
        setTimeout(queueLoop, 100);
    }
}

/**
 * Find all cell boundaries in the document
 * Returns array of line numbers where cells start (cell delimiter lines)
 */
function findCellBoundaries(editor: vscode.TextEditor): number[] {
    const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL.cell');
    const regex = config.get("blockSymbol", "#.*%%.*");
    const flags = config.get("regexFlags", "") + "g";
    const docText = editor.document.getText();

    const boundaries: number[] = [];
    const regexObj = new RegExp(regex, flags);
    let result;

    while ((result = regexObj.exec(docText)) !== null) {
        const line = editor.document.positionAt(result.index).line;
        boundaries.push(line);
    }

    return boundaries;
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context: vscode.ExtensionContext) {
    vscode.window.onDidCloseTerminal(function (event) {
        if (event.name === pythonTerminalName) {
            removePythonTerminal();
        }
    });
    function activatePython() {
        createPythonTerminal().then(() => {
            vscode.window.showInformationMessage("Python REPL activated - check terminal for environment details");
        });
    };

    function sendLines(startLine: number, endLine: number, checkCwd = false) {
        const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL');
        const directSend = config.get('sendTextDirectly');
        const editor = vscode.window.activeTextEditor;

        if (editor) {
            const filename = editor.document.fileName;
            let command;

            // set pwd to editor file path
            if (filename !== currentFilename && checkCwd) {
                updateFilename(filename, config.get('runInCurrentDirectory', true));
            }

            if (directSend) {
                let docText = editor.document.getText();
                let startRange = editor.document.offsetAt(editor.document.lineAt(startLine).range.start);
                let endRange = editor.document.offsetAt(editor.document.lineAt(endLine).range.end);
                function removeLeadingIndent(command: string) {
                    const strings = command.split('\n');
                    const filterStrings = strings.filter(item => item.search(/\S/) > -1);
                    const indents = filterStrings.map(item => item.search(/\S/));
                    const minIndent = Math.min(...indents);

                    if (minIndent > 0) {
                        return filterStrings.map(item => item.slice(minIndent)).join('\n');
                    }
                    else {
                        return command;
                    }
                }
                command = removeLeadingIndent(docText.substring(startRange, endRange));
            } else {
                command = `\n%load -r ${startLine + 1}-${endLine + 1} ${filename}\n`;
            }

            if (config.get("copyToClipboard", false)) {
                vscode.env.clipboard.writeText(command).then((v) => v, (v) => null);
            }

            sendQueuedText(command, 100);
            queueLoop();
        }
    };

    async function sendFileContents() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await prepareForExecution(editor);
            const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL');
            const filename = editor.document.fileName;

            // set pwd to editor file path
            if (filename !== currentFilename) {
                updateFilename(filename, config.get('runInCurrentDirectory', true));
            }

            sendQueuedText(`\n%load ${filename}\n`, 100);
            queueLoop();
        }
    };

    async function sendCell() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await prepareForExecution(editor);
            let [sL, eL] = processRegEx(editor);
            sendLines(sL, eL, true);
        }
    };

    async function sendSelected() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await prepareForExecution(editor);
            const config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('pythonREPL');
            const globalConfig: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration();

            const selectStart = editor.document.offsetAt(editor.selection.start);
            const selectEnd = editor.document.offsetAt(editor.selection.end);
            const sL = editor.document.positionAt(selectStart).line;
            const eL = editor.document.positionAt(selectEnd).line;

            if (config.get('removeSelectionAfterSend', true)) {
                if (globalConfig.hasOwnProperty('vim')) {
                    vscode.commands.executeCommand('extension.vim_ctrl+[');
                }
                else {
                    vscode.commands.executeCommand('editor.action.cancelSelectionAnchor');
                }
            }

            sendLines(sL, eL, true);
        }
    };

    async function sendCellAndMove() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await prepareForExecution(editor);
            const docText = editor.document.getText();
            const [sL, eL] = processRegEx(editor);

            sendLines(sL, eL, true);

            // move to next cell only if current cell is not the last cell
            let lineEnd = editor.document.positionAt(docText.length).line;
            if (eL < lineEnd - 2) {
                const range = editor.document.lineAt(eL + 2).range;
                editor.selections = [new vscode.Selection(range.start, range.start)];
                editor.revealRange(range);
            }
        }
    };

    async function sendAllAbove() {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            await prepareForExecution(editor);
            const [sL, eL] = processRegEx(editor, true);
            sendLines(sL, eL - 1, true);
        }
    };

    function goToNextCell() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const currentLine = editor.selection.active.line;
        const boundaries = findCellBoundaries(editor);

        // Find the next cell boundary after current line
        const nextBoundary = boundaries.find(line => line > currentLine);

        if (nextBoundary !== undefined) {
            // Move to the line after the cell delimiter
            const targetLine = Math.min(nextBoundary + 1, editor.document.lineCount - 1);
            const position = new vscode.Position(targetLine, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        }
    }

    function goToPreviousCell() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const boundaries = findCellBoundaries(editor);

        // Get the start of the current cell using processRegEx
        const [currentCellStart] = processRegEx(editor);

        // Find the boundary that starts the current cell or the one right before cursor
        let currentCellBoundary: number | undefined;
        for (let i = boundaries.length - 1; i >= 0; i--) {
            if (boundaries[i] <= currentCellStart) {
                currentCellBoundary = boundaries[i];
                break;
            }
        }

        // Find the previous cell boundary (the one before the current cell's boundary)
        let previousBoundary: number | undefined;
        if (currentCellBoundary !== undefined) {
            for (let i = boundaries.length - 1; i >= 0; i--) {
                if (boundaries[i] < currentCellBoundary) {
                    previousBoundary = boundaries[i];
                    break;
                }
            }
        }

        if (previousBoundary !== undefined) {
            // Move to the line after the cell delimiter
            const targetLine = Math.min(previousBoundary + 1, editor.document.lineCount - 1);
            const position = new vscode.Position(targetLine, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        } else {
            // If no previous boundary found, go to the start of document (before first cell)
            const position = new vscode.Position(0, 0);
            editor.selection = new vscode.Selection(position, position);
            editor.revealRange(new vscode.Range(position, position));
        }
    }

    function goToCellStart() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const [sL] = processRegEx(editor);
        const position = new vscode.Position(sL, 0);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
    }

    function goToCellEnd() {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }

        const [, eL] = processRegEx(editor);
        const lineCount = editor.document.lineCount;
        const targetLine = Math.min(eL, lineCount - 1);
        const line = editor.document.lineAt(targetLine);
        const position = new vscode.Position(targetLine, line.text.length);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
    }

    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.activatePython', activatePython));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendCell', sendCell));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendCellAndMove', sendCellAndMove));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendAllAbove', sendAllAbove));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendSelected', sendSelected));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendFileContents', sendFileContents));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.goToNextCell', goToNextCell));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.goToPreviousCell', goToPreviousCell));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.goToCellStart', goToCellStart));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.goToCellEnd', goToCellEnd));
}

exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;