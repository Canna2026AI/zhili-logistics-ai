import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { AnySchema } from 'ajv';
import { parse } from 'yaml';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

const document = parse(
  readFileSync(resolve(import.meta.dirname, '../openapi/zhili.openapi.yaml'), 'utf8')
) as {
  components: {
    responses: Record<string, JsonValue>;
    schemas: Record<string, JsonValue>;
  };
};

function resolvePointer(pointer: string): JsonValue {
  if (!pointer.startsWith('#/')) throw new Error(`Unsupported external reference: ${pointer}`);
  return pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
    .reduce<JsonValue>(
      (value, segment) => {
        if (
          typeof value !== 'object' ||
          value === null ||
          Array.isArray(value) ||
          !(segment in value)
        ) {
          throw new Error(`Unresolvable OpenAPI reference: ${pointer}`);
        }
        return value[segment]!;
      },
      document as unknown as JsonValue
    );
}

function dereference(value: JsonValue, stack: ReadonlySet<string> = new Set()): JsonValue {
  if (Array.isArray(value)) return value.map((item) => dereference(item, stack));
  if (typeof value !== 'object' || value === null) return value;

  const reference = value.$ref;
  if (typeof reference === 'string') {
    if (stack.has(reference)) throw new Error(`Circular OpenAPI reference: ${reference}`);
    const nextStack = new Set(stack).add(reference);
    const target = dereference(resolvePointer(reference), nextStack);
    const siblings = Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== '$ref')
        .map(([key, child]) => [key, dereference(child, stack)])
    );
    if (Object.keys(siblings).length === 0) return target;
    if (typeof target !== 'object' || target === null || Array.isArray(target)) {
      throw new Error(`Referenced schema with siblings is not an object: ${reference}`);
    }
    return { ...target, ...siblings };
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, dereference(child, stack)])
  );
}

const response = document.components.responses.PreconditionFailed as {
  content: { 'application/problem+json': { schema: JsonValue } };
};

export const preconditionFailedSchema = dereference(
  response.content['application/problem+json'].schema
);

export const validatePreconditionFailed = new Ajv2020({ allErrors: true, strict: false }).compile(
  preconditionFailedSchema as AnySchema
);
