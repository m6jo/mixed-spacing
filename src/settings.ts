import { SpaceState, string2SpaceState } from 'src/core';
import { App, TextComponent, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, Workspace, WorkspaceLeaf, TextAreaComponent, moment } from 'obsidian';
import EasyTypingPlugin from './main';
import { showString, findFirstPipeNotPrecededByBackslash } from './utils';
import { enUS, ruRU, zhCN, zhTW } from './lang/locale';
import {sprintf} from "sprintf-js";
import { setDebug } from './utils';

export interface PairString {
	left: string;
	right: string;
}

export interface ConvertRule {
	before: PairString;
	after: PairString;
	after_pattern?: string;
}

export enum RuleType {delete= "Delete Rule", convert='Convert Rule'}
export enum WorkMode { OnlyWhenTyping = "typing", Globally = "global" }
export enum StrictLineMode { EnterTwice = "enter_twice", TwoSpace = "two_space", Mix = "mix_mode" }

export interface EasyTypingSettings {
	Tabout: boolean;
	SelectionEnhance: boolean;
	IntrinsicSymbolPairs: boolean;
	BaseObEditEnhance: boolean;
	BetterCodeEdit: boolean;
	BetterBackspace: boolean;
	AutoFormat: boolean;
	ExcludeFiles: string;
	AutoCapital: boolean;
	AutoCapitalMode: WorkMode;
	ChineseEnglishSpace: boolean;
	EnglishNumberSpace: boolean;
	QuoteSpace: boolean;
	ChineseNoSpace: boolean;
	ChineseNumberSpace: boolean;
	PunctuationSpace: boolean;
	PunctuationSpaceMode: WorkMode;
	InlineCodeSpaceMode: SpaceState;
	InlineFormulaSpaceMode: SpaceState;
	InlineLinkSpaceMode: SpaceState;
	InlineLinkSmartSpace: boolean;
	UserDefinedRegSwitch: boolean;
	UserDefinedRegExp: string;
	debug: boolean;

	userSelRepRuleTrigger: string[];
	userSelRepRuleValue: PairString[];
	userDeleteRulesStrList: [string, string][];
	userConvertRulesStrList: [string, string][];
	userSelRuleSettingsOpen: boolean;
	userDelRuleSettingsOpen: boolean;
	userCvtRuleSettingsOpen: boolean;

	StrictModeEnter: boolean;
	StrictLineMode: StrictLineMode;
	EnhanceModA: boolean;
	PuncRectify: boolean;
	TryFixChineseIM: boolean;
	FixMacOSContextMenu: boolean;
	TryFixMSIME: boolean;
	CollapsePersistentEnter: boolean;
}

export const DEFAULT_SETTINGS: EasyTypingSettings = {
	Tabout: true,
	SelectionEnhance: true,
	IntrinsicSymbolPairs: true,
	BaseObEditEnhance: false,
	BetterCodeEdit: false,
	BetterBackspace: true,
	AutoFormat: true,
	ExcludeFiles: "",
	ChineseEnglishSpace: true,
	ChineseNumberSpace: true,
	EnglishNumberSpace: false,
	ChineseNoSpace: true,
	QuoteSpace: true,
	PunctuationSpace: true,
	AutoCapital: false,
	AutoCapitalMode: WorkMode.OnlyWhenTyping,
	PunctuationSpaceMode: WorkMode.OnlyWhenTyping,
	InlineCodeSpaceMode: SpaceState.soft,
	InlineFormulaSpaceMode: SpaceState.soft,
	InlineLinkSpaceMode: SpaceState.soft,
	InlineLinkSmartSpace: true,
	UserDefinedRegSwitch: true,
	UserDefinedRegExp: "{{.*?}}|++\n"+
		"<.*?>|--\n" +
		"\\[\\!.*?\\][-+]{0,1}|-+\n"+
		"(file:///|https?://|ftp://|obsidian://|zotero://|www.)[^\\s（）《》。,，！？;；：\"\"''\\)\\(\\[\\]\\{\\}']+|--\n"+
		"\n[a-zA-Z0-9_\\-.]+@[a-zA-Z0-9_\\-.]+|++\n"+
		"(?<!#)#[\\u4e00-\\u9fa5\\w-\\/]+|++",
	debug: false,
	userSelRepRuleTrigger: [],
	userSelRepRuleValue: [],
	userDeleteRulesStrList: [],
	userConvertRulesStrList: [],
	userSelRuleSettingsOpen: true,
	userDelRuleSettingsOpen: true,
	userCvtRuleSettingsOpen: true,

	StrictModeEnter: false,
	StrictLineMode: StrictLineMode.EnterTwice,
	EnhanceModA: false,
	TryFixChineseIM: true,
	PuncRectify: false,
	FixMacOSContextMenu: false,
	TryFixMSIME: false,
	CollapsePersistentEnter: false,
}

var locale = enUS;

export class EasyTypingSettingTab extends PluginSettingTab {
	plugin: EasyTypingPlugin;

	constructor(app: App, plugin: EasyTypingPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		if (moment.locale() == "zh" || moment.locale() == "zh-cn") {
			locale = zhCN;
		}
		else if (moment.locale().toLowerCase() == "zh-tw"){
			locale = zhTW;
		}
		else if (moment.locale() == "ru") {
			locale = ruRU;
		}

		containerEl.empty();

		containerEl.createEl("h1", { text: "Red Panda Formatter" });
		containerEl.createEl("p", { text: "基於 easy-typing 的精簡版排版工具" });

		containerEl.createEl("h2", { text: "使用說明" });
		containerEl.createEl("p", { text: "此插件針對中文寫作優化，啟用後會自動進行以下格式化：" });

		const featureList = containerEl.createEl("ul");
		featureList.createEl("li", { text: "✅ 自動配對符號（括號、引號等）" });
		featureList.createEl("li", { text: "✅ 中英文、中文數字間自動加空格" });
		featureList.createEl("li", { text: "✅ 智能選擇替換增強" });
		featureList.createEl("li", { text: "✅ 增強刪除功能與 Tab 跳出" });
		featureList.createEl("li", { text: "✅ 引用符號空格與標點處理" });
		featureList.createEl("li", { text: "❌ 已關閉：代碼塊編輯、句首大寫、英文數字空格" });

		containerEl.createEl("p", {
			text: "如需調整功能，請直接修改插件設定檔或聯繫開發者。",
			attr: { style: "color: #666; font-style: italic; margin-top: 20px;" }
		});

		// Debug setting (hidden but functional)
		if (this.plugin.settings.debug) {
			containerEl.createEl("h3", { text: "Debug Mode (開發者模式)" });
			containerEl.createEl("p", { text: "Debug mode is currently enabled." });
		}
	}
}

// Helper functions for string/SpaceState conversion
export function spaceState2String(space_state: SpaceState): string {
	if (space_state == SpaceState.none) return "none";
	else if (space_state == SpaceState.soft) return "soft";
	else return "strict";
}

export function string2spaceState(str: string): SpaceState {
	if (str == "none") return SpaceState.none;
	else if (str == "soft") return SpaceState.soft;
	else return SpaceState.strict;
}