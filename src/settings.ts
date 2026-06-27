import { AbstractInputSuggest, App, moment, PluginSettingTab, Setting, TFile, TFolder } from 'obsidian';
import type MonthlyNotesPlugin from './main';

export interface MonthlyNotesSettings {
	dateFormat: string;
	folder: string;
	template: string;
}

export const DEFAULT_SETTINGS: MonthlyNotesSettings = {
	dateFormat: 'YYYY-MM',
	folder: '',
	template: '',
};

const PRESET_FORMATS = [
	'YYYY-MM',
	'YYYY MMMM',
] as const;

const CUSTOM_OPTION = 'custom';

// A stored format is "custom" when it isn't one of the presets — including the
// empty string, which is what choosing Custom in the dropdown persists. The
// dropdown round-trip (Custom -> '' -> detected as custom on re-render) lives
// or dies on this, so it's pulled out where it can be tested without a DOM.
export function isCustomFormat(format: string): boolean {
	return !(PRESET_FORMATS as readonly string[]).includes(format);
}

export class FolderSuggest extends AbstractInputSuggest<TFolder> {
	protected inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFolder[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFolder => f instanceof TFolder && f.path.toLowerCase().includes(q))
			.slice(0, this.limit);
	}
	renderSuggestion(folder: TFolder, el: HTMLElement): void {
		el.setText(folder.path);
	}
	selectSuggestion(folder: TFolder, _evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = folder.path;
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class FileSuggest extends AbstractInputSuggest<TFile> {
	protected inputEl: HTMLInputElement;

	constructor(app: App, inputEl: HTMLInputElement) {
		super(app, inputEl);
		this.inputEl = inputEl;
	}

	getSuggestions(query: string): TFile[] {
		const q = query.toLowerCase();
		return this.app.vault.getAllLoadedFiles()
			.filter((f): f is TFile => f instanceof TFile && f.extension === 'md' && f.path.toLowerCase().includes(q))
			.slice(0, this.limit);
	}
	renderSuggestion(file: TFile, el: HTMLElement): void {
		el.setText(file.path);
	}
	selectSuggestion(file: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.inputEl.value = file.path;
		this.inputEl.dispatchEvent(new Event('input'));
		this.close();
	}
}

export class MonthlyNotesSettingTab extends PluginSettingTab {
	plugin: MonthlyNotesPlugin;
	private suggesters: { close(): void }[] = [];

	constructor(app: App, plugin: MonthlyNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		for (const s of this.suggesters) {
			s.close();
		}
		this.suggesters = [];

		const now = moment();
		const format = this.plugin.settings.dateFormat;
		const isCustom = isCustomFormat(format);

		new Setting(containerEl)
			.setName('Date format')
			.setDesc('Choose how monthly notes are named in your vault.')
			.addDropdown(dropdown => {
				for (const f of PRESET_FORMATS) {
					dropdown.addOption(f, now.format(f));
				}
				dropdown.addOption(CUSTOM_OPTION, 'Custom');
				dropdown.setValue(isCustom ? CUSTOM_OPTION : format);
				dropdown.onChange(async value => {
					this.plugin.settings.dateFormat = value === CUSTOM_OPTION ? '' : value;
					await this.plugin.saveSettings();
					this.display();
				});
			});

		if (isCustom) {
			const previewFormat = format || 'YYYY-MM';
			const desc = document.createDocumentFragment();
			const wrapper = document.createElement('span');
			wrapper.appendText('For more syntax, refer to ');
			wrapper.createEl('a', {
				text: 'format reference',
				href: 'https://momentjs.com/docs/#/displaying/format/',
			});
			wrapper.createEl('br');
			wrapper.appendText('Your current syntax looks like this: ');
			wrapper.createEl('b', { cls: 'u-pop', text: now.format(previewFormat) });
			desc.appendChild(wrapper);

			new Setting(containerEl)
				.setName('Custom format')
				.setDesc(desc)
				.addText(text => text
					.setValue(format)
					.setPlaceholder('YYYY-MM')
					.onChange(async value => {
						this.plugin.settings.dateFormat = value;
						await this.plugin.saveSettings();
						this.display();
					}));
		}

		new Setting(containerEl)
			.setName('New file location')
			.setDesc('New monthly notes will be placed here.')
			.addText(text => {
				const suggest = new FolderSuggest(this.app, text.inputEl);
				this.suggesters.push(suggest);
				return text
					.setValue(this.plugin.settings.folder)
					.setPlaceholder('Example: folder 1/folder 2')
					.onChange(async value => {
						this.plugin.settings.folder = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('Template file location')
			.setDesc('Choose the file to use as a template.')
			.addText(text => {
				const suggest = new FileSuggest(this.app, text.inputEl);
				this.suggesters.push(suggest);
				return text
					.setValue(this.plugin.settings.template)
					.setPlaceholder('Example: folder/note')
					.onChange(async value => {
						this.plugin.settings.template = value;
						await this.plugin.saveSettings();
					});
			});
	}
}
