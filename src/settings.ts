import { moment, PluginSettingTab } from 'obsidian';
import type { App, Setting, SettingDefinitionItem, TFile } from 'obsidian';
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

// The declarative API binds each control to a key on plugin.settings, but the
// date-format dropdown can't bind directly: its values are the preset formats
// plus a sentinel "custom" that maps to/from the empty string in storage. This
// phantom key is translated by the getControlValue/setControlValue overrides
// below; the other controls (folder, template) bind to their real keys.
const DATE_FORMAT_KEY = 'dateFormatDropdown';

export class MonthlyNotesSettingTab extends PluginSettingTab {
	plugin: MonthlyNotesPlugin;

	constructor(app: App, plugin: MonthlyNotesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getControlValue(key: string): unknown {
		if (key === DATE_FORMAT_KEY) {
			const format = this.plugin.settings.dateFormat;
			return isCustomFormat(format) ? CUSTOM_OPTION : format;
		}
		return super.getControlValue(key);
	}

	async setControlValue(key: string, value: unknown): Promise<void> {
		if (key === DATE_FORMAT_KEY) {
			this.plugin.settings.dateFormat = value === CUSTOM_OPTION ? '' : (value as string);
			await this.plugin.saveSettings();
			// Re-evaluate the custom-format row's visibility so it appears when
			// the user picks Custom and disappears when they pick a preset.
			this.update();
			return;
		}
		await super.setControlValue(key, value);
	}

	getSettingDefinitions(): SettingDefinitionItem[] {
		const now = moment();

		const dropdownOptions: Record<string, string> = {};
		for (const f of PRESET_FORMATS) {
			dropdownOptions[f] = now.format(f);
		}
		dropdownOptions[CUSTOM_OPTION] = 'Custom';

		return [
			{
				name: 'Date format',
				desc: 'Choose how monthly notes are named in your vault.',
				control: {
					type: 'dropdown' as const,
					key: DATE_FORMAT_KEY,
					options: dropdownOptions,
				},
			},
			{
				name: 'Custom format',
				visible: () => isCustomFormat(this.plugin.settings.dateFormat),
				render: (setting: Setting) => this.renderCustomFormat(setting),
			},
			{
				name: 'New file location',
				desc: 'New monthly notes will be placed here.',
				control: {
					type: 'folder' as const,
					key: 'folder',
					placeholder: 'Example: folder 1/folder 2',
				},
			},
			{
				name: 'Template file location',
				desc: 'Choose the file to use as a template.',
				control: {
					type: 'file' as const,
					key: 'template',
					placeholder: 'Example: folder/note',
					filter: (file: TFile) => file.extension === 'md',
				},
			},
		];
	}

	private renderCustomFormat(setting: Setting): void {
		const format = this.plugin.settings.dateFormat;
		const previewFormat = format || 'YYYY-MM';

		const desc = activeDocument.createDocumentFragment();
		const wrapper = activeDocument.createElement('span');
		wrapper.appendText('For more syntax, refer to ');
		wrapper.createEl('a', {
			text: 'format reference',
			href: 'https://momentjs.com/docs/#/displaying/format/',
		});
		wrapper.createEl('br');
		wrapper.appendText('Your current syntax looks like this: ');
		const preview = wrapper.createEl('b', { cls: 'u-pop', text: moment().format(previewFormat) });
		desc.appendChild(wrapper);

		setting.setDesc(desc).addText(text => text
			.setValue(format)
			.setPlaceholder('YYYY-MM')
			.onChange(async value => {
				this.plugin.settings.dateFormat = value;
				await this.plugin.saveSettings();
				// Update the preview span in place rather than re-rendering the
				// whole tab, which would blur the text input the user is typing in.
				preview.setText(moment().format(value || 'YYYY-MM'));
			}));
	}
}
