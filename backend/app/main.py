import json
from pathlib import Path

from starlette.applications import Starlette
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.responses import FileResponse, JSONResponse, StreamingResponse
from starlette.routing import Mount, Route
from starlette.staticfiles import StaticFiles

from .config import settings
from .file_parser import list_report_files, safe_extract_text
from .llm_service import analyze_reports, stream_analyze_reports


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


async def _read_analyze_body(request: Request):
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return None, JSONResponse({"detail": "无效的 JSON"}, status_code=400)
    if not isinstance(body, dict):
        return None, JSONResponse({"detail": "请求体必须是 JSON 对象"}, status_code=400)

    instruction = (body.get("instruction") or "").strip()
    if not instruction:
        return None, JSONResponse({"detail": "instruction 不能为空"}, status_code=400)

    directory = Path(body.get("directory") or settings.report_directory)
    if not directory.exists() or not directory.is_dir():
        return None, JSONResponse({"detail": f"目录不存在: {directory}"}, status_code=400)

    paths = list_report_files(directory, settings.max_files)
    if not paths:
        return None, JSONResponse(
            {
                "detail": (
                    f"目录下未找到支持的检测文件（txt/pdf/docx/xlsx/csv 等）: {directory}"
                )
            },
            status_code=400,
        )

    return (instruction, directory, paths), None


def _build_file_payload(directory: Path, paths: list[Path]):
    payload: list[dict] = []
    file_list: list[str] = []
    parse_errors: list[str] = []
    for path in paths:
        rel = str(path.relative_to(directory))
        extracted = safe_extract_text(path, settings.max_chars_per_file)
        if extracted.error:
            parse_errors.append(f"{rel}: {extracted.error}")
        payload.append(
            {
                "name": path.name,
                "relative_path": rel,
                "size_bytes": path.stat().st_size,
                "excerpt": extracted.text,
                "parse_error": extracted.error,
            }
        )
        file_list.append(rel)
    return payload, file_list, parse_errors


async def analyze(request: Request):
    prepared, error = await _read_analyze_body(request)
    if error:
        return error

    instruction, directory, paths = prepared
    payload, file_list, parse_errors = _build_file_payload(directory, paths)

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
            "parse_errors": parse_errors,
        }
    )


def _sse(event: str, data: dict) -> bytes:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n".encode("utf-8")


async def analyze_stream(request: Request):
    prepared, error = await _read_analyze_body(request)
    if error:
        return error

    instruction, directory, paths = prepared
    payload, file_list, parse_errors = _build_file_payload(directory, paths)

    def events():
        try:
            for event in stream_analyze_reports(instruction, payload):
                event_type = event.pop("type")
                if event_type == "result":
                    analysis = event["analysis"]
                    yield _sse(
                        "result",
                        {
                            "conclusion": analysis["conclusion"],
                            "metrics": analysis["metrics"],
                            "charts": analysis["charts"],
                            "files_scanned": len(paths),
                            "directory": str(directory),
                            "file_list": file_list,
                            "parse_errors": parse_errors,
                        },
                    )
                elif event_type == "done":
                    yield _sse("done", {})
                else:
                    yield _sse(event_type, event)
        except ValueError as e:
            yield _sse("error", {"detail": str(e)})
        except Exception as e:
            yield _sse("error", {"detail": f"大模型调用失败: {e}"})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


STATIC_DIR = Path(__file__).resolve().parent.parent / "static"


async def index_page(_: Request):
    return FileResponse(STATIC_DIR / "index.html")


routes = [
    Route("/", index_page, methods=["GET"]),
    Route("/api/health", health, methods=["GET"]),
    Route("/api/config", get_config, methods=["GET"]),
    Route("/api/analyze", analyze, methods=["POST"]),
    Route("/api/analyze/stream", analyze_stream, methods=["POST"]),
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
