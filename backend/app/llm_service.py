from openai import OpenAI

from .config import settings
from .response_parser import parse_analysis_response

SYSTEM_PROMPT = """你是一名检测报告分析专家。用户会提供本地检测文件摘录与自然语言指令。

你必须只输出一个 JSON 对象（不要 markdown 代码块外的其它文字），结构如下：
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
"""


def analyze_reports(user_instruction: str, files_payload: list[dict]) -> dict:
    if not settings.openai_api_key:
        raise ValueError("未配置 OPENAI_API_KEY，请在 backend/.env 中设置")

    client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)

    catalog = []
    for item in files_payload:
        catalog.append(
            f"### 文件: {item['name']}\n"
            f"路径: {item['relative_path']}\n"
            f"大小: {item['size_bytes']} 字节\n"
            f"内容摘录:\n{item['excerpt']}\n"
        )

    user_content = (
        f"## 用户指令\n{user_instruction}\n\n"
        f"## 共 {len(files_payload)} 个文件\n"
        + "\n".join(catalog)
    )

    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )
    except Exception as e:
        hint = (
            f"请检查 backend/.env：OPENAI_BASE_URL（需含 /v1）、"
            f"OPENAI_MODEL 是否与该服务商一致。当前 base={settings.openai_base_url} model={settings.openai_model}"
        )
        raise RuntimeError(f"{e}。{hint}") from e

    raw = response.choices[0].message.content or ""
    return parse_analysis_response(raw, len(files_payload))
