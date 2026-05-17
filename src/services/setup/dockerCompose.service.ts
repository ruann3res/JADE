import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

export type DockerComposeResolution = {
	readonly composeFile: string;
	/** "workspace" when the file came from the user's project, "extension" when from the VSIX. */
	readonly source: 'workspace' | 'extension';
};

export type DockerComposeUpResult = {
	readonly composeFile: string;
	readonly source: 'workspace' | 'extension';
	readonly qdrantUrl: string;
};

export type WaitOptions = {
	readonly timeoutMs?: number;
	readonly intervalMs?: number;
	readonly fetchImpl?: typeof fetch;
};

/**
 * Resolves which docker-compose file to use (workspace overrides extension) and
 * brings the Qdrant service up. Pure shell + HTTP; no VS Code UI here.
 */
export class DockerComposeService {
	constructor(private readonly extensionRootPath: string) {}

	async resolveCompose(): Promise<DockerComposeResolution> {
		const workspaceCompose = await this.firstExistingWorkspaceCompose();
		if (workspaceCompose) {
			return { composeFile: workspaceCompose, source: 'workspace' };
		}
		const bundled = path.join(this.extensionRootPath, 'docker-compose.yml');
		if (!(await fileExists(bundled))) {
			throw new Error(`Bundled docker-compose.yml not found at ${bundled}`);
		}
		return { composeFile: bundled, source: 'extension' };
	}

	async assertDockerAvailable(): Promise<void> {
		await runCommand('docker', ['--version']);
		await runCommand('docker', ['compose', 'version']);
	}

	async up(composeFile: string): Promise<void> {
		await runCommand('docker', ['compose', '-f', composeFile, 'up', '-d']);
	}

	async waitForQdrant(qdrantUrl: string, options?: WaitOptions): Promise<void> {
		const timeoutMs = options?.timeoutMs ?? 30_000;
		const intervalMs = options?.intervalMs ?? 1_000;
		const fetchImpl = options?.fetchImpl ?? fetch;
		const deadline = Date.now() + timeoutMs;
		let lastError: unknown;

		while (Date.now() < deadline) {
			try {
				const response = await fetchImpl(`${trimSlash(qdrantUrl)}/collections`, { method: 'GET' });
				if (response.ok) {
					return;
				}
				lastError = new Error(`HTTP ${response.status}`);
			} catch (error) {
				lastError = error;
			}
			await delay(intervalMs);
		}

		const message = lastError instanceof Error ? lastError.message : String(lastError ?? 'unknown error');
		throw new Error(`Qdrant did not become ready at ${qdrantUrl} within ${timeoutMs}ms: ${message}`);
	}

	private async firstExistingWorkspaceCompose(): Promise<string | undefined> {
		const folders = vscode.workspace.workspaceFolders ?? [];
		for (const folder of folders) {
			for (const name of ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']) {
				const candidate = path.join(folder.uri.fsPath, name);
				if (await fileExists(candidate)) {
					return candidate;
				}
			}
		}
		return undefined;
	}
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath);
		return stat.isFile();
	} catch {
		return false;
	}
}

function runCommand(command: string, args: readonly string[]): Promise<{ stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { shell: false });
		let stdout = '';
		let stderr = '';
		child.stdout.on('data', (chunk: Buffer) => {
			stdout += chunk.toString();
		});
		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		child.once('error', (error) => reject(error));
		child.once('close', (code) => {
			if (code === 0) {
				resolve({ stdout, stderr });
				return;
			}
			const detail = stderr.trim() || stdout.trim() || `exit code ${code ?? 'null'}`;
			reject(new Error(`\`${command} ${args.join(' ')}\` failed: ${detail}`));
		});
	});
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimSlash(value: string): string {
	return value.replace(/\/$/, '');
}
