import {
  DriftError,
  type Json,
  type RetrieveInput,
  type RetrieveResult,
} from '../contracts/types.js';

type Row = Record<string, Json>;

export interface RetrievalExecutionLimits {
  maxGroups: number;
  maxResults: number;
  assertWithinBudget(): void;
}

export function runRetrieval(
  records: object[],
  input: RetrieveInput,
  limits: RetrievalExecutionLimits,
): RetrieveResult {
  const projection = input.projection?.length ? input.projection : [{ field: 'id' }];
  const projected = records.map((record) => {
    limits.assertWithinBudget();
    return Object.fromEntries(
      projection.map((item) => [item.as ?? item.field, readField(record, item.field)]),
    ) as Row;
  });
  const rows =
    input.groupBy?.length || input.aggregates?.length
      ? reduceGroups(projected, input, limits)
      : projected;

  limits.assertWithinBudget();
  sortRows(rows, input);
  limits.assertWithinBudget();
  return {
    rows: rows.slice(0, Math.min(input.limit ?? 100, limits.maxResults)),
    scanned: records.length,
  };
}

function readField(record: object, path: string): Json {
  const values = record as Record<string, unknown>;
  const [root, ...segments] = path.split('.');
  if (root === 'data' || root === 'metadata') {
    return (
      (segments.reduce<unknown>((value, segment) => {
        return value && typeof value === 'object'
          ? (value as Record<string, unknown>)[segment]
          : null;
      }, values[root]) as Json) ?? null
    );
  }
  return (values[path] as Json | undefined) ?? null;
}

function reduceGroups(rows: Row[], input: RetrieveInput, limits: RetrievalExecutionLimits): Row[] {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    limits.assertWithinBudget();
    const key = JSON.stringify((input.groupBy ?? []).map((field) => row[field]));
    const group = groups.get(key);
    if (group) group.push(row);
    else {
      if (groups.size >= limits.maxGroups)
        throw new DriftError('limit_exceeded', 'Retrieval exceeds server group limit', 422);
      groups.set(key, [row]);
    }
  }
  return [...groups.values()].map((group) => {
    limits.assertWithinBudget();
    return reduceGroup(group, input);
  });
}

function reduceGroup(group: Row[], input: RetrieveInput): Row {
  const result: Row = {};
  for (const field of input.groupBy ?? []) result[field] = group[0]![field] ?? null;
  for (const aggregate of input.aggregates ?? []) {
    const values = aggregate.field
      ? group.map((row) => Number(row[aggregate.field!])).filter(Number.isFinite)
      : [];
    result[aggregate.as] = aggregateValue(aggregate.op, group.length, values);
  }
  return result;
}

function aggregateValue(
  op: NonNullable<RetrieveInput['aggregates']>[number]['op'],
  count: number,
  values: number[],
) {
  switch (op) {
    case 'count':
      return count;
    case 'sum':
      return values.reduce((total, value) => total + value, 0);
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    case 'avg':
      return values.reduce((total, value) => total + value, 0) / (values.length || 1);
  }
}

function sortRows(rows: Row[], input: RetrieveInput) {
  for (const sort of (input.sort ?? []).reverse()) {
    rows.sort((left, right) => {
      const a = String(left[sort.field] ?? '');
      const b = String(right[sort.field] ?? '');
      return (a < b ? -1 : a > b ? 1 : 0) * (sort.direction === 'desc' ? -1 : 1);
    });
  }
}
