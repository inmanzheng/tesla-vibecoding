import { describe, expect, it, vi } from "vitest";

import {
  MICROPHONE_DENIED_HINT,
  createCarVoiceInput,
  describeInputProbe,
  probeCarMicrophone,
} from "../src/remote/carVoiceInput.js";

class FakeSpeechRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  maxAlternatives = 1;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null = null;
  onerror: ((event: { error?: string }) => void) | null = null;
  onend: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

describe("carVoiceInput", () => {
  it("reports unsupported when SpeechRecognition is missing", () => {
    const onTranscript = vi.fn();
    const onStatus = vi.fn();
    const voice = createCarVoiceInput({ onTranscript, onStatus });
    expect(voice.supported).toBe(false);
    voice.toggle();
    expect(onStatus).toHaveBeenCalledWith("unsupported", expect.any(String));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it("forwards one transcript and stops on a second toggle", () => {
    let instance: FakeSpeechRecognition | undefined;
    class BoundRecognition extends FakeSpeechRecognition {
      constructor() {
        super();
        instance = this;
      }
    }
    vi.stubGlobal("webkitSpeechRecognition", BoundRecognition);
    const onTranscript = vi.fn();
    const onStatus = vi.fn();
    const voice = createCarVoiceInput({ onTranscript, onStatus });
    expect(voice.supported).toBe(true);
    voice.toggle();
    expect(instance?.start).toHaveBeenCalledTimes(1);
    instance?.onresult?.({ results: [{ 0: { transcript: "  你好  " } }] });
    expect(onTranscript).toHaveBeenCalledTimes(1);
    expect(onTranscript).toHaveBeenCalledWith("你好");
    voice.toggle();
    expect(instance?.stop).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("does not call getUserMedia when the microphone permission is already denied", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("navigator", {
      permissions: { query: vi.fn(async () => ({ state: "denied" })) },
      mediaDevices: { getUserMedia },
    });
    const label = await probeCarMicrophone();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(label).toContain("perm=denied");
    expect(label).toContain(MICROPHONE_DENIED_HINT);
    vi.unstubAllGlobals();
  });

  it("includes permission and error names in the probe label", () => {
    expect(describeInputProbe("0", "NotAllowedError", "prompt")).toContain("perm=prompt");
    expect(describeInputProbe("0", "NotAllowedError", "prompt")).toContain("gUMErr=NotAllowedError");
  });
});
