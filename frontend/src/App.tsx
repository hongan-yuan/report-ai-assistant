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
};

const EXAMPLE =
  "分析 D:\\TestReport 下所有检测文件，找出与「某某客户」相关的检测报告，汇总检测项目与通过率，并列出不合格项。";

export default function App() {
  const [directory, setDirectory] = useState("D:\\TestReport");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);

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
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, directory }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d.msg).join("; ")
              : "分析请求失败";
        throw new Error(msg);
      }
      setResult(data as AnalyzeResult);
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
          {loading && <p className="muted">正在读取文件并调用大模型，请稍候…</p>}
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
