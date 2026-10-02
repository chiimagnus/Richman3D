import { messages } from "../i18n";
import {
  isLanguage,
  type GamePreferences,
  type Language,
  type LookSensitivity,
} from "../settings/preferences";

export type SettingsActions = {
  readonly setSoundEnabled: (enabled: boolean) => void;
  readonly setLookSensitivity: (sensitivity: LookSensitivity) => void;
  readonly setLanguage: (language: Language) => void;
};

export type SettingsRenderOptions = {
  readonly preferences: GamePreferences;
  readonly pointerLocked: boolean;
  readonly busy: boolean;
};

export class SettingsPanel {
  private readonly root = document.createElement("div");
  private readonly openButton: HTMLButtonElement;
  private readonly dialog: HTMLDialogElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly title: HTMLElement;
  private readonly soundTitle: HTMLElement;
  private readonly soundHelp: HTMLElement;
  private readonly soundInput: HTMLInputElement;
  private readonly sensitivityTitle: HTMLElement;
  private readonly sensitivityHelp: HTMLElement;
  private readonly sensitivityGroup: HTMLElement;
  private readonly sensitivityButtons: readonly HTMLButtonElement[];
  private readonly languageTitle: HTMLElement;
  private readonly languageHelp: HTMLElement;
  private readonly languageGroup: HTMLElement;
  private readonly languageButtons: readonly HTMLButtonElement[];
  private readonly note: HTMLElement;

  constructor(container: HTMLElement, actions: SettingsActions) {
    this.root.className = "settings-root";
    this.root.innerHTML = `
      <button
        class="settings-open"
        type="button"
        data-settings-open
        aria-haspopup="dialog"
      ></button>

      <dialog
        class="settings-dialog"
        data-settings-dialog
        aria-labelledby="settings-title"
      >
        <div class="settings-card">
          <header class="settings-header">
            <h2 id="settings-title" data-settings-title></h2>
            <button
              class="settings-close"
              type="button"
              data-settings-close
            ></button>
          </header>

          <div class="settings-section">
            <label class="settings-row" for="settings-sound">
              <span>
                <strong data-sound-title></strong>
                <small data-sound-help></small>
              </span>
              <input
                id="settings-sound"
                type="checkbox"
                data-settings-sound
              />
            </label>

            <div class="settings-row settings-row-stack">
              <span>
                <strong data-sensitivity-title></strong>
                <small data-sensitivity-help></small>
              </span>
              <div
                class="settings-segments"
                role="group"
                data-sensitivity-group
              >
                <button type="button" data-sensitivity="low"></button>
                <button type="button" data-sensitivity="standard"></button>
                <button type="button" data-sensitivity="high"></button>
              </div>
            </div>

            <div class="settings-row settings-row-stack">
              <span>
                <strong data-language-title></strong>
                <small data-language-help></small>
              </span>
              <div
                class="settings-segments settings-language-segments"
                role="group"
                data-language-group
              >
                <button type="button" data-language="zh-CN"></button>
                <button type="button" data-language="en"></button>
              </div>
            </div>
          </div>

          <p class="settings-note" data-settings-note></p>
        </div>
      </dialog>
    `;

    container.append(this.root);

    this.openButton = requiredElement<HTMLButtonElement>(
      this.root,
      "[data-settings-open]",
    );
    this.dialog = requiredElement<HTMLDialogElement>(
      this.root,
      "[data-settings-dialog]",
    );
    this.closeButton = requiredElement<HTMLButtonElement>(
      this.root,
      "[data-settings-close]",
    );
    this.title = requiredElement(this.root, "[data-settings-title]");
    this.soundTitle = requiredElement(this.root, "[data-sound-title]");
    this.soundHelp = requiredElement(this.root, "[data-sound-help]");
    this.soundInput = requiredElement<HTMLInputElement>(
      this.root,
      "[data-settings-sound]",
    );
    this.sensitivityTitle = requiredElement(this.root, "[data-sensitivity-title]");
    this.sensitivityHelp = requiredElement(this.root, "[data-sensitivity-help]");
    this.sensitivityGroup = requiredElement(this.root, "[data-sensitivity-group]");
    this.sensitivityButtons = [
      ...this.root.querySelectorAll<HTMLButtonElement>("[data-sensitivity]"),
    ];
    this.languageTitle = requiredElement(this.root, "[data-language-title]");
    this.languageHelp = requiredElement(this.root, "[data-language-help]");
    this.languageGroup = requiredElement(this.root, "[data-language-group]");
    this.languageButtons = [
      ...this.root.querySelectorAll<HTMLButtonElement>("[data-language]"),
    ];
    this.note = requiredElement(this.root, "[data-settings-note]");

    this.openButton.addEventListener("click", () => {
      if (!this.dialog.open) {
        this.dialog.showModal();
      }
    });
    this.closeButton.addEventListener("click", () => this.dialog.close());
    this.soundInput.addEventListener("change", () => {
      actions.setSoundEnabled(this.soundInput.checked);
    });

    for (const button of this.sensitivityButtons) {
      button.addEventListener("click", () => {
        const sensitivity = button.dataset.sensitivity;
        if (isLookSensitivity(sensitivity)) {
          actions.setLookSensitivity(sensitivity);
        }
      });
    }

    for (const button of this.languageButtons) {
      button.addEventListener("click", () => {
        const language = button.dataset.language;
        if (isLanguage(language)) {
          actions.setLanguage(language);
        }
      });
    }
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  render(options: SettingsRenderOptions): void {
    const { preferences } = options;
    const copy = messages(preferences.language).settings;

    this.root.dataset.pointerLocked = String(options.pointerLocked);
    this.openButton.disabled = options.busy;
    this.openButton.textContent = copy.title;
    this.title.textContent = copy.title;
    this.closeButton.textContent = copy.close;
    this.closeButton.setAttribute("aria-label", copy.closeAria);
    this.soundTitle.textContent = copy.sound;
    this.soundHelp.textContent = copy.soundHelp;
    this.soundInput.checked = preferences.soundEnabled;
    this.sensitivityTitle.textContent = copy.sensitivity;
    this.sensitivityHelp.textContent = copy.sensitivityHelp;
    this.sensitivityGroup.setAttribute("aria-label", copy.sensitivityAria);
    this.languageTitle.textContent = copy.language;
    this.languageHelp.textContent = copy.languageHelp;
    this.languageGroup.setAttribute("aria-label", copy.languageAria);
    this.note.textContent = copy.note;

    const sensitivityLabels: Record<LookSensitivity, string> = {
      low: copy.low,
      standard: copy.standard,
      high: copy.high,
    };

    for (const button of this.sensitivityButtons) {
      const sensitivity = button.dataset.sensitivity;
      if (!isLookSensitivity(sensitivity)) {
        continue;
      }
      button.textContent = sensitivityLabels[sensitivity];
      button.setAttribute(
        "aria-pressed",
        String(sensitivity === preferences.lookSensitivity),
      );
    }

    for (const button of this.languageButtons) {
      const language = button.dataset.language;
      if (!isLanguage(language)) {
        continue;
      }
      button.textContent = copy.languageOptions[language];
      button.setAttribute(
        "aria-pressed",
        String(language === preferences.language),
      );
    }

    if (options.pointerLocked && this.dialog.open) {
      this.dialog.close();
    }
  }
}

function isLookSensitivity(value: string | undefined): value is LookSensitivity {
  return value === "low" || value === "standard" || value === "high";
}

function requiredElement<T extends Element = HTMLElement>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) {
    throw new Error(`设置界面缺少元素: ${selector}`);
  }
  return element;
}
