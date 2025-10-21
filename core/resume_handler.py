from pathlib import Path
from core.resume_refiner import extract_company_name, SYSTEM_PROMPT


class ResumeHandler:
    """Handles resume refinement workflow (official Responses API streaming version)."""

    def __init__(self, app):
        self.app = app
        self.chat = app.chat
        self.status = app.status
        self.openai_client = app.openai_client
        self.DEFAULT_RESUME_PATH = app.DEFAULT_RESUME_PATH

    async def handle_resume_command(self):
        """Entry point when user types :resume."""
        self.chat.start_assistant()
        default_path = self.DEFAULT_RESUME_PATH

        if default_path.exists():
            self.app._resume_path = str(default_path)
            self.chat.update_assistant(f"Using default resume: {default_path.name}")
            self.chat.update_assistant("Please paste the job description (end with Ctrl+D on a new line): ")
            self.app._resume_input_state = "waiting_for_job_description"
        else:
            self.chat.update_assistant("Default resume not found. Please provide a path to your LaTeX resume file:")
            self.app._resume_input_state = "waiting_for_resume_path"

    async def process_resume_refinement(self, resume_path_str: str, job_description: str):
        """Stream refined LaTeX to chat using official semantic event model."""
        client = self.openai_client
        MODEL = "gpt-5"

        try:
            resume_path = Path(resume_path_str)
            if not resume_path.exists():
                self.chat.update_assistant(f"❌ Error: Resume file not found at {resume_path}")
                return

            # Read the LaTeX resume
            latex_text = resume_path.read_text(encoding="utf-8")
            company_name = extract_company_name(job_description)

            # Start the assistant message
            self.chat.start_assistant()
            self.chat.update_assistant(f"🧠 Refining resume for **{company_name}**...\n```latex")

            # ✅ Correct official streaming pattern
            async with client.responses.stream(
                model=MODEL,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Job Description:\n{job_description}\n\nResume:\n{latex_text}",
                    },
                ],
            ) as stream:

                async for event in stream:
                    etype = getattr(event, "type", None)

                    if etype == "response.output_text.delta":
                        # Append each partial output as it streams
                        self.chat.update_assistant(event.delta, append=True)

                    elif etype == "error":
                        # Handle streaming error
                        self.chat.update_assistant(f"\n% ERROR: {event.error.message}\n")

                    elif etype == "response.completed":
                        # Model completed its output
                        break

            # ✅ Clean exit (context auto-closes)
            self.chat.update_assistant("\n```")
            self.status.toast("Resume refinement complete ✓")

        except Exception as e:
            self.chat.update_assistant(f"⚠️ Unexpected error during streaming: {e}")
