# ui/input_bar.py
from textual.widget import Widget
from textual.message import Message
from textual.widgets import Input
from textual.events import Key


class InputBar(Widget):
    """Bottom input widget that supports Enter (send) and Shift+Enter (newline)."""

    class Submitted(Message):
        """Message emitted when Enter is pressed."""
        def __init__(self, text: str):
            self.text = text
            super().__init__()

    def __init__(self, id: str | None = None):
        super().__init__(id=id)
        self.input = Input(
            placeholder="Type a message (:help) — Enter to send, Shift+Enter for newline"
        )

    def compose(self):
        yield self.input

    def on_key(self, event: Key):
        """Capture keys directly while input is focused."""
        if event.key == "enter":
            text = self.input.value.strip()
            if text:
                self.post_message(self.Submitted(text))  # ✅ no await
                self.input.value = ""
            event.stop()  # prevent default Input behavior
        elif event.key == "shift+enter":
            self.input.value += "\n"
            event.stop()
