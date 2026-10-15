export const TOUR_TARGETS = [
  'overview',
  'strategy',
  'capacity',
  'add-item',
  'access-item',
  'cache-usage',
  'cache-items',
  'eviction-priority',
  'statistics',
  'event-log',
  'load-example',
  'guided-example',
  'reset',
] as const;

export type TourTargetId = (typeof TOUR_TARGETS)[number];

export interface TourContext {
  readonly capacityEditable: boolean;
  readonly exampleActive: boolean;
  readonly cacheEmpty: boolean;
}

type TourStep = {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
} & ({ readonly kind: 'target'; readonly target: TourTargetId } | { readonly kind: 'centered' });

export const TOUR_STEPS = [
  {
    id: 'welcome',
    kind: 'target',
    target: 'overview',
    title: 'Meet your cache',
    paragraphs: [
      "Hi, I'm Byte. A cache is a small space that keeps items handy. Add items, look for them, and see what gets removed when the space fills up.",
      "This is a teaching simulation in page memory. It does not change your browser's real cache. Sizes use abstract units, not bytes or money.",
      'This is a quick look around. You can try the controls when we finish, and your current work will stay as it is.',
    ],
  },
  {
    id: 'strategy',
    kind: 'target',
    target: 'strategy',
    title: 'Choose what makes room',
    paragraphs: [
      'When the cache is full, its rule decides what leaves. FIFO removes the item added earliest. LRU removes the item that has gone longest without an access. LFU removes the item accessed the fewest times.',
      'Changing the rule keeps the current items and their history. Ties use the extra rules shown in Eviction priority; size decides how much room is needed.',
    ],
  },
  {
    id: 'capacity',
    kind: 'target',
    target: 'capacity',
    title: 'Set the size of the shelf',
    paragraphs: [
      'Capacity is the total room available. You can choose 1–100 abstract units. Choose it before your first operation. After that, it stays locked until Reset.',
    ],
  },
  {
    id: 'add',
    kind: 'target',
    target: 'add-item',
    title: 'Put something in the cache',
    paragraphs: [
      'Give an item a name, called its key, and a size. For example, A with size 3 uses three units. Click Add item or press Enter.',
      'If it does not fit, the selected rule makes room first. Duplicate names and items larger than capacity show an error; rejected additions never evict anything.',
    ],
  },
  {
    id: 'access',
    kind: 'target',
    target: 'access-item',
    title: 'Look for an item',
    paragraphs: [
      'Enter a key and choose Access. If it is already here, that is a hit. If it is missing, that is a miss, and nothing is added. An empty key shows an error instead.',
      'Names are case-sensitive: A and a are different. Spaces at the ends are trimmed.',
    ],
  },
  {
    id: 'usage',
    kind: 'target',
    target: 'cache-usage',
    title: 'See how much room is used',
    paragraphs: [
      'The number shows used space out of total space, such as 3 / 10. Each colored segment represents an item’s share of capacity. Empty space is room you can still use. Colors help you scan; the item details below provide the labels.',
    ],
  },
  {
    id: 'items',
    kind: 'target',
    target: 'cache-items',
    title: "Read an item's history",
    paragraphs: [
      'Each item gets a card with its size, when it was added, its latest access, and its access count. Steps count accepted operations, not seconds. A new item’s access count starts at zero.',
      "You can also use a card's Access button. Cards stay in insertion order.",
    ],
  },
  {
    id: 'priority',
    kind: 'target',
    target: 'eviction-priority',
    title: 'See who would leave first',
    paragraphs: [
      'This list predicts the removal order if a new item needs room. The first item is the next candidate; it is not being removed yet. Switching rules can change this list. A large addition may need more than one item removed. The list and real evictions use the same rules.',
    ],
  },
  {
    id: 'statistics',
    kind: 'target',
    target: 'statistics',
    title: 'Understand hits and misses',
    paragraphs: [
      'A hit means an Access found its key. A miss means it did not. Hit rate is the share of accesses that were hits; the dash means there have been no accesses yet.',
      'Adding an item does not count as an access. The eviction counter records how many items have been removed since Reset.',
    ],
  },
  {
    id: 'log',
    kind: 'target',
    target: 'event-log',
    title: 'Follow what happened',
    paragraphs: [
      'The newest operation appears at the top. Each accepted operation has a step number and an explanation. When an addition removes items, its details show every removal and why it happened.',
      'The log keeps the latest 50 events; lifetime statistics continue counting. Validation errors stay beside the controls.',
    ],
  },
  {
    id: 'load-example',
    kind: 'target',
    target: 'load-example',
    title: 'Try a prepared example',
    paragraphs: [
      'This button replaces the current simulation with a prepared example at capacity 10, keeping your chosen rule. Manual controls are disabled while it is loaded. The tour only explains this button; loading the example is your choice after you finish.',
    ],
  },
  {
    id: 'guided-example',
    kind: 'target',
    target: 'guided-example',
    title: 'Run it one step at a time',
    paragraphs: [
      'After loading the example, choose Next step to run one operation. The labels show what is done and what comes next. At the last step, FIFO and LRU remove A, while LFU removes B. Reset, choose another rule, and load the example again to compare.',
    ],
  },
  {
    id: 'reset',
    kind: 'target',
    target: 'reset',
    title: 'Start fresh',
    paragraphs: [
      'Reset clears the items, statistics, errors, and event log, and leaves guided mode. It keeps your selected rule and last accepted capacity, which becomes editable again. Use it when you want a fresh experiment.',
    ],
  },
  {
    id: 'finish',
    kind: 'centered',
    title: 'Your turn',
    paragraphs: [
      'Start with capacity 10. Add A with size 3 and B with size 3. Access A, then access a missing name to see a hit and a miss. Or load the guided example and follow Next step. Use Take a tour whenever you want another explanation.',
    ],
  },
] as const satisfies readonly TourStep[];

export function tourNotes(stepId: string, context: TourContext): readonly string[] {
  const notes: string[] = [];
  if (stepId === 'capacity' && !context.capacityEditable) {
    notes.push(
      context.exampleActive
        ? 'Capacity is currently locked because the guided example is loaded.'
        : 'Your capacity is locked right now because this simulation has already started.',
    );
  }
  if (stepId === 'items' && context.cacheEmpty) {
    notes.push('This area is empty until you add an item.');
  }
  if (
    context.exampleActive &&
    ['strategy', 'capacity', 'add', 'access', 'finish'].includes(stepId)
  ) {
    notes.push(
      'The guided example is currently active, so manual controls are disabled. Reset returns you to manual mode when you are ready.',
    );
  }
  return notes;
}
