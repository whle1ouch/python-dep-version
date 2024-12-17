interface VersionInfo {
  version: string;
  timestamp: number;
}

interface CacheData {
  [pythonPath: string]: {
    installed: { [key: string]: VersionInfo };
    latest: { [key: string]: VersionInfo };
  };
}

export class VersionCache {
  private static instance: VersionCache;
  private cache: CacheData = {};
  private readonly TTL = 1000 * 60 * 5; // 5j分钟缓存过期时间

  private constructor() {}

  static getInstance(): VersionCache {
    if (!VersionCache.instance) {
      VersionCache.instance = new VersionCache();
    }
    return VersionCache.instance;
  }

  getInstalledVersion(pythonPath: string, packageName: string): string | null {
    const envCache = this.cache[pythonPath];
    if (!envCache) return null;

    const cached = envCache.installed[packageName];
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.version;
    }
    return null;
  }

  getLatestVersion(pythonPath: string, packageName: string): string | null {
    const envCache = this.cache[pythonPath];
    if (!envCache) return null;

    const cached = envCache.latest[packageName];
    if (cached && Date.now() - cached.timestamp < this.TTL) {
      return cached.version;
    }
    return null;
  }

  setInstalledVersion(pythonPath: string, packageName: string, version: string): void {
    if (!this.cache[pythonPath]) {
      this.cache[pythonPath] = {
        installed: {},
        latest: {},
      };
    }
    this.cache[pythonPath].installed[packageName] = {
      version,
      timestamp: Date.now(),
    };
  }

  setLatestVersion(pythonPath: string, packageName: string, version: string): void {
    if (!this.cache[pythonPath]) {
      this.cache[pythonPath] = {
        installed: {},
        latest: {},
      };
    }
    this.cache[pythonPath].latest[packageName] = {
      version,
      timestamp: Date.now(),
    };
  }

  clearCache(pythonPath?: string): void {
    if (pythonPath) {
      // 清除特定 Python 环境的缓存
      delete this.cache[pythonPath];
    } else {
      // 清除所有缓存
      this.cache = {};
    }
  }
}
