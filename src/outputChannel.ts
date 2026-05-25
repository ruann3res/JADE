import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function registerJadeOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
	channel = vscode.window.createOutputChannel('JADE');
	context.subscriptions.push(channel);
	return channel;
}

export type JadeLogLevel = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_TAG: Record<JadeLogLevel, string> = {
	info: 'INFO',
	warn: 'WARN',
	error: 'ERROR',
	debug: 'DBG',
};

function formatTimestamp(): string {
	return new Date().toLocaleTimeString('en-US', {
		hour12: false,
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	});
}

function formatLine(level: JadeLogLevel, message: string): string {
	return `[${formatTimestamp()}] [${LEVEL_TAG[level]}] ${message}`;
}

/**
 * Appends one structured line: time, level, and message.
 * Existing `jadeLog(msg)` usage remains valid (level `info`).
 */
export function jadeLog(message: string, level: JadeLogLevel = 'info'): void {
	channel?.appendLine(formatLine(level, message));
}

export function jadeLogWarn(message: string): void {
	jadeLog(message, 'warn');
}

export function jadeLogError(message: string): void {
	jadeLog(message, 'error');
}

export function jadeLogDebug(message: string): void {
	jadeLog(message, 'debug');
}

/** Visual block to separate phases in the Output (e.g. start of an analysis). */
export function jadeLogSection(title: string): void {
	const rule = '─'.repeat(22);
	channel?.appendLine('');
	channel?.appendLine(`${rule} ${title} ${rule}`);
}

export function jadeShowOutput(preserveFocus = false): void {
	channel?.show(preserveFocus);
}
