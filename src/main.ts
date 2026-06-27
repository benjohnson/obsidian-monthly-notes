import { moment, normalizePath, Notice, Plugin, TFile } from 'obsidian';
import type { MonthlyNotesSettings } from './settings';
import { DEFAULT_SETTINGS, MonthlyNotesSettingTab } from './settings';

export function buildNotePath(
	settings: { dateFormat: string; folder: string },
	now: ReturnType<typeof moment>,
): string {
	const dateFormatted = now.format(settings.dateFormat);
	const folder = settings.folder.trim();
	const filename = folder ? `${folder}/${dateFormatted}.md` : `${dateFormatted}.md`;
	return normalizePath(filename);
}

export function applyTemplate(content: string, title: string, now: ReturnType<typeof moment>): string {
	return content.replace(/\{\{\s*(title|date|time)\s*(?::\s*([^}]*?)\s*)?\}\}/gi, (match: string, key: string, format: string | undefined) => {
		switch (key.toLowerCase()) {
			// Title isn't a date, so a colon-suffix is meaningless. Leave a
			// formatted title token (e.g. {{title:YYYY}}) untouched rather than
			// silently dropping the suffix.
			case 'title': return format === undefined ? title : match;
			case 'date': return now.format(format || 'YYYY-MM-DD');
			case 'time': return now.format(format || 'HH:mm');
			default: return match;
		}
	});
}

export default class MonthlyNotesPlugin extends Plugin {
	declare settings: MonthlyNotesSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('calendar-days', 'Open monthly note', () => {
			void this.openMonthlyNote();
		});

		this.addCommand({
			id: 'open-note',
			name: 'Open monthly note',
			callback: () => { void this.openMonthlyNote(); },
		});

		this.addSettingTab(new MonthlyNotesSettingTab(this.app, this));
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, (await this.loadData()) as Partial<MonthlyNotesSettings>);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async openMonthlyNote(now: ReturnType<typeof moment> = moment()) {
		try {
			const normalizedPath = buildNotePath(this.settings, now);
			const file = this.app.vault.getAbstractFileByPath(normalizedPath);

			if (file instanceof TFile) {
				await this.app.workspace.getLeaf().openFile(file);
				return;
			}

			const folder = this.settings.folder.trim();
			if (folder) {
				const folderPath = normalizePath(folder);
				const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
				if (!folderExists) {
					await this.app.vault.createFolder(folderPath);
				}
			}

			const dateFormatted = now.format(this.settings.dateFormat);
			const content = await this.getTemplateContent(dateFormatted, now);
			const created = await this.app.vault.create(normalizedPath, content);
			await this.app.workspace.getLeaf().openFile(created);
		} catch (err) {
			new Notice(`Failed to open monthly note: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	async getTemplateContent(title: string, now?: ReturnType<typeof moment>): Promise<string> {
		const templatePath = this.settings.template.trim();
		if (!templatePath) return '';

		const templateFile = this.app.vault.getAbstractFileByPath(normalizePath(templatePath));
		if (!(templateFile instanceof TFile)) {
			new Notice(`Template file not found: ${templatePath}`);
			return '';
		}

		const content = await this.app.vault.read(templateFile);
		return applyTemplate(content, title, now ?? moment());
	}
}