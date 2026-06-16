import json
from pathlib import Path

from pathlib import Path as PathLib

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from .config import settings
from .file_parser import extract_text, list_report_files
from .llm_service import analyze_reports


async def health(_: Request):
    return JSONResponse({"status": "ok"})


async def get_config(_: Request):
    return JSONResponse(
        {
            "default_directory": settings.report_directory,
            "model": settings.openai_model,
            "max_files": settings.max_files,
        }
    )


async def analyze(request: Request):
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return JSONResponse({"detail": "无效的 JSON"}, status_code=400)

    instruction = (body.get("instruction") or "").strip()
    if not instruction:
        return JSONResponse({"detail": "instruction 不能为空"}, status_code=400)

    directory = Path(body.get("directory") or settings.report_directory)
    if not directory.exists():
        return JSONResponse({"detail": f"目录不存在: {directory}"}, status_code=400)

    paths = list_report_files(directory, settings.max_files)
    if not paths:
        return JSONResponse(
            {
                "detail": (
                    f"目录下未找到支持的检测文件（txt/pdf/docx/xlsx/csv 等）: {directory}"
                )
            },
            status_code=400,
        )

    payload: list[dict] = []
    file_list: list[str] = []
    for path in paths:
        rel = str(path.relative_to(directory))
        excerpt = extract_text(path, settings.max_chars_per_file)
        if not excerpt.strip():
            excerpt = "(未能提取文本，可能为扫描件或空文件)"
        payload.append(
            {
                "name": path.name,
                "relative_path": rel,
                "size_bytes": path.stat().st_size,
                "excerpt": excerpt,
            }
        )
        file_list.append(rel)

    try:
        analysis = analyze_reports(instruction, payload)
    except ValueError as e:
        return JSONResponse({"detail": str(e)}, status_code=500)
    except Exception as e:
        return JSONResponse({"detail": f"大模型调用失败: {e}"}, status_code=502)

    return JSONResponse(
        {
            "conclusion": analysis["conclusion"],
            "metrics": analysis["metrics"],
            "charts": analysis["charts"],
            "files_scanned": len(paths),
            "directory": str(directory),
            "file_list": file_list,
        }
    )


STATIC_DIR = PathLib(__file__).resolve().parent.parent / "static"


async def index_page(_: Request):
    return FileResponse(STATIC_DIR / "index.html")


routes = [
    Route("/", index_page, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
    Route("/api/config", get_config, methods=["GET"]),
    Route("/api/analyze", analyze, methods=["POST"]),
    Mount("/static", StaticFiles(directory=STATIC_DIR), name="static"),
]

app = Starlette(routes=routes)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
