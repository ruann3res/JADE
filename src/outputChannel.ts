import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function registerUdiaOutput(context: vscode.ExtensionContext): vscode.OutputChannel {
	channel = vscode.window.createOutputChannel('UDIA');
	context.subscriptions.push(channel);
	return channel;
}

export type UdiaLogLevel = 'info' | 'warn' | 'error' | 'debug';

const LEVEL_TAG: Record<UdiaLogLevel, string> = {
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

function formatLine(level: UdiaLogLevel, message: string): string {
	return `[${formatTimestamp()}] [${LEVEL_TAG[level]}] ${message}`;
}

/**
 * Appends one structured line: time, level, and message.
 * Existing `udiaLog(msg)` usage remains valid (level `info`).
 */
export function udiaLog(message: string, level: UdiaLogLevel = 'info'): void {
	channel?.appendLine(formatLine(level, message));
}

export function udiaLogWarn(message: string): void {
	udiaLog(message, 'warn');
}

export function udiaLogError(message: string): void {
	udiaLog(message, 'error');
}

export function udiaLogDebug(message: string): void {
	udiaLog(message, 'debug');
}

/** Visual block to separate phases in the Output (e.g. start of an analysis). */
export function udiaLogSection(title: string): void {
	const rule = '─'.repeat(22);
	channel?.appendLine('');
	channel?.appendLine(`${rule} ${title} ${rule}`);
}

export function udiaShowOutput(preserveFocus = false): void {
	channel?.show(preserveFocus);
}
