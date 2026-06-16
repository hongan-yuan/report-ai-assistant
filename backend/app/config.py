import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _normalize_base_url(url: str) -> str:
    url = (url or "https://api.openai.com/v1").strip().rstrip("/")
    if not url.endswith("/v1"):
        url = f"{url}/v1"
    return url


class Settings:
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    openai_base_url: str = _normalize_base_url(
        os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1")
    )
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    report_directory: str = os.getenv("REPORT_DIRECTORY", r"D:\TestReport")
    max_files: int = int(os.getenv("MAX_FILES", "50"))
    max_chars_per_file: int = int(os.getenv("MAX_CHARS_PER_FILE", "12000"))


settings = Settings()
