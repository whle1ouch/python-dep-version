import * as vscode from 'vscode';
import { VersionCache } from './cache';
import { DependencyVersionProvider } from './provider';
import { showError } from './utils';

export function activate(context: vscode.ExtensionContext) {
  console.log('Activating python-version extension');

  try {
    const provider = new DependencyVersionProvider();

    // 注册 provider
    const inlayHintsProvider = vscode.languages.registerInlayHintsProvider(
      [
        { scheme: 'file', pattern: '**/*requirements*.txt' },
        { scheme: 'file', pattern: '**/pyproject.toml' },
        { scheme: 'file', pattern: '**/Pipfile' },
      ],
      provider,
    );

    // 注册刷新命令
    const refreshCommand = vscode.commands.registerCommand('python-dep-version.refresh', async () => {
      try {
        // 清除缓存
        const cache = VersionCache.getInstance();
        cache.clearCache();

        // 刷新当前编辑器的 inlay hints
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
          // 触发文档变更以刷新 hints
          const edit = new vscode.WorkspaceEdit();
          edit.insert(activeEditor.document.uri, new vscode.Position(0, 0), '');
          await vscode.workspace.applyEdit(edit);
          await activeEditor.document.save();
          // 撤销插入操作
          await vscode.commands.executeCommand('undo');
        }

        // 刷新 inlay hints
        await vscode.commands.executeCommand('editor.action.inlayHints.refresh');

        vscode.window.showInformationMessage('Python Version hints refreshed');
      } catch (error) {
        await showError('Failed to refresh hints', error);
      }
    });

    // 注册清除缓存命令
    const clearCacheCommand = vscode.commands.registerCommand('python-dep-version.clearCache', () => {
      try {
        // 获取缓存实例并清除
        const cache = VersionCache.getInstance();
        cache.clearCache();

        // 刷新 inlay hints
        vscode.commands.executeCommand('editor.action.inlayHints.refresh');

        // 显示成功消息
        vscode.window.showInformationMessage('Python dependency version cache cleared');
      } catch (error) {
        showError('Failed to clear cache', error);
      }
    });

    // 确保命令被正确添加到订阅中
    context.subscriptions.push(inlayHintsProvider, refreshCommand, clearCacheCommand);

    // 确保在扩展停用时清理资源
    context.subscriptions.push({
      dispose: () => provider.dispose(),
    });
  } catch (error) {
    showError('Failed to activate extension', error);
  }
}

export function deactivate() {}
