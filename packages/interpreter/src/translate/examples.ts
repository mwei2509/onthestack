import type { CardText } from './translate.js';
import type { TranslationDraft } from './schema.js';

/** Worked examples for the drafting prompt. Tests check every one against the schema. */
export const EXAMPLES: { card: CardText; draft: TranslationDraft }[] = [
  {
    card: {
      name: 'Authority of the Consuls',
      typeLine: 'Enchantment',
      oracleText: 'Creatures your opponents control enter tapped.\nWhenever a creature an opponent controls enters, you gain 1 life.',
    },
    draft: {
      abilities: [
        { kind: 'static', text: 'Creatures your opponents control enter tapped.', effect: { entersTapped: { types: ['Creature'], controller: 'opponent' } } },
        {
          kind: 'triggered',
          text: 'Whenever a creature an opponent controls enters, you gain 1 life.',
          when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'opponent' } },
          effect: [{ gameAction: 'life', who: 'you', amount: 1 }],
        },
      ],
    },
  },
  {
    card: {
      name: 'Blood Artist',
      typeLine: 'Creature — Vampire',
      oracleText: 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
    },
    draft: {
      abilities: [
        {
          kind: 'triggered',
          text: 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
          when: { event: 'ZoneChanged', from: 'battlefield', to: 'graveyard', object: { selfOr: { types: ['Creature'] } } },
          targets: [{ id: 't1', kind: 'player', player: 'any' }],
          effect: [{ gameAction: 'life', who: { target: 't1' }, amount: 1, lose: true }, { gameAction: 'life', who: 'you', amount: 1 }],
        },
      ],
    },
  },
  {
    card: {
      name: 'Godless Shrine',
      typeLine: 'Land — Plains Swamp',
      oracleText: '({T}: Add {W} or {B}.)\nAs Godless Shrine enters, you may pay 2 life. If you don\'t, it enters tapped.',
    },
    draft: {
      abilities: [
        { kind: 'static', text: "As Godless Shrine enters, you may pay 2 life. If you don't, it enters tapped.", effect: { entersTapped: 'self', unless: { payLife: 2 } } },
      ],
    },
  },
  {
    card: {
      name: 'Coastal Piracy',
      typeLine: 'Enchantment',
      oracleText: 'Whenever a creature you control deals combat damage to an opponent, you may draw a card.',
    },
    draft: {
      abilities: [
        {
          kind: 'triggered',
          text: 'Whenever a creature you control deals combat damage to an opponent, you may draw a card.',
          when: { event: 'DamageDealt', combat: true, player: 'opponent', object: { types: ['Creature'], controller: 'you' } },
          optional: true,
          effect: [{ playerTask: 'You may draw a card.', who: 'you' }],
        },
      ],
    },
  },
  {
    card: {
      name: 'Case of the Uneaten Feast',
      typeLine: 'Enchantment — Case',
      oracleText:
        'Whenever a creature you control enters, you gain 1 life.\nTo solve — You\'ve gained 5 or more life this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — Sacrifice this Case: Creature cards in your graveyard gain "You may cast this card from your graveyard" until end of turn.',
    },
    draft: {
      abilities: [
        {
          kind: 'triggered',
          text: 'Whenever a creature you control enters, you gain 1 life.',
          when: { event: 'ZoneChanged', to: 'battlefield', object: { types: ['Creature'], controller: 'you' } },
          effect: [{ gameAction: 'life', who: 'you', amount: 1 }],
        },
        {
          kind: 'unmodeled',
          text: 'To solve — You\'ve gained 5 or more life this turn. (If unsolved, solve at the beginning of your end step.)\nSolved — Sacrifice this Case: Creature cards in your graveyard gain "You may cast this card from your graveyard" until end of turn.',
        },
      ],
    },
  },
  {
    card: {
      name: 'Cleric Class',
      typeLine: 'Enchantment — Class',
      oracleText:
        '(Gain the next level as a sorcery to add its ability.)\nIf you would gain life, you gain that much life plus 1 instead.\n{3}{W}: Level 2\nWhenever you gain life, put a +1/+1 counter on target creature you control.\n{4}{W}: Level 3\nWhen this Class becomes level 3, return target creature card from your graveyard to the battlefield. You gain life equal to its toughness.',
    },
    draft: {
      abilities: [
        { kind: 'alwaysOn', text: 'If you would gain life, you gain that much life plus 1 instead.', when: { event: 'LifeChanged', player: 'you', gained: true } },
        {
          kind: 'unmodeled',
          text: '{3}{W}: Level 2\nWhenever you gain life, put a +1/+1 counter on target creature you control.\n{4}{W}: Level 3\nWhen this Class becomes level 3, return target creature card from your graveyard to the battlefield. You gain life equal to its toughness.',
        },
      ],
    },
  },
];
