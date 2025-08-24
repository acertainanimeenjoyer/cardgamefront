import React from 'react';
import PlayerPanel from '../../components/PlayerPanel';
import EnemyPanel from '../../components/EnemyPanel';

/** returns a function so CharacterBadge can toggle it in a popup */
export const makeEnemyDetails = ({ enemy, hand = [], deckCount = 0 }) => () =>
  <EnemyPanel enemy={enemy} hand={hand} deckCount={deckCount} />;

export const makePlayerDetails = ({ player, delta }) => () =>
  <PlayerPanel player={player} delta={delta} />;
