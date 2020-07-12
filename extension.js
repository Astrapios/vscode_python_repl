// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const pythonTerminalName = 'Python REPL';

let pythonTerminal = null;
let textQueue = [];
let waitsQueue = [];
let currentFilename = null;
let isrunning = false;
let noruntimes = 10;

var getProperty = (obj, prop, deflt) => { return obj.hasOwnProperty(prop) ? obj[prop] : deflt; };
var isString = obj => typeof obj === 'string';

/**
 * @param {import("vscode").TextEditor} editor
 */
function processRegEx(editor, runAllAbove=false){
    const config = vscode.workspace.getConfiguration('pythonREPL').get('cell')
    if (getProperty(config, "debugNotify", false)) {
        vscode.window.showInformationMessage(JSON.stringify(config));
    }
    // let config = getConfigRegEx();
    // if (config === undefined) { return; }
    var docText = editor.document.getText();
    // position of cursor is "start" of selection
    var offsetCursor = editor.document.offsetAt(editor.selection.start);
    var selectStart = offsetCursor;
    var flags = getProperty(config, "regexFlags", "") + "g";
    var regex;
    regex = getProperty(config, "blockSymbol");
    if (regex && isString(regex)) {
        regex = new RegExp(regex, flags);
        selectStart = 0;
        regex.lastIndex = 0;
        var result;
        while ((result=regex.exec(docText)) != null) {
        if (result.index >= offsetCursor) break;
        selectStart = regex.lastIndex;
        }
    }
    var selectEnd = editor.document.offsetAt(editor.selection.end);
    regex = getProperty(config, "blockSymbol");
    if (regex && isString(regex)) {
        regex = new RegExp(regex, flags);
        regex.lastIndex = selectEnd;
        selectEnd = docText.length;
        var result;
        while ((result=regex.exec(docText)) != null) {
        selectEnd = result.index;
        break;
        }
    }

    if (runAllAbove) {
        selectEnd = selectStart;
        selectStart = 0;
    }

    if (getProperty(config, "copyToClipboard", false)) {
        vscode.env.clipboard.writeText(docText.substring(selectStart, selectEnd)).then((v)=>v, (v)=>null);
    }

    editor.selection = new vscode.Selection(editor.document.positionAt(selectStart), editor.document.positionAt(selectEnd));
};

function createPythonTerminal() {
    const configuration = vscode.workspace.getConfiguration("pythonREPL");
    let pythonCommand = configuration.get("pythonRunCommand");
    let terminalCommand = getProperty(configuration, "customTerminalCommand");
    let envCommand = getProperty(configuration, "environmentActivationCommand");
    let send_timeout = 0;

    // create python terminal if it doesn't exist
    if (pythonTerminal === null) {
        textQueue = [];
        waitsQueue = [];

        pythonTerminal = vscode.window.createTerminal(pythonTerminalName);

        if (terminalCommand && isString(terminalCommand)){
            sendQueuedText(terminalCommand, 200);
        }
        if (envCommand && isString(envCommand)){
            sendQueuedText(envCommand, 200);
        }
        sendQueuedText(pythonCommand, 2000);

        pythonTerminal.show(configuration.get("focusActiveEditorGroup"));  //defalt: true
        send_timeout = configuration.get("initializationTimeout");
    }

    console.log(send_timeout);
    return send_timeout
}

function removePythonTerminal() {
    pythonTerminal = null;
    currentFilename = null;
    textQueue = [];
    waitsQueue = [];
}

function updateFilename(filename, runInCurrentDirectory) {
    currentFilename = filename;
    sendQueuedText(`__file__ = r'${filename}'`)
    sendQueuedText('import sys')
    sendQueuedText('import os')
    if (runInCurrentDirectory) {
        sendQueuedText(`os.chdir(os.path.dirname(r'${filename}'))`)
    }
    sendQueuedText('sys.path.append(os.path.dirname(__file__))', 2000)
    sendQueuedText('\n')
}

function sendQueuedText(text, waitTime = 50) {
    textQueue.push(text);
    waitsQueue.push(waitTime);
}

function judgeCMD(CMD) {
    let A = CMD.split('\n');
    let istop = false;

    console.log(CMD)
    console.log(A)

    if (A.length > 1) {
        let text = A[A.length - 1]
        console.log(text)
        istop = RegExp(/^\s+/g).test(text)
    }

    console.log(istop)
    return istop
}

function queueLoop() {
    if (textQueue.length > 0 && pythonTerminal !== null && pythonTerminal._queuedRequests.length === 0) {
        isrunning = true;
        const text = textQueue.shift();
        const waitTime = waitsQueue.shift();
        pythonTerminal.sendText(text);
        setTimeout(queueLoop, waitTime);
    } else {
        if (isrunning) {            
            if (textQueue.length === 0 && pythonTerminal !== null && pythonTerminal._queuedRequests.length === 0) {
                isrunning = false;
            };
        } else {
            noruntimes -= 1;
            if (noruntimes < 0) {
                return
            }; 
        };
        setTimeout(queueLoop, 200);
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
    function activatePython () {
        let send_timeout = createPythonTerminal()
        setTimeout(queueLoop, send_timeout);
        vscode.window.showInformationMessage("Python REPL activated");
    };
        
    function sendSelected(check_cwd=false) {
        const configuration = vscode.workspace.getConfiguration("pythonREPL");
        const editor = vscode.window.activeTextEditor;
        const filename = editor.document.fileName;
        let send_timeout = createPythonTerminal();

        // set pwd to editor file path
        if (filename !== currentFilename && check_cwd) {
            updateFilename(filename, configuration.get('runInCurrentDirectory'));
        }

        // get selection & get snippet
        const selection = (editor !== undefined) ? editor.selection : undefined;
        const isSelection = (editor === undefined || selection === undefined || selection.isEmpty) ? false : true
        const isAutoInputLine = configuration.get("isAutoInputLine");
        let command;

        if (isSelection === false || isAutoInputLine) {  //defalt: true
            let startLine, endLine;
            if (editor.selection.isEmpty) {
                startLine = editor.selection.active.line + 1
                endLine = startLine;
            } else {
                startLine = editor.selection.start.line + 1;
                endLine = editor.selection.end.line + 1;
            };
            command = `\n%load -r ${startLine}-${endLine} ${filename}\n`;
        };

        if (isSelection) {
            const selectedText = editor.document.getText(selection);
            const command_text = selectedText.toString();

            if (isAutoInputLine) {
                sendQueuedText(command, 500);
                sendQueuedText('\n');

                if (judgeCMD(command_text)) {
                    console.log('')
                    sendQueuedText('\n', 300);
                };
            } else {
                sendQueuedText(command_text, 500);
            };
        } else {
            sendQueuedText(command);
            sendQueuedText('\n');
        };
        sendQueuedText('\n');
        pythonTerminal.show(configuration.get("focusActiveEditorGroup"));  //defalt: true
        setTimeout(queueLoop, send_timeout);
    };

    function sendFileContents() {
        const configuration = vscode.workspace.getConfiguration("pythonREPL");
        const editor = vscode.window.activeTextEditor;
        const filename = editor.document.fileName;
        let send_timeout = createPythonTerminal();

        // set pwd to editor file path
        if (filename !== currentFilename) {
            updateFilename(filename, configuration.get('runInCurrentDirectory'));
        }

        sendQueuedText(`\n%load ${filename}\n`, 500);
        sendQueuedText('\n');
        sendQueuedText('\n');
        pythonTerminal.show(configuration.get("focusActiveEditorGroup"));
        setTimeout(queueLoop, send_timeout);
    };

    function sendCell () {
        const editor = vscode.window.activeTextEditor;
        processRegEx(editor);
        sendSelected(true);
        vscode.commands.executeCommand('cursorUndo');
    };
    function sendCellAndMove () {
        const editor = vscode.window.activeTextEditor;
        processRegEx(editor);
        sendSelected(true);
        vscode.commands.executeCommand('cursorEnd');
    };

    function sendAllAbove () {
        const editor = vscode.window.activeTextEditor;
        processRegEx(editor, true);
        sendSelected(true);
        vscode.commands.executeCommand('cursorUndo');
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