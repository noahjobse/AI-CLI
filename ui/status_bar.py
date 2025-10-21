# ui/status_bar.py
import os
from time import time
from rich.text import Text
from textual.widgets import Static
from dotenv import load_dotenv

load_dotenv()


class StatusBar(Static):
    """Shows model, tokens, cost, and status messages."""

    def on_mount(self):
        # ✅ Use model from environment (strictly required)
        self._model = os.environ["OPENAI_MODEL"]
        self._logfile = "sessions/..."
        self._prompt_tokens = 0
        self._completion_tokens = 0
        self._est_cost = 0.0
        self._toast = None
        self._toast_until = 0
        self.set_interval(0.1, self._tick)

    def set_model(self, name: str):
        self._model = name
        self.refresh()

    def set_logging(self, filename: str):
        self._logfile = filename
        self.refresh()

    def bump_tokens(self, prompt: int, completion: int, cost_inc: float):
        self._prompt_tokens += prompt
        self._completion_tokens += completion
        self._est_cost += cost_inc

    def toast(self, msg: str, seconds: float = 1.2):
        self._toast = f"[green]{msg}[/]"
        self._toast_until = time() + seconds
        self.refresh()

    def refresh_status(self):
        self.refresh()

    def _tick(self):
        if self._toast and time() > self._toast_until:
            self._toast = None
            self.refresh()

    def render(self):
        parts = [
            f"[bold]model:[/] {self._model}",
            f"[bold]logging:[/] {self._logfile}",
            f"[bold]tokens:[/] {self._prompt_tokens + self._completion_tokens}",
            f"[bold]est:[/] ${self._est_cost:.4f}",
        ]
        if self._toast:
            parts.append(self._toast)
        return Text("  ".join(parts))
