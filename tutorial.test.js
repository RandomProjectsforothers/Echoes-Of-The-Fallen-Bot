const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getExpectedTutorialAction,
  advanceTutorialStep,
  createTutorialEnemy,
  ensureTutorialStarterItems,
} = require("./tutorial");
const { getEnemy } = require("./enemies");

test("guided tutorial advances through the survival loop", () => {
  assert.equal(getExpectedTutorialAction(0), "hunt");
  assert.equal(getExpectedTutorialAction(1), "shop");
  assert.equal(getExpectedTutorialAction(2), "use");
  assert.deepEqual(advanceTutorialStep(2, "use"), {
    nextStep: 3,
    isComplete: false,
    expectedAction: "use",
  });
});

test("guidance reduces enemy pressure for beginners", () => {
  const enemy = createTutorialEnemy({
    id: "ash_wolf",
    name: "Ash Wolf",
    hp: 18,
    attack: 4,
    defense: 1,
    xpReward: 45,
    coinReward: 34,
    loot: [{ item: "Wolf Fang", chance: 0.35 }],
  });

  assert.ok(enemy.hp <= 12);
  assert.ok(enemy.attack <= 2);
  assert.ok(enemy.coinReward <= 17);
});

test("guided tutorial gives the beginner a usable potion for the healing lesson", () => {
  const items = ensureTutorialStarterItems(["Ashen charm"]);
  assert.ok(items.includes("Healing Potion"));
  assert.equal(items.length, 2);
});

test("early enemies stay in the fair damage band", () => {
  const enemy = getEnemy("velthar_slime", 1);
  assert.ok(enemy.attack >= 2 && enemy.attack <= 5);
  assert.ok(enemy.hp >= 8);
});

test("guided tutorial is complete after the final dungeon step", () => {
  assert.equal(getExpectedTutorialAction(5), "dungeon");
  assert.deepEqual(advanceTutorialStep(5, "dungeon"), {
    nextStep: 6,
    isComplete: true,
    expectedAction: "dungeon",
  });
});
