const WORDS = [
  'ACORN', 'AMBER', 'ANVIL', 'APPLE', 'ARROW', 'ASPEN', 'ATLAS', 'BADGE', 'BAKER', 'BASIL',
  'BEACH', 'BEARD', 'BERRY', 'BIRCH', 'BISON', 'BLAZE', 'BLOOM', 'BOAT', 'BOLT', 'BRAVE',
  'BREAD', 'BRICK', 'BROOK', 'BRUSH', 'CABIN', 'CAMEL', 'CANDY', 'CANOE', 'CEDAR', 'CHALK',
  'CHARM', 'CHESS', 'CHIME', 'CIDER', 'CLAY', 'CLOUD', 'CLOVER', 'COAST', 'COMET', 'CORAL',
  'CRANE', 'CREEK', 'CROWN', 'DAISY', 'DELTA', 'DOVE', 'DRAKE', 'DUNE', 'EAGLE', 'EMBER',
  'FABLE', 'FALCON', 'FENCE', 'FERN', 'FIELD', 'FLAME', 'FLINT', 'FLUTE', 'FOREST', 'FOX',
  'FROST', 'GARNET', 'GHOST', 'GIANT', 'GLADE', 'GLOW', 'GOAT', 'GRAPE', 'GROVE', 'HARBOR',
  'HAWK', 'HAZEL', 'HERON', 'HONEY', 'IVORY', 'IVY', 'JADE', 'JEWEL', 'KITE', 'KNIGHT',
  'LAKE', 'LANTERN', 'LARK', 'LEMON', 'LILY', 'LION', 'LOTUS', 'LUNAR', 'MAPLE', 'MARSH',
  'MEADOW', 'MESA', 'MINT', 'MOON', 'MOSS', 'MOTH', 'NOBLE', 'NORTH', 'OAK', 'OCEAN',
  'OLIVE', 'ONYX', 'OPAL', 'ORBIT', 'OTTER', 'OWL', 'PANDA', 'PEACH', 'PEARL', 'PEBBLE',
  'PINE', 'PIXIE', 'PLUM', 'POND', 'POPPY', 'PRISM', 'QUAIL', 'QUILL', 'RAVEN', 'REED',
  'RIDGE', 'RIVER', 'ROBIN', 'ROCKET', 'ROSE', 'RUBY', 'SAGE', 'SALT', 'SHELL', 'SILK',
  'SLATE', 'SNOW', 'SPARK', 'SPRUCE', 'STAG', 'STAR', 'STONE', 'STORM', 'SUN', 'SWAN',
  'THORN', 'TIDE', 'TIGER', 'TORCH', 'TOWER', 'TULIP', 'VALE', 'VELVET', 'VINE', 'WAVE',
  'WHALE', 'WILLOW', 'WIND', 'WOLF', 'WREN', 'YARROW', 'ZEBRA', 'ZEPHYR',
];

export const GAME_CODE = /^[A-Z]+-[A-Z]+-\d{2}$/;

/** A code like KITE-MOSS-42 (ADR 0052): about 2.5 million combinations, so a live game can't be found by guessing. */
export function newGameCode(random: (n: number) => number = randomInt): string {
  const word = () => WORDS[random(WORDS.length)];
  return `${word()}-${word()}-${String(random(100)).padStart(2, '0')}`;
}

function randomInt(n: number): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! % n;
}
