import { mock } from "bun:test";
import {
	moment,
	normalizePath,
	TFile,
	TFolder,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	AbstractInputSuggest,
} from "./__mocks__/obsidian";

mock.module("obsidian", () => ({
	moment,
	normalizePath,
	TFile,
	TFolder,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	AbstractInputSuggest,
}));
