from textual.containers import VerticalScroll
from textual.widgets import Static
from textual.binding import Binding
from rich.markdown import Markdown
from rich.panel import Panel


class ChatRow(Static):
    """One chat message (user, assistant, etc.)."""

    def __init__(self, role: str, text: str):
        super().__init__()
        self.role = role
        self.text = text
        color = {"USER": "cyan", "ASSISTANT": "green", "TOOL": "yellow"}.get(role, "white")
        self.update(Panel(Markdown(self.text), title=self.role, border_style=color))

    def update_text(self, new_text: str):
        """Update message text dynamically (for streaming)."""
        self.text = new_text
        color = {"USER": "cyan", "ASSISTANT": "green", "TOOL": "yellow"}.get(self.role, "white")
        self.update(Panel(Markdown(self.text), title=self.role, border_style=color))


class ChatView(VerticalScroll):
    """Scrollable chat history view with streaming + copy support."""
    can_focus = True

    BINDINGS = [
        Binding("ctrl+c", "copy_last", "Copy last assistant", show=True),
    ]

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.last_assistant = ""
        self.current_assistant_row = None

    async def add_user(self, text: str):
        """Add user message and preserve all history."""
        row = ChatRow("USER", text)
        await self.mount(row)
        self.scroll_end(animate=False)
        self.current_assistant_row = None

    def start_assistant(self):
        """Start a new assistant row for streaming."""
        self.current_assistant_row = ChatRow("ASSISTANT", "")
        self.mount(self.current_assistant_row)
        self.scroll_end(animate=False)

    def update_assistant(self, text: str, append: bool = False):
        """Update or append assistant messages during streaming."""
        if not self.current_assistant_row:
            self.start_assistant()

        prev = self.current_assistant_row.text
        new_text = (prev + text) if append else text

        self.current_assistant_row.update_text(new_text)
        self.last_assistant = new_text
        self.scroll_end(animate=False)

    def clear(self):
        """Clear all chat messages."""
        self.remove_children()
        self.last_assistant = ""
        self.current_assistant_row = None

    def action_copy_last(self):
        """Copy the last assistant message to clipboard."""
        if not self.last_assistant.strip():
            self.app.bell()
            if hasattr(self.app, "status"):
                self.app.status.toast("❌ Nothing to copy")
            return

        self.app.copy_to_clipboard(self.last_assistant)
        if hasattr(self.app, "status"):
            self.app.status.toast("📋 Copied to clipboard ✓")
