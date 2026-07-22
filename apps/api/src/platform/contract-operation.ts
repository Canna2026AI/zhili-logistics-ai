import { RequestMethod, SetMetadata, type CustomDecorator, type Type } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { IDEMPOTENT_COMMAND_METADATA_KEY } from './idempotency';

export const CONTRACT_OPERATION_METADATA_KEY = 'zhili:contract-operation';

export interface ImplementedOperation {
  readonly method: string;
  readonly path: string;
  readonly operationId: string | undefined;
  readonly idempotency: boolean | undefined;
}

export interface ContractOperationMapping {
  readonly operationId: string;
  readonly contractPath: string;
}

export function ContractOperation(
  operationId: string,
  contractPath?: string
): CustomDecorator<string> {
  return SetMetadata(
    CONTRACT_OPERATION_METADATA_KEY,
    contractPath === undefined ? operationId : [{ operationId, contractPath }]
  );
}

export function ContractOperations(
  mappings: readonly ContractOperationMapping[]
): CustomDecorator<string> {
  return SetMetadata(CONTRACT_OPERATION_METADATA_KEY, mappings);
}

export function collectControllerOperations(
  controllers: readonly Type<unknown>[],
  globalPrefix: string
): readonly ImplementedOperation[] {
  const scanner = new MetadataScanner();
  const operations: ImplementedOperation[] = [];

  for (const controller of controllers) {
    const controllerPath = singlePathMetadata(controller, 'controller');
    assertInternalRuntimePath(controllerPath, `controller ${controller.name}`);
    const prototype = controller.prototype as object;
    for (const methodName of scanner.getAllMethodNames(prototype)) {
      const handler = (prototype as Record<string, unknown>)[methodName];
      if (typeof handler !== 'function') continue;
      const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as
        RequestMethod | undefined;
      if (requestMethod === undefined) continue;

      const method = REQUEST_METHOD_NAMES[requestMethod];
      if (!method) throw new Error(`Unsupported Nest request method metadata: ${requestMethod}`);
      const methodPath = singlePathMetadata(handler, `route ${controller.name}.${methodName}`);
      assertInternalRuntimePath(methodPath, `route ${controller.name}.${methodName}`);
      const contractMetadata = Reflect.getMetadata(CONTRACT_OPERATION_METADATA_KEY, handler) as
        string | readonly ContractOperationMapping[] | undefined;
      const methodPolicy = Reflect.getMetadata(IDEMPOTENT_COMMAND_METADATA_KEY, handler) as
        boolean | undefined;
      const classPolicy = Reflect.getMetadata(IDEMPOTENT_COMMAND_METADATA_KEY, controller) as
        boolean | undefined;

      for (const mapping of operationMappings(
        contractMetadata,
        methodPath,
        `route ${controller.name}.${methodName}`
      )) {
        operations.push({
          method,
          path: implementedPath(globalPrefix, controllerPath, mapping.contractPath),
          operationId: mapping.operationId,
          idempotency: methodPolicy ?? classPolicy,
        });
      }
    }
  }

  return operations;
}

export function collectApplicationOperations(
  discoveryService: DiscoveryService,
  globalPrefix: string
): readonly ImplementedOperation[] {
  const controllers = discoveryService
    .getControllers()
    .map((wrapper) => wrapper.metatype)
    .filter((controller): controller is Type<unknown> => typeof controller === 'function');
  return collectControllerOperations(controllers, globalPrefix);
}

export function assertOpenApiCoverage(
  document: unknown,
  implementedOperations: readonly ImplementedOperation[]
): void {
  const openApi = requireRecord(document, 'OpenAPI document');
  const paths = requireRecord(openApi.paths, 'OpenAPI paths');
  const serverPrefix = openApiServerPrefix(openApi);

  for (const implemented of implementedOperations) {
    const label = `${implemented.method} ${implemented.path}`;
    const contractPath = stripServerPrefix(implemented.path, serverPrefix);
    const pathItem = paths[contractPath];
    if (!isRecord(pathItem)) {
      throw new Error(`${label} has no matching OpenAPI path ${contractPath}`);
    }
    const operation = pathItem[implemented.method.toLowerCase()];
    if (!isRecord(operation)) {
      throw new Error(`${label} has no matching OpenAPI method`);
    }
    if (
      typeof implemented.operationId !== 'string' ||
      implemented.operationId !== operation.operationId
    ) {
      throw new Error(
        `${label} operationId ${String(implemented.operationId)} does not match OpenAPI ${String(
          operation.operationId
        )}`
      );
    }

    const hasIdempotencyKey = operationDeclaresIdempotencyKey(openApi, pathItem, operation);
    if (MUTATION_METHODS.has(implemented.method) && implemented.idempotency === undefined) {
      throw new Error(`${label} must declare @IdempotentCommand() or @SkipIdempotency()`);
    }
    if (implemented.idempotency === true && !hasIdempotencyKey) {
      throw new Error(`${label} metadata=true but OpenAPI does not declare Idempotency-Key`);
    }
    if (implemented.idempotency === false && hasIdempotencyKey) {
      throw new Error(`${label} metadata=false but OpenAPI declares Idempotency-Key`);
    }
  }
}

const REQUEST_METHOD_NAMES: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function assertInternalRuntimePath(path: string, label: string): void {
  for (const segment of path.split('/')) {
    const firstColon = segment.indexOf(':');
    if (firstColon === -1) continue;
    const onlyNestParameter = firstColon === 0 && segment.indexOf(':', 1) === -1;
    if (!onlyNestParameter) {
      throw new Error(
        `${label} registers a raw colon-action path; use internalActionPath() and declare the external contractPath`
      );
    }
  }
}

function operationMappings(
  metadata: string | readonly ContractOperationMapping[] | undefined,
  runtimePath: string,
  label: string
): readonly { readonly operationId: string | undefined; readonly contractPath: string }[] {
  if (typeof metadata === 'string') return [{ operationId: metadata, contractPath: runtimePath }];
  if (metadata === undefined) return [{ operationId: undefined, contractPath: runtimePath }];
  if (metadata.length === 0) throw new Error(`${label} must map at least one contract operation`);

  return metadata.map((mapping) => {
    if (
      !isRecord(mapping) ||
      typeof mapping.operationId !== 'string' ||
      mapping.operationId.trim() === '' ||
      typeof mapping.contractPath !== 'string' ||
      mapping.contractPath.trim() === ''
    ) {
      throw new Error(`${label} contains an invalid contract operation mapping`);
    }
    return { operationId: mapping.operationId, contractPath: mapping.contractPath };
  });
}

function singlePathMetadata(target: object, label: string): string {
  const value = Reflect.getMetadata(PATH_METADATA, target) as
    string | readonly string[] | undefined;
  if (value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') return value[0];
  throw new Error(`${label} must use one deterministic route path`);
}

function implementedPath(globalPrefix: string, controllerPath: string, methodPath: string): string {
  const joined = [globalPrefix, controllerPath, methodPath]
    .map((part) => part.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${joined}`.replace(/(^|\/):([A-Za-z0-9_]+)/g, '$1{$2}');
}

function openApiServerPrefix(openApi: Record<string, unknown>): string {
  const servers = openApi.servers;
  if (!Array.isArray(servers) || !isRecord(servers[0]) || typeof servers[0].url !== 'string') {
    return '';
  }
  const url = servers[0].url;
  return url === '/' ? '' : `/${url.replace(/^\/+|\/+$/g, '')}`;
}

function stripServerPrefix(path: string, prefix: string): string {
  if (!prefix) return path;
  if (path === prefix) return '/';
  if (!path.startsWith(`${prefix}/`)) {
    throw new Error(`${path} does not use OpenAPI server prefix ${prefix}`);
  }
  return path.slice(prefix.length);
}

function operationDeclaresIdempotencyKey(
  openApi: Record<string, unknown>,
  pathItem: Record<string, unknown>,
  operation: Record<string, unknown>
): boolean {
  const parameters = [
    ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
    ...(Array.isArray(operation.parameters) ? operation.parameters : []),
  ];
  return parameters.some((parameter) => {
    const resolved = resolveParameter(openApi, parameter);
    return (
      resolved?.in === 'header' &&
      typeof resolved.name === 'string' &&
      resolved.name.toLowerCase() === 'idempotency-key'
    );
  });
}

function resolveParameter(
  openApi: Record<string, unknown>,
  parameter: unknown
): Record<string, unknown> | undefined {
  if (!isRecord(parameter)) return undefined;
  if (typeof parameter.$ref !== 'string') return parameter;
  const segments = parameter.$ref.match(/^#\/components\/parameters\/([^/]+)$/);
  if (!segments) return undefined;
  const components = isRecord(openApi.components) ? openApi.components : undefined;
  const parameters =
    components && isRecord(components.parameters) ? components.parameters : undefined;
  const resolved = parameters?.[segments[1]!];
  return isRecord(resolved) ? resolved : undefined;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
