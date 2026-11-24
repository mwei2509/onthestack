import { conversation, entry, table, tappedLife, type EvalCase } from '../case.js';

/** ADR 0065: what was tapped on the board is already recorded, so a statement that describes it adds nothing. */
export const taps: EvalCase[] = [
  {
    id: 'statement-repeats-a-tap',
    checks: 'a player explains a life loss they already tapped, which must not be recorded twice',
    turnStart: table('theo'),
    pinned: [tappedLife('main1', 'melissa', -3, 0)],
    statements: conversation(['melissa', "That's the 3 I lost to the Caves of Koilos."]),
    currentStep: 'main1',
    expected: { entries: [] },
  },
  {
    id: 'statement-repeats-a-tap-and-adds-more',
    checks: 'a statement that mentions a tapped life loss and also does something new: only the new part is recorded',
    turnStart: table('theo'),
    pinned: [tappedLife('main1', 'theo', -2, 0)],
    statements: conversation(['theo', 'I paid the 2 life already, and I play a Plains.']),
    currentStep: 'main1',
    expected: { entries: [entry('main1', 'theo', { type: 'playLand', card: 'Plains' }, ['s1'])] },
  },
];
