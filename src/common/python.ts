import { PythonExtension, ResolvedEnvironment } from "@vscode/python-extension";
import { Disposable, Event, EventEmitter, Uri } from "vscode";



export interface IInterpreterDetails {
  path?: string;
  resource?: Uri;
}

const onDidChangePythonInterpreterEvent = new EventEmitter<IInterpreterDetails>();
export const onDidChangePythonInterpreter: Event<IInterpreterDetails> =
  onDidChangePythonInterpreterEvent.event;


let _api: PythonExtension | undefined;
async function getPythonExtensionAPI(): Promise<PythonExtension | undefined> {
  if (_api) {
    return _api;
  }
  _api = await PythonExtension.api();
  return _api;
}

export async function initializePython(disposables: Disposable[]): Promise<void> {
  try {
    const api = await getPythonExtensionAPI();

    if (api) {
      disposables.push(
        api.environments.onDidChangeActiveEnvironmentPath((e) => {
          onDidChangePythonInterpreterEvent.fire({ path: e.path, resource: e.resource?.uri });
        }),
      );
      onDidChangePythonInterpreterEvent.fire(await getInterpreterDetails());
    }
  } catch (error) {
  }
}

export async function resolveInterpreter(
  interpreter: string[],
): Promise<ResolvedEnvironment | undefined> {
  const api = await getPythonExtensionAPI();
  return api?.environments.resolveEnvironment(interpreter[0]);
}

export async function getInterpreterDetails(resource?: Uri): Promise<IInterpreterDetails> {
  const api = await getPythonExtensionAPI();
  const environment = await api?.environments.resolveEnvironment(
    api?.environments.getActiveEnvironmentPath(resource),
  );
  if (environment?.executable.uri) {
    return { path: environment?.executable.uri.fsPath, resource };
  }
  return { path: undefined, resource };
}
