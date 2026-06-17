from openai import OpenAI

from .config import settings
from .response_parser import parse_analysis_response

SYSTEM_PROMPT = """你是一名检测报告分析专家。用户会提供本地检测文件摘录与自然语言指令。

正式回答必须只输出一个 JSON 对象（不要 markdown 代码块外的其它文字），结构如下：
{
  "metrics": {
    "total_files": 数字,
    "total_tests": 数字,
    "passed": 通过项数量,
    "failed": 不通过项数量,
    "pass_rate_percent": 总通过率0-100,
    "headline": "一句话总结，不超过40字"
  },
  "charts": [
    {
      "id": "pass_fail",
      "type": "doughnut",
      "title": "总体通过情况",
      "labels": ["通过", "不通过"],
      "values": [通过数, 不通过数],
      "unit": "count"
    },
    {
      "id": "by_item",
      "type": "bar",
      "title": "各检测项目通过率(%)",
      "labels": ["项目A", "项目B"],
      "values": [100, 85],
      "unit": "percent"
    }
  ],
  "conclusion": "详细分析文字，中文，可用 ## 小节，引用文件名"
}

要求：
1. charts 至少 2 个：必须含 doughnut/pie 总体通过情况 + bar 项目或客户维度统计
2. 数值须根据文件内容估算；无法确定时填 0 并在 conclusion 说明
3. conclusion 简明，不超过 300 字
4. 如果你的运行环境支持 <think>...</think> 可见过程，可以先在 <think> 中简短写出分析过程；</think> 之后必须只输出上述 JSON
"""


def _create_client() -> OpenAI:
    if not settings.openai_api_key:
        raise ValueError("未配置 OPENAI_API_KEY，请在 backend/.env 中设置")

    return OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)


def _build_user_content(user_instruction: str, files_payload: list[dict]) -> str:
    catalog = []
    for item in files_payload:
        parse_error = item.get("parse_error")
        parse_note = f"解析状态: {parse_error}\n" if parse_error else ""
        catalog.append(
            f"### 文件: {item['name']}\n"
            f"路径: {item['relative_path']}\n"
            f"大小: {item['size_bytes']} 字节\n"
            f"{parse_note}"
            f"内容摘录:\n{item['excerpt']}\n"
        )

    return (
        f"## 用户指令\n{user_instruction}\n\n"
        f"## 共 {len(files_payload)} 个文件\n"
        + "\n".join(catalog)
    )


def _chat_completion_kwargs(user_instruction: str, files_payload: list[dict]) -> dict:
    kwargs = {
        "model": settings.openai_model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": _build_user_content(user_instruction, files_payload)},
        ],
        "temperature": settings.openai_temperature,
        "top_p": settings.openai_top_p,
        "max_tokens": settings.openai_max_tokens,
        "presence_penalty": settings.openai_presence_penalty,
    }
    extra_body = dict(settings.openai_extra_body_json)
    if settings.vllm_extra_body:
        extra_body.setdefault("top_k", settings.openai_top_k)
        extra_body.setdefault("min_p", settings.openai_min_p)
        extra_body.setdefault("repetition_penalty", settings.openai_repetition_penalty)
        chat_template_kwargs = extra_body.setdefault("chat_template_kwargs", {})
        if isinstance(chat_template_kwargs, dict):
            chat_template_kwargs.setdefault(
                "enable_thinking", settings.qwen_enable_thinking
            )
            if settings.qwen_preserve_thinking:
                chat_template_kwargs.setdefault("preserve_thinking", True)
    if extra_body:
        kwargs["extra_body"] = extra_body
    return kwargs


def _provider_hint() -> str:
    return (
        f"请检查 backend/.env：OPENAI_BASE_URL（需含 /v1）、"
        f"OPENAI_MODEL 是否与该服务商一致。当前 base={settings.openai_base_url} model={settings.openai_model}"
    )


def analyze_reports(user_instruction: str, files_payload: list[dict]) -> dict:
    client = _create_client()

    try:
        response = client.chat.completions.create(
            **_chat_completion_kwargs(user_instruction, files_payload),
        )
    except Exception as e:
        raise RuntimeError(f"{e}。{_provider_hint()}") from e

    raw = response.choices[0].message.content or ""
    return parse_analysis_response(raw, len(files_payload))


def _delta_text(delta: object, name: str) -> str:
    if isinstance(delta, dict):
        value = delta.get(name)
    else:
        value = getattr(delta, name, None)
        if value is None:
            extra = getattr(delta, "model_extra", None)
            if isinstance(extra, dict):
                value = extra.get(name)
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return str(value)


def _chunk_text(text: str, size: int = 24) -> list[str]:
    if not text:
        return []
    chunks: list[str] = []
    current = ""
    for char in text:
        current += char
        if len(current) >= size or char in "。！？\n":
            chunks.append(current)
            current = ""
    if current:
        chunks.append(current)
    return chunks


class ThinkTagFilter:
    def __init__(self) -> None:
        self.buffer = ""
        self.in_think = False

    def feed(self, text: str) -> tuple[str, str]:
        self.buffer += text
        reasoning_parts: list[str] = []
        content_parts: list[str] = []

        while self.buffer:
            if self.in_think:
                end = self.buffer.find("</think>")
                if end < 0:
                    reasoning_parts.append(self.buffer)
                    self.buffer = ""
                    break
                reasoning_parts.append(self.buffer[:end])
                self.buffer = self.buffer[end + len("</think>") :]
                self.in_think = False
                continue

            start = self.buffer.find("<think>")
            if start < 0:
                keep = min(len(self.buffer), len("<think>") - 1)
                emit_len = len(self.buffer) - keep
                if emit_len > 0:
                    content_parts.append(self.buffer[:emit_len])
                    self.buffer = self.buffer[emit_len:]
                break

            content_parts.append(self.buffer[:start])
            self.buffer = self.buffer[start + len("<think>") :]
            self.in_think = True

        return "".join(reasoning_parts), "".join(content_parts)

    def flush(self) -> tuple[str, str]:
        if not self.buffer:
            return "", ""
        if self.in_think:
            reasoning = self.buffer
            self.buffer = ""
            return reasoning, ""
        content = self.buffer
        self.buffer = ""
        return "", content


def stream_analyze_reports(user_instruction: str, files_payload: list[dict]):
    client = _create_client()
    raw_parts: list[str] = []
    think_filter = ThinkTagFilter()

    try:
        stream = client.chat.completions.create(
            **_chat_completion_kwargs(user_instruction, files_payload),
            stream=True,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta
            reasoning = _delta_text(delta, "reasoning_content")
            if not reasoning:
                reasoning = _delta_text(delta, "reasoning")
            if reasoning:
                yield {"type": "reasoning_delta", "text": reasoning}

            content = _delta_text(delta, "content")
            if content:
                tagged_reasoning, visible_content = think_filter.feed(content)
                if tagged_reasoning:
                    yield {"type": "reasoning_delta", "text": tagged_reasoning}
                if visible_content:
                    raw_parts.append(visible_content)
    except Exception as e:
        raise RuntimeError(f"{e}。{_provider_hint()}") from e

    tagged_reasoning, visible_content = think_filter.flush()
    if tagged_reasoning:
        yield {"type": "reasoning_delta", "text": tagged_reasoning}
    if visible_content:
        raw_parts.append(visible_content)

    raw = "".join(raw_parts)
    analysis = parse_analysis_response(raw, len(files_payload))
    conclusion = analysis.get("conclusion") or ""
    yield {
        "type": "result",
        "analysis": {
            **analysis,
            "conclusion": "",
        },
    }
    for chunk in _chunk_text(conclusion):
        yield {"type": "conclusion_delta", "text": chunk}
    yield {"type": "done"}
