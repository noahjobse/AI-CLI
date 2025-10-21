# core/resume_handler.py
import os
import platform
import subprocess
from pathlib import Path
from datetime import datetime
from core.resume_refiner import extract_company_name, SYSTEM_PROMPT
from dotenv import load_dotenv

load_dotenv()


class ResumeHandler:
    """Handles resume refinement workflow (Responses API streaming + summary + export + compile)."""

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
        """Stream refined LaTeX → export → compile → summarize."""
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

            # --- Finish stream cleanly ---
            self.chat.update_assistant("\n```", append=True)
            self.status.toast("Resume refinement complete ✓")
            await self.app.logger.log("INFO", "Resume refinement stream completed")

            # --- Export refined LaTeX ---
            export_dir = Path("exports/resumes")
            export_dir.mkdir(parents=True, exist_ok=True)

            safe_company = "".join(c for c in company_name if c.isalnum() or c in ("-", "_")).strip() or "Generic"
            filename_base = f"NoahJobse_Resume_2025_{safe_company}"

            export_path = export_dir / f"{filename_base}.tex"
            export_path.write_text(refined_output, encoding="utf-8")

            self.chat.start_assistant()
            self.chat.update_assistant(f"💾 Exported refined LaTeX to:\n`{export_path}`")
            self.status.toast("Refined LaTeX exported ✓")
            await self.app.logger.log("INFO", f"Refined LaTeX exported to {export_path}")

            # --- Compile to PDF ---
            self.chat.start_assistant()
            self.chat.update_assistant("⚙️ Compiling to PDF...")

            pdf_path = export_dir / f"{filename_base}.pdf"
            compile_result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-output-directory",
                    str(export_dir),
                    str(export_path),
                ],
                capture_output=True,
                text=True,
            )

            if compile_result.returncode == 0 and pdf_path.exists():
                self.chat.start_assistant()
                self.chat.update_assistant(f"📄 **Compiled PDF generated!**\n`{pdf_path}`")

                # --- Cleanup temp LaTeX artifacts (.aux, .log, etc.) ---
                for ext in [".aux", ".log", ".out", ".toc"]:
                    aux_file = export_path.with_suffix(ext)
                    if aux_file.exists():
                        aux_file.unlink()

                # --- Open PDF in default viewer ---
                try:
                    system = platform.system()
                    if system == "Windows":
                        os.startfile(pdf_path)
                    elif system == "Darwin":
                        subprocess.run(["open", pdf_path])
                    else:
                        subprocess.run(["xdg-open", pdf_path])
                    self.status.toast("PDF opened ✓")
                    await self.app.logger.log("INFO", f"PDF compiled and opened: {pdf_path}")
                except Exception as open_err:
                    self.chat.update_assistant(f"⚠️ Could not open PDF: {open_err}")
            else:
                self.chat.update_assistant("⚠️ PDF compilation failed.")
                await self.app.logger.log("ERROR", compile_result.stderr)

            # --- Stream concise summary ---
            self.chat.start_assistant()
            self.chat.update_assistant("🧾 Summarizing key improvements...\n")

            summary_prompt = (
                "Summarize the main differences between the original and refined resume "
                "in 3–5 short bullet points. Focus only on concrete improvements — "
                "quantification, relevance to company, clarity, and tone. "
                f"Make it concise for {company_name}. Output only bullets starting with '• '"
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

            self.status.toast("✅ All steps complete — PDF ready and summary displayed.")
            await self.app.logger.log("INFO", f"Summary complete for {company_name}")

        except Exception as e:
            self.chat.update_assistant(f"⚠️ Unexpected error during streaming: {e}")
            await self.app.logger.log("ERROR", f"Resume refinement failed: {e}")
