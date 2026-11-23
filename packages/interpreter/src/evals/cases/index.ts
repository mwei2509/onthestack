import type { EvalCase } from '../case.js';
import { basics } from './basics.js';
import { combat } from './combat.js';
import { corrections } from './conversation.js';
import { questions } from './questions.js';

export const CASES: EvalCase[] = [...basics, ...combat, ...corrections, ...questions];
