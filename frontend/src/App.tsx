import { useCallback, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import ResultCharts, { type ChartSpec, type Metrics } from "./ResultCharts";
import { useSpeechInput } from "./useSpeechInput";
import "./App.css";

type AnalyzeResult = {
  conclusion: string;
  metrics?: Metrics;
  charts?: ChartSpec[];
  files_scanned: number;
  directory: string;
  file_list: string[];
  parse_errors?: string[];
};

const EXAMPLE =
  "分析 D:\\TestReport 下所有检测文件，找出与「某某客户」相关的检测报告，汇总检测项目与通过率，并列出不合格项。";

type StreamEvent =
  | { event: "reasoning_delta"; data: { text?: string } }
  | { event: "result"; data: AnalyzeResult }
  | { event: "conclusion_delta"; data: { text?: string } }
  | { event: "error"; data: { detail?: string } }
  | { event: "done"; data: Record<string, never> }
  | { event: "unknown"; data: Record<string, unknown> };

function parseSseBlock(block: string): StreamEvent | null {
  const lines = block.split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const dataText = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!event) return null;

  try {
    const data = dataText ? JSON.parse(dataText) : {};
    if (event === "reasoning_delta") return { event, data };
    if (event === "result") return { event, data };
    if (event === "conclusion_delta") return { event, data };
    if (event === "error") return { event, data };
    if (event === "done") return { event, data };
    return { event: "unknown", data };
  } catch {
    return { event: "error", data: { detail: "流式响应解析失败" } };
  }
}

export default function App() {
  const [directory, setDirectory] = useState("D:\\TestReport");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [reasoningText, setReasoningText] = useState("");

  const {
    toggleVoice,
    voiceStatus,
    voiceButtonLabel,
    voiceStatusHint,
    isVoiceActive,
    isSpeechSupported,
  } = useSpeechInput(instruction, setInstruction, setError);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((data: { default_directory?: string }) => {
        if (data.default_directory) setDirectory(data.default_directory);
      })
      .catch(() => {});
  }, []);

  const runAnalyze = useCallback(async () => {
    const text = instruction.trim();
    if (!text) {
      setError("请输入或通过语音说出分析指令。");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    setReasoningText("");
    try {
      const res = await fetch("/api/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, directory }),
      });
      if (!res.ok) {
        const data = await res.json();
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg).join("; ")
              : "分析请求失败";
        throw new Error(msg);
      }
      if (!res.body) {
        throw new Error("当前浏览器不支持流式响应读取。");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const handleStreamEvent = (streamEvent: StreamEvent | null) => {
        if (!streamEvent) return;

        if (streamEvent.event === "reasoning_delta") {
          const delta = streamEvent.data.text ?? "";
          if (delta) setReasoningText((prev) => prev + delta);
        } else if (streamEvent.event === "result") {
          setReasoningText("");
          setResult(streamEvent.data);
        } else if (streamEvent.event === "conclusion_delta") {
          const delta = streamEvent.data.text ?? "";
          if (delta) {
            setResult((prev) =>
              prev ? { ...prev, conclusion: `${prev.conclusion}${delta}` } : prev,
            );
          }
        } else if (streamEvent.event === "error") {
          throw new Error(streamEvent.data.detail || "分析请求失败");
        }
      };

      try {
        let done = false;
        while (!done) {
          const chunk = await reader.read();
          done = chunk.done;
          buffer += decoder.decode(chunk.value ?? new Uint8Array(), {
            stream: !done,
          });
          const blocks = buffer.split(/\n\n|\r\n\r\n/);
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            handleStreamEvent(parseSseBlock(block));
          }
        }
        handleStreamEvent(parseSseBlock(buffer));
      } finally {
        reader.releaseLock();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "未知错误");
    } finally {
      setLoading(false);
    }
  }, [instruction, directory]);

  const handleVoiceClick = useCallback(() => {
    if (!isSpeechSupported) {
      setError("当前浏览器不支持语音识别，请使用 Chrome/Edge 或改用文字输入。");
      return;
    }
    setError(null);
    toggleVoice();
  }, [isSpeechSupported, toggleVoice]);

  return (
    <div className="app">
      <header className="header">
        <h1>检测报告 AI 分析助手</h1>
        <p>读取本地检测目录，结合大模型理解您的指令并给出分析结论</p>
      </header>

      <main className="main">
        <section className="panel">
          <label className="label">
            检测报告目录
            <input
              className="input"
              value={directory}
              onChange={(e) => setDirectory(e.target.value)}
              placeholder="例如 D:\TestReport"
            />
          </label>

          <label className="label">
            分析指令（文本或语音）
            <textarea
              className="textarea"
              rows={5}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={EXAMPLE}
            />
          </label>

          <div className="actions">
            <button
              type="button"
              className={`btn secondary${isVoiceActive ? " voice-active" : ""}`}
              onClick={handleVoiceClick}
              disabled={loading || voiceStatus === "starting" || voiceStatus === "stopping"}
            >
              {voiceButtonLabel}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setInstruction(EXAMPLE)}
              disabled={loading}
            >
              填入示例
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={runAnalyze}
              disabled={loading}
            >
              {loading ? "分析中…" : "开始分析"}
            </button>
          </div>

          {voiceStatusHint && (
            <p className="voice-hint" role="status" aria-live="polite">
              <span className="voice-dot" aria-hidden="true" />
              {voiceStatusHint}
            </p>
          )}

          {error && <div className="error">{error}</div>}
        </section>

        <section className="panel result-panel">
          <h2>分析结论</h2>
          {loading && !result && !reasoningText && (
            <p className="muted">正在读取文件并调用大模型，请稍候…</p>
          )}
          {loading && !result && reasoningText && (
            <div className="reasoning-panel">
              <div className="reasoning-title">思考...</div>
              <div className="reasoning-text">{reasoningText}</div>
            </div>
          )}
          {!loading && !result && !error && (
            <p className="muted">提交指令后，结论将显示在此处。</p>
          )}
          {result && (
            <>
              <div className="meta">
                目录：<code>{result.directory}</code> · 已扫描{" "}
                <strong>{result.files_scanned}</strong> 个文件
              </div>
              {result.metrics && (
                <ResultCharts
                  metrics={result.metrics}
                  charts={result.charts ?? []}
                />
              )}
              <div className="markdown">
                <ReactMarkdown>{result.conclusion}</ReactMarkdown>
                {loading && <span className="streaming-cursor" aria-hidden="true" />}
              </div>
              {result.file_list.length > 0 && (
                <details className="files">
                  <summary>参与分析的文件列表</summary>
                  <ul>
                    {result.file_list.map((f) => (
                      <li key={f}>
                        <code>{f}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
