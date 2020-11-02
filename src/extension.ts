'use strict';
import * as path from 'path';
import * as vscode from 'vscode';

interface Task {
    line : number;
    text : string;
    indent : number;
    check : string;
    title : string;
	tags : string[];
}

interface Column {
	line : number;
    text : string;
	title : string;
    tasks : Task[];
}

interface Kanban {
	file : string;
	line : number;
    text : string;
    title : string;
    level : number;
    columns : Column[];
}

enum ColumnType {
	TODO,
	DONE,
	NONE
}

interface Header {
	line : number;
	title : string;
	level : number;
}


export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "markdown-kanban-board" is now active!');
	context.subscriptions.push(
		vscode.commands.registerCommand('kanban.show', () => {
			KanbanBoardPanel.createOrShow(context.extensionUri);
		})
	);
}

export function deactivate() {
}

class KanbanBoardPanel {

    public static currentPanel: KanbanBoardPanel | undefined;

	public static readonly viewType = 'KanbanBoard';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private _document: vscode.TextDocument;
	private version:number=-1;

	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
		if(!vscode.window.activeTextEditor){
			return;
		} 
		const doc = vscode.window.activeTextEditor.document;
		let kanbans = this.detectKanban(doc);

		if (KanbanBoardPanel.currentPanel) {
			KanbanBoardPanel.currentPanel._setDocument(doc,kanbans);
			return;
		}
	
		const panel = vscode.window.createWebviewPanel(
			KanbanBoardPanel.viewType,
			`Kanban Borad`,
			vscode.ViewColumn.Beside,
			{
				enableScripts: true,
				localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
			}
		);

		KanbanBoardPanel.currentPanel = new KanbanBoardPanel(panel, extensionUri, doc, kanbans);
	}


	public static detectKanban(doc : vscode.TextDocument) : Kanban[]
	{
		let useKeyword = vscode.workspace.getConfiguration().get("kanban.autodetect.useKeyword") as boolean;
		let keyword = vscode.workspace.getConfiguration().get("kanban.autodetect.keyword") as string;
		let smartDetect = vscode.workspace.getConfiguration().get("kanban.autodetect.smartDetect") as boolean;

		let columnTodo = (vscode.workspace.getConfiguration().get("kanban.column.todo") as string).split(",").map(t=>t.toUpperCase().replace(/ /g,""));
		let columnDone = (vscode.workspace.getConfiguration().get("kanban.column.done") as string).split(",").map(t=>t.toUpperCase().replace(/ /g,""));

		let isTodoOrDone = (title:string)=>{
			title = title.toUpperCase().replace(/ /g,"");
			return columnTodo.indexOf(title)>=0 || columnDone.indexOf(title)>=0;
		};

		let getLastLine = (kanban:Kanban)=>{
			if(kanban.columns.length>0){
				let column = kanban.columns[ kanban.columns.length-1 ];
				if(column.tasks.length>0){
					return column.tasks[column.tasks.length-1].line;
				}else{
					return column.line;
				}
			}else{
				return kanban.line;
			}
		};

		let headers : Header[] = [];
		let kanbans : Kanban[] = [];
		for(var line=0;line<doc.lineCount;line++){
			let textline = doc.lineAt(line);

			if(textline.text.startsWith("#")){
				let m = textline.text.match(/(#+)\s+(.*)/);
				if(m){
					let h:Header = {
						line,
						title : m[2],
						level : m[1].length
					};
					headers.push(h);
					if( useKeyword && h.title.indexOf(keyword)>=0 )
					{
						let kanban = this._parse(doc,line);
						if(kanban){
							line=getLastLine(kanban);
							kanbans.push(kanban);
						}
					}
					else if( smartDetect && isTodoOrDone(h.title) ){
						let j = headers.length-1;
						do{
							let t = headers[j--];
							if(t && t.level<h.level){
								let kanban = this._parse(doc,t.line);
								if(kanban){
									line=getLastLine(kanban);
									kanbans.push(kanban);
									headers=[];
									break;
								}
							} 
						} while(j>=0);
					}
				}
			}
		}
		return kanbans;
	}

	private static _parse(doc: vscode.TextDocument,line : number) : Kanban|null
	{
		let textline = doc.lineAt(line);
		
		let km = textline.text.match(/(#+)\s+(.*)/);
		if(!km){
			return null;
		}

		let getLastColumn = (kanban:Kanban) : Column|null=>{
			if(kanban.columns.length>0){
				return kanban.columns[kanban.columns.length-1];
			}else{
				return null;
			}
		};

		let kanban: Kanban = { file : doc.fileName, line, text:textline.text, level:km[1].length, title : km[2], columns: [] };
		for(line++;line<doc.lineCount;line++){
			textline = doc.lineAt(line);
			if( textline.text.startsWith("#") ){
				let cm = textline.text.match(/(#+)\s+(.*)/);
				if(cm){
					if( cm[1].length > kanban.level ){
						let column:Column = { line, text:textline.text, title: cm[2], tasks:[] };
						kanban.columns.push(column);
					}else{
						return kanban;
					}
				}
			}else{
				let tm = textline.text.match(/^(\s*)- \[(x| )\](.*)/);
				if(tm){
					var task:Task = { line, text:textline.text, indent : tm[1].length, check : tm[2], title : "", tags : [] };
					var tags = tm[3].match(/(\S| (?![@#]))+/g);
					if(tags){
						for(var i=0;i<tags.length;i++){
							var tag = tags[i].trim();
							if( tag[0] === '@' || tag[0] === '#'){
								task.tags.push(tag);
							}else{
								task.title = (task.title + " " + tag).trim();
							}
						}
					}
					let column = getLastColumn(kanban);
					if(!column){
						column = { title: "To do", line: -1, text: "", tasks:[] };
						kanban.columns.push(column);
					}
					column.tasks.push(task);
				}
			}
		}
		return kanban;
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, doc: vscode.TextDocument,kanbans:Kanban[]) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._document = doc;
		this.version = doc.version;

		vscode.workspace.onDidChangeTextDocument(e=>{
			this._onDidChangeTextDocument(e);
		},this,this._disposables);

		this._panel.webview.onDidReceiveMessage(
			message => {
				this._onDidReceiveMessage(message);
			},
			null,
			this._disposables
		);

		this._panel.onDidDispose(() => {
			this.dispose();
		}, null, this._disposables);

		this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
		this._updateView(kanbans);
	}

	private _onDidChangeTextDocument(e:vscode.TextDocumentChangeEvent){
        console.log("KanbanBoardPanel -> _onDidChangeTextDocument -> e", e, this.version);
		if(e.document.fileName===this._document.fileName && e.document.version!==this.version){
			this.version = e.document.version;
			let kanbans = KanbanBoardPanel.detectKanban(this._document);
			this._updateView(kanbans);
		}
	}

	private _setDocument(doc:vscode.TextDocument,kanbans:Kanban[])
	{
		this._document=doc;
		this._updateView(kanbans);
	}

	private _updateView(kanbans:Kanban[]){
        console.log("KanbanBoardPanel -> _updateView -> kanbans", kanbans);
		if(kanbans.length>0){
			let p = path.parse(kanbans[0].file);
			this._panel.title = `Kanban Borad - ${p.name}${p.ext}`;
		}else{
			this._panel.title = `Kanban Borad`;
		}
		this._panel.webview.postMessage({
			command:"update",
			kanbans:kanbans,
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview) {
		const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'media', 'index.js');
		const scriptUri = webview.asWebviewUri(scriptPathOnDisk);
		const nonce = getNonce();

//		<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
		return `<!DOCTYPE html>
			<html lang="ja">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
			</head>
            <body>
                <div class="app" id="app"></div>
				<script nonce="${nonce}" src="${scriptUri}"></script>
			</body>
			</html>`;
    }


	private _getLine(doc:vscode.TextDocument,task:Kanban|Task|Column):vscode.TextLine|null
	{
		var textline = doc.lineAt(task.line);
		if(textline.text===task.text){
			return textline;
		}
		return null;
	}

	private _getColumnLastPos(doc:vscode.TextDocument,column:Column):vscode.Position|null
	{
		let textline:vscode.TextLine|null;
		if(column.tasks.length===0){
			textline = this._getLine(doc,column);
		}else{
			let task = column.tasks[column.tasks.length-1];
			textline = this._getLine(doc,task);
		}
		if(textline){
			return textline.range.start.translate(1,0);
		}
		return null;
	}

	private _getKanbanLastPos(doc:vscode.TextDocument,kanban:Kanban):vscode.Position|null
	{
		if(kanban.columns.length===0){
			let textline = this._getLine(doc,kanban);
			if(textline){
				return textline.range.start.translate(1,0);
			}
		}else{
			let column = kanban.columns[kanban.columns.length-1];
			let pos = this._getColumnLastPos(doc,column);
			return pos;
		}
		return null;
	}

	private _autoSave(doc:vscode.TextDocument)
	{
		let autosave = vscode.workspace.getConfiguration().get("kanban.autosave") as boolean;
		if(autosave){
			return doc.save();
		}
	}

    private _addTask(msg:any)
    {
		let uri = vscode.Uri.file(msg.kanban.file);
		vscode.workspace.openTextDocument(uri).then(doc=>{
			let pos = this._getColumnLastPos(doc,msg.column);
			if(pos){
				let text = `- [ ] ${msg.str}`;
				let edit = new vscode.WorkspaceEdit();
				edit.insert(uri, pos, text);
				edit.insert(uri, pos, doc.eol===vscode.EndOfLine.LF?"\n":"\r\n");
				vscode.workspace.applyEdit(edit).then(()=>{
					this._autoSave(doc);
				});
			}else{
				console.error("同期が取れてない");
			}
		});
    }

    private _addColumn(msg:any)
    {
		let uri = vscode.Uri.file(msg.kanban.file);
		vscode.workspace.openTextDocument(uri).then(doc=>{
			let pos = this._getKanbanLastPos(doc,msg.kanban);
			if(pos){
				let text = `${"#".repeat(msg.kanban.level+1)} ${msg.str}`;
				let edit = new vscode.WorkspaceEdit();
				edit.insert(uri, pos, doc.eol===vscode.EndOfLine.LF?"\n":"\r\n");
				edit.insert(uri, pos, text);
				edit.insert(uri, pos, doc.eol===vscode.EndOfLine.LF?"\n":"\r\n");
				vscode.workspace.applyEdit(edit).then(()=>{
					this._autoSave(doc);
				});
			}else{
				console.error("同期が取れてない");
			}
		});
    }

	private _editTask(msg:any)
	{
		let uri = vscode.Uri.file(msg.kanban.file);
		vscode.workspace.openTextDocument(uri).then(doc=>{
			let textline = this._getLine(doc,msg.old);
			if(textline){
				let edit = new vscode.WorkspaceEdit();
				edit.replace(doc.uri,textline.range,msg.task.text);
				vscode.workspace.applyEdit(edit).then(()=>{
					this._autoSave(doc);
				});
			}else{
				console.error("同期が取れてない");
			}
		});
	}

	private _checkColumnType(column:Column):ColumnType
	{
		let title = column.title.toUpperCase().replace(/ /g,"");
		let columnTodo = (vscode.workspace.getConfiguration().get("kanban.column.todo") as string).split(",").map(t=>t.toUpperCase().replace(/ /g,""));
		let columnDone = (vscode.workspace.getConfiguration().get("kanban.column.done") as string).split(",").map(t=>t.toUpperCase().replace(/ /g,""));

		if( columnTodo.indexOf(title)>=0 ){
			return ColumnType.TODO;
		}
		if( columnDone.indexOf(title)>=0 ){
			return ColumnType.DONE;
		}
		return ColumnType.NONE;
	}

	private _toTaskString(task:Task)
	{
		return `- [${task.check}] ${task.title} ${task.tags.join(" ")}`.trim();
	}

	private _applyAutoTag(msg:any) : string
	{
		let startTag = vscode.workspace.getConfiguration().get("kanban.starttag.name") as string;
		let endTag = vscode.workspace.getConfiguration().get("kanban.endtag.name") as string;

		function isStartTag(tag:string):boolean {
			let sp = startTag.split("%t");
			if(sp.length===2){
				return tag.startsWith(sp[0]) && tag.endsWith(sp[1]);
			}else{
				return tag === startTag;
			}
		}

		function isEndTag(tag:string):boolean {
			let sp = endTag.split("%t");
			if(sp.length===2){
				return tag.startsWith(sp[0]) && tag.endsWith(sp[1]);
			}else{
				return tag === endTag;
			}
		}

		function getTime():string
		{
			function fill(s:number,l:number){
				let f = `0000${s}`;
				return f.substr(f.length-l);
			}
			let time = vscode.workspace.getConfiguration().get("kanban.time.dateformat") as string;
			let date = new Date();
			time = time.replace("YYYY",fill(date.getFullYear(),4));
			time = time.replace("MM",fill(date.getMonth()+1,2));
			time = time.replace("DD",fill(date.getDate(),2));
			time = time.replace("HH",fill(date.getHours(),2));
			time = time.replace("mm",fill(date.getMinutes(),2));
			time = time.replace("ss",fill(date.getSeconds(),2));
			return time;
		}

		function makeStartTag():string {
			return startTag.replace("%t",getTime());
		}

		function makeEndTag():string {
			return endTag.replace("%t",getTime());
		}

		let task:Task = msg.from;
		let from:Column = msg.kanban.columns.find((c:any)=>c.tasks.find((t:any)=>t.line===msg.from.line) );
		let to:Column = msg.to?msg.kanban.columns.find((c:any)=>c.tasks.find((t:any)=>t.line===msg.to.line) ):msg.column;

		if( from.line === to.line){
			return task.text;
		}

		let fromType = this._checkColumnType(from);
		let toType = this._checkColumnType(to);


		if( toType === ColumnType.DONE ){
			let checkWhenMoveToDone = vscode.workspace.getConfiguration().get("kanban.check.checkWhenMoveToDone") as boolean;
			let setEndWhenMoveToDone = vscode.workspace.getConfiguration().get("kanban.endtag.setEndWhenMoveToDone") as boolean;
			if( checkWhenMoveToDone ){
				task.check = "x";
			}
			if( setEndWhenMoveToDone ){
				task.tags = task.tags.filter( tag => !isEndTag(tag) );
				task.tags.push( makeEndTag() );
			}
		}

		if( toType === ColumnType.TODO ){
			let unsetStartWhenMoveToTodo = vscode.workspace.getConfiguration().get("kanban.starttag.unsetStartWhenMoveToTodo") as boolean;
			if( unsetStartWhenMoveToTodo ){
				task.tags = task.tags.filter( tag => !isStartTag(tag) );
			}
		}

		if( fromType === ColumnType.DONE ){
			let uncheckWhenMoveFromDone = vscode.workspace.getConfiguration().get("kanban.check.uncheckWhenMoveFromDone") as boolean;
			let unsetEndWhenMoveFromDone = vscode.workspace.getConfiguration().get("kanban.endtag.unsetEndWhenMoveFromDone") as boolean;
			if( uncheckWhenMoveFromDone ){
				task.check = " ";
			}
			if( unsetEndWhenMoveFromDone ){
				task.tags = task.tags.filter( tag => !isEndTag(tag) );
			}
		}

		if( fromType === ColumnType.TODO ){
			let setStartWhenMoveFromTodo = vscode.workspace.getConfiguration().get("kanban.starttag.setStartWhenMoveFromTodo") as boolean;
			if( setStartWhenMoveFromTodo ){
				task.tags = task.tags.filter( tag => !isStartTag(tag) );
				task.tags.push( makeStartTag() );
			}
		}

		return this._toTaskString(task);
	}

	private _moveTask(msg:any)
	{
		let getMovePos = (doc:vscode.TextDocument,msg:any): vscode.Position|null => {
			if(msg.to){
				let to = this._getLine(doc,msg.to);
				if(to){
					return to.range.start.translate(1,0);
				}
			}else{
				let column = this._getLine(doc,msg.column);
				if(column){
					let offset = 1;
					if(msg.column.tasks.length>0){
						offset = msg.column.tasks[0].line-msg.column.line;
					}
					return column.range.start.translate(offset,0);
				}
			}
			return null;
		};

		let uri = vscode.Uri.file(msg.kanban.file);
		vscode.workspace.openTextDocument(uri).then(doc=>{
			let from = this._getLine(doc,msg.from);
			if(from){
				let pos = getMovePos(doc,msg);
				if(pos){
					let edit = new vscode.WorkspaceEdit();

					let end = from.range.start.translate(1,0);
					let range = new vscode.Range(from.range.start,end);
					edit.delete(uri,range);

					let text = this._applyAutoTag(msg);

					edit.insert(uri,pos,text);
					edit.insert(uri,pos,doc.eol===vscode.EndOfLine.LF?"\n":"\r\n");
					vscode.workspace.applyEdit(edit).then(()=>{
						this._autoSave(doc);
					});
					return;
				}
			}
			console.error("同期が取れてない");
		});
	}

	private _removeTask(msg:any)
	{
		let uri = vscode.Uri.file(msg.kanban.file);
		vscode.workspace.openTextDocument(uri).then(doc=>{
			let task = this._getLine(doc,msg.task);
			if(task){
				let range = new vscode.Range(task.range.start,task.range.start.translate(1,0));
				let edit = new vscode.WorkspaceEdit();
				edit.delete(uri,range);
				vscode.workspace.applyEdit(edit).then(()=>{
					this._autoSave(doc);
				});
				return;
			}else{
				console.error("同期が取れてない");
			}
		});
	}

	private _onDidReceiveMessage(msg:any)
	{
		console.log("KanbanBoardPanel -> _onDidReceiveMessage -> msg", msg);
		switch(msg.command){
			case "add.task":
				if(msg.kanban && msg.column && msg.str) {
					this._addTask(msg);
				}
				break;
			case "add.column":
				if(msg.kanban && msg.str) {
					this._addColumn(msg);
				}
				break;
			case "edit.task":
				if(msg.kanban && msg.task && msg.old) {
					this._editTask(msg);
				}
				break;
			case "move.task":
				if(msg.kanban && msg.from) {
					this._moveTask(msg);
				}
				break;
			case "remove.task":
				if(msg.kanban && msg.column && msg.task) {
					this._removeTask(msg);
				}
				break;
				}
	}

	public dispose() {
		KanbanBoardPanel.currentPanel = undefined;
		this._panel.dispose();
		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}