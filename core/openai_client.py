# core/openai_client.py
import os
from openai import AsyncOpenAI
from dotenv import load_dotenv

load_dotenv()

# Initialize async client
client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


async def stream_response(messages, model: str = MODEL):
    """
    Async streaming using OpenAI Responses API.
    Yields each text delta as it arrives.
    """
    try:
        async with client.responses.stream(
            model=model,
            input=messages,
        ) as stream:
            async for event in stream:
                if event.type == "response.output_text.delta":
                    yield event.delta
                elif event.type == "response.error":
                    yield f"[error] {event.error.message}"

    except Exception as e:
        yield f"[error] {e}"
