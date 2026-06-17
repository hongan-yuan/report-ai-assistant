import sys
from openai import OpenAI

# 1. 配置本地 vLLM 客户端
# 指向你刚刚启动的本地 vLLM 服务的地址和端口 (8001)
LOCAL_API_BASE = "http://127.0.0.1:8001/v1"
# vLLM 本地服务默认不校验 API Key，随便填一个字符串即可
DUMMY_API_KEY = "sk-local-qwen3"
# 注意：这里必须填入你启动 vLLM 时 --model 后面跟的那个完整路径名
MODEL_NAME = "Model/Qwen3.6-35B-A3B"


def ask_qwen(user_query: str):
    """向本地 Qwen 模型发送请求并获取回复"""

    # 初始化客户端
    client = OpenAI(
        api_key=DUMMY_API_KEY,
        base_url=LOCAL_API_BASE
    )

    print(f"\n[用户]: {user_query}")
    print("[Qwen3.6 正在思考...]\n")

    try:
        # 发起流式请求 (stream=True 可以实现打字机效果，响应更快)
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "system", "content": "你是一个严谨、专业的AI助手。请用清晰的中文回答问题。"},
                {"role": "user", "content": user_query}
            ],
            temperature=0.1,  # 控制随机性，越低越严谨
            top_p=0.9,  # 核采样控制
            max_tokens=2048,  # 最大输出长度
            stream=True  # 开启流式输出
        )

        # 实时打印模型的输出内容
        print("[回复]: ", end="")
        for chunk in response:
            if chunk.choices[0].delta.content is not None:
                print(chunk.choices[0].delta.content, end="", flush=True)
        print("\n")

    except Exception as e:
        print(f"\n[调用失败]: 请检查 vLLM 服务是否在 8001 端口正常运行。\n错误信息: {e}")


if __name__ == "__main__":
    # 如果在命令行运行时传入了参数，就使用传入的参数作为问题
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        # 否则使用默认的测试问题
        query = "请用中文介绍一下你自己"

    ask_qwen(query)