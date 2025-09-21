// Article Formatter Module - Lazy loaded for performance
import { Editor, MarkdownView, Notice } from 'obsidian';
import { EditorView } from '@codemirror/view';
import { ensureSyntaxTree } from "@codemirror/language";
import { EasyTypingSettings } from '../settings';
import { LineFormater, getPosLineType, LineType } from '../core';

export class ArticleFormatter {
    private settings: EasyTypingSettings;
    private formater: LineFormater;

    constructor(settings: EasyTypingSettings) {
        this.settings = settings;
        this.formater = new LineFormater();
    }

    async formatArticle(editor: Editor, view: MarkdownView): Promise<void> {
        const editorView = editor.cm as EditorView;
        const tree = ensureSyntaxTree(editorView.state, editorView.state.doc.length);

        if (!tree) {
            new Notice('Red Panda Formatter: Syntax tree is not ready yet, please wait a moment and try again later!', 5000);
            return;
        }

        console.time('Article formatting');

        let lineCount = editor.lineCount();
        let new_article = "";
        let cs = editor.getCursor();
        let ch = 0;

        for (let i = 0; i < lineCount; i++) {
            if (i != 0) new_article += '\n';
            if (i != cs.line) {
                new_article += this.preFormatOneLine(editor, i + 1)[0];
            } else {
                let newData = this.preFormatOneLine(editor, i + 1, cs.ch);
                new_article += newData[0];
                ch = newData[1];
            }
        }

        editor.setValue(new_article);
        editor.setCursor({ line: cs.line, ch: ch });

        console.timeEnd('Article formatting');
        new Notice('Red Panda Formatter: 文章格式化完成！', 2000);
    }

    formatSelectionOrCurLine(editor: Editor, view: MarkdownView): void {
        if (!editor.somethingSelected() || editor.getSelection() === '') {
            let lineNumber = editor.getCursor().line;
            let newLineData = this.preFormatOneLine(editor, lineNumber + 1, editor.getCursor().ch);
            editor.replaceRange(newLineData[0], { line: lineNumber, ch: 0 }, { line: lineNumber, ch: editor.getLine(lineNumber).length });
            editor.setSelection({ line: lineNumber, ch: newLineData[1] });
            new Notice('Red Panda Formatter: 行格式化完成！', 1500);
            return;
        }

        let selection = editor.listSelections()[0];
        let begin = selection.anchor.line;
        let end = selection.head.line;
        if (begin > end) {
            let temp = begin;
            begin = end;
            end = temp;
        }

        let new_lines = "";
        for (let i = begin; i <= end; i++) {
            if (i != begin) new_lines += '\n';
            new_lines += this.preFormatOneLine(editor, i + 1)[0];
        }

        editor.replaceRange(new_lines, { line: begin, ch: 0 }, { line: end, ch: editor.getLine(end).length });
        if (selection.anchor.line < selection.head.line) {
            editor.setSelection({ line: selection.anchor.line, ch: 0 }, { line: selection.head.line, ch: editor.getLine(selection.head.line).length });
        } else {
            editor.setSelection({ line: selection.anchor.line, ch: editor.getLine(selection.anchor.line).length }, { line: selection.head.line, ch: 0 });
        }

        new Notice('Red Panda Formatter: 選擇區域格式化完成！', 1500);
    }

    private preFormatOneLine(editor: Editor, lineNumber: number, ch: number = -1): [string, number] {
        const editorView = editor.cm as EditorView;
        let state = editorView.state;
        let line = state.doc.line(lineNumber);

        let newLine = line.text;
        let newCh = 0;
        let curCh = line.text.length;
        if (ch != -1) {
            curCh = ch;
        }

        try {
            if (getPosLineType(state, line.from) == LineType.text || getPosLineType(state, line.from) == LineType.table) {
                let newLineData = this.formater.formatLine(state, lineNumber, this.settings, curCh, 0);
                newLine = newLineData[0];
                newCh = newLineData[1];
            }
        } catch (error) {
            console.warn('Formatting error:', error);
            // Fallback to original line
        }

        return [newLine, newCh];
    }

    deleteBlankLines(editor: Editor): void {
        const editorView = editor.cm as EditorView;
        let state = editorView.state;
        let doc = state.doc;

        const tree = ensureSyntaxTree(state, doc.length);
        if (!tree) {
            new Notice('Red Panda Formatter: 語法樹尚未準備完成，請稍等片刻後重試！', 5000);
            return;
        }

        console.time('Delete blank lines');

        let start_line = 1;
        let end_line = doc.lines;
        let line_num = doc.lines;
        const selected = editor.somethingSelected() && editor.getSelection() != '';
        if (selected) {
            let selection = editor.listSelections()[0];
            let begin = selection.anchor.line + 1;
            let end = selection.head.line + 1;
            if (begin > end) {
                let temp = begin;
                begin = end;
                end = temp;
            }
            start_line = begin;
            end_line = end;
        }

        let delete_index: number[] = [];
        let blank_reg = /^\s*$/;
        let remain_next_blank = false;

        if (start_line != 1) {
            let node = tree.resolve(doc.line(start_line - 1).from, 1);
            if (node.name.contains('list') || node.name.contains('quote') || node.name.contains('blockid')) {
                remain_next_blank = true;
            }
        }
        if (end_line != line_num && !blank_reg.test(doc.line(end_line + 1).text)) {
            end_line += 1;
        }

        for (let i = start_line; i <= end_line; i++) {
            let line = doc.line(i);
            let pos = line.from;
            let node = tree.resolve(pos, 1);

            // 對於空白行
            if (blank_reg.test(line.text) && !remain_next_blank) {
                delete_index.push(i);
                continue;
            }
            else if (blank_reg.test(line.text) && remain_next_blank) {
                remain_next_blank = false;
                continue;
            }

            if (node.name.contains('hr') && delete_index[delete_index.length - 1] == i - 1) {
                delete_index.pop();
            }
            else if (node.name.contains('list') || node.name.contains('quote') || node.name.contains('blockid')) {
                remain_next_blank = true;
            }
            else {
                remain_next_blank = false;
            }
        }

        let newContent = "";
        for (let i = 1; i < line_num; i++) {
            if (!delete_index.includes(i)) {
                newContent += doc.line(i).text + '\n';
            }
        }
        if (!delete_index.includes(line_num)) {
            newContent += doc.line(line_num).text;
        }

        editor.setValue(newContent);

        console.timeEnd('Delete blank lines');
        new Notice('Red Panda Formatter: 空行刪除完成！', 1500);
    }
}