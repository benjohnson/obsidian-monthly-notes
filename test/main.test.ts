import { test, expect, beforeEach, spyOn, describe } from "bun:test";

import MonthlyNotesPlugin, { buildNotePath, applyTemplate } from "../src/main";
import { DEFAULT_SETTINGS, MonthlyNotesSettingTab, isCustomFormat, type MonthlyNotesSettings } from "../src/settings";
import * as obsidianMock from "./__mocks__/obsidian";
import moment from "moment";

type App = ReturnType<typeof obsidianMock.createMockApp>;

// A fixed instant for every test that builds a path or opens a note, so nothing
// depends on the wall clock or the machine locale.
const NOW = moment("2026-06-09T14:30:00"); // June 2026 (month 06)

function createPlugin(app?: App): MonthlyNotesPlugin {
	const plugin = new MonthlyNotesPlugin({} as any, {} as any);
	if (app) plugin.app = app as any;
	return plugin;
}

function makeSettings(overrides: Partial<MonthlyNotesSettings> = {}): MonthlyNotesSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

beforeEach(() => {
	moment.locale("en");
});

// ─── buildNotePath ──────────────────────────────────────────────────

describe("buildNotePath", () => {
	test("default settings produce a root-level filename", () => {
		expect(buildNotePath(DEFAULT_SETTINGS, NOW)).toBe("2026-06.md");
	});

	test("a configured folder is prefixed", () => {
		expect(buildNotePath(makeSettings({ folder: "Monthly" }), NOW)).toBe("Monthly/2026-06.md");
		expect(buildNotePath(makeSettings({ folder: "Notes/Monthly" }), NOW)).toBe("Notes/Monthly/2026-06.md");
	});

	test("the folder is trimmed; a whitespace-only folder is treated as empty", () => {
		expect(buildNotePath(makeSettings({ folder: "  Monthly  " }), NOW)).toBe("Monthly/2026-06.md");
		expect(buildNotePath(makeSettings({ folder: "   " }), NOW)).toBe("2026-06.md");
	});

	test("messy folder input is normalized (leading/trailing, backslashes, doubled slashes)", () => {
		// These pass through Obsidian's normalizePath, which the mock mirrors exactly.
		expect(buildNotePath(makeSettings({ folder: "/Monthly" }), NOW)).toBe("Monthly/2026-06.md");
		expect(buildNotePath(makeSettings({ folder: "Monthly/" }), NOW)).toBe("Monthly/2026-06.md");
		expect(buildNotePath(makeSettings({ folder: "Monthly\\Notes" }), NOW)).toBe("Monthly/Notes/2026-06.md");
		expect(buildNotePath(makeSettings({ folder: "Monthly//Notes" }), NOW)).toBe("Monthly/Notes/2026-06.md");
	});

	test("'..' in a folder is NOT sanitized (documents the limitation)", () => {
		// normalizePath does not resolve '..', so a user who types '../outside'
		// escapes the intended folder. Pinned so the behavior is a decision, not a surprise.
		expect(buildNotePath(makeSettings({ folder: "../outside" }), NOW)).toStartWith("../outside/");
	});

	test("the YYYY MMMM preset format", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "YYYY MMMM" }), NOW)).toBe("2026 June.md");
	});

	test("a custom format with escaped literal text", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "[Month] MMMM, YYYY" }), NOW)).toBe("Month June, 2026.md");
	});

	test("a slash inside the date format produces a nested path", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "YYYY/[M]MM" }), NOW)).toBe("2026/M06.md");
	});

	test("an empty date format does not crash and still yields a .md path", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "" }), NOW)).toEndWith(".md");
	});

	// Month-numbering near year boundaries — the default YYYY-MM format is
	// locale-independent, so these are simpler than the week equivalents. These are
	// the regressions that would silently point a user at the wrong note.
	test("Dec 31 2026 stays in month 12 of 2026", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "YYYY-MM" }), moment("2026-12-31"))).toBe("2026-12.md");
	});

	test("Jan 1 2027 starts a new month and year", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "YYYY-MM" }), moment("2027-01-01"))).toBe("2027-01.md");
	});

	test("MM zero-pads the month number", () => {
		expect(buildNotePath(makeSettings({ dateFormat: "YYYY-MM" }), moment("2026-01-05"))).toBe("2026-01.md");
	});

	test("all days of one month resolve to the same file", () => {
		const settings = makeSettings({ dateFormat: "YYYY-MM" });
		// Jun 1 and Jun 30, 2026 share a month.
		expect(buildNotePath(settings, moment("2026-06-01"))).toBe(buildNotePath(settings, moment("2026-06-30")));
	});
});

// ─── applyTemplate ──────────────────────────────────────────────────

describe("applyTemplate", () => {
	test("{{title}}, {{date}} and {{time}} are substituted", () => {
		expect(applyTemplate("{{title}}", "2026-06", NOW)).toBe("2026-06");
		expect(applyTemplate("{{date}}", "ignored", NOW)).toBe("2026-06-09");
		expect(applyTemplate("{{time}}", "ignored", NOW)).toBe("14:30");
	});

	test("matching is case-insensitive and tolerates inner whitespace", () => {
		expect(applyTemplate("{{TITLE}} {{Date}} {{TIME}}", "06", NOW)).toBe("06 2026-06-09 14:30");
		expect(applyTemplate("{{ title }} {{  date}} {{time  }}", "06", NOW)).toBe("06 2026-06-09 14:30");
	});

	test("every occurrence is replaced", () => {
		expect(applyTemplate("title: {{title}}\n# {{title}}", "2026-06", NOW)).toBe("title: 2026-06\n# 2026-06");
	});

	test("unknown and malformed tokens are left untouched", () => {
		expect(applyTemplate("{{tags}} {{weekday}}", "06", NOW)).toBe("{{tags}} {{weekday}}");
		expect(applyTemplate("{title} {{title}", "06", NOW)).toBe("{title} {{title}");
	});

	test("content with no matching placeholders passes through unchanged", () => {
		expect(applyTemplate("", "06", NOW)).toBe("");
		expect(applyTemplate("# Month {{title}} notes", "2026-06", NOW)).toBe("# Month 2026-06 notes");
	});

	test("a title with $-patterns is inserted literally, not as a regex replacement string", () => {
		// Guards against a refactor from a function replacer to a string replacer,
		// where '$&' / '$`' would expand against the match.
		expect(applyTemplate("{{title}}", "$&", NOW)).toBe("$&");
		expect(applyTemplate("{{title}}", "$`$'", NOW)).toBe("$`$'");
	});

	test("a title that itself looks like a placeholder is not re-expanded", () => {
		expect(applyTemplate("{{title}}", "{{date}}", NOW)).toBe("{{date}}");
	});

	test("time zero-pads single-digit hours and minutes", () => {
		expect(applyTemplate("{{time}}", "ignored", moment("2026-06-09T05:05:00"))).toBe("05:05");
	});

	test("{{date:FORMAT}} formats with the supplied moment format", () => {
		expect(applyTemplate("{{date:YYYY-MM-DD}}", "ignored", NOW)).toBe("2026-06-09");
		expect(applyTemplate("{{date:dddd}}", "ignored", NOW)).toBe("Tuesday");
		expect(applyTemplate("{{date:[Month] MMMM YYYY}}", "ignored", NOW)).toBe("Month June 2026");
	});

	test("{{time:FORMAT}} formats with the supplied moment format, colons and all", () => {
		expect(applyTemplate("{{time:HH:mm:ss}}", "ignored", NOW)).toBe("14:30:00");
		expect(applyTemplate("{{time:h:mm A}}", "ignored", NOW)).toBe("2:30 PM");
	});

	test("a format is case-insensitive on the key and tolerates whitespace around the format", () => {
		expect(applyTemplate("{{ DATE : YYYY/MM/DD }}", "ignored", NOW)).toBe("2026/06/09");
	});

	test("an empty format falls back to the default", () => {
		expect(applyTemplate("{{date:}}", "ignored", NOW)).toBe("2026-06-09");
		expect(applyTemplate("{{time:}}", "ignored", NOW)).toBe("14:30");
	});

	test("{{title}} takes no format; a title with a colon-suffix is left untouched", () => {
		// Title isn't a date — there's nothing to format. Rather than silently drop
		// the suffix, leave the malformed token in place like any other unknown token.
		expect(applyTemplate("{{title:YYYY}}", "2026-06", NOW)).toBe("{{title:YYYY}}");
	});
});

// ─── Settings persistence ───────────────────────────────────────────

describe("loadSettings / saveSettings", () => {
	test("first run falls back to defaults", async () => {
		const plugin = createPlugin();
		spyOn(plugin, "loadData").mockResolvedValue(null);
		await plugin.loadSettings();
		expect(plugin.settings).toEqual(DEFAULT_SETTINGS);
	});

	test("saved data is merged over defaults", async () => {
		const plugin = createPlugin();
		spyOn(plugin, "loadData").mockResolvedValue({ folder: "Monthly" });
		await plugin.loadSettings();
		expect(plugin.settings).toEqual({ ...DEFAULT_SETTINGS, folder: "Monthly" });
	});

	test("saveSettings hands the current settings object to saveData", async () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ folder: "Monthly" });
		const saveDataSpy = spyOn(plugin, "saveData").mockResolvedValue();
		await plugin.saveSettings();
		expect(saveDataSpy).toHaveBeenCalledWith(plugin.settings);
	});
});

// ─── isCustomFormat ─────────────────────────────────────────────────

describe("isCustomFormat", () => {
	test("presets are not custom; everything else (including empty) is", () => {
		expect(isCustomFormat("YYYY-MM")).toBe(false);
		expect(isCustomFormat("YYYY MMMM")).toBe(false);
		// Choosing "Custom" in the dropdown persists '', which must read back as custom.
		expect(isCustomFormat("")).toBe(true);
		expect(isCustomFormat("YYYY-MM-DD")).toBe(true);
	});
});

// ─── MonthlyNotesSettingTab dropdown translation ────────────────────
//
// The declarative settings API binds controls to keys on plugin.settings,
// but the date-format dropdown is a phantom key ("dateFormatDropdown") that
// has to be translated to/from the real "dateFormat" storage. These pin the
// round-trip so a future refactor of the tab can't silently break it.

function createSettingTab(plugin: MonthlyNotesPlugin, app?: App): MonthlyNotesSettingTab {
	return new MonthlyNotesSettingTab((app ?? obsidianMock.createMockApp()) as any, plugin);
}

describe("MonthlyNotesSettingTab dropdown translation", () => {
	test("getControlValue('dateFormatDropdown') returns the preset for a stored preset", () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ dateFormat: "YYYY-MM" });
		const tab = createSettingTab(plugin);

		expect(tab.getControlValue("dateFormatDropdown")).toBe("YYYY-MM");
	});

	test("getControlValue('dateFormatDropdown') returns 'custom' for an empty format", () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ dateFormat: "" });
		const tab = createSettingTab(plugin);

		expect(tab.getControlValue("dateFormatDropdown")).toBe("custom");
	});

	test("getControlValue('dateFormatDropdown') returns 'custom' for a non-preset format", () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ dateFormat: "YYYY-MM-DD" });
		const tab = createSettingTab(plugin);

		expect(tab.getControlValue("dateFormatDropdown")).toBe("custom");
	});

	test("setControlValue('dateFormatDropdown', preset) stores the preset and saves", async () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ dateFormat: "" });
		const saveSpy = spyOn(plugin, "saveSettings").mockResolvedValue();
		const tab = createSettingTab(plugin);

		await tab.setControlValue("dateFormatDropdown", "YYYY MMMM");

		expect(plugin.settings.dateFormat).toBe("YYYY MMMM");
		expect(saveSpy).toHaveBeenCalled();
	});

	test("setControlValue('dateFormatDropdown', 'custom') stores '' and saves", async () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ dateFormat: "YYYY-MM" });
		const saveSpy = spyOn(plugin, "saveSettings").mockResolvedValue();
		const tab = createSettingTab(plugin);

		await tab.setControlValue("dateFormatDropdown", "custom");

		expect(plugin.settings.dateFormat).toBe("");
		expect(saveSpy).toHaveBeenCalled();
	});

	test("getControlValue delegates to super for the folder key", () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings({ folder: "Monthly" });
		const tab = createSettingTab(plugin);

		expect(tab.getControlValue("folder")).toBe("Monthly");
	});

	test("setControlValue delegates to super for the template key", async () => {
		const plugin = createPlugin();
		plugin.settings = makeSettings();
		const tab = createSettingTab(plugin);

		await tab.setControlValue("template", "templates/monthly.md");

		expect(plugin.settings.template).toBe("templates/monthly.md");
	});
});

// ─── openMonthlyNote ───────────────────────────────────────────────

describe("openMonthlyNote", () => {
	beforeEach(() => obsidianMock.clearNotices());

	test("an existing note is opened, and the template is never read", async () => {
		const settings = makeSettings();
		const path = buildNotePath(settings, NOW);
		const app = obsidianMock.createMockApp(new Map([[path, new obsidianMock.TFile(path, "old")]]));
		const openFileSpy = spyOn(app.workspace.getLeaf(), "openFile");

		const plugin = createPlugin(app);
		plugin.settings = settings;
		const templateSpy = spyOn(plugin, "getTemplateContent");

		await plugin.openMonthlyNote(NOW);

		expect(openFileSpy).toHaveBeenCalledWith(expect.objectContaining({ path }));
		expect(templateSpy).not.toHaveBeenCalled();
	});

	test("a missing note is created with template content and opened", async () => {
		const app = obsidianMock.createMockApp();
		const createSpy = spyOn(app.vault, "create");
		const openFileSpy = spyOn(app.workspace.getLeaf(), "openFile");

		const plugin = createPlugin(app);
		plugin.settings = makeSettings();
		spyOn(plugin, "getTemplateContent").mockResolvedValue("# Hello");

		await plugin.openMonthlyNote(NOW);

		expect(createSpy).toHaveBeenCalledWith("2026-06.md", "# Hello");
		expect(openFileSpy).toHaveBeenCalledWith(expect.any(obsidianMock.TFile));
	});

	test("a missing configured folder is created before the note", async () => {
		const app = obsidianMock.createMockApp();
		const createFolderSpy = spyOn(app.vault, "createFolder");
		const createSpy = spyOn(app.vault, "create");

		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ folder: "Monthly" });
		spyOn(plugin, "getTemplateContent").mockResolvedValue("");

		await plugin.openMonthlyNote(NOW);

		expect(createFolderSpy).toHaveBeenCalledWith("Monthly");
		expect(createSpy).toHaveBeenCalledWith("Monthly/2026-06.md", "");
	});

	test("a nested missing folder is created in a single call (assumes recursive createFolder)", async () => {
		const app = obsidianMock.createMockApp();
		const createFolderSpy = spyOn(app.vault, "createFolder");

		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ folder: "Notes/Monthly" });
		spyOn(plugin, "getTemplateContent").mockResolvedValue("");

		await plugin.openMonthlyNote(NOW);

		// The code calls createFolder once with the full path and relies on Obsidian
		// creating intermediate folders. If that ever changes, nested folders fail
		// silently — this test is the tripwire.
		expect(createFolderSpy).toHaveBeenCalledTimes(1);
		expect(createFolderSpy).toHaveBeenCalledWith("Notes/Monthly");
	});

	test("an existing folder is not re-created", async () => {
		const app = obsidianMock.createMockApp(new Map([["Monthly", new obsidianMock.TFolder("Monthly")]]));
		const createFolderSpy = spyOn(app.vault, "createFolder");

		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ folder: "Monthly" });
		spyOn(plugin, "getTemplateContent").mockResolvedValue("");

		await plugin.openMonthlyNote(NOW);

		expect(createFolderSpy).not.toHaveBeenCalled();
	});

	test("a failed create surfaces a Notice instead of rejecting", async () => {
		// Realistic triggers: a folder occupies the note's path, or a double-click
		// race where the file appears between the existence check and the create.
		const path = buildNotePath(makeSettings(), NOW);
		const app = obsidianMock.createMockApp(new Map([[path, new obsidianMock.TFolder(path)]]));

		const plugin = createPlugin(app);
		plugin.settings = makeSettings();
		spyOn(plugin, "getTemplateContent").mockResolvedValue("");

		await expect(plugin.openMonthlyNote(NOW)).resolves.toBeUndefined();
		expect(obsidianMock.getNotices()).toHaveLength(1);
		expect(obsidianMock.getNotices()[0]).toStartWith("Failed to open monthly note:");
	});

	test("corrupted settings (non-string folder) surface a Notice, not a crash", async () => {
		// A hand-edited data.json like `"folder": null` makes folder.trim() throw;
		// the catch turns it into a user-facing Notice rather than a silent rejection.
		const plugin = createPlugin(obsidianMock.createMockApp());
		plugin.settings = makeSettings({ folder: null as any });

		await expect(plugin.openMonthlyNote(NOW)).resolves.toBeUndefined();
		expect(obsidianMock.getNotices()).toHaveLength(1);
	});
});

// ─── getTemplateContent ─────────────────────────────────────────────

describe("getTemplateContent", () => {
	beforeEach(() => obsidianMock.clearNotices());

	test("an empty or whitespace-only template returns '' and reads nothing", async () => {
		const plugin = createPlugin(obsidianMock.createMockApp());

		plugin.settings = makeSettings({ template: "" });
		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("");

		plugin.settings = makeSettings({ template: "   " });
		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("");

		expect(obsidianMock.getNotices()).toHaveLength(0);
	});

	test("a missing template shows a Notice and returns ''", async () => {
		const plugin = createPlugin(obsidianMock.createMockApp());
		plugin.settings = makeSettings({ template: "templates/monthly.md" });

		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("");
		expect(obsidianMock.getNotices()).toEqual(["Template file not found: templates/monthly.md"]);
	});

	test("a template path that resolves to a folder shows a Notice", async () => {
		const app = obsidianMock.createMockApp(new Map([["templates", new obsidianMock.TFolder("templates")]]));
		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ template: "templates" });

		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("");
		expect(obsidianMock.getNotices()).toHaveLength(1);
	});

	test("an existing template is read and its placeholders substituted", async () => {
		const app = obsidianMock.createMockApp(new Map([
			["templates/monthly.md", new obsidianMock.TFile("templates/monthly.md", "# {{title}}\n{{date}} {{time}}")],
		]));
		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ template: "templates/monthly.md" });

		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("# 2026-06\n2026-06-09 14:30");
	});

	test("a template path needing normalization still resolves", async () => {
		const app = obsidianMock.createMockApp(new Map([
			["templates/monthly.md", new obsidianMock.TFile("templates/monthly.md", "hello")],
		]));
		const plugin = createPlugin(app);
		plugin.settings = makeSettings({ template: "templates\\monthly.md" });

		expect(await plugin.getTemplateContent("2026-06", NOW)).toBe("hello");
	});
});

// ─── Plugin lifecycle ───────────────────────────────────────────────

describe("onload", () => {
	test("registers the open-note command, wired to openMonthlyNote", async () => {
		const plugin = createPlugin();
		const openSpy = spyOn(plugin, "openMonthlyNote").mockResolvedValue();
		const addCommandSpy = spyOn(plugin, "addCommand").mockImplementation((cmd: any) => cmd.callback());

		await plugin.onload();

		const [cmd] = addCommandSpy.mock.calls[0] as any[];
		expect(cmd.id).toBe("open-note");
		expect(cmd.name).toBe("Open monthly note");
		expect(openSpy).toHaveBeenCalled();
	});

	test("registers the calendar-days ribbon icon, wired to openMonthlyNote", async () => {
		const plugin = createPlugin();
		const openSpy = spyOn(plugin, "openMonthlyNote").mockResolvedValue();
		const ribbonSpy = spyOn(plugin, "addRibbonIcon").mockImplementation((_icon, _title, cb: any) => { cb(); return {} as any; });

		await plugin.onload();

		const [icon, title] = ribbonSpy.mock.calls[0] as any[];
		expect(icon).toBe("calendar-days");
		expect(title).toBe("Open monthly note");
		expect(openSpy).toHaveBeenCalled();
	});

	test("registers the settings tab", async () => {
		const plugin = createPlugin();
		const tabSpy = spyOn(plugin, "addSettingTab");

		await plugin.onload();

		expect(tabSpy).toHaveBeenCalledWith(expect.any(MonthlyNotesSettingTab));
	});
});
