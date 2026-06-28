import momentLib from "moment";

export const moment = momentLib;

export class TFile {
	path: string;
	basename: string;
	extension: string;
	constructor(path: string, public content: string = "") {
		this.path = path;
		this.basename = path.includes("/") ? path.split("/").pop()! : path;
		this.extension = this.basename.includes(".") ? this.basename.split(".").pop()! : "";
	}
}

export class TFolder {
	path: string;
	constructor(path: string) {
		this.path = path;
	}
}

// Faithful reproduction of Obsidian's own normalizePath, not a re-derivation:
// collapse runs of forward/backslashes to a single '/', strip leading and
// trailing slashes, apply Unicode NFC normalization, map '' -> '/'. Keeping it
// identical to the app means the path tests exercise real behavior, not a guess.
// Ref: https://docs.obsidian.md/Reference/TypeScript+API/normalizePath
export function normalizePath(path: string): string {
	path = path.replace(/([\\/])+/g, "/").replace(/(^\/+|\/+$)/g, "");
	path = path.normalize("NFC");
	return path === "" ? "/" : path;
}

const notices: string[] = [];
export function getNotices(): string[] {
	return [...notices];
}
export function clearNotices(): void {
	notices.length = 0;
}
export class Notice {
	constructor(message: string) {
		notices.push(message);
	}
}

export class Plugin {
	app!: ReturnType<typeof createMockApp>;
	addRibbonIcon(_icon: string, _title: string, _cb: () => void): HTMLElement {
		return {} as HTMLElement;
	}
	addCommand(_cmd: { id: string; name: string; callback: () => void }): void {}
	addSettingTab(_tab: any): void {}
	async loadData(): Promise<any> {
		return null;
	}
	async saveData(_data: any): Promise<void> {}
}

export class PluginSettingTab {
	app!: ReturnType<typeof createMockApp>;
	containerEl!: HTMLElement;
	plugin!: any;
}

export class AbstractInputSuggest<T> {
	limit: number = 10;
	protected app!: ReturnType<typeof createMockApp>;
	protected inputEl!: HTMLInputElement;
	constructor(app: any, inputEl: any) {
		this.app = app;
		this.inputEl = inputEl;
	}
	getSuggestions(_query: string): T[] { return []; }
	renderSuggestion(_value: T, _el: HTMLElement): void {}
	selectSuggestion(_value: T, _evt: MouseEvent | KeyboardEvent): void {}
	close(): void {}
}

export class Setting {
	constructor(_containerEl: HTMLElement) { return this; }
	setName(_name: string): this { return this; }
	setDesc(_desc: string | DocumentFragment): this { return this; }
	addDropdown(_cb: (dropdown: any) => void): this { return this; }
	addText(_cb: (text: any) => void): this { return this; }
}

export function createMockApp(initialFiles: Map<string, TFile | TFolder> = new Map()) {
	const vaultFiles = new Map(initialFiles);

	const vault = {
		getAbstractFileByPath(path: string): TFile | TFolder | null {
			return vaultFiles.get(path) ?? null;
		},
		async create(path: string, content: string = ""): Promise<TFile> {
			if (vaultFiles.has(path)) {
				throw new Error(`File already exists: ${path}`);
			}
			const file = new TFile(path, content);
			vaultFiles.set(path, file);
			return file;
		},
		async createFolder(path: string): Promise<TFolder> {
			if (vaultFiles.has(path)) {
				throw new Error(`Folder already exists: ${path}`);
			}
			const folder = new TFolder(path);
			vaultFiles.set(path, folder);
			return folder;
		},
		async read(file: TFile): Promise<string> {
			return file.content;
		},
		getAllLoadedFiles(): (TFile | TFolder)[] {
			return Array.from(vaultFiles.values());
		},
	};

	const leaf = {
		async openFile(_file: TFile) {},
	};
	const workspace = {
		getLeaf() {
			return leaf;
		},
	};

	return { vault, workspace };
}
