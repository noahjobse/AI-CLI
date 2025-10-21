import asyncio
from core.resume_handler import ResumeHandler


class CommandHandler:
    """Handles colon-prefixed commands for AITui."""

    def __init__(self, app):
        self.app = app
        self.chat = app.chat
        self.session = app.session
        self.status = app.status
        self.resume_handler = ResumeHandler(app)

    async def handle(self, cmd: str):
        """Dispatch commands."""
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
                    "  :quit   — Exit app\n"
                    "  :resume — Refine resume from job description"
                )

            case "quit":
                self.status.toast("Goodbye 👋")
                await self.app.action_quit()

            case "resume":
                await self.resume_handler.handle_resume_command()

            case _:
                self.chat.start_assistant()
                self.chat.update_assistant(f"Unknown command: {cmd}")
