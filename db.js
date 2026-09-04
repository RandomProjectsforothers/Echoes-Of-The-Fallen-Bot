const { Pool } = require("pg");

const normalizeDatabaseUrl = (url) => {
  if (!url) return url;

  if (url.includes("sslmode=")) {
    return url.replace(/([?&])sslmode=[^&#]+/g, "$1sslmode=verify-full");
  }

  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}sslmode=verify-full`;
};

const pool = new Pool({
  connectionString: normalizeDatabaseUrl(process.env.DATABASE_URL),
  ssl: { rejectUnauthorized: false },
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      discord_id TEXT PRIMARY KEY,
      weapon TEXT NOT NULL,
      armor TEXT,
      chapter INTEGER NOT NULL DEFAULT 1,
      dungeon_floor INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      rank TEXT NOT NULL DEFAULT 'Bronze',
      title TEXT NOT NULL DEFAULT 'Newbie',
      tutorial_language TEXT NOT NULL DEFAULT 'en',
      tutorial_mode TEXT NOT NULL DEFAULT 'pending',
      tutorial_step INTEGER NOT NULL DEFAULT 0,
      xp INTEGER NOT NULL DEFAULT 0,
      coins INTEGER NOT NULL DEFAULT 0,
      stellars INTEGER NOT NULL DEFAULT 0,
      hp INTEGER NOT NULL DEFAULT 100,
      max_hp INTEGER NOT NULL DEFAULT 100,
      attack INTEGER NOT NULL DEFAULT 1,
      defense INTEGER NOT NULL DEFAULT 1,
      weapon_attack_bonus INTEGER NOT NULL DEFAULT 0,
      armor_defense_bonus INTEGER NOT NULL DEFAULT 0,
      inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    ALTER TABLE players
      ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS dungeon_floor INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rank TEXT NOT NULL DEFAULT 'Bronze',
      ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT 'Newbie',
      ADD COLUMN IF NOT EXISTS tutorial_language TEXT NOT NULL DEFAULT 'en',
      ADD COLUMN IF NOT EXISTS tutorial_mode TEXT NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS tutorial_step INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS xp INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS coins INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS stellars INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS hp INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS max_hp INTEGER NOT NULL DEFAULT 100,
      ADD COLUMN IF NOT EXISTS attack INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS defense INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS armor TEXT,
      ADD COLUMN IF NOT EXISTS weapon_attack_bonus INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS armor_defense_bonus INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS inventory JSONB NOT NULL DEFAULT '[]'::jsonb
  `);
}

async function getPlayer(discordId) {
  const result = await pool.query(
    "SELECT * FROM players WHERE discord_id = $1",
    [discordId],
  );
  return result.rows[0];
}

async function deletePlayer(discordId) {
  await pool.query("DELETE FROM players WHERE discord_id = $1", [discordId]);
}

async function createPlayer(discordId, weapon, overrides = {}) {
  const {
    chapter = 1,
    dungeonFloor = 0,
    level = 1,
    rank = "Bronze",
    title = "Newbie",
    stellars = 0,
    tutorialLanguage = "en",
    tutorialMode = "pending",
    tutorialStep = 0,
    xp = 0,
    coins = 0,
    hp = 100,
    maxHp = 100,
    attack = 1,
    defense = 1,
    armor = null,
    weaponAttackBonus = 0,
    armorDefenseBonus = 0,
    inventory = [],
  } = overrides;

  await pool.query(
    `INSERT INTO players (discord_id, weapon, armor, chapter, dungeon_floor, level, rank, title, tutorial_language, tutorial_mode, tutorial_step, xp, coins, stellars, hp, max_hp, attack, defense, weapon_attack_bonus, armor_defense_bonus, inventory)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     ON CONFLICT (discord_id) DO NOTHING`,
    [discordId, weapon, armor, chapter, dungeonFloor, level, rank, title, tutorialLanguage, tutorialMode, tutorialStep, xp, coins, stellars, hp, maxHp, attack, defense, weaponAttackBonus, armorDefenseBonus, JSON.stringify(inventory)],
  );
  return getPlayer(discordId);
}

async function adjustCoins(discordId, delta, { allowNegative = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE players
       SET coins = coins + $2
       WHERE discord_id = $1 AND ($3 OR coins + $2 >= 0)
       RETURNING *`,
      [discordId, delta, allowNegative],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function settleWager(firstId, secondId, wager) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = [firstId, secondId].sort();
    const locked = await client.query(
      "SELECT discord_id, coins FROM players WHERE discord_id = ANY($1) ORDER BY discord_id FOR UPDATE",
      [ids],
    );
    if (locked.rows.length !== 2 || locked.rows.some((player) => player.coins < wager)) {
      await client.query("ROLLBACK");
      return null;
    }

    await client.query(
      `UPDATE players
       SET coins = coins + CASE discord_id WHEN $1 THEN $3 ELSE -$3 END
       WHERE discord_id IN ($1, $2)`,
      [firstId, secondId, wager],
    );
    const result = await client.query(
      "SELECT * FROM players WHERE discord_id = ANY($1)",
      [ids],
    );
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function purchaseItem(discordId, price, itemName, equipment = {}) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE players
       SET coins = coins - $2,
           inventory = inventory || $3::jsonb,
           weapon = COALESCE($4, weapon),
           armor = COALESCE($5, armor),
           weapon_attack_bonus = COALESCE($6, weapon_attack_bonus),
           armor_defense_bonus = COALESCE($7, armor_defense_bonus)
       WHERE discord_id = $1 AND coins >= $2
       RETURNING *`,
      [discordId, price, JSON.stringify([itemName]), equipment.weapon ?? null, equipment.armor ?? null, equipment.weaponAttackBonus ?? null, equipment.armorDefenseBonus ?? null],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function sellItem(discordId, itemName, sellPrice) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE players
       SET coins = coins + $3,
           inventory = inventory - $2
       WHERE discord_id = $1 AND inventory @> to_jsonb(ARRAY[$2]::text[])
       RETURNING *`,
      [discordId, itemName, sellPrice],
    );
    await client.query("COMMIT");
    return result.rows[0] ?? null;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function updatePlayerProgress(discordId, updates) {
  const current = await getPlayer(discordId);
  if (!current) return null;

  const fields = { ...current, ...updates };
  await pool.query(
    `UPDATE players
     SET weapon = $2,
         chapter = $3,
         dungeon_floor = $4,
         level = $5,
         rank = $6,
         title = $7,
         tutorial_language = $8,
         tutorial_mode = $9,
         tutorial_step = $10,
         xp = $11,
         coins = $12,
         stellars = $13,
         hp = $14,
         max_hp = $15,
         attack = $16,
         defense = $17,
         weapon_attack_bonus = $18,
         armor_defense_bonus = $19,
         armor = $20,
         inventory = $21
     WHERE discord_id = $1`,
    [
      discordId,
      fields.weapon ?? current.weapon,
      fields.chapter,
      fields.dungeon_floor ?? fields.dungeonFloor ?? current.dungeon_floor ?? 0,
      fields.level ?? current.level,
      fields.rank ?? current.rank ?? "Bronze",
      fields.title ?? current.title ?? "Newbie",
      fields.tutorial_language ?? current.tutorial_language ?? "en",
      fields.tutorial_mode ?? current.tutorial_mode ?? "pending",
      fields.tutorial_step ?? current.tutorial_step ?? 0,
      fields.xp ?? current.xp,
      fields.coins ?? current.coins,
      fields.stellars ?? current.stellars ?? 0,
      fields.hp,
      fields.max_hp ?? fields.maxHp ?? current.max_hp,
      fields.attack,
      fields.defense,
      fields.weapon_attack_bonus ?? fields.weaponAttackBonus ?? current.weapon_attack_bonus ?? 0,
      fields.armor_defense_bonus ?? fields.armorDefenseBonus ?? current.armor_defense_bonus ?? 0,
      fields.armor ?? current.armor ?? null,
      JSON.stringify(fields.inventory ?? current.inventory ?? []),
    ],
  );

  return getPlayer(discordId);
}

module.exports = {
  init,
  getPlayer,
  deletePlayer,
  createPlayer,
  updatePlayerProgress,
  adjustCoins,
  settleWager,
  purchaseItem,
  sellItem,
};