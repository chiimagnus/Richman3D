import type {
  GamePreferences,
  LookSensitivity,
} from "../settings/preferences";

export type SettingsActions = {
  readonly setSoundEnabled: (enabled: boolean) => void;
  readonly setLookSensitivity: (sensitivity: LookSensitivity) => void;
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
  private readonly soundInput: HTMLInputElement;
  private readonly sensitivityButtons: readonly HTMLButtonElement[];

  constructor(container: HTMLElement, actions: SettingsActions) {
    this.root.className = "settings-root";
    this.root.innerHTML = `
      <button
        class="settings-open"
        type="button"
        data-settings-open
        aria-haspopup="dialog"
      >设置</button>

      <dialog
        class="settings-dialog"
        data-settings-dialog
        aria-labelledby="settings-title"
      >
        <div class="settings-card">
          <header class="settings-header">
            <h2 id="settings-title">设置</h2>
            <button
              class="settings-close"
              type="button"
              data-settings-close
              aria-label="关闭设置"
            >关闭</button>
          </header>

          <div class="settings-section">
            <label class="settings-row" for="settings-sound">
              <span>
                <strong>声音</strong>
                <small>游戏音效</small>
              </span>
              <input
                id="settings-sound"
                type="checkbox"
                data-settings-sound
              />
            </label>

            <div class="settings-row settings-row-stack">
              <span>
                <strong>鼠标灵敏度</strong>
                <small>第一人称环视</small>
              </span>
              <div
                class="settings-segments"
                role="group"
                aria-label="第一人称鼠标灵敏度"
              >
                <button type="button" data-sensitivity="low">低</button>
                <button type="button" data-sensitivity="standard">标准</button>
                <button type="button" data-sensitivity="high">高</button>
              </div>
            </div>
          </div>

          <p class="settings-note">设置会保存在当前浏览器。</p>
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
    this.soundInput = requiredElement<HTMLInputElement>(
      this.root,
      "[data-settings-sound]",
    );
    this.sensitivityButtons = [
      ...this.root.querySelectorAll<HTMLButtonElement>("[data-sensitivity]"),
    ];

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
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  render(options: SettingsRenderOptions): void {
    const { preferences } = options;

    this.root.dataset.pointerLocked = String(options.pointerLocked);
    this.openButton.disabled = options.busy;
    this.soundInput.checked = preferences.soundEnabled;

    for (const button of this.sensitivityButtons) {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.sensitivity === preferences.lookSensitivity),
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
