import json
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _normalize_base_url(url: str) -> str:
    url = (url or "https://api.openai.com/v1").strip().rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _env_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not value.strip():
        return default
    try:
        return float(value)
    except ValueError:
        return default


def _env_json_object(name: str) -> dict:
    value = os.getenv(name)
    if not value or not value.strip():
        return {}
    try:
        data = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return data if isinstance(data, dict) else {}


class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = _normalize_base_url(
        os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    )
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    openai_temperature: float = _env_float("OPENAI_TEMPERATURE", 0.6)
    openai_top_p: float = _env_float("OPENAI_TOP_P", 0.95)
    openai_max_tokens: int = _env_int("OPENAI_MAX_TOKENS", 32768)
    openai_presence_penalty: float = _env_float("OPENAI_PRESENCE_PENALTY", 1.5)
    openai_top_k: int = _env_int("OPENAI_TOP_K", 20)
    openai_min_p: float = _env_float("OPENAI_MIN_P", 0.0)
    openai_repetition_penalty: float = _env_float("OPENAI_REPETITION_PENALTY", 1.0)
    vllm_extra_body: bool = _env_bool("VLLM_EXTRA_BODY", True)
    qwen_enable_thinking: bool = _env_bool("QWEN_ENABLE_THINKING", True)
    qwen_preserve_thinking: bool = _env_bool("QWEN_PRESERVE_THINKING", False)
    openai_extra_body_json: dict = _env_json_object("OPENAI_EXTRA_BODY_JSON")
    report_directory: str = os.getenv("REPORT_DIRECTORY", r"D:\TestReport")
    max_files: int = _env_int("MAX_FILES", 50)
    max_chars_per_file: int = _env_int("MAX_CHARS_PER_FILE", 12000)


settings = Settings()
