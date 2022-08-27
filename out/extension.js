"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");
const pythonTerminalName = 'Python REPL';
const isString = (obj) => typeof obj === 'string';
const delay = (ms) => new Promise(res => setTimeout(res, ms));
let pythonTerminal = null;
let textQueue;
let waitsQueue;
let currentFilename = "";
let isrunning = false;
/**
 * @param {import("vscode").TextEditor} editor
 */
function processRegEx(editor, runAllAbove = false) {
    const config = vscode.workspace.getConfiguration('pythonREPL');
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
    else if ((offsetCursor == selectEndOffset && offsetCursor < lineEndOffset) || selectStartOffset == selectEndOffset) {
        let regexObj = new RegExp(regex, flags);
        let result;
        selectStartOffset = offsetCursor;
        selectEndOffset = docText.length;
        regexObj.lastIndex = selectStartOffset;
        while ((result = regexObj.exec(docText)) != null) {
            if (result.index >= offsetCursor + 1) {
                selectEndOffset = result.index;
                lineAdjust = 1; // adjust the line by 1 to get rid of regex comment line
                break;
            }
        }
    }
    else {
        // find start offset
        let regexObj = new RegExp(regex, flags);
        let result;
        selectStartOffset = 0;
        regexObj.lastIndex = 0;
        while ((result = regexObj.exec(docText)) != null) {
            if (result.index >= offsetCursor || result.index >= lineEndOffset)
                break;
            selectStartOffset = regexObj.lastIndex;
        }
        // find end offset
        selectEndOffset = editor.document.offsetAt(editor.selection.end);
        regexObj = new RegExp(regex, flags);
        regexObj.lastIndex = selectEndOffset;
        selectEndOffset = docText.length;
        while ((result = regexObj.exec(docText)) != null) {
            if (result.index >= offsetCursor) {
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
;
async function createPythonTerminal() {
    // create python terminal if it doesn't exist
    if (pythonTerminal === null) {
        const config = vscode.workspace.getConfiguration('pythonREPL');
        const pythonCommand = config.get("pythonRunCommand", "");
        const terminalCommand = config.get("customTerminalCommand", "");
        const envCommand = config.get("environmentActivationCommand", "");
        textQueue = [];
        waitsQueue = [];
        const terminalOptions = {
            name: pythonTerminalName,
            hideFromUser: true
        };
        pythonTerminal = vscode.window.createTerminal(terminalOptions);
        pythonTerminal.show(true); //defalt: true
        if (terminalCommand && isString(terminalCommand)) {
            pythonTerminal.sendText(terminalCommand);
        }
        if (envCommand && isString(envCommand)) {
            pythonTerminal.sendText(envCommand);
        }
        await delay(config.get("terminalInitTimeout", 1000));
        pythonTerminal.sendText(pythonCommand);
        await delay(config.get("pythonCommandTimeout", 300));
    }
}
function removePythonTerminal() {
    pythonTerminal = null;
    currentFilename = "";
    textQueue = [];
    waitsQueue = [];
}
function updateFilename(filename, runInCurrentDirectory) {
    currentFilename = filename;
    sendQueuedText(`__file__ = r'${filename}'`);
    sendQueuedText('import sys');
    sendQueuedText('import os');
    if (runInCurrentDirectory) {
        sendQueuedText(`os.chdir(os.path.dirname(r'${filename}'))`);
    }
    sendQueuedText('sys.path.append(os.path.dirname(__file__))', 100);
}
function sendQueuedText(text, waitTime = 10) {
    textQueue.push(text);
    waitsQueue.push(waitTime);
}
function queueLoop() {
    const config = vscode.workspace.getConfiguration("pythonREPL");
    const direct_send = config.get('sendTextDirectly');
    if (textQueue.length > 0 && pythonTerminal !== null) {
        isrunning = true;
        const text = textQueue.shift();
        const waitTime = waitsQueue.shift();
        pythonTerminal.sendText(text);
        setTimeout(queueLoop, waitTime);
    }
    else {
        if (isrunning) {
            if (textQueue.length === 0 && pythonTerminal !== null) {
                isrunning = false;
            }
            ;
        }
        else {
            if (!direct_send) {
                pythonTerminal.sendText('\n', false);
            }
            return;
        }
        ;
        setTimeout(queueLoop, 100);
    }
}
// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    vscode.window.onDidCloseTerminal(function (event) {
        if (event.name === pythonTerminalName) {
            removePythonTerminal();
        }
    });
    function activatePython() {
        createPythonTerminal();
        vscode.window.showInformationMessage("Python REPL activated");
    }
    ;
    function sendLines(startLine, endLine, check_cwd = false) {
        const config = vscode.workspace.getConfiguration('pythonREPL');
        const direct_send = config.get('sendTextDirectly');
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const filename = editor.document.fileName;
            let command;
            // set pwd to editor file path
            if (filename !== currentFilename && check_cwd) {
                updateFilename(filename, config.get('runInCurrentDirectory', true));
            }
            if (direct_send) {
                let docText = editor.document.getText();
                let start_range = editor.document.offsetAt(editor.document.lineAt(startLine).range.start);
                let end_range = editor.document.offsetAt(editor.document.lineAt(endLine).range.end);
                function removeLeadingIndent(command) {
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
                command = removeLeadingIndent(docText.substring(start_range, end_range));
            }
            else {
                command = `\n%load -r ${startLine + 1}-${endLine + 1} ${filename}\n`;
            }
            if (config.get("copyToClipboard", false)) {
                vscode.env.clipboard.writeText(command).then((v) => v, (v) => null);
            }
            sendQueuedText(command, 100);
            queueLoop();
        }
    }
    ;
    async function sendFileContents() {
        await createPythonTerminal();
        const editor = vscode.window.activeTextEditor;
        const config = vscode.workspace.getConfiguration('pythonREPL');
        if (editor) {
            const filename = editor.document.fileName;
            // set pwd to editor file path
            if (filename !== currentFilename) {
                updateFilename(filename, config.get('runInCurrentDirectory', true));
            }
            sendQueuedText(`\n%load ${filename}\n`, 500);
            queueLoop();
        }
    }
    ;
    async function sendCell() {
        await createPythonTerminal();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            let [sL, eL] = processRegEx(editor);
            sendLines(sL, eL, true);
        }
    }
    ;
    async function sendSelected() {
        await createPythonTerminal();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const selectStart = editor.document.offsetAt(editor.selection.start);
            const selectEnd = editor.document.offsetAt(editor.selection.end);
            const sL = editor.document.positionAt(selectStart).line;
            const eL = editor.document.positionAt(selectEnd).line;
            sendLines(sL, eL, true);
        }
    }
    ;
    async function sendCellAndMove() {
        await createPythonTerminal();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
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
    }
    ;
    async function sendAllAbove() {
        await createPythonTerminal();
        const editor = vscode.window.activeTextEditor;
        if (editor) {
            const [sL, eL] = processRegEx(editor, true);
            sendLines(sL, eL - 1, true);
        }
    }
    ;
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
//# sourceMappingURL=extension.js.map