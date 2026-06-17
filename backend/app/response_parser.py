from __future__ import annotations

import json
import re
from typing import Any


def _extract_json_blob(text: str) -> dict[str, Any] | None:
    text = text.strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", text, re.IGNORECASE)
    if fenced:
        try:
            data = json.loads(fenced.group(1).strip())
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass

    start = text.find("{")
    end = text.rfind("}")
    if start >= 0 and end > start:
        try:
            data = json.loads(text[start : end + 1])
            if isinstance(data, dict):
                return data
        except json.JSONDecodeError:
            pass
    return None


def _coerce_float(value: Any, default: float = 0.0) -> float:
    if value is None:
        return default
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)

    text = str(value).strip()
    if not text:
        return default

    normalized = (
        text.replace(",", "")
        .replace("，", "")
        .replace("％", "%")
        .replace("﹪", "%")
    )
    match = re.search(r"[-+]?\d+(?:\.\d+)?", normalized)
    if not match:
        return default

    try:
        return float(match.group(0))
    except ValueError:
        return default


def _coerce_int(value: Any, default: int = 0) -> int:
    return int(round(_coerce_float(value, float(default))))


def _normalize_chart(raw: dict[str, Any], index: int) -> dict[str, Any] | None:
    chart_type = str(raw.get("type", "bar")).lower()
    if chart_type not in ("bar", "doughnut", "pie", "line"):
        chart_type = "bar"

    labels = raw.get("labels") or []
    values = raw.get("values") or []
    if not isinstance(labels, list) or not isinstance(values, list):
        return None
    labels = [str(x) for x in labels]
    values = [_coerce_float(v) for v in values]
    if not labels or len(labels) != len(values):
        return None

    return {
        "id": raw.get("id") or f"chart_{index}",
        "type": chart_type,
        "title": str(raw.get("title") or f"图表 {index + 1}"),
        "labels": labels,
        "values": values,
        "unit": raw.get("unit") or "",
    }


def _normalize_metrics(raw: dict[str, Any] | None, file_count: int) -> dict[str, Any]:
    raw = raw if isinstance(raw, dict) else {}
    passed = _coerce_int(raw.get("passed") or raw.get("passed_count"))
    failed = _coerce_int(raw.get("failed") or raw.get("failed_count"))
    total_tests = _coerce_int(raw.get("total_tests"), passed + failed)
    pass_rate = raw.get("pass_rate_percent")
    if pass_rate is None and total_tests > 0:
        pass_rate = round(100.0 * passed / total_tests, 1)
    pass_rate = _coerce_float(pass_rate)

    return {
        "total_files": _coerce_int(raw.get("total_files"), file_count),
        "total_tests": total_tests,
        "passed": passed,
        "failed": failed,
        "pass_rate_percent": pass_rate,
        "headline": str(raw.get("headline") or ""),
    }


def _default_pass_fail_chart(metrics: dict[str, Any]) -> dict[str, Any] | None:
    passed, failed = metrics["passed"], metrics["failed"]
    if passed == 0 and failed == 0:
        return None
    return {
        "id": "pass_fail",
        "type": "doughnut",
        "title": "总体通过 / 不通过",
        "labels": ["通过", "不通过"],
        "values": [passed, failed],
        "unit": "count",
    }


def parse_analysis_response(raw_text: str, file_count: int) -> dict[str, Any]:
    data = _extract_json_blob(raw_text)
    if not data:
        return {
            "conclusion": raw_text.strip() or "（无分析内容）",
            "metrics": _normalize_metrics(None, file_count),
            "charts": [],
        }

    conclusion = str(
        data.get("conclusion") or data.get("summary_text") or data.get("analysis") or ""
    ).strip()
    if not conclusion:
        conclusion = raw_text.strip()

    metrics = _normalize_metrics(data.get("metrics"), file_count)
    charts: list[dict[str, Any]] = []
    for i, item in enumerate(data.get("charts") or []):
        if isinstance(item, dict):
            chart = _normalize_chart(item, i)
            if chart:
                charts.append(chart)

    if not charts:
        fallback = _default_pass_fail_chart(metrics)
        if fallback:
            charts.append(fallback)

    return {"conclusion": conclusion, "metrics": metrics, "charts": charts}
