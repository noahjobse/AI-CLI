import asyncio
import os
from datetime import datetime
from pathlib import Path
from typing import Literal


class AsyncEventLogger:
    """
    Production-ready asynchronous event logger with daily log rotation.
    Writes human-readable entries like:
        2025-10-21 14:52:03 — [INFO] TUI started ✓
    """

    _instance = None

    def __new__(cls, log_dir: str = "logs"):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._init(log_dir)
        return cls._instance

    def _init(self, log_dir: str):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(parents=True, exist_ok=True)
        self.queue = asyncio.Queue()
        self._current_date = datetime.now().strftime("%Y-%m-%d")
        self._writer_task: asyncio.Task | None = None
        self._shutdown_event = asyncio.Event()

    async def start(self):
        """Start the background writer task."""
        if self._writer_task is None or self._writer_task.done():
            self._writer_task = asyncio.create_task(self._writer())

    async def _writer(self):
        """Continuously write log messages from queue to file."""
        while not self._shutdown_event.is_set() or not self.queue.empty():
            try:
                message = await self.queue.get()
                await self._write_to_file(message)
            except Exception as e:
                print(f"[Logger Error] {e}")  # Fallback if writing fails

    async def _write_to_file(self, message: str):
        """Append a message to the current day's log file."""
        current_date = datetime.now().strftime("%Y-%m-%d")
        if current_date != self._current_date:
            self._current_date = current_date  # roll over daily

        file_path = self.log_dir / f"events_{self._current_date}.log"
        async with asyncio.Lock():
            loop = asyncio.get_running_loop()
            await loop.run_in_executor(
                None, self._sync_write, file_path, message
            )

    @staticmethod
    def _sync_write(file_path: Path, message: str):
        """Blocking file write (executed in a threadpool)."""
        with open(file_path, "a", encoding="utf-8") as f:
            f.write(message + "\n")

    async def log(
        self,
        level: Literal["INFO", "WARN", "ERROR"],
        message: str,
    ):
        """Queue a formatted log entry."""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"{timestamp} — [{level}] {message}"
        await self.queue.put(entry)

    async def stop(self):
        """Flush and stop the background writer."""
        self._shutdown_event.set()
        if self._writer_task:
            await self._writer_task
