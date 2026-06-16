export type VoiceStatus = "idle" | "starting" | "listening" | "stopping";

type SpeechRecognitionCtor = new () => SpeechRecognition;

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function buildTranscript(results: SpeechRecognitionResultList): {
  finalText: string;
  interimText: string;
} {
  let finalText = "";
  let interimText = "";
  for (let i = 0; i < results.length; i++) {
    const chunk = results[i][0]?.transcript ?? "";
    if (results[i].isFinal) {
      finalText += chunk;
    } else {
      interimText += chunk;
    }
  }
  return { finalText, interimText };
}

function speechErrorMessage(error: string): string | null {
  switch (error) {
    case "aborted":
      return null;
    case "not-allowed":
    case "service-not-allowed":
      return "麦克风权限被拒绝，请在浏览器地址栏允许麦克风访问后重试。";
    case "no-speech":
      return "未检测到语音，请靠近麦克风后再次点击「语音输入」。";
    case "audio-capture":
      return "无法访问麦克风，请检查设备是否被其他程序占用。";
    case "network":
      return "语音识别需要网络连接，请检查网络后重试。";
    default:
      return `语音识别失败（${error}），请重试或使用文字输入。`;
  }
}

async function ensureMicrophoneAccess(): Promise<string | null> {
  if (!navigator.mediaDevices?.getUserMedia) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch {
    return "无法访问麦克风，请在浏览器中允许麦克风权限。";
  }
}

export interface SpeechInputOptions {
  onTextChange: (text: string) => void;
  onStatusChange: (status: VoiceStatus) => void;
  onError: (message: string | null) => void;
}

export class SpeechInputController {
  private recognition: SpeechRecognition | null = null;
  private status: VoiceStatus = "idle";
  private userStopped = false;
  private baseText = "";
  private lastComposedText = "";
  private options: SpeechInputOptions;

  constructor(options: SpeechInputOptions) {
    this.options = options;
  }

  getStatus(): VoiceStatus {
    return this.status;
  }

  isActive(): boolean {
    return this.status === "starting" || this.status === "listening";
  }

  private setStatus(status: VoiceStatus) {
    this.status = status;
    this.options.onStatusChange(status);
  }

  private composeText(finalText: string, interimText: string): string {
    const spoken = `${finalText}${interimText}`.trim();
    if (!spoken) return this.baseText.trimEnd();
    if (!this.baseText) return spoken;
    return `${this.baseText.trimEnd()} ${spoken}`.trim();
  }

  private attachHandlers(rec: SpeechRecognition) {
    rec.onstart = () => {
      this.setStatus("listening");
      this.options.onError(null);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      const { finalText, interimText } = buildTranscript(event.results);
      const text = this.composeText(finalText, interimText);
      this.lastComposedText = text;
      this.options.onTextChange(text);
    };

    rec.onerror = (event: Event) => {
      const error = (event as SpeechRecognitionErrorEvent).error ?? "unknown";
      const message = speechErrorMessage(error);
      if (message) this.options.onError(message);
      if (error !== "aborted") {
        this.userStopped = true;
      }
    };

    rec.onend = () => {
      if (!this.userStopped && this.recognition) {
        const spoken = this.lastComposedText.trim();
        this.baseText = spoken ? `${spoken} ` : "";
        try {
          this.recognition.start();
          return;
        } catch {
          // Ignore restart races when the user stops manually.
        }
      }
      this.recognition = null;
      this.setStatus("idle");
    };
  }

  private createRecognition(): SpeechRecognition | null {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return null;

    const rec = new Ctor();
    rec.lang = "zh-CN";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    this.attachHandlers(rec);
    return rec;
  }

  async start(currentText: string): Promise<void> {
    if (this.isActive()) return;

    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      this.options.onError("当前浏览器不支持语音识别，请使用 Chrome/Edge 或改用文字输入。");
      return;
    }

    this.userStopped = false;
    this.baseText = currentText.trim() ? `${currentText.trim()} ` : "";
    this.lastComposedText = currentText.trim();
    this.setStatus("starting");
    this.options.onError(null);

    const micError = await ensureMicrophoneAccess();
    if (micError) {
      this.setStatus("idle");
      this.options.onError(micError);
      return;
    }

    if (this.userStopped) {
      this.setStatus("idle");
      return;
    }

    const rec = this.createRecognition();
    if (!rec) {
      this.setStatus("idle");
      this.options.onError("当前浏览器不支持语音识别，请使用 Chrome/Edge 或改用文字输入。");
      return;
    }

    this.recognition = rec;
    try {
      rec.start();
    } catch {
      this.recognition = null;
      this.setStatus("idle");
      this.options.onError("无法启动语音识别，请稍后重试。");
    }
  }

  stop(): void {
    if (!this.isActive()) return;
    this.userStopped = true;
    this.setStatus("stopping");
    this.recognition?.stop();
  }

  destroy(): void {
    this.userStopped = true;
    this.recognition?.stop();
    this.recognition = null;
    this.setStatus("idle");
  }
}

export function voiceStatusLabel(status: VoiceStatus): string {
  switch (status) {
    case "starting":
      return "正在启动…";
    case "listening":
      return "停止录音";
    case "stopping":
      return "正在结束…";
    default:
      return "语音输入";
  }
}

export function voiceStatusHint(status: VoiceStatus): string | null {
  switch (status) {
    case "starting":
      return "正在连接麦克风，请稍候…";
    case "listening":
      return "正在聆听，说完后点击「停止录音」结束";
    case "stopping":
      return "正在结束录音…";
    default:
      return null;
  }
}
