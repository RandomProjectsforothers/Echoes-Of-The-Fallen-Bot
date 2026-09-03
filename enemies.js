const enemies = {
  velthar_slime: {
    id: "velthar_slime",
    name: "Velthar Slime",
    hp: 12,
    attack: 3,
    defense: 0,
    xpReward: 30,
    coinReward: 24,
    loot: [{ item: "Slime Core", chance: 0.2 }],
  },
  ash_wolf: {
    id: "ash_wolf",
    name: "Ash Wolf",
    hp: 18,
    attack: 4,
    defense: 1,
    xpReward: 45,
    coinReward: 34,
    loot: [
      { item: "Wolf Fang", chance: 0.35 },
      { item: "Healing Potion", chance: 0.08 },
    ],
  },
  hollow_knight: {
    id: "hollow_knight",
    name: "Hollow Knight",
    hp: 28,
    attack: 6,
    defense: 2,
    xpReward: 75,
    coinReward: 60,
    loot: [
      { item: "Rustbound Sigil", chance: 0.25 },
      { item: "Iron Sword", chance: 0.05 },
    ],
  },
  ash_bandit: {
    id: "ash_bandit",
    name: "Ash Bandit",
    hp: 20,
    attack: 5,
    defense: 1,
    xpReward: 55,
    coinReward: 48,
    loot: [
      { item: "Bandit Token", chance: 0.3 },
      { item: "Dungeon Key", chance: 0.04 },
    ],
  },
};

function getEnemy(enemyId) {
  const enemy = enemies[enemyId];
  return enemy ? { ...enemy } : null;
}

function getRandomEnemy() {
  const pool = Object.values(enemies);
  return getEnemy(pool[Math.floor(Math.random() * pool.length)].id);
}

module.exports = { enemies, getEnemy, getRandomEnemy };
