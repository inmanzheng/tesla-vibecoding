import { toAndroidKeyCodeFromDomCode } from "../remote/androidKeyCodes.js";

export interface OnScreenKeyboardSender {
  sendKeyboardInput(input: { action: "keyboardPress" | "keyboardRelease"; value: string | number }): void;
}

type KeySpec = {
  label: string;
  code: string;
  wide?: "wide" | "x-wide";
  hold?: boolean;
};

const ROW_1: KeySpec[] = [
  ...digits(),
  { label: "退格", code: "Backspace", wide: "wide" },
];
const ROW_2: KeySpec[] = "QWERTYUIOP".split("").map((letter) => ({ label: letter.toLowerCase(), code: `Key${letter}` }));
const ROW_3: KeySpec[] = [
  ..."ASDFGHJKL".split("").map((letter) => ({ label: letter.toLowerCase(), code: `Key${letter}` })),
  { label: "回车", code: "Enter", wide: "wide" },
];
const ROW_4: KeySpec[] = [
  { label: "Shift", code: "ShiftLeft", hold: true, wide: "wide" },
  ..."ZXCVBNM".split("").map((letter) => ({ label: letter.toLowerCase(), code: `Key${letter}` })),
  { label: ",", code: "Comma" },
  { label: ".", code: "Period" },
];
const ROW_5: KeySpec[] = [
  { label: "⌘", code: "MetaLeft", hold: true },
  { label: "⌃", code: "ControlLeft", hold: true },
  { label: "⌥", code: "AltLeft", hold: true },
  { label: "空格", code: "Space", wide: "x-wide" },
  { label: "Tab", code: "Tab" },
  { label: "Esc", code: "Escape" },
];

function digits(): KeySpec[] {
  return ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9", "Digit0"].map(
    (code, index) => ({ label: String((index + 1) % 10), code }),
  );
}

export function OnScreenKeyboard({
  sender,
  onClose,
}: {
  sender: OnScreenKeyboardSender | null;
  onClose: () => void;
}) {
  return (
    <div className="osk" role="group" aria-label="屏幕键盘">
      <div className="osk-toolbar">
        <span>屏幕键盘 · 中文请开 Mac 输入法后点字母</span>
        <button type="button" onClick={onClose}>
          收起
        </button>
      </div>
      {[ROW_1, ROW_2, ROW_3, ROW_4, ROW_5].map((row, index) => (
        <div className="osk-row" key={index}>
          {row.map((key) => (
            <OskKey key={key.code} spec={key} sender={sender} />
          ))}
        </div>
      ))}
    </div>
  );
}

function OskKey({ spec, sender }: { spec: KeySpec; sender: OnScreenKeyboardSender | null }) {
  const value = toAndroidKeyCodeFromDomCode(spec.code);
  const className = ["osk-key", spec.wide ? `osk-key-${spec.wide}` : "", spec.hold ? "osk-key-hold" : ""]
    .filter(Boolean)
    .join(" ");

  function press(): void {
    if (value === undefined || !sender) return;
    sender.sendKeyboardInput({ action: "keyboardPress", value });
    if (!spec.hold) {
      sender.sendKeyboardInput({ action: "keyboardRelease", value });
    }
  }

  function release(): void {
    if (value === undefined || !sender || !spec.hold) return;
    sender.sendKeyboardInput({ action: "keyboardRelease", value });
  }

  return (
    <button
      type="button"
      className={className}
      data-code={spec.code}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (spec.hold && event.currentTarget.dataset.on === "1") {
          event.currentTarget.dataset.on = "0";
          release();
          return;
        }
        if (spec.hold) event.currentTarget.dataset.on = "1";
        press();
      }}
    >
      {spec.label}
    </button>
  );
}
