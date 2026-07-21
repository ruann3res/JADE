# JADE

> **JADE (Java Static Analysis Repair)** is a Visual Studio Code extension that combines static analysis and local Large Language Models (LLMs) to detect Java issues and generate traceable repair suggestions.

JADE integrates static-analysis heuristics, local LLMs through Ollama, optional Retrieval-Augmented Generation (RAG), AI execution reports, model comparison, safe patch validation, and structured user feedback.

## Features

- Analyze Java files directly from VS Code.
- Generate diagnostics for code smells, bugs, security issues, and duplication.
- Ask a local LLM to generate structured quick fixes.
- Validate generated patches before applying them to the editor.
- Review suggestions in a report panel and save structured feedback.
- Compare supported local models on fixed benchmark samples or on the open Java file.
- Export reports for auditability and research.

## Requirements

- VS Code compatible with `^1.118.0`.
- Java Development Kit (JDK) 17 or later
- [Ollama](https://ollama.com/) running locally with least one supported model installed:

```bash
ollama pull deepseek-coder:6.7b
```

or:

```bash
ollama pull qwen2.5-coder:7b
```

Optional:

- Docker, if you want to run `JADE: Setup` for Qdrant and SonarCloud-backed RAG.

## Installation 

### Option 1 (Recommended)

Install JADE directly from the Visual Studio Marketplace.

https://marketplace.visualstudio.com/items?itemName=ruann3res-iftm.jade-static-analysis-repair

### Option 2 (Development)

Clone this repository and run the extension from source by following the instructions in the **Development** section below.

## Quick Start

1. Start Ollama.
2. Open a Java workspace in VS Code.
3. Open a `.java` file.
4. Run `JADE: Select Ollama model` and choose the active model.
5. Run `JADE: Analyze File`.
6. Review diagnostics in the editor and in the report panel.
7. Use `JADE: Generate Fix with AI` on a selected JADE diagnostic when you want a repair suggestion.
8. Save feedback in the report panel when a suggestion is useful, wrong, partial, or unclear.

## Demo Sample

For a short demo, use a sample like this:

```java
public class PresentationWorkingSample {

    public void runHeavyProcess(int seed) {
        System.out.println("inicio do processamento pesado");

        try {
            validateSeed(seed);
        } catch (IllegalArgumentException ex) {
        }

        int result = calculateResult(seed);
        System.out.println("resultado=" + result);
    }

    private int calculateResult(int seed) {
        int result = seed;

        for (int step = 1; step <= 41; step++) {
            result += step;
        }

        return result;
    }

    private void validateSeed(int seed) {
        if (seed < 0) {
            throw new IllegalArgumentException("seed nao pode ser negativo");
        }
    }
}
```

The expected issue is the empty `catch` block. It catches `IllegalArgumentException` but does not handle it, so validation failures can be silently swallowed and the method may continue as if nothing happened.

## Commands

| Command | Description |
|---------|-------------|
| `JADE: Analyze File` | Run AI-assisted static analysis on the current Java file. |
| `JADE: Generate Fix with AI` | Generate and apply a validated repair for a JADE diagnostic. |
| `JADE: Select Ollama model` | Choose the active local Ollama model. |
| `JADE: Setup` | Configure optional Docker, Qdrant, SonarCloud, and RAG setup. |
| `JADE: Reset Setup` | Reset RAG setup state and fall back to embedded heuristics. |
| `JADE: Run Model Comparison` | Run the reproducible benchmark against supported models. |
| `JADE: Compare Models on Open Java File` | Compare supported models on the currently open Java file. |
| `JADE: Export Model Comparison Samples` | Export official benchmark samples to the workspace. |
| `JADE: Open Latest AI Report` | Open the latest AI execution report. |
| `JADE: Open Latest Model Comparison Report` | Open the latest model comparison report. |
| `JADE: Export Feedback` | Open the external feedback form. |

## Extension Settings

| Setting | Description |
|---------|-------------|
| `jade.ollama.baseUrl` | Ollama API base URL. |
| `jade.ollama.model` | Active Ollama model. |
| `jade.ollama.requestTimeoutMs` | Request timeout in milliseconds. |
| `jade.ai.batchMaxLines` | Maximum Java lines per AI batch. |
| `jade.ai.batchOverlapLines` | Overlap between consecutive batches. |
| `jade.rag.qdrant.url` | Qdrant URL used after setup. |
| `jade.rag.embedding.model` | Ollama embedding model used for RAG retrieval. |

## Model Comparison Protocol

JADE includes a reproducible benchmark battery for comparing Deepseek and Qwen through Ollama.

- Run `JADE: Run Model Comparison` to execute the fixed benchmark.
- Results are written to `model-comparison-results/` in the open workspace.
- Run `JADE: Compare Models on Open Java File` to compare Deepseek and Qwen against the currently open Java file.
- Open-file comparison has no fixed ground truth, so it records model outputs and response metrics without treating suggestions as academically validated false positives.
- Run `JADE: Export Model Comparison Samples` to copy the official Java samples, expected findings, and protocol material into the open workspace for inspection.

The benchmark always reads the official samples packaged with the extension. Exporting samples is for auditability and documentation; it does not mutate the packaged benchmark battery.

## Development

Clone the project and enter the extension root:

```bash
cd /Users/ruanneres/www/person/project/plugin-ai/plugin/UDIA
```

Install dependencies:

```bash
pnpm install
```

Run the full validation suite:

```bash
pnpm test
```

Run individual checks:

```bash
pnpm run check-types
pnpm run lint
pnpm run compile
```

Run the extension in development mode:

1. Open the project in VS Code.
2. Press `F5`.
3. In the Extension Development Host window, open a Java file.
4. Run `JADE: Analyze File` from the Command Palette.

## Build and Package

Create the production bundle:

```bash
pnpm run package
```

Create an installable `.vsix` package:

```bash
pnpm run vsix
```

Install the generated `.vsix` locally:

```bash
code --install-extension jade-static-analysis-repair-0.0.1.vsix
```

Adjust the file name if the version in `package.json` has changed.

## Publish to the VS Code Marketplace

Publishing uses Microsoft's `vsce` tool and a Visual Studio Marketplace publisher account.

Prerequisites:

- A Marketplace publisher matching the `publisher` field in `package.json`.
- A Personal Access Token from Azure DevOps with `Marketplace: Manage` scope.
- A passing local build and test run.

Login once:

```bash
pnpm exec vsce login ruann3res-iftm
```

Build and test before publishing:

```bash
pnpm install
pnpm test
pnpm run package
pnpm run vsix
```

Publish a patch release:

```bash
pnpm exec vsce publish patch --no-dependencies
```

Other release options:

```bash
pnpm exec vsce publish minor --no-dependencies
pnpm exec vsce publish major --no-dependencies
pnpm exec vsce publish 0.0.2 --no-dependencies
```

Manual publishing is also possible: generate the `.vsix` with `pnpm run vsix` and upload it from the Visual Studio Marketplace publisher management page.

## Publishing Checklist

Before publishing, confirm:

- `pnpm test` passes.
- `pnpm run vsix` creates a `.vsix` file.
- `README.md` describes the extension clearly; this content appears on the Marketplace page.
- `CHANGELOG.md` includes the release notes.
- `LICENSE` is present.
- `package.json` has the correct `name`, `displayName`, `description`, `publisher`, `version`, `repository`, and `keywords`.
- `.vscodeignore` excludes development-only files but keeps runtime assets and packaged samples.

## License

MIT
