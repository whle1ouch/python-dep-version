import { exec } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';
import { VersionCache } from './cache';

const execAsync = promisify(exec);
const cache = VersionCache.getInstance();

export async function showError(message: string, error?: any) {
  console.error(message, error);
  await vscode.window.showErrorMessage(`python Version: ${message}`);
}

export async function getInstalledVersion(pythonPath: string, packageName: string): Promise<string> {
  try {
    // 先检查缓存
    const cachedVersion = cache.getInstalledVersion(pythonPath, packageName);
    if (cachedVersion) {
      return cachedVersion;
    }

    // 如果缓存中没有，则执行命令获取
    const { stdout } = await execAsync(`"${pythonPath}" -m pip show ${packageName}`);
    const version = stdout.toString().match(/Version: (.+)/);
    const result = version ? version[1].trim() : 'not found';

    // 将结果存入缓存
    if (result !== 'not found') {
      cache.setInstalledVersion(pythonPath, packageName, result);
    }

    return result;
  } catch (error) {
    console.error(`Error getting installed version for ${packageName}:`, error);
    return 'not found';
  }
}

export async function getLatestVersion(pythonPath: string, packageName: string): Promise<string> {
  try {
    // 先检查缓存
    const cachedVersion = cache.getLatestVersion(pythonPath, packageName);
    if (cachedVersion) {
      return cachedVersion;
    }

    // 修改命令以获取最新版本
    // 注意：某些 pip 版本可能不支持 index versions，我们改用 pip install --dry-run
    const pythonCmd = `"${pythonPath}" -m pip install ${packageName}==invalid 2>&1`;
    const { stdout, stderr } = await execAsync(pythonCmd);
    const output = stdout + stderr;

    // 从输出中提取版本信息
    const versionMatch = output.match(/\(from versions: (.*)\)/);
    if (versionMatch) {
      const versions = versionMatch[1].split(',').map((v) => v.trim());
      const latestVersion = versions[versions.length - 1];

      if (latestVersion) {
        cache.setLatestVersion(pythonPath, packageName, latestVersion);
        return latestVersion;
      }
    }

    console.log(`No version found for ${packageName}, output:`, output);
    return 'unknown';
  } catch (error) {
    console.error(`Error getting latest version for ${packageName}:`, error);
    return 'unknown';
  }
}

// 添加清除缓存的函数
export function clearVersionCache(): void {
  cache.clearCache();
}
