export type VoiceInputStatus = "unsupported" | "idle" | "listening" | "error";

export interface CarVoiceInputOptions {
  lang?: string;
  onTranscript: (text: string) => void;
  onStatus: (status: VoiceInputStatus, detail?: string) => void;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  onresult: ((event: { results: ArrayLike<{ 0?: { transcript?: string } }> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export const MICROPHONE_DENIED_HINT =
  "车机已记住拒绝，本页无法再弹框；请清站点数据或等受信域名后再试；现在用手机配对页听写";

export const MICROPHONE_FIRMWARE_HINT = "车机固件拦截了麦克风，无法再弹框。请用手机配对页听写";

export function describeInputProbe(gUM = "-", gUMErr = "-", perm = "-"): string {
  return `secure=${globalThis.isSecureContext ? 1 : 0} speech=${getSpeechRecognitionCtor() ? 1 : 0} perm=${perm} gUM=${gUM} gUMErr=${gUMErr}`;
}

export async function queryMicrophonePermission(): Promise<PermissionState | "query-na" | "-"> {
  const permissions = typeof navigator !== "undefined" ? navigator.permissions : undefined;
  if (!permissions?.query) return "query-na";
  try {
    const status = await permissions.query({ name: "microphone" as PermissionName });
    return status.state;
  } catch {
    return "query-na";
  }
}

function getUserMediaAudio(): Promise<MediaStream> {
  const media = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (media?.getUserMedia) return media.getUserMedia({ audio: true });
  const host = navigator as Navigator & {
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (error: unknown) => void,
    ) => void;
    getUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (error: unknown) => void,
    ) => void;
  };
  const legacy = host.webkitGetUserMedia ?? host.getUserMedia;
  if (!legacy) {
    const error = new Error("missing");
    error.name = "missing";
    return Promise.reject(error);
  }
  return new Promise((resolve, reject) => {
    legacy.call(navigator, { audio: true }, resolve, reject);
  });
}

export async function probeCarMicrophone(): Promise<string> {
  const perm = await queryMicrophonePermission();
  if (perm === "denied") {
    return `${describeInputProbe("0", "-", perm)} ${MICROPHONE_DENIED_HINT}`;
  }
  try {
    const stream = await getUserMediaAudio();
    for (const track of stream.getTracks()) track.stop();
    return describeInputProbe("1", "-", perm);
  } catch (caught) {
    const name = caught instanceof Error ? caught.name : "error";
    const hint = perm === "prompt" && name === "NotAllowedError" ? ` ${MICROPHONE_FIRMWARE_HINT}` : "";
    return `${describeInputProbe("0", name, perm)}${hint}`;
  }
}

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | undefined {
  const host = globalThis as typeof globalThis & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition;
}

export function createCarVoiceInput(options: CarVoiceInputOptions) {
  const ctor = getSpeechRecognitionCtor();
  let recognition: SpeechRecognitionLike | null = null;
  let active = false;

  function setStatus(status: VoiceInputStatus, detail?: string): void {
    options.onStatus(status, detail);
  }

  function ensureRecognition(): SpeechRecognitionLike | null {
    if (!ctor) return null;
    if (recognition) return recognition;
    const instance = new ctor();
    instance.lang = options.lang ?? "zh-CN";
    instance.interimResults = false;
    instance.continuous = false;
    instance.maxAlternatives = 1;
    instance.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript?.trim() ?? "";
      if (transcript) options.onTranscript(transcript);
    };
    instance.onerror = (event) => {
      active = false;
      const error = event.error ?? "unknown";
      if (error === "not-allowed" || error === "service-not-allowed") {
        setStatus("error", MICROPHONE_DENIED_HINT);
        return;
      }
      setStatus("error", `${error}。Speech 失败时请用手机配对页听写`);
    };
    instance.onend = () => {
      active = false;
      setStatus("idle");
    };
    recognition = instance;
    return instance;
  }

  return {
    supported: Boolean(ctor),
    toggle(): void {
      if (!ctor) {
        setStatus("unsupported", "此浏览器没有 Web Speech");
        return;
      }
      const instance = ensureRecognition();
      if (!instance) return;
      if (active) {
        try {
          instance.stop();
        } catch {
          // 已经停了。
        }
        active = false;
        setStatus("idle");
        return;
      }
      try {
        instance.start();
        active = true;
        setStatus("listening");
      } catch (caught) {
        active = false;
        setStatus("error", caught instanceof Error ? caught.message : String(caught));
      }
    },
    stop(): void {
      if (!recognition || !active) {
        active = false;
        return;
      }
      try {
        recognition.stop();
      } catch {
        // 忽略。
      }
      active = false;
      setStatus("idle");
    },
  };
}
