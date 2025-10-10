# ai_tui/core/openai_client.py
import os
import sys
import time
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")


def stream_response(messages, model: str = MODEL):
    """
    Stream a response from the OpenAI API, mimicking the CLI structure.
    Yields each text delta as it arrives.
    """
    try:
        stream = client.responses.create(
            model=model,
            input=messages,
            stream=True,
            reasoning={"effort": "low"},
            text={"verbosity": "low"},
        )

        for event in stream:
            if event.type == "response.output_text.delta":
                yield event.delta
            elif event.type == "response.error":
                yield f"[error] {event.error.message}"
    except Exception as e:
        yield f"[error] {e}"
