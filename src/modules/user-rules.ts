// User Rules Module - Lazy loaded for performance
import { EditorView } from '@codemirror/view';
import { Transaction, TransactionSpec } from '@codemirror/state';
import { ConvertRule, EasyTypingSettings } from '../settings';
import { isRegexp, replacePlaceholders, parseTheAfterPattern } from '../utils';

export class UserRulesProcessor {
    private settings: EasyTypingSettings;
    private userDeleteRules: ConvertRule[] = [];
    private userConvertRules: ConvertRule[] = [];

    constructor(settings: EasyTypingSettings) {
        this.settings = settings;
        this.refreshUserRules();
    }

    refreshUserRules(): void {
        this.refreshUserDeleteRule();
        this.refreshUserConvertRule();
    }

    private refreshUserDeleteRule(): void {
        this.userDeleteRules = [];
        for (let ruleStr of this.settings.userDeleteRulesStrList) {
            let before = ruleStr[0];
            let after = ruleStr[1];

            let beforeLeftStr = before.substring(0, before.indexOf('|'));
            let beforeRightStr = before.substring(before.indexOf('|') + 1);
            let afterLeftStr = after.substring(0, after.indexOf('|'));
            let afterRightStr = after.substring(after.indexOf('|') + 1);

            this.userDeleteRules.push({
                before: { left: beforeLeftStr, right: beforeRightStr },
                after: { left: afterLeftStr, right: afterRightStr }
            });
        }
    }

    private refreshUserConvertRule(): void {
        this.userConvertRules = [];
        for (let ruleStr of this.settings.userConvertRulesStrList) {
            let before = ruleStr[0];
            let after = ruleStr[1];

            let beforeLeftStr = before.substring(0, before.indexOf('|'));
            let beforeRightStr = before.substring(before.indexOf('|') + 1);
            let afterLeftStr = after.substring(0, after.indexOf('|'));
            let afterRightStr = after.substring(after.indexOf('|') + 1);

            let rule: ConvertRule = {
                before: { left: beforeLeftStr, right: beforeRightStr },
                after: { left: afterLeftStr, right: afterRightStr }
            };

            if (isRegexp(afterLeftStr) || isRegexp(afterRightStr)) {
                rule.after_pattern = afterLeftStr + "|" + afterRightStr;
            }

            this.userConvertRules.push(rule);
        }
    }

    processUserDeleteRules(tr: Transaction, fromA: number, toA: number, toB: number, changeTypeStr: string): TransactionSpec | null {
        if (changeTypeStr !== "delete.backward") return null;

        for (let rule of this.userDeleteRules) {
            let leftDocStr = tr.startState.doc.sliceString(0, toA);
            let rightDocStr = tr.startState.doc.sliceString(toA);
            let leftRegexpStr = rule.before.left;

            if (isRegexp(rule.before.left)) {
                leftRegexpStr = leftRegexpStr.slice(2, -1);
            } else {
                leftRegexpStr = leftRegexpStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            }

            let leftRegexp = new RegExp(leftRegexpStr + "$");
            let match = leftDocStr.match(leftRegexp);

            if (match) {
                let rightRegexpStr = rule.before.right;
                if (isRegexp(rule.before.right)) {
                    rightRegexpStr = rightRegexpStr.slice(2, -1);
                } else {
                    rightRegexpStr = rightRegexpStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                }

                let rightRegexp = new RegExp("^" + rightRegexpStr);
                let rightMatch = rightDocStr.match(rightRegexp);

                if (rightMatch) {
                    let afterLeftStr = rule.after.left;
                    let afterRightStr = rule.after.right;

                    if (rule.after_pattern) {
                        let afterRes = parseTheAfterPattern(rule.after_pattern, [match[0], rightMatch[0]]);
                        let afterParts = afterRes[0].split('|');
                        afterLeftStr = afterParts[0] || '';
                        afterRightStr = afterParts[1] || '';
                    }

                    return {
                        changes: {
                            from: toA - match[0].length,
                            to: toA + rightMatch[0].length,
                            insert: afterLeftStr + afterRightStr
                        },
                        selection: { anchor: toA - match[0].length + afterLeftStr.length },
                        userEvent: "EasyTyping.change"
                    };
                }
            }
        }

        return null;
    }

    processUserConvertRules(tr: Transaction, fromA: number, toA: number, toB: number, changeTypeStr: string, insertedStr: string): TransactionSpec | null {
        if (changeTypeStr !== "input.type" && changeTypeStr !== "input.type.compose") return null;

        for (let rule of this.userConvertRules) {
            if (insertedStr !== rule.before.left.charAt(rule.before.left.length - 1)) continue;

            let left = tr.state.doc.sliceString(toB - rule.before.left.length, toB);
            let right = tr.state.doc.sliceString(toB, toB + rule.before.right.length);

            if (left === rule.before.left && right === rule.before.right) {
                let afterLeftStr = rule.after.left;
                let afterRightStr = rule.after.right;

                if (rule.after_pattern) {
                    let afterRes = replacePlaceholders(rule.after_pattern, [left, right]);
                    let afterParts = afterRes.split('|');
                    if (afterParts.length >= 2) {
                        afterLeftStr = afterParts[0];
                        afterRightStr = afterParts[1];
                    }
                }

                return {
                    changes: {
                        from: toA - rule.before.left.length + 1,
                        to: toA + rule.before.right.length,
                        insert: afterLeftStr + afterRightStr
                    },
                    selection: { anchor: toA - rule.before.left.length + afterLeftStr.length + 1 },
                    userEvent: "EasyTyping.change"
                };
            }
        }

        return null;
    }

    updateSettings(newSettings: EasyTypingSettings): void {
        this.settings = newSettings;
        this.refreshUserRules();
    }
}