const TUTORIAL_ACTIONS = ["hunt", "shop", "use", "journey", "recover", "dungeon"];

function getExpectedTutorialAction(step = 0) {
  return TUTORIAL_ACTIONS[step] ?? null;
}

function createTutorialEnemy(enemy = {}) {
  return {
    id: enemy.id || "tutorial_slime",
    name: enemy.name || "Tutorial Slime",
    hp: Math.min(enemy.hp ?? 12, 12),
    attack: Math.min(enemy.attack ?? 2, 2),
    defense: Math.max(0, enemy.defense ?? 0),
    xpReward: Math.min(enemy.xpReward ?? 15, 15),
    coinReward: Math.min(enemy.coinReward ?? 12, 12),
    loot: Array.isArray(enemy.loot) ? enemy.loot : [{ item: "Ashen charm", chance: 0.2 }],
  };
}

function ensureTutorialStarterItems(inventory = []) {
  const items = Array.isArray(inventory) ? [...inventory] : [];
  if (!items.includes("Healing Potion")) {
    items.push("Healing Potion");
  }
  return items;
}

function advanceTutorialStep(step, action) {
  const expectedAction = getExpectedTutorialAction(step);
  if (!expectedAction) {
    return { nextStep: step, isComplete: true, expectedAction: null };
  }

  if (expectedAction !== action) {
    return { nextStep: step, isComplete: false, expectedAction };
  }

  const nextStep = step + 1;
  return {
    nextStep,
    isComplete: nextStep >= TUTORIAL_ACTIONS.length,
    expectedAction,
  };
}

module.exports = {
  TUTORIAL_ACTIONS,
  getExpectedTutorialAction,
  advanceTutorialStep,
  createTutorialEnemy,
  ensureTutorialStarterItems,
};
