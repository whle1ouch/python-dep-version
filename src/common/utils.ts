import { exec } from 'child_process';
import { promisify } from 'util';
import { window } from 'vscode';
import { VersionCache } from './cache';

const execAsync = promisify(exec);
const cache = VersionCache.getInstance();

export async function showError(message: string, error?: any) {
  await window.showErrorMessage(`python Version: ${message}`);
}

async function getInstalledVersion(pythonPath: string, packageName: string): Promise<string> {
  try {
    // 先检查缓存
    const cachedVersion = cache.getInstalledVersion(pythonPath, packageName);
    if (cachedVersion) {
      return cachedVersion;
    }

    // 如果缓存中没有，则执行命令获取
    const { stdout } = await execAsync(`"${pythonPath}" -m pip show ${packageName}`);
    const version = stdout.toString().match(/Version: (.+)/);
    const result = version ? version[1].trim() : '';

    // 将结果存入缓存
    if (result.length > 0) {
      cache.setInstalledVersion(pythonPath, packageName, result);
    }

    return result;
  } catch (error) {
    return '';
  }
}

async function getLatestVersion(pythonPath: string, packageName: string): Promise<string> {
  try {
    // 先检查缓存
    const cachedVersion = cache.getLatestVersion(pythonPath, packageName);
    if (cachedVersion) {
      return cachedVersion;
    }

    // 修改命令以获取最新版本
    // WARN：未来 pip 版本可能不支持 index versions
    const pythonCmd = `"${pythonPath}" -m pip index versions ${packageName}`;
    const { stdout, stderr } = await execAsync(pythonCmd);

    // 从输出中提取版本信息
    const version = stdout.match(/\LATEST: (.+)/);
    const result = version ? version[1].trim() : '';
    if (result.length > 0) {
      cache.setLatestVersion(pythonPath, packageName, result);
    }

    return result;
  } catch (error) {
    return '';
  }
}

export async function getVersionHintString(pythonPath: string, packageName: string): Promise<string> {
  const installedVersion = await getInstalledVersion(pythonPath, packageName);
  // const [latestVersion, installedVersion] = await Promise.all([
  //   getLatestVersion(pythonPath, packageName),
  //   getInstalledVersion(pythonPath, packageName),
  // ]);
  // const hintString =
  //   ' 📦 ' +
  //   (installedVersion.length > 0 ? `installed:${installedVersion}` : 'not installed) +
  //   (latestVersion.length > 0 ? +` | latest:${latestVersion}` : '');
  const hintString = ' 📦 ' + (installedVersion.length > 0 ? `installed:${installedVersion}` : 'not installed');
  return hintString;
}

export function isPythonEnvFile(fileName: string): boolean {
  return fileName.endsWith('requirements.txt') || fileName.endsWith('pyproject.toml') || fileName.endsWith('Pipfile');
}

export function searchPackageName(text: string): string {
  const match = text.match(/^([^=><~\s]+)(?:[=><~]{1,2}(.+))?/);
  if (match){
    return match[1]
  }
  return ''
}
