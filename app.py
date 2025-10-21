# app.py
import os
import asyncio
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
from textual.app import App, ComposeResult
from textual.containers import Vertical
from openai import AsyncOpenAI  # ✅ async client

# ✅ Core imports
from ui.chat_view import ChatView
from ui.input_bar import InputBar
from ui.status_bar import StatusBar
from core.session import Session
from core.commands import CommandHandler
from core.logger import AsyncEventLogger


class AITui(App):
    """AI TUI — OpenAI streaming chat interface (Responses API version, async)."""

    CSS = """
    Screen { layout: vertical; }
    #chat { height: 1fr; overflow-y: auto; }
    #input { height: auto; max-height: 10; min-height: 3; }
    #status { height: 1; }
    """

    DEFAULT_RESUME_PATH = Path(
        r"C:\Users\noahj\Documents\Projects\AI-CLI\resume\full.tex"
    )

    _resume_input_state = None
    _resume_path: str = ""
    _job_description: str = ""

    def compose(self) -> ComposeResult:
        """Build UI layout."""
        self.chat = ChatView(id="chat")
        self.input = InputBar(id="input")
        self.status = StatusBar(id="status")
        yield Vertical(self.chat, self.input, self.status)

    async def on_mount(self):
        """Initialize app resources and logger."""
        load_dotenv()

        # ✅ Require model and API key from environment
        self.model = os.environ["OPENAI_MODEL"]
        api_key = os.environ["OPENAI_API_KEY"]

        self.session = Session()
        self.openai_client = AsyncOpenAI(api_key=api_key)
        self.command_handler = CommandHandler(self)
        self.input.focus()

        # Initialize async event logger
        self.logger = AsyncEventLogger()
        await self.logger.start()
        await self.logger.log("INFO", f"TUI started ✓ | Model: {self.model}")

        self.status.toast(f"TUI started ✓ | {self.model}")

        # Create session log
        os.makedirs("sessions", exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.log_path = f"sessions/session_{ts}.md"
        with open(self.log_path, "w", encoding="utf-8") as f:
            f.write(f"# Session started {datetime.now()}\n\n")

        await self.logger.log("INFO", f"Session log created: {self.log_path}")

    async def on_input_bar_submitted(self, message: InputBar.Submitted):
        """Handle user input."""
        text = message.text.strip()
        if not text:
            return

        await self.logger.log("INFO", f"User input received: {text}")

        # --- Resume refinement steps ---
        if self._resume_input_state == "waiting_for_resume_path":
            self._resume_path = text if text else "resume.tex"
            self.chat.update_assistant(f"Using resume path: {self._resume_path}")
            self.chat.update_assistant(
                "Please paste the job description (end with Ctrl+D on a new line): "
            )
            self._resume_input_state = "waiting_for_job_description"
            await self.logger.log("INFO", f"Resume path set to {self._resume_path}")
            return

        elif self._resume_input_state == "waiting_for_job_description":
            self._job_description = text
            self._resume_input_state = None
            await self.logger.log("INFO", "Processing resume refinement request")
            await self.command_handler.resume_handler.process_resume_refinement(
                self._resume_path, self._job_description
            )
            return

        # --- Commands ---
        if text.startswith(":"):
            cmd = text[1:].strip()
            await self.logger.log("INFO", f"Command invoked: {cmd}")
            try:
                await self.command_handler.handle(cmd)
            except Exception as e:
                await self.logger.log("ERROR", f"Command error ({cmd}): {e}")
                self.chat.update_assistant(f"❌ Command failed: {e}")
            return

        # --- Regular Chat ---
        await self.chat.add_user(text)
        self.session.add_user(text)
        self.status.toast(f"🤖 Generating... ({self.model})")
        await self.logger.log("INFO", f"OpenAI response stream started ({self.model})")

        assistant_text = ""
        self.chat.start_assistant()

        try:
            async for chunk in self._stream_openai(self.session.export()):
                assistant_text += chunk
                self.chat.update_assistant(assistant_text)
                await asyncio.sleep(0.02)

            self.session.add_assistant(assistant_text)
            self.status.toast("✓ Done")
            await self.logger.log("INFO", "OpenAI response stream completed")

        except Exception as e:
            await self.logger.log("ERROR", f"Streaming error: {e}")
            self.chat.update_assistant(f"⚠️ Error during OpenAI stream: {e}")

        # --- Save to session log ---
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(f"## USER\n{text}\n\n## ASSISTANT\n{assistant_text}\n\n")
        await self.logger.log("INFO", "Session exchange logged successfully")

    async def _stream_openai(self, messages):
        """True async streaming via the Responses API."""
        async with self.openai_client.responses.stream(
            model=self.model,  # ✅ pulled directly from .env
            input=messages,
        ) as stream:
            async for event in stream:
                if event.type == "response.output_text.delta":
                    yield event.delta
                elif event.type == "response.error":
                    yield f"[error] {event.error.message}"

    async def action_quit(self) -> None:
        """Override quit to include log shutdown."""
        await self.logger.log("INFO", "TUI shutting down")
        await self.logger.stop()
        await super().action_quit()


if __name__ == "__main__":
    AITui().run()
