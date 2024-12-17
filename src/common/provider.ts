import * as TOML from '@iarna/toml';
import * as vscode from 'vscode';
import { VersionCache } from './cache';
import type { DependencySpec, GetInlayHintParams, Pipfile, PyProjectToml } from './types';
import { getVersionHintString, searchPackageName, showError } from './utils';

const cache = VersionCache.getInstance();

export class DependencyVersionProvider implements vscode.InlayHintsProvider {
  private pythonPath: string | undefined = undefined;
  private _onDidchangeInlayHints = new vscode.EventEmitter<void>();
  readonly onDidChangeInlayHints = this._onDidchangeInlayHints.event;

  constructor() {}

  refreshHints() {
    this._onDidchangeInlayHints.fire();
  }

  clearAllCache() {
    cache.clearCache();
  }

  clearCache() {
    if (!this.pythonPath) return;
    cache.clearCache(this.pythonPath);
  }

  async updatePythonPath(pathPath: string | undefined) {
    if (pathPath === this.pythonPath) return;
    this.pythonPath = pathPath;
    this.refreshHints();
  }

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlayHint[]> {
    if (!this.pythonPath) return [];

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
  }

  private async processPyprojectToml(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const params: GetInlayHintParams[] = [];

    try {
      const content = document.getText();
      const tomlData = TOML.parse(content) as PyProjectToml;
      const project = tomlData?.project;
      const depGroup = tomlData['dependency-groups'];
      const uv = tomlData.tool?.uv;
      const poetry = tomlData.tool?.poetry;

      // project
      if (project?.dependencies) {
        params.push(...this.parseStrListDependencies(document, project.dependencies));
      }

      if (depGroup?.dev) {
        params.push(...this.parseStrListDependencies(document, depGroup.dev));
      }

      if (uv?.['dev-dependencies']) {
        params.push(...this.parseStrListDependencies(document, uv['dev-dependencies']));
      }

      // 处理主依赖
      if (poetry?.dependencies) {
        params.push(...this.parseRecordDependencies(document, poetry.dependencies));
      }

      // 处理开发依赖
      if (poetry?.dev_dependencies) {
        params.push(...this.parseRecordDependencies(document, poetry.dev_dependencies));
      }

      // 处理组依赖
      if (poetry?.group) {
        for (const [groupName, group] of Object.entries(poetry.group)) {
          if (group?.dependencies) {
            params.push(...this.parseRecordDependencies(document, group.dependencies));
          }
        }
      }
    } catch (error) {
      await showError('Error processing pyproject.toml', error);
    }

    return await Promise.all(params.map((p) => this.getVscodeHint(p)));
  }

  private async processRequirementsTxt(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const params: GetInlayHintParams[] = [];
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = line.text.trim();

      // 跳过空行和注释行
      if (!lineText || lineText.startsWith('#')) {
        continue;
      }

      const packageName = searchPackageName(lineText);
      if (packageName) {
        params.push({
          position: new vscode.Position(i, line.text.length),
          packageName,
        });
      }
    }
    return await Promise.all(params.map((p) => this.getVscodeHint(p)));
  }

  private async processPipfile(document: vscode.TextDocument): Promise<vscode.InlayHint[]> {
    const hintsParams: GetInlayHintParams[] = [];

    try {
      const content = document.getText();
      const pipfile = TOML.parse(content) as Pipfile;

      // 处理主依赖
      if (pipfile.packages) {
        hintsParams.push(...this.parseRecordDependencies(document, pipfile.packages));
      }

      // 处理开发依赖
      if (pipfile['dev-packages']) {
        hintsParams.push(...this.parseRecordDependencies(document, pipfile['dev-packages']));
      }
    } catch (error) {
      await showError('Error processing Pipfile', error);
    }

    return await Promise.all(hintsParams.map((p) => this.getVscodeHint(p)));
  }

  // 处理列表依赖项目
  private parseStrListDependencies(document: vscode.TextDocument, dependencies: string[]): GetInlayHintParams[] {
    const params: GetInlayHintParams[] = [];

    for (const depString of dependencies) {
      const packageName = searchPackageName(depString);
      if (!packageName) continue;

      const packagePos = this.findPackagePosition(document, packageName);
      if (packagePos) {
        params.push({
          position: packagePos,
          packageName,
        });
      }
    }
    return params;
  }

  // 处理记录依赖项目
  private parseRecordDependencies(
    document: vscode.TextDocument,
    dependencies: Record<string, DependencySpec>,
  ): GetInlayHintParams[] {
    const params: GetInlayHintParams[] = [];

    for (const [packageName, _] of Object.entries(dependencies)) {
      if (packageName === 'python') continue;

      const packagePos = this.findPackagePosition(document, packageName);
      if (packagePos) {
        params.push({
          position: packagePos,
          packageName,
        });
      }
    }
    return params;
  }

  private async getVscodeHint(param: GetInlayHintParams): Promise<vscode.InlayHint> {
    const hintString = await getVersionHintString(this.pythonPath as string, param.packageName);
    const hint = new vscode.InlayHint(param.position, hintString);
    hint.paddingLeft = true;
    return hint;
  }

  private findPackagePosition(document: vscode.TextDocument, packageName: string): vscode.Position | null {
    for (let i = 0; i < document.lineCount; i++) {
      const line = document.lineAt(i);
      const lineText = line.text;

      // 跳过空行和注释行
      if (!lineText.trim() || lineText.trim().startsWith('#')) {
        continue;
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
}
