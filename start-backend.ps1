Set-Location $PSScriptRoot\backend
if (-not (Test-Path .venv)) {
  python -m venv .venv
}
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -q
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host "已创建 .env，请填写 OPENAI_API_KEY" }
Write-Host "UI: http://127.0.0.1:8000"
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
