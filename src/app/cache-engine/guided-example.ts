import type { EngineCommand } from './models';

export const GUIDED_CAPACITY = 10;

export interface GuidedStep {
  readonly label: string;
  readonly command: EngineCommand;
}

export const GUIDED_STEPS: readonly GuidedStep[] = [
  { label: 'Add A, size 3', command: { type: 'add', key: 'A', size: 3 } },
  { label: 'Add B, size 3', command: { type: 'add', key: 'B', size: 3 } },
  { label: 'Add C, size 3', command: { type: 'add', key: 'C', size: 3 } },
  { label: 'Access A', command: { type: 'access', key: 'A' } },
  { label: 'Access A', command: { type: 'access', key: 'A' } },
  { label: 'Access B', command: { type: 'access', key: 'B' } },
  { label: 'Access C', command: { type: 'access', key: 'C' } },
  { label: 'Add D, size 4', command: { type: 'add', key: 'D', size: 4 } },
];
