/**
 * Source-order metadata for pseudo/media condition maps.
 * Core concepts: non-emitted metadata and CSS cascade comparisons.
 */

const conditionSourceOrders = new WeakMap<Record<string, unknown>, Map<string, number>>();

export function setConditionSourceOrder(
  map: Record<string, unknown>,
  condition: string,
  sourceOrder: number | undefined,
): void {
  if (sourceOrder === undefined) {
    return;
  }
  const orders = conditionSourceOrders.get(map) ?? new Map<string, number>();
  orders.set(condition, sourceOrder);
  conditionSourceOrders.set(map, orders);
}

export function getConditionSourceOrder(
  map: Record<string, unknown>,
  condition: string,
): number | undefined {
  return conditionSourceOrders.get(map)?.get(condition);
}

export function copyConditionSourceOrders(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): void {
  const sourceOrders = conditionSourceOrders.get(source);
  if (!sourceOrders) {
    return;
  }
  const targetOrders = conditionSourceOrders.get(target) ?? new Map<string, number>();
  for (const [condition, sourceOrder] of sourceOrders) {
    targetOrders.set(condition, sourceOrder);
  }
  conditionSourceOrders.set(target, targetOrders);
}
