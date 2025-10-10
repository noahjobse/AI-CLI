from textual.widgets import Static, Button
from textual.containers import Vertical
from rich.syntax import Syntax
import pyperclip


class CodeBlock(Vertical):
    """A code block widget with a copy button."""

    def __init__(self, code: str, lang: str = "plaintext"):
        super().__init__()
        self.code = code.strip()
        self.lang = lang

    def compose(self):
        yield Static(Syntax(self.code, self.lang, theme="monokai", line_numbers=False))
        yield Button("Copy Code", id="copy-btn", variant="success")

    def on_button_pressed(self, event: Button.Pressed):
        if event.button.id == "copy-btn":
            pyperclip.copy(self.code)
            # Fire a toast message for your StatusBar
            self.post_message_no_wait(self.ToastRequest("✔ Copied!"))

    class ToastRequest:
        """Trigger for the status bar toast."""
        def __init__(self, message: str):
            self.message = message
