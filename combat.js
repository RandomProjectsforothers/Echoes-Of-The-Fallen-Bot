function createCombatState(enemy, player) {
  return {
    enemyId: enemy.id,
    enemyName: enemy.name,
    enemyHp: enemy.hp,
    enemyMaxHp: enemy.hp,
    enemyAttack: enemy.attack,
    enemyDefense: enemy.defense,
    xpReward: enemy.xpReward,
    coinReward: enemy.coinReward,
    loot: enemy.loot ?? [],
    playerHp: player.hp ?? player.max_hp ?? 100,
    playerMaxHp: player.max_hp ?? 100,
    playerAttack: player.attack ?? 1,
    playerDefense: player.defense ?? 1,
    defending: false,
  };
}

function playerAttack(state) {
  const damage = Math.max(1, state.playerAttack - state.enemyDefense);
  const enemyHp = Math.max(0, state.enemyHp - damage);
  if (enemyHp === 0) {
    return { state: { ...state, enemyHp, defending: false }, damage, incomingDamage: 0, victory: true };
  }

  const defenseBonus = state.defending ? 2 : 0;
  const incomingDamage = Math.max(1, state.enemyAttack - Math.floor((state.playerDefense + defenseBonus) / 2));
  const playerHp = Math.max(0, state.playerHp - incomingDamage);
  return {
    state: { ...state, enemyHp, playerHp, defending: false },
    damage,
    incomingDamage,
    victory: false,
    defeat: playerHp === 0,
  };
}

function playerDefend(state) {
  const incomingDamage = Math.max(1, state.enemyAttack - Math.floor((state.playerDefense + 2) / 2));
  const playerHp = Math.max(0, state.playerHp - incomingDamage);
  return {
    state: { ...state, playerHp, defending: true },
    incomingDamage,
    defeat: playerHp === 0,
  };
}

function playerFlee(state) {
  return { state, fled: true };
}

module.exports = { createCombatState, playerAttack, playerDefend, playerFlee };
