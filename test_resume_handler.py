import asyncio
from pathlib import Path
from dotenv import load_dotenv
from openai import AsyncOpenAI
from core.resume_handler import ResumeHandler

class MockApp:
    def __init__(self):
        self.chat = type("MockChat", (), {"update_assistant": print})
        self.status = type("MockStatus", (), {"toast": print})
        self.DEFAULT_RESUME_PATH = Path(r"C:\Users\noahj\Documents\Projects\AI-CLI\resume\full.tex")
        self.openai_client = AsyncOpenAI()

async def main():
    load_dotenv()
    handler = ResumeHandler(MockApp())
    resume_path = r"C:\Users\noahj\Documents\Projects\AI-CLI\resume\full.tex"
    job_desc = "We are looking for an async Python developer experienced with OpenAI APIs."
    await handler.process_resume_refinement(resume_path, job_desc)

asyncio.run(main())
