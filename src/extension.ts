// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

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

async function detectAndActivateEnvironment(): Promise<string> {
    let returnValue = "";
    // Try to get the current Python interpreter from VS Code's Python extension
    const interpreterPath = await getCurrentPythonInterpreter();
    if (interpreterPath) {
        // Check if this is a conda environment
        if (interpreterPath.includes('conda') || interpreterPath.includes('envs')) {
            // Extract conda environment name from path
            const pathParts = interpreterPath.split(/[\\\/]/);
            const envIndex = pathParts.findIndex((part: string) => part === 'envs');
            if (envIndex !== -1 && envIndex + 1 < pathParts.length) {
                const envName = pathParts[envIndex + 1];
                vscode.window.showInformationMessage(`Auto-detected conda environment: ${envName}`);
                returnValue = `conda activate ${envName}`;
            }

            // Alternative conda path pattern (e.g., /opt/conda/envs/envname)
            const condaMatch = interpreterPath.match(/conda[\\\/]envs[\\\/]([^\\\/]+)/);
            if (condaMatch) {
                const envName = condaMatch[1];
                vscode.window.showInformationMessage(`Auto-detected conda environment: ${envName}`);
                returnValue = `conda activate ${envName}`;
            }
        }

        // Check if this is a virtual environment
        if (interpreterPath.includes('venv') || interpreterPath.includes('virtualenv')) {
            // Extract the virtual environment path and create activation command
            const venvPath = interpreterPath.replace(/\/bin\/python.*$/, '');
            vscode.window.showInformationMessage(`Using virtual environment: ${venvPath}`);
            returnValue = `source "${venvPath}/bin/activate"`;
        }
    }

    return returnValue;
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

        // Auto-detect and activate environment, or use manual command if provided
        let envCommand = manualEnvCommand;
        if (!envCommand || !isString(envCommand)) {
            envCommand = await detectAndActivateEnvironment();
        }

        if (envCommand && isString(envCommand)) {
            pythonTerminal.sendText(envCommand);
            await delay(config.get("terminalInitTimeout", 100)); // Longer delay for environment activation
        }

        // Start Python after environment is activated
        const pythonCommand = config.get("pythonRunCommand", "");
        pythonTerminal.sendText(pythonCommand);
        await delay(config.get("pythonCommandTimeout", 100));
    }
}

async function saveFileBeforeSend(editor: vscode.TextEditor) {
    const config = vscode.workspace.getConfiguration('pythonREPL');
    if (editor.document.isDirty && config.get("saveFileBeforeSend")) {
        const originalFormatOnSave = vscode.workspace.getConfiguration('editor').get('formatOnSave');
        const originalFormatOnPaste = vscode.workspace.getConfiguration('editor').get('formatOnPaste');
        const originalPythonFormatOnSave = vscode.workspace.getConfiguration('editor', { languageId: 'python' }).get('formatOnSave');
        const originalPythonFormatOnPaste = vscode.workspace.getConfiguration('editor', { languageId: 'python' }).get('formatOnPaste');
        const originalCodeActionsOnSave = vscode.workspace.getConfiguration('editor').get('codeActionsOnSave');
        const originalPythonCodeActionsOnSave = vscode.workspace.getConfiguration('editor', { languageId: 'python' }).get('codeActionsOnSave');
        await vscode.workspace.getConfiguration('editor').update('formatOnSave', false, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor').update('formatOnPaste', false, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('formatOnSave', false, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('formatOnPaste', false, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor').update('codeActionsOnSave', [], vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('codeActionsOnSave', [], vscode.ConfigurationTarget.Workspace);
        await editor.document.save();
        await vscode.workspace.getConfiguration('editor').update('formatOnSave', originalFormatOnSave, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor').update('formatOnPaste', originalFormatOnPaste, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('formatOnSave', originalPythonFormatOnSave, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('formatOnPaste', originalPythonFormatOnPaste, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor').update('codeActionsOnSave', originalCodeActionsOnSave, vscode.ConfigurationTarget.Workspace);
        await vscode.workspace.getConfiguration('editor', { languageId: 'python' }).update('codeActionsOnSave', originalPythonCodeActionsOnSave, vscode.ConfigurationTarget.Workspace);
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

    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.activatePython', activatePython));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendCell', sendCell));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendCellAndMove', sendCellAndMove));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendAllAbove', sendAllAbove));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendSelected', sendSelected));
    context.subscriptions.push(vscode.commands.registerCommand('pythonREPL.sendFileContents', sendFileContents));
}

exports.activate = activate;
function deactivate() {
}
exports.deactivate = deactivate;