# core/resume_handler.py
import os
from pathlib import Path
from core.resume_refiner import extract_company_name, SYSTEM_PROMPT
from dotenv import load_dotenv

load_dotenv()


class ResumeHandler:
    """Handles resume refinement workflow (Responses API streaming + streamed summary)."""

    def __init__(self, app):
        self.app = app
        self.chat = app.chat
        self.status = app.status
        self.openai_client = app.openai_client
        self.DEFAULT_RESUME_PATH = app.DEFAULT_RESUME_PATH
        self.model = os.environ["OPENAI_MODEL"]

    async def handle_resume_command(self):
        """Entry point when user types :resume."""
        self.chat.start_assistant()
        default_path = self.DEFAULT_RESUME_PATH

        if default_path.exists():
            self.app._resume_path = str(default_path)
            self.chat.update_assistant(f"Using default resume: {default_path.name}")
            self.chat.update_assistant(
                "Please paste the job description (end with Ctrl+D on a new line): "
            )
            self.app._resume_input_state = "waiting_for_job_description"
        else:
            self.chat.update_assistant(
                "Default resume not found. Please provide a path to your LaTeX resume file:"
            )
            self.app._resume_input_state = "waiting_for_resume_path"

    async def process_resume_refinement(self, resume_path_str: str, job_description: str):
        """Stream refined LaTeX to chat using official semantic event model, then stream concise summary."""
        client = self.openai_client
        MODEL = self.model

        try:
            resume_path = Path(resume_path_str)
            if not resume_path.exists():
                self.chat.update_assistant(f"❌ Error: Resume file not found at {resume_path}")
                await self.app.logger.log("ERROR", f"Resume not found at {resume_path}")
                return

            # --- Load LaTeX text ---
            latex_text = resume_path.read_text(encoding="utf-8")
            company_name = extract_company_name(job_description)

            self.chat.start_assistant()
            self.chat.update_assistant(f"🧠 Refining resume for **{company_name}**...\n```latex")

            refined_output = ""
            async with client.responses.stream(
                model=MODEL,
                input=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"Job Description:\n{job_description}\n\nResume:\n{latex_text}",
                    },
                ],
                reasoning={"effort": "low"},
            ) as stream:
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "response.output_text.delta":
                        refined_output += event.delta
                        self.chat.update_assistant(event.delta, append=True)
                    elif etype == "response.error":
                        self.chat.update_assistant(f"\n% ERROR: {event.error.message}\n")
                        await self.app.logger.log("ERROR", event.error.message)
                    elif etype == "response.completed":
                        break

            self.chat.update_assistant("\n```", append=True)
            self.status.toast("Resume refinement complete ✓")
            await self.app.logger.log("INFO", "Resume refinement stream completed")

            # --- Stream concise post-analysis summary ---
            self.chat.start_assistant()
            self.chat.update_assistant("🧾 Summarizing key improvements...\n")

            summary_prompt = (
                "Summarize the main differences between the original and refined resume "
                "in 3–5 short bullet points. Focus only on concrete improvements — "
                "quantification, relevance to company, clarity, and tone. "
                f"Make it concise for {company_name}. Output only bullets starting with '• '."
            )

            summary_output = ""
            async with client.responses.stream(
                model=MODEL,
                input=[
                    {"role": "system", "content": "You are a concise resume refinement summarizer."},
                    {
                        "role": "user",
                        "content": f"{summary_prompt}\n\n"
                                   f"Job Description:\n{job_description}\n\n"
                                   f"Refined Resume (LaTeX):\n{refined_output}",
                    },
                ],
            ) as stream:
                async for event in stream:
                    etype = getattr(event, "type", None)
                    if etype == "response.output_text.delta":
                        summary_output += event.delta
                        self.chat.update_assistant(event.delta, append=True)
                    elif etype == "response.error":
                        self.chat.update_assistant(f"\n% ERROR: {event.error.message}\n")
                        await self.app.logger.log("ERROR", event.error.message)
                    elif etype == "response.completed":
                        break

            self.status.toast("Summary ready ✓")
            await self.app.logger.log("INFO", "Streaming summary completed successfully")

        except Exception as e:
            self.chat.update_assistant(f"⚠️ Unexpected error during streaming: {e}")
            await self.app.logger.log("ERROR", f"Resume refinement failed: {e}")
