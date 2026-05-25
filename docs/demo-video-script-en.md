# JADE Demo Video — Narration Script (English)

## 0:00–0:25 | Introduction

This video presents JADE, a Visual Studio Code extension focused on Java code analysis and repair with the support of language models.

The tool helps developers, researchers, and software quality teams identify issues, generate suggestions, and continuously improve AI-assisted analysis through structured user feedback.

## 0:25–0:55 | Tool overview

JADE integrates static analysis, local models via Ollama, context retrieved through RAG, visual reports, and a built-in feedback loop inside VS Code. Today it officially supports **Deepseek-Coder (6.7B)** and **Qwen2.5-Coder (7B)** through Ollama.

Its potential users include Java developers, instructors, students, software engineering researchers, and teams that want to evaluate and refine AI models applied to code quality.

Because AI suggestions are not always perfect, JADE was designed to capture human judgment on every finding — not only to document results, but to drive iterative improvement of the tool.

## 0:55–1:35 | Setup and configuration

**Ollama** is all you need — with **Deepseek-Coder** or **Qwen2.5-Coder** installed (`JADE: Select Ollama model` to switch). No Docker or Sonar required.

JADE ships with **built-in heuristics** that enrich every analysis out of the box.

Optionally, **JADE: Setup** runs **Docker + Qdrant** and ingests your **SonarCloud** rules for richer, project-specific context. If setup is skipped or Qdrant fails, the built-in heuristics take over automatically.

## 1:35–2:10 | Java file analysis

Now we analyze a Java file with a small class called `PresentationWorkingSample`.

In `runHeavyProcess`, the code validates the input inside a `try` block, but the `catch (IllegalArgumentException ex)` block is empty. If validation fails, the exception is silently swallowed and the method continues as if nothing happened.

JADE sends the code to the selected local model, adds RAG context, and reports this as a code smell: an exception is caught but not handled. The finding appears as a diagnostic in the editor and in the **Report and feedback** panel.

## 2:10–2:50 | Collecting feedback on suggestions

After the analysis, the developer reviews each suggestion in the report panel.

For every finding, JADE lets you rate the suggestion, choose a verdict — valid issue, false positive, partially valid, or unclear — select a reason such as useful, wrong line, missing context, or too generic, and add an optional comment.

When you click **Save feedback**, the record is stored in `jade-feedback.json` in the workspace, linked to the model, prompt version, file, line, and suggestion content.

This structured feedback is essential: it tells us which suggestions are trustworthy, which are noise, and where the tool still needs to improve — in prompts, RAG context, or fix generation.

## 2:50–3:15 | AI fix generation

Beyond detecting issues, JADE can also ask the model for a safe fix.

The extension does not apply arbitrary free text directly: it expects a structured response, validates the generated patch, and only then applies the change in the editor.

If a fix is wrong or unhelpful, that outcome can also be captured in the report — for example with the **wrong fix** reason — so future versions of the tool can learn from real usage.

## 3:15–3:45 | Broader feedback and model comparison

Users can also share broader experience through **JADE: Export Feedback**, which opens an external form for general comments about the extension.

For research purposes, JADE includes a model comparison module that runs the same examples on **Deepseek** and **Qwen** — the two models currently supported — and records metrics such as response time, valid suggestions, false positives, precision, recall, and F1 when ground truth is available.

Together, per-suggestion feedback and benchmark results form the evidence base we use to prioritize improvements and decide whether Deepseek or Qwen performs better for a given task.

## 3:45–4:20 | Results and contributions

As a result, JADE offers an integrated experience for analysis, repair, evaluation, and continuous improvement of AI use on Java code.

Its main contributions are: integration with local models, RAG-assisted analysis, safe fix generation, **structured user feedback on every suggestion**, traceable reports, export for broader feedback, and scientific comparison between models.

The feedback file and comparison reports give us actionable data to refine prompts, reduce false positives, and make the tool more reliable over time.

## 4:20–4:40 | Closing

Therefore, JADE is not only a practical development support tool, but also an evolving system that learns from developer input.

The full workflow lives inside VS Code: analyze, explain, review, give feedback, fix, compare models, and record results — so every session can help make the next one better.

## Summary line

JADE is a VS Code extension that uses local language models — currently **Deepseek-Coder** and **Qwen2.5-Coder** via Ollama — to support Java code analysis and repair, providing diagnostics, suggestions, safe fixes, traceable reports, structured feedback collection, and scientific comparison between those models to continuously improve the tool.
