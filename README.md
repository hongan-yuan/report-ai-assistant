# Report AI Assistant（检测报告 AI 分析助手）

本地 Web 应用：从指定目录读取检测文件（PDF / Word / Excel / 文本等），结合用户文字或语音指令，调用 OpenAI 兼容大模型进行分析，并在界面展示结论。

## 功能

- 前端 UI：输入分析指令、语音输入（Chrome/Edge Web Speech API）
- 可配置检测报告目录（默认 `D:\TestReport`）
- 后端扫描目录、提取文件文本、调用大模型
- 结论以 Markdown 形式展示

## 环境要求

- Python 3.10+
- Node.js 18+
- 大模型 API Key（OpenAI / DeepSeek / 通义 / Ollama 等 OpenAI 兼容接口）

## 快速开始

### 1. 配置后端

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# 编辑 .env，填入 OPENAI_API_KEY、BASE_URL、MODEL 等
```

### 2. 准备检测文件目录

将检测报告放入例如 `D:\TestReport`（或在界面中修改路径）。可先复制 `samples/demo_report.csv` 到该目录做联调测试。

### 3. 启动后端

```powershell
cd backend
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

### 4. 打开界面

后端启动后，浏览器访问 **http://127.0.0.1:8000** 即可使用内置 UI（无需 Node.js）。

可选：若已安装 Node.js，也可运行 React 版前端：

```powershell
cd frontend
npm install
npm run dev
```

然后打开 http://localhost:5173

## 配置说明（backend/.env）

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` | API 密钥 |
| `OPENAI_BASE_URL` | 兼容接口地址，如 `https://api.deepseek.com/v1` |
| `OPENAI_MODEL` | 模型名，如 `gpt-4o-mini`、`deepseek-chat` |
| `REPORT_DIRECTORY` | 默认报告目录 |
| `MAX_FILES` | 单次最多分析文件数 |
| `MAX_CHARS_PER_FILE` | 每个文件送入模型的最大字符数 |

## 使用示例

> 分析所有的检测文件，找出与「某某客户」相关的检测报告，分析他们的检测项目和通过率。

## 项目结构

```
report-ai-assistant/
├── backend/          # Starlette API + 文件解析 + LLM
├── frontend/         # React + Vite UI
└── README.md
```

## 说明与限制

- 扫描件 PDF 若无文本层，可能无法提取内容，需 OCR 扩展。
- 文件过多或过大时受 `MAX_FILES` / `MAX_CHARS_PER_FILE` 限制，可在 `.env` 调整。
- 语音输入依赖浏览器与麦克风权限，推荐 Edge/Chrome。
