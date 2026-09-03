const enemies = {
  velthar_slime: {
    id: "velthar_slime",
    name: "Velthar Slime",
    hp: 12,
    attack: 3,
    defense: 0,
    xpReward: 30,
    coinReward: 24,
    itemReward: null,
  },
};

function getEnemy(enemyId) {
  const enemy = enemies[enemyId];
  return enemy ? { ...enemy } : null;
}

module.exports = { enemies, getEnemy };
