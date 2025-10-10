# ai_tui/core/session.py
from datetime import datetime


class Session:
    """Stores all messages and basic session state."""

    def __init__(self):
        self.messages = []
        self.created = datetime.now()

    def add_user(self, text: str):
        self.messages.append({"role": "user", "content": text})

    def add_assistant(self, text: str):
        self.messages.append({"role": "assistant", "content": text})

    def reset(self):
        self.messages = []

    def export(self):
        return self.messages
