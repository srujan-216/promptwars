import { describe, expect, it } from 'vitest';

import { extractionResponseGeminiSchema } from './schema';

/**
 * These pin the defect that broke the first deployment.
 *
 * `responseSchema` takes Google's Schema type, whose Type enum is UPPERCASE. We sent
 * lowercase JSON Schema types, the API rejected every request, and the live site returned
 * 422 on every extraction. Nothing in the test suite noticed, because every test used a stub
 * client that never validated the schema it was handed.
 *
 * A stub cannot check what a real API accepts. What it CAN check is that the shape we send
 * matches the documented contract — so that is asserted here, recursively.
 */

type Node = { type?: unknown; properties?: Record<string, Node>; items?: Node };

const VALID_TYPES = ['OBJECT', 'ARRAY', 'STRING', 'NUMBER', 'INTEGER', 'BOOLEAN'];

function walk(node: Node, path: string, visit: (n: Node, p: string) => void): void {
  visit(node, path);
  if (node.properties !== undefined) {
    for (const [key, child] of Object.entries(node.properties)) {
      walk(child, `${path}.${key}`, visit);
    }
  }
  if (node.items !== undefined) walk(node.items, `${path}[]`, visit);
}

describe('extraction schema — Gemini Schema contract', () => {
  it('uses only uppercase type names, everywhere', () => {
    walk(extractionResponseGeminiSchema, 'root', (node, path) => {
      if (node.type === undefined) return;
      const described = typeof node.type === 'string' ? node.type : JSON.stringify(node.type);
      expect(VALID_TYPES, `${path} has type ${described}`).toContain(node.type);
    });
  });

  it('never uses a lowercase JSON Schema type', () => {
    // The exact regression: 'object' instead of 'OBJECT'.
    expect(JSON.stringify(extractionResponseGeminiSchema)).not.toMatch(
      /"type":"(object|array|string|number|integer|boolean)"/,
    );
  });

  it('declares every field the Zod schema requires', () => {
    const labItems = extractionResponseGeminiSchema.properties.labs.items;

    expect(Object.keys(labItems.properties).sort()).toEqual([
      'confidence',
      'name',
      'referenceText',
      'sourceQuote',
      'unit',
      'value',
    ]);
  });

  it('keeps sourceQuote required — a field without provenance is unusable', () => {
    const required: readonly string[] =
      extractionResponseGeminiSchema.properties.labs.items.required;

    expect(required).toContain('sourceQuote');
  });

  it('allows referenceText to be null, so "no range printed" is expressible', () => {
    // Without nullable the model must invent a range to satisfy the schema, which is
    // exactly the failure rule 3 exists to catch.
    expect(extractionResponseGeminiSchema.properties.labs.items.properties.referenceText).toHaveProperty(
      'nullable',
      true,
    );
  });

  it('offers the model nowhere to put a clinical judgement', () => {
    const serialised = JSON.stringify(extractionResponseGeminiSchema).toLowerCase();

    for (const forbidden of ['status', 'abnormal', 'severity', 'interpretation', 'diagnosis']) {
      expect(serialised).not.toContain(forbidden);
    }
  });
});
