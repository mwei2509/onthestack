import type { EvalCase } from '../case.js';
import { basics } from './basics.js';
import { cards } from './cards.js';
import { combat } from './combat.js';
import { corrections } from './conversation.js';
import { questions } from './questions.js';
import { taps } from './taps.js';

export const CASES: EvalCase[] = [...basics, ...cards, ...combat, ...corrections, ...questions, ...taps];
