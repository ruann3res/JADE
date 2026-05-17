# UDIA README

This is the README for your extension "UDIA". After writing up a brief description, we recommend including the following sections.

## Model comparison protocol

UDIA includes an official reproducible benchmark battery for comparing Deepseek and Qwen through Ollama.

- Run `UDIA: Run Model Comparison` to execute the fixed benchmark.
- Results are written to the open workspace in `model-comparison-results/`.
- Run `UDIA: Compare Models on Open Java File` to compare Deepseek and Qwen against the currently open Java file. These results are written to `model-comparison-results/open-file/`.
- Run `UDIA: Export Model Comparison Samples` to copy the official Java samples, expected findings, and protocol document into the open workspace for inspection.

The benchmark always reads the official samples packaged with the extension. Exporting samples is for auditability and documentation; it does not mutate the packaged benchmark battery.
Open-file comparison has no fixed ground truth, so it records model outputs and response metrics without treating suggestions as academically validated false positives.

## Features

Describe specific features of your extension including screenshots of your extension in action. Image paths are relative to this README file.

For example if there is an image subfolder under your extension project workspace:

\!\[feature X\]\(images/feature-x.png\)

> Tip: Many popular extensions utilize animations. This is an excellent way to show off your extension! We recommend short, focused animations that are easy to follow.

## Requirements

If you have any requirements or dependencies, add a section describing those and how to install and configure them.

## Extension Settings

Include if your extension adds any VS Code settings through the `contributes.configuration` extension point.

For example:

This extension contributes the following settings:

* `myExtension.enable`: Enable/disable this extension.
* `myExtension.thing`: Set to `blah` to do something.

## Known Issues

Calling out known issues can help limit users opening duplicate issues against your extension.

## Release Notes

Users appreciate release notes as you update your extension.

### 1.0.0

Initial release of ...

### 1.0.1

Fixed issue #.

### 1.1.0

Added features X, Y, and Z.

---

## Following extension guidelines

Ensure that you've read through the extensions guidelines and follow the best practices for creating your extension.

* [Extension Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

## Working with Markdown

You can author your README using Visual Studio Code. Here are some useful editor keyboard shortcuts:

* Split the editor (`Cmd+\` on macOS or `Ctrl+\` on Windows and Linux).
* Toggle preview (`Shift+Cmd+V` on macOS or `Shift+Ctrl+V` on Windows and Linux).
* Press `Ctrl+Space` (Windows, Linux, macOS) to see a list of Markdown snippets.

## For more information

* [Visual Studio Code's Markdown Support](http://code.visualstudio.com/docs/languages/markdown)
* [Markdown Syntax Reference](https://help.github.com/articles/markdown-basics/)

**Enjoy!**
