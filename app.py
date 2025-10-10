import os
import asyncio
from datetime import datetime
from textual.app import App, ComposeResult
from textual.containers import Vertical
from dotenv import load_dotenv

# ✅ Core imports
from ai_tui.ui.chat_view import ChatView
from ai_tui.ui.input_bar import InputBar
from ai_tui.ui.status_bar import StatusBar
from ai_tui.core.openai_client import stream_response
from ai_tui.core.session import Session


class AITui(App):
    """AI TUI — OpenAI streaming chat interface."""

    CSS = """
    Screen { layout: vertical; }
    #chat { height: 1fr; overflow-y: auto; }
    #input { height: 3; }
    #status { height: 1; }
    """

    def compose(self) -> ComposeResult:
        """Assemble layout."""
        self.chat = ChatView(id="chat")
        self.input = InputBar(id="input")
        self.status = StatusBar(id="status")
        yield Vertical(self.chat, self.input, self.status)

    async def on_mount(self):
        """Initialize session + focus input."""
        load_dotenv()
        self.session = Session()
        self.input.focus()
        self.status.toast("TUI started ✓")

        # Auto-create sessions folder
        os.makedirs("sessions", exist_ok=True)
        ts = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
        self.log_path = f"sessions/session_{ts}.md"
        with open(self.log_path, "w", encoding="utf-8") as f:
            f.write(f"# Session started {datetime.now()}\n\n")

    async def on_input_bar_submitted(self, message: InputBar.Submitted):
        """Handle user input (commands or chat)."""
        text = message.text.strip()
        if not text:
            return

        # --- Command handling ---
        if text.startswith(":"):
            await self._handle_command(text[1:].strip())
            return

        # --- Regular chat ---
        await self.chat.add_user(text)  # ✅ now awaited (fix for user messages)
        self.session.add_user(text)
        self.status.toast("🤖 Generating...")

        # --- Stream assistant reply ---
        assistant_text = ""
        self.chat.start_assistant()  # Create assistant message container

        async for chunk in self._stream_openai(self.session.export()):
            assistant_text += chunk
            self.chat.update_assistant(assistant_text)
            await asyncio.sleep(0.02)  # smooth rendering throttle

        # Store + finalize
        self.session.add_assistant(assistant_text)
        self.status.toast("✓ Done")

        # --- Save to log file ---
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(f"## USER\n{text}\n\n## ASSISTANT\n{assistant_text}\n\n")

    async def _stream_openai(self, messages):
        """Async generator wrapping stream_response for Textual compatibility."""
        loop = asyncio.get_running_loop()

        def run_stream():
            yield from stream_response(messages)

        for delta in await loop.run_in_executor(None, lambda: list(run_stream())):
            yield delta

    async def _handle_command(self, cmd: str):
        """Handle :commands."""
        match cmd:
            case "reset":
                self.chat.clear()
                self.session.reset()
                self.status.toast("Chat cleared ✓")

            case "help":
                self.chat.start_assistant()
                self.chat.update_assistant(
                    "Available commands:\n"
                    "  :reset  — Clear chat\n"
                    "  :help   — Show this help\n"
                    "  :quit   — Exit app"
                )

            case "quit":
                self.status.toast("Goodbye 👋")
                await self.action_quit()

            case _:
                self.chat.start_assistant()
                self.chat.update_assistant(f"Unknown command: {cmd}")


if __name__ == "__main__":
    AITui().run()
