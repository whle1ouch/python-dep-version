import * as TOML from '@iarna/toml';
import * as vscode from 'vscode';
import { VersionCache } from './cache';
import { Pipfile, PipfileDependency, PoetryDependencySpec, PyProjectToml } from './types';
import { getInstalledVersion, getLatestVersion, showError } from './utils';

export class DependencyVersionProvider implements vscode.InlayHintsProvider {
  private pythonPath: string = 'python';
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.updatePythonPath();
    this.setupPythonInterpreterListener();
  }

  private setupPythonInterpreterListener() {
    // 监听 Python 扩展
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (pythonExtension) {
      if (!pythonExtension.isActive) {
        pythonExtension.activate().then(() => {
          this.setupPythonApiListener(pythonExtension);
        });
      } else {
        this.setupPythonApiListener(pythonExtension);
      }
    }
  }

  private setupPythonApiListener(extension: vscode.Extension<any>) {
    const pythonApi = extension.exports;

    // 监听环境变化
    const disposable = pythonApi.environments.onDidChangeActiveEnvironmentPath(async (env: any) => {
      console.log('Python interpreter changed:', env.path);

      // 更新 Python 路径
      if (env.path) {
        const oldPath = this.pythonPath;
        this.pythonPath = env.path;

        // 清除旧环境的缓存
        const cache = VersionCache.getInstance();
        cache.clearCache(oldPath);

        // 刷新 hints
        await this.refreshHints();
      }
    });

    this.disposables.push(disposable);
  }

  private async refreshHints() {
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
  }

  private async updatePythonPath() {
    try {
      const extension = vscode.extensions.getExtension('ms-python.python');
      if (!extension) {
        await showError('Python extension not found');
        return;
      }

      if (!extension.isActive) {
        await extension.activate();
      }

      const pythonApi = extension.exports;
      const environment = await pythonApi.environments.getActiveEnvironmentPath();

      if (environment?.path) {
        this.pythonPath = environment.path;
        console.log(`Python path updated to: ${this.pythonPath}`);
      } else {
        await showError('No active Python environment found');
      }
    } catch (error) {
      await showError('Failed to get Python path', error);
    }
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlayHint[]> {
    try {
      console.log(`Providing inlay hints for: ${document.fileName}`);

      const config = vscode.workspace.getConfiguration('python-version');
      if (!config.get<boolean>('enableInlayHints', true)) {
        return [];
      }

      if (document.fileName.endsWith('requirements.txt')) {
        return this.processRequirementsTxt(document);
      } else if (document.fileName.endsWith('pyproject.toml')) {
        return this.processPyprojectToml(document);
      } else if (document.fileName.endsWith('Pipfile')) {
        return this.processPipfile(document);
      }

      return [];
    } catch (error) {
      await showError('Error providing inlay hints', error);
      return [];
    }
  }

  private async processPyprojectToml(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    try {
      const content = document.getText();
      const tomlData = TOML.parse(content) as PyProjectToml;
      const poetry = tomlData.tool?.poetry;

      if (!poetry) {
        return hints;
      }

      // 处理主依赖
      if (poetry.dependencies) {
        hints.push(...(await this.processPoetryDependencies(document, poetry.dependencies)));
      }

      // 处理开发依赖
      if (poetry.dev_dependencies) {
        hints.push(...(await this.processPoetryDependencies(document, poetry.dev_dependencies)));
      }

      // 处理组依赖
      if (poetry.group) {
        for (const [groupName, group] of Object.entries(poetry.group)) {
          if (group?.dependencies) {
            hints.push(...(await this.processPoetryDependencies(document, group.dependencies)));
          }
        }
      }
    } catch (error) {
      await showError('Error processing pyproject.toml', error);
    }

    return hints;
  }

  private async processPoetryDependencies(
    document: vscode.TextDocument,
    dependencies: Record<string, PoetryDependencySpec>,
  ): Promise<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    for (const [packageName, constraint] of Object.entries(dependencies)) {
      if (packageName === 'python') continue;

      let currentConstraint: string;
      if (typeof constraint === 'string') {
        currentConstraint = constraint;
      } else if ('version' in constraint) {
        currentConstraint = constraint.version;
      } else {
        continue;
      }

      const packagePos = this.findPackagePosition(document, packageName);
      if (packagePos) {
        try {
          const [latestVersion, installedVersion] = await Promise.all([
            getLatestVersion(this.pythonPath, packageName),
            getInstalledVersion(this.pythonPath, packageName),
          ]);

          if (latestVersion === 'unknown' || installedVersion === 'not found') {
            console.warn(`Unable to fetch complete version info for ${packageName}`);
          }

          const hint = new vscode.InlayHint(
            packagePos,
            ` 📦 latest: ${latestVersion} | installed: ${installedVersion} | specified: ${currentConstraint}`,
          );
          hint.paddingLeft = true;
          hints.push(hint);
        } catch (error) {
          console.error(`Error processing ${packageName}:`, error);
        }
      }
    }
    return hints;
  }

  private async processRequirementsTxt(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    try {
      for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const lineText = line.text.trim();

        // 跳过空行和注释行
        if (!lineText || lineText.startsWith('#')) {
          continue;
        }

        // 处理依赖声明
        const match = lineText.match(/^([^=><~\s]+)(?:[=><~]{1,2}(.+))?/);
        if (match) {
          const packageName = match[1];
          const currentConstraint = match[2]?.trim() || '';

          try {
            const [latestVersion, installedVersion] = await Promise.all([
              getLatestVersion(this.pythonPath, packageName),
              getInstalledVersion(this.pythonPath, packageName),
            ]);
            const hintString =
              ' 📦 ' + latestVersion === currentConstraint
                ? 'latest'
                : `latest: ${latestVersion}` + ' | ' + installedVersion === currentConstraint
                ? 'installed: satisfies'
                : `installed: ${installedVersion}`;
            const hint = new vscode.InlayHint(new vscode.Position(i, line.text.length), hintString);
            hint.paddingLeft = true;
            hints.push(hint);
          } catch (error) {
            console.error(`Error processing ${packageName}:`, error);
          }
        }
      }
    } catch (error) {
      await showError('Error processing requirements.txt', error);
    }

    return hints;
  }

  private async processPipfile(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    try {
      const content = document.getText();
      const pipfile = TOML.parse(content) as Pipfile;

      // 处理主依赖
      if (pipfile.packages) {
        hints.push(...(await this.processPipfileDependencies(document, pipfile.packages, false)));
      }

      // 处理开发依赖
      if (pipfile.dev_packages) {
        hints.push(...(await this.processPipfileDependencies(document, pipfile.dev_packages, true)));
      }
    } catch (error) {
      await showError('Error processing Pipfile', error);
    }

    return hints;
  }

  private async processPipfileDependencies(
    document: vscode.TextDocument,
    dependencies: Record<string, string | PipfileDependency>,
    isDev: boolean,
  ): Promise<vscode.InlayHint[]> {
    const hints: vscode.InlayHint[] = [];

    for (const [packageName, constraint] of Object.entries(dependencies)) {
      if (packageName === 'python') continue;

      let currentConstraint: string = '';
      if (typeof constraint === 'string') {
        currentConstraint = constraint;
      } else if (constraint.version) {
        currentConstraint = constraint.version;
      } else if (constraint.ref) {
        currentConstraint = `ref:${constraint.ref}`;
      } else if (constraint.git) {
        currentConstraint = `git:${constraint.git}`;
      }

      const packagePos = this.findPackagePosition(document, packageName);
      if (packagePos) {
        try {
          const [latestVersion, installedVersion] = await Promise.all([
            getLatestVersion(this.pythonPath, packageName),
            getInstalledVersion(this.pythonPath, packageName),
          ]);

          const hintLabel = ` 📦 ${isDev ? '[dev] ' : ''}latest: ${latestVersion} | installed: ${installedVersion}`;
          const hint = new vscode.InlayHint(packagePos, hintLabel);
          hint.paddingLeft = true;
          hints.push(hint);
        } catch (error) {
          console.error(`Error processing ${packageName}:`, error);
        }
      }
    }
    return hints;
  }

  private findPackagePosition(document: vscode.TextDocument, packageName: string): vscode.Position | null {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = line.text;

      // 跳过空行和注释行
      if (!lineText.trim() || lineText.trim().startsWith('#')) {
        continue;
      }

      // 处理 requirements.txt 格式
      if (document.fileName.endsWith('requirements.txt')) {
        const packageMatch = lineText.match(new RegExp(`^${packageName}(?:[=><~]|$)`));
        if (packageMatch) {
          return new vscode.Position(i, packageName.length);
        }
      }

      // 处理 pyproject.toml 格式
      if (document.fileName.endsWith('pyproject.toml')) {
        // Poetry 格式: package = "version"
        const poetryMatch = lineText.match(new RegExp(`^\\s*${packageName}\\s*=`));
        if (poetryMatch) {
          const charPosition = lineText.indexOf(packageName) + packageName.length;
          return new vscode.Position(i, charPosition);
        }

        // PDM/UV 格式: "package>=version"
        const pdmMatch = lineText.match(new RegExp(`["']${packageName}(?:[=><~]|$)`));
        if (pdmMatch) {
          const charPosition = lineText.indexOf(packageName) + packageName.length;
          return new vscode.Position(i, charPosition);
        }
      }

      // 添加 Pipfile 格式支持
      if (document.fileName.endsWith('Pipfile')) {
        const pipfileMatch = lineText.match(new RegExp(`^\\s*${packageName}\\s*=`));
        if (pipfileMatch) {
          const charPosition = lineText.indexOf(packageName) + packageName.length;
          return new vscode.Position(i, charPosition);
        }
      }
    }
    return null;
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
  }
}
