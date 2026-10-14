export function readInputValue(event: Event): string {
  const target = event.target;
  return target instanceof HTMLInputElement || target instanceof HTMLSelectElement
    ? target.value
    : '';
}
