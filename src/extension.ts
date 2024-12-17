import { commands, type ExtensionContext, languages, workspace } from 'vscode';
import { DependencyVersionProvider } from './common/provider';
import { initializePython, onDidChangePythonInterpreter } from './common/python';
import { isPythonEnvFile, showError } from './common/utils';

export function activate(context: ExtensionContext) {
  // 注册 provider
  const provider = new DependencyVersionProvider();

  context.subscriptions.push(
    languages.registerInlayHintsProvider(
      [
        { scheme: 'file', pattern: '**/*requirements*.txt' },
        { scheme: 'file', pattern: '**/pyproject.toml' },
        { scheme: 'file', pattern: '**/Pipfile' },
      ],
      provider,
    ),
    onDidChangePythonInterpreter((e) => {
      provider.updatePythonPath(e.path);
    }),
    commands.registerCommand('python-dep-version.refresh', async () => {
      try {
        // 刷新 inlay hints
        provider.clearCache();
        provider.refreshHints();
      } catch (error) {
        await showError('Failed to refresh hints', error);
      }
    }),
    // 注册清除缓存命令
    commands.registerCommand('python-dep-version.clearCache', () => {
      try {
        // 获取缓存实例并清除
        provider.clearAllCache();
        // 刷新 inlay hints
        provider.refreshHints();
      } catch (error) {
        showError('Failed to clear cache', error);
      }
    }),
  );
  setImmediate(async (): Promise<void> => {
    await initializePython(context.subscriptions);
  });

  workspace.onDidSaveTextDocument((e) => {
    if (isPythonEnvFile(e.fileName)) {
      provider.clearCache();
      provider.refreshHints();
    }
  });
}

export async function deactivate() {}
