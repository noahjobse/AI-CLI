from textual.message import Message
from textual.widgets import TextArea
from textual.events import Key
from textual.binding import Binding


class InputBar(TextArea):
    """Bottom input widget that supports Enter (send) and Shift+Enter (newline),
    and allows full multi-line paste (e.g. job descriptions)."""

    BINDINGS = [Binding("ctrl+enter", "submit", show=False)]

    class Submitted(Message):
        """Message emitted when Enter is pressed."""
        def __init__(self, text: str):
            self.text = text
            super().__init__()

    def __init__(self, id: str | None = None):
        super().__init__(
            placeholder="Type a message (:help) — Enter to send, Shift+Enter for newline",
            soft_wrap=True,
            show_line_numbers=False,
            tab_behavior="indent",
            theme="css",
            id=id,
        )
        self._is_pasting = False  # Tracks whether user is pasting text

    def on_key(self, event: Key):
        """Handle Enter vs Shift+Enter, and allow multi-line pastes."""
        mods = getattr(event, "modifiers", ())

        # --- Detect paste (Ctrl+V)
        if event.key.lower() == "v" and "ctrl" in mods:
            self._is_pasting = True
            self.call_after_refresh(self._reset_paste_flag)
            return  # Let Textual handle actual paste

        # --- Shift+Enter → newline
        if event.key == "enter" and "shift" in mods:
            self.insert_text_at_cursor("\n")
            event.prevent_default()
            event.stop()
            return

        # --- Plain Enter → submit (only if not pasting)
        if event.key == "enter" and "shift" not in mods and not self._is_pasting:
            event.prevent_default()
            event.stop()
            self._handle_submit()
            return

    def _reset_paste_flag(self):
        """Reset paste flag after Textual processes the clipboard insert."""
        self._is_pasting = False

    def _handle_submit(self):
        """Send the text and clear the input."""
        text = self.text.strip()
        if text:
            self.post_message(self.Submitted(text))
            self.text = ""  # clear after sending
