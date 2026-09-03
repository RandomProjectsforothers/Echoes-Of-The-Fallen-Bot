require("dotenv").config();
const { randomInt } = require("node:crypto");
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
} = require("discord.js");
const {
  init,
  getPlayer,
  deletePlayer,
  createPlayer,
  updatePlayerProgress,
  adjustCoins,
  settleWager,
  purchaseItem,
} = require("./db");
const { getEnemy } = require("./enemies");
const { createCombatState, playerAttack, playerDefend, playerFlee } = require("./combat");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const STELLAR_GOLD_UNLOCK_FLOOR = 15;
const OBLIVION_DAMAGE = 9000;
const OWNER_USER_ID = process.env.OWNER_USER_ID;
const pendingLanguages = new Map();
const pendingBegins = new Map();
const pendingCardGames = new Map();
const activeCombats = new Map();

function customEmoji(name, id, fallback) {
  return { id, name, fallback };
}

const botEmojis = {
  shop: customEmoji("shop", "1545125186469101709", "🛒"),
  profile: customEmoji("pr", "1545125148770705479", "📜"),
  gamble: customEmoji("gamble", "1545129558548815924", "🎲"),
  cherry: customEmoji("cherry", "1545129516542984332", "🍒"),
  antidote: customEmoji("echo_antidote", "1545117505914277928", "🧪"),
  card: customEmoji("echo_card", "1545123683289534555", "🃏"),
  coin: customEmoji("echo_coin", "1545122038702678166", "🪙"),
  heal: customEmoji("echo_heal", "1545122094931513355", "💚"),
  slots: customEmoji("echo_slots", "1545125084987916329", "🎰"),
  lucky7: customEmoji("lucky7", "1545127020873383936", "7️⃣"),
  key: customEmoji("echo_key", "1545125008194412545", "🗝️"),
  slime: customEmoji("slime", "1545134127454490674", "🟢"),
};

async function safeInteractionReply(interaction, payload) {
  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload);
      return;
    }
    await interaction.reply(payload);
  } catch (error) {
    if (error?.code !== 10062) {
      throw error;
    }
  }
}

async function safeInteractionEdit(interaction, payload) {
  try {
    await interaction.editReply(payload);
  } catch (error) {
    if (error?.code !== 10062) {
      throw error;
    }
  }
}

function formatInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length === 0) {
    return "No relics yet";
  }

  return inventory.join(", ");
}

async function sendInventoryReply(target, userId, { isEphemeral = false } = {}) {
  const player = await getPlayer(userId);
  if (!player) {
    const content = "You do not have a Soul Record yet. Use `/begin` or `echo begin` to awaken in Velthar.";
    if (target && typeof target.editReply === "function" && (target.deferred || target.replied)) {
      await target.editReply({ content });
    } else if (target && typeof target.reply === "function") {
      await target.reply({ content, ephemeral: isEphemeral });
    } else if (target?.channel && typeof target.channel.send === "function") {
      await target.channel.send(content);
    }
    return;
  }

  const profileUser = target?.author || target?.user;
  const inventory = Array.isArray(player.inventory) ? player.inventory : [];
  const embed = new EmbedBuilder()
    .setColor(0x3d2942)
    .setTitle(`${emojiMarkup(botEmojis.profile)} ${profileUser.username}'s Inventory`)
    .setDescription(inventory.length ? inventory.map((item, index) => `**${index + 1}.** ${item}`).join("\n") : "Your inventory is empty.")
    .addFields({
      name: "Equipped Weapon",
      value: `${emojiMarkup(getWeaponEmoji(player.weapon))} ${player.weapon}`,
      inline: true,
    }, {
      name: "Gold Coins",
      value: String(player.coins ?? 0),
      inline: true,
    })
    .setFooter({ text: "Use the shop to find more supplies." });

  if (target && typeof target.editReply === "function" && (target.deferred || target.replied)) {
    await target.editReply({ embeds: [embed] });
  } else if (target && typeof target.reply === "function") {
    await target.reply({ embeds: [embed], ephemeral: isEphemeral });
  } else if (target?.channel && typeof target.channel.send === "function") {
    await target.channel.send({ embeds: [embed] });
  }
}

function formatEquipment(weapon, inventory) {
  const items = [weapon, ...(Array.isArray(inventory) ? inventory : [])];
  return items.join(", ");
}

const shopItems = {
  antidote: { name: "Antidote", emoji: botEmojis.antidote, price: 20, description: "Cures poison and other venom effects." },
  healing_potion: { name: "Healing Potion", emoji: botEmojis.heal, price: 30, description: "Restores 25 HP when used." },
  iron_sword: { name: "Iron Sword", price: 100, description: "Weapon · Damage +2 · Reliable shop steel." },
  twin_daggers: { name: "Twin Daggers", price: 115, description: "Weapon · Damage +1 · Fast and precise." },
  leather_armor: { name: "Leather Armor", price: 90, description: "Armor · Defense +2 · Buyable gear, not crafted gear." },
  chain_armor: { name: "Chain Armor", price: 180, description: "Armor · Defense +4 · Buyable gear, not crafted gear." },
  dungeon_key: { name: "Dungeon Key", emoji: botEmojis.key, price: 150, description: "Special item · Required to attempt a dungeon." },
};

function createGamblingMenu() {
  return new EmbedBuilder()
    .setColor(0x6b1f2b)
    .setTitle(`${emojiMarkup(botEmojis.gamble)} Velthar Gambling Hall`)
    .setDescription(
      "Choose a game below. Every game publishes its winning chance before you wager.\n\n"
      + `${emojiMarkup(botEmojis.coin)} \`echo cf <value> <heads|tails>\` — Coin Flip · 50/50\n`
      + `${emojiMarkup(botEmojis.slots)} \`echo slots <value>\` — Slots · 15% jackpot chance\n`
      + `${emojiMarkup(botEmojis.card)} \`echo rgc @player <value>\` — Rigged Card Game · first to 10\n`
      + "`echo poker17 <value>` — 17 Poker · 25% win chance\n"
      + `${emojiMarkup(botEmojis.cherry)} \`echo lottery <value>\` — Lottery · 1% jackpot chance`,
    )
    .setFooter({ text: "Gold Coins are used for wagers. Stellars are not accepted." });
}

async function playRiggedCardGame(target, opponentId, wager) {
  const playerId = target.author?.id || target.user?.id;
  const playerMention = target.author || target.user;

  if (!opponentId || opponentId === playerId) {
    return "Mention another player for the Rigged Card Game.";
  }

  const players = await Promise.all([ensurePlayerRecord(playerId), ensurePlayerRecord(opponentId)]);
  if (players.some((player) => (player.coins ?? 0) < wager)) {
    return "Both players need enough Gold Coins to cover the wager.";
  }

  const ownerInvolved = isOwner(playerId) || isOwner(opponentId);
  let playerScore = 0;
  let opponentScore = 0;
  let redraws = 0;

  while (playerScore < 10 && opponentScore < 10) {
    if (randomInt(0, 3) === 0) {
      redraws += 1;
      continue;
    }

    const ownerWins = randomInt(0, 3) < 2;
    const playerWins = ownerInvolved
      ? (isOwner(playerId) ? ownerWins : !ownerWins)
      : randomInt(0, 2) === 1;
    if (playerWins) playerScore += 1;
    else opponentScore += 1;
  }

  const playerWon = playerScore === 10;
  const winnerId = playerWon ? playerId : opponentId;
  const winner = winnerId === playerId ? playerMention : `<@${opponentId}>`;
  const settledPlayers = await settleWager(
    playerWon ? opponentId : playerId,
    playerWon ? playerId : opponentId,
    wager,
  );
  if (!settledPlayers) return "The wager could not be settled because a player no longer has enough Gold Coins.";
  const nextGold = settledPlayers.find((player) => player.discord_id === playerId)?.coins ?? 0;

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(playerWon ? 0x3d6b4f : 0x6b1f2b)
        .setTitle(`${emojiMarkup(botEmojis.card)} Rigged Card Game`)
        .setDescription(
          `${playerMention} challenged <@${opponentId}> to a first-to-10 match.\n\n`
          + `**Winner:** ${winner}\n`
          + `**Final score:** ${playerScore} - ${opponentScore}\n`
          + `**Redraws:** ${redraws}\n`
          + `**Your balance:** ${nextGold} Gold Coins\n\n`
          + `Scored points used ${ownerInvolved ? "2/3 owner and 1/3 opponent" : "1/2 each"} odds.`,
        )
        .setFooter({ text: `First to 10 · Wager: ${wager} Gold Coins` }),
    ],
  };
}

function createCardGameChallenge(challengerId, opponentId, wager) {
  const token = `${challengerId}_${opponentId}_${Date.now()}`;
  pendingCardGames.set(token, { challengerId, opponentId, wager });
  setTimeout(() => pendingCardGames.delete(token), 60 * 1000).unref();
  return {
    content: `<@${opponentId}> has been challenged to a Rigged Card Game for **${wager} Gold Coins**.`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`card_accept_${token}`).setLabel("Accept").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`card_decline_${token}`).setLabel("Decline").setStyle(ButtonStyle.Secondary),
    )],
  };
}

async function playSimpleGamble(target, game, wager) {
  const userId = target.author?.id || target.user?.id;
  const player = await ensurePlayerRecord(userId);
  const gold = player.coins ?? 0;
  if (!isOwner(userId) && wager > gold) {
    return `You only have **${gold} Gold Coins**, so you cannot wager **${wager}**.`;
  }

  const games = {
    slots: { name: "Slots", emoji: botEmojis.slots, chance: 15 },
    poker17: { name: "17 Poker", emoji: botEmojis.card, chance: 25 },
    lottery: { name: "Lottery", emoji: botEmojis.cherry, chance: 1 },
  };
  const selectedGame = games[game];
  const won = randomInt(0, 100) < selectedGame.chance;
  const updated = await adjustCoins(userId, won ? wager : -wager, {
    allowNegative: isOwner(userId),
  });
  if (!updated) return "Your wager could not be settled because your balance changed. Please try again.";
  const nextGold = updated.coins;

  return {
    embeds: [
      new EmbedBuilder()
        .setColor(won ? 0x3d6b4f : 0x6b1f2b)
        .setTitle(`${emojiMarkup(selectedGame.emoji)} ${won ? `${selectedGame.name} jackpot` : `${selectedGame.name} result`}`)
        .setDescription(
          `${target.author || target.user} wagered **${wager} Gold Coins**.\n\n`
          + `**Chance to win:** ${selectedGame.chance}%\n`
          + (won
            ? `**Won:** +${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`
            : `**Lost:** -${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`),
        )
        .setFooter({ text: `${selectedGame.name} · Wager: ${wager} Gold Coins` }),
    ],
  };
}

function createShopPrompt() {
  const buttons = Object.entries(shopItems).map(([itemId, item]) => new ButtonBuilder()
    .setCustomId(`shop_buy_${itemId}`)
    .setLabel(`${item.name} · ${item.price} Gold`)
    .setEmoji(discordEmoji(item.emoji || "📦"))
    .setStyle(ButtonStyle.Secondary));
  const shopButtons = [];
  for (let index = 0; index < buttons.length; index += 5) {
    shopButtons.push(new ActionRowBuilder().addComponents(buttons.slice(index, index + 5)));
  }

  return {
    embed: new EmbedBuilder()
      .setColor(0x6b1f2b)
      .setTitle(`${emojiMarkup(botEmojis.shop)} Velthar Supply House`)
      .setDescription("The keeper lays out supplies for the road, the ruins, and the dungeon gate. Buyable weapons and armor are separate from anything you may craft later.")
      .addFields(Object.values(shopItems).map((item) => ({
        name: `${emojiMarkup(item.emoji || "📦")} ${item.name} · ${item.price} Gold Coins`,
        value: item.description,
      })))
      .setFooter({ text: "Stellars are not accepted here." }),
    components: shopButtons,
  };
}

function isOwner(userId) {
  return Boolean(OWNER_USER_ID && userId === OWNER_USER_ID);
}

async function ensurePlayerRecord(userId, weapon = "Wanderer") {
  const existing = await getPlayer(userId);

  if (existing) {
    return existing;
  }

  const created = await createPlayer(userId, weapon, {
    chapter: 1,
    level: 1,
    rank: "Bronze",
    title: "Newbie",
    xp: 0,
    coins: 0,
    hp: 100,
    maxHp: 100,
    attack: 1,
    defense: 1,
    inventory: ["Ashen charm", "Torn map"],
  });

  return created;
}

async function grantPlayerReward(userId, action, { damageTaken = 0 } = {}) {
  const player = await ensurePlayerRecord(userId);
  const xpGain = action === "hunt" ? 24 : 42;
  const coinGain = action === "hunt" ? 18 : 32;
  const nextXp = (player.xp ?? 0) + xpGain;
  const nextCoins = (player.coins ?? 0) + coinGain;
  const nextLevel = Math.max(1, 1 + Math.floor(nextXp / 100));

  const updated = await updatePlayerProgress(userId, {
    level: nextLevel,
    xp: nextXp,
    coins: nextCoins,
    chapter: player.chapter ?? 1,
    hp: Math.max(0, (player.hp ?? 100) - damageTaken),
    max_hp: player.max_hp ?? player.maxHp ?? 100,
    attack: player.attack ?? 1,
    defense: player.defense ?? 1,
    inventory: Array.isArray(player.inventory) ? player.inventory : ["Ashen charm"],
  });

  return updated;
}

async function handleCombatCommand(message, action) {
  const userId = message.author.id;
  if (action === "encounter") {
    if (activeCombats.has(userId)) {
      await message.channel.send("You are already in combat. Use `echo attack`, `echo defend`, or `echo flee`.");
      return;
    }

    const player = await ensurePlayerRecord(userId);
    const enemy = getEnemy("velthar_slime");
    activeCombats.set(userId, createCombatState(enemy, player));
    await message.channel.send(
      `A **${enemy.name}** emerges from the fog. It has **${enemy.hp} HP**.\n\n`
      + "Choose `echo attack`, `echo defend`, or `echo flee`.",
    );
    return;
  }

  const combat = activeCombats.get(userId);
  if (!combat) {
    await message.channel.send("You are not in combat. Use `echo encounter` to face the first enemy.");
    return;
  }

  const result = action === "attack"
    ? playerAttack(combat)
    : action === "defend"
      ? playerDefend(combat)
      : playerFlee(combat);
  activeCombats.set(userId, result.state);

  if (result.fled) {
    activeCombats.delete(userId);
    await message.channel.send("You flee into the Velthar fog. The encounter remains unresolved.");
    return;
  }

  if (result.victory) {
    activeCombats.delete(userId);
    const player = await ensurePlayerRecord(userId);
    const nextXp = (player.xp ?? 0) + 30;
    const nextLevel = Math.max(1, 1 + Math.floor(nextXp / 100));
    const updated = await updatePlayerProgress(userId, {
      xp: nextXp,
      level: nextLevel,
      hp: result.state.playerHp,
      chapter: Math.max(player.chapter ?? 1, 2),
    });
    const rewarded = await adjustCoins(userId, 24);
    await message.channel.send(
      `**Victory!** You defeat the ${result.state.enemyName}.\n\n`
      + `**Rewards:** +30 XP, +24 Gold Coins\n`
      + `**Level:** ${updated?.level ?? nextLevel}\n`
      + `**Balance:** ${rewarded?.coins ?? player.coins ?? 0} Gold Coins\n`
      + "**Chapter progress:** Chapter 2 unlocked.",
    );
    return;
  }

  if (result.defeat) {
    activeCombats.delete(userId);
    await updatePlayerProgress(userId, { hp: 0 });
    await message.channel.send("The enemy defeats you. Your HP has fallen to 0. Use `echo recover` before trying again.");
    return;
  }

  await message.channel.send(
    `${action === "attack" ? `You deal **${result.damage} damage**.` : "You brace for the next attack."}\n`
    + `The ${result.state.enemyName} deals **${result.incomingDamage} damage**.\n\n`
    + `**Your HP:** ${result.state.playerHp}/${result.state.playerMaxHp}\n`
    + `**Enemy HP:** ${result.state.enemyHp}/${result.state.enemyMaxHp}\n`
    + "Choose `echo attack`, `echo defend`, or `echo flee`.",
  );
}

function resolveSlimeEncounter(player) {
  const slime = {
    hp: 5 + Math.max(0, (player.level ?? 1) - 1),
    attack: 2,
    defense: 0,
  };
  const playerDamage = Math.max(1, (player.attack ?? 1) - slime.defense);
  const incomingDamage = Math.max(1, slime.attack - Math.floor((player.defense ?? 1) / 2));
  const strikes = Math.ceil(slime.hp / playerDamage);

  return {
    slime,
    playerDamage,
    incomingDamage,
    strikes,
    damageTaken: strikes * incomingDamage,
  };
}

async function sendProfileReply(target, userId, { isEphemeral = false } = {}) {
  const existing = await getPlayer(userId);

  if (!existing) {
    const content = "You do not have a Soul Record yet. Use `/begin` or `echo begin` to awaken in Velthar.";

    if (target && typeof target.reply === "function") {
      await target.reply({
        content,
      });
      return;
    }

    if (target && typeof target.channel?.send === "function") {
      await target.channel.send(content);
    }
    return;
  }

  const createdAt = new Date(existing.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const profileUser = target?.author || target?.user;

  const embed = applyWeaponImage(new EmbedBuilder()
    .setColor(0x6b1f2b)
    .setTitle(`${emojiMarkup(botEmojis.profile)} Soul Record`)
    .setThumbnail(profileUser.displayAvatarURL({ extension: "png", size: 256 }))
    .setAuthor({
      name: `${profileUser.username} — profile`,
      iconURL: profileUser.displayAvatarURL({ extension: "png", size: 64 }),
    })
    .setDescription("Soul Record I · The Awakening")
    .addFields(
      {
        name: "PROGRESS",
        value:
        `**Title:** ${existing.title ?? "Newbie"}\n` +
        `**Level:** ${existing.level ?? 1}\n` +
        `**Guild Rank:** ${existing.rank ?? "Bronze"}\n` +
        `**XP:** ${existing.xp ?? 0}\n` +
        `**Floor:** ${existing.dungeon_floor > 0 ? existing.dungeon_floor : "Locked"}\n` +
          "\u200b",
        inline: true,
      },
      {
        name: "STATS",
        value:
        `**HP:** ${existing.hp}/${existing.max_hp}\n` +
        `**Attack:** ${existing.weapon === "Sage Sword Oblivion" && !isOwner(profileUser.id) ? "Unknown" : existing.attack}\n` +
        `**Defense:** ${existing.defense}`,
        inline: true,
      },
      {
        name: "EQUIPMENT",
        value: `**Sword:** ${emojiMarkup(getWeaponEmoji(existing.weapon))} ${existing.weapon}\n**Armor:** No Armor`,
        inline: true,
      },
      {
        name: "CURRENCY",
        value: `**Gold Coins:** ${existing.coins ?? 0}\n**Stellars:** ${existing.stellars ?? 0}`,
        inline: true,
      },
      {
        name: "AWAKENED",
        value: createdAt,
        inline: false,
      },
    )
    .setFooter({ text: "The fallen do not die. We awaken." }), existing.weapon);

  if (target && typeof target.reply === "function") {
    await target.reply({ embeds: [embed] });
    return;
  }

  if (target && typeof target.channel?.send === "function") {
    await target.channel.send({ embeds: [embed] });
  }
}

const weaponEmojis = {
  lightSword: process.env.LIGHT_SWORD_EMOJI_ID
    ? { id: process.env.LIGHT_SWORD_EMOJI_ID, name: "echo_light_sword" }
    : "🗡️",
  daggers: process.env.DAGGERS_EMOJI_ID
    ? { id: process.env.DAGGERS_EMOJI_ID, name: "echo_dagger" }
    : "🔪",
  heavySword: process.env.HEAVY_SWORD_EMOJI_ID
    ? { id: process.env.HEAVY_SWORD_EMOJI_ID, name: "echo_heavy_sword" }
    : "⚔️",
  oblivion: { id: "1545147003296550972", name: "Oblivion" },
};

const emojiMarkup = (emoji) => (
  typeof emoji === "string" ? emoji : `<:${emoji.name}:${emoji.id}>`
);

const discordEmoji = (emoji) => (
  typeof emoji === "string" ? emoji : { id: emoji.id, name: emoji.name }
);

function getWeaponEmoji(weapon) {
  if (weapon === "Daggers") return weaponEmojis.daggers;
  if (weapon === "Heavy Sword") return weaponEmojis.heavySword;
  if (weapon === "Sage Sword Oblivion") return weaponEmojis.oblivion;
  return weaponEmojis.lightSword;
}

function getWeaponImageUrl(weapon) {
  const emoji = getWeaponEmoji(weapon);
  if (typeof emoji === "string") return null;
  return `https://cdn.discordapp.com/emojis/${emoji.id}.png?size=512&quality=lossless`;
}

function applyWeaponImage(embed, weapon) {
  const imageUrl = getWeaponImageUrl(weapon);
  if (imageUrl) embed.setImage(imageUrl);
  return embed;
}

function createWeaponPrompt(userId) {
  const awakening = new EmbedBuilder()
    .setColor(0x3d2942)
    .setTitle("⚔️ Echoes of the Fallen")
    .setDescription(
      "You awaken beneath the ruined bells of **Velthar**.\n\n"
      + "Your name is a hollow space in your mind, but a fractured reflection watches from the fog. "
      + "Before you lies a weathered chest containing three weapons.",
    )
    .addFields({
      name: "Choose your first weapon",
      value: "Your choice shapes the first page of your Soul Record.",
    })
    .setFooter({ text: "Soul Record I · The Awakening" });

  const weapons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`begin_light_sword_${userId}`)
      .setLabel("Light Sword")
      .setEmoji(weaponEmojis.lightSword)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`begin_daggers_${userId}`)
      .setLabel("Daggers")
      .setEmoji(weaponEmojis.daggers)
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`begin_heavy_sword_${userId}`)
      .setLabel("Heavy Sword")
      .setEmoji(weaponEmojis.heavySword)
      .setStyle(ButtonStyle.Danger),
  );

  return { awakening, weapons };
}

function createLanguagePrompt(userId) {
  const languages = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`language_en_${userId}`).setLabel("English").setEmoji("🇬🇧").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`language_es_${userId}`).setLabel("Español").setEmoji("🇪🇸").setStyle(ButtonStyle.Secondary),
  );

  return {
    embed: new EmbedBuilder()
      .setColor(0x3d2942)
      .setTitle("Choose your language")
      .setDescription("Before your awakening begins, choose the language for your journey through Velthar.")
      .setFooter({ text: "You can change this later." }),
    components: languages,
  };
}

function createTutorialModePrompt(language = "en") {
  const spanish = language === "es";
  const modeButtons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("tutorial_guided")
      .setLabel(spanish ? "Tutorial guiado" : "Play through tutorial")
      .setEmoji("▶️")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("tutorial_long")
      .setLabel(spanish ? "Leer guía completa" : "Read entire guide")
      .setEmoji("📖")
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embed: new EmbedBuilder()
      .setColor(0x3d2942)
      .setTitle(spanish ? "¿Cómo quieres aprender?" : "How do you want to learn?")
      .setDescription(spanish ? "Elige una guía completa o aprende paso a paso mientras juegas." : "Choose a complete guide or learn step by step while you play.")
      .setFooter({ text: spanish ? "Tu viaje comienza ahora." : "Your journey begins now." }),
    components: modeButtons,
  };
}

function createTutorialStartPrompt(language, mode) {
  const spanish = language === "es";
  const guided = mode === "guided";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(guided ? "tutorial_start_guided" : "tutorial_open_long")
      .setLabel(guided
        ? (spanish ? "Comenzar tutorial guiado" : "Begin guided tutorial")
        : (spanish ? "Abrir guía completa" : "Open full guide"))
      .setEmoji(guided ? "▶️" : "📖")
      .setStyle(ButtonStyle.Primary),
  );

  return {
    embed: new EmbedBuilder()
      .setColor(0x3d2942)
      .setTitle(guided
        ? (spanish ? "Tutorial guiado seleccionado" : "Guided tutorial selected")
        : (spanish ? "Guía completa seleccionada" : "Full guide selected"))
      .setDescription(guided
        ? (spanish ? "Aprenderás un paso a la vez. Pulsa el botón cuando estés listo." : "You will learn one step at a time. Press the button when you are ready.")
        : (spanish ? "Recibirás toda la información en un solo mensaje. Pulsa el botón para abrirla." : "You will receive everything in one message. Press the button to open it.")),
    components: row,
  };
}

function getTutorialSteps(language = "en") {
  if (language === "es") {
    return [
      { title: "El propósito del juego", description: "Crece en Velthar, completa encuentros y conquista pisos de mazmorra cada vez más profundos." },
      { title: "Cómo jugar", description: "Gana XP y monedas de cobre con `hunt` y `journey`. Revisa tu progreso con `profile` y usa `recover` cuando tu HP sea bajo." },
      { title: "Objetos y monedas", description: "Las monedas de cobre son la moneda cotidiana. El equipo y los objetos que encuentres se guardan en tu Soul Record." },
      { title: "Mazmorras", description: "Usa `dungeon` para entrar. Derrota al guardián para desbloquear el siguiente piso de mazmorra y obtener mejores recompensas." },
      { title: "El Imperio y Stellar Gold", description: `Después de superar el piso ${STELLAR_GOLD_UNLOCK_FLOOR}, el camino al Imperio se abre y presenta Stellar Gold.` },
      { title: "Tu primer paso", description: "Usa `hunt` para comenzar o `journey` para tomar un camino más arriesgado." },
    ];
  }

  return [
    { title: "The purpose of the game", description: "Grow stronger in Velthar, complete encounters, and conquer deeper dungeon floors." },
    { title: "How to play", description: "Gain XP and Copper Coins with `hunt` and `journey`. Check your progress with `profile`, and use `recover` when your HP is low." },
    { title: "Items and coins", description: "Copper Coins are the everyday currency. Equipment and items you find are recorded in your Soul Record." },
    { title: "Dungeons", description: "Use `dungeon` to enter. Defeat its guardian to unlock the next dungeon floor and earn better rewards." },
    { title: "The Empire and Stellar Gold", description: `After clearing dungeon floor ${STELLAR_GOLD_UNLOCK_FLOOR}, the path to the Empire opens and introduces Stellar Gold.` },
    { title: "Your first step", description: "Use `hunt` to begin or `journey` to take a riskier path." },
  ];
}

function createFullGuide(language) {
  const steps = getTutorialSteps(language);
  const spanish = language === "es";
  return new EmbedBuilder()
    .setColor(0x3d2942)
    .setTitle(spanish ? "⚔️ Guía completa de Velthar" : "⚔️ Complete Velthar Guide")
    .setDescription(steps.map((step) => `**${step.title}**\n${step.description}`).join("\n\n"))
    .addFields({
      name: spanish ? "Comandos" : "Commands",
      value: "`echo begin` · `echo profile` · `echo hunt` · `echo journey` · `echo recover` · `echo shop` · `echo dungeon` · `echo help`",
    })
    .setFooter({ text: spanish ? "Guía completa · Tu viaje comienza ahora." : "Full guide · Your journey begins now." });
}

function createGuidedPrompt(language, step) {
  const spanish = language === "es";
  const prompts = spanish
    ? [
      "Primer paso: usa `echo hunt` para enfrentarte a una criatura de Velthar.",
      "Buen comienzo. Ahora usa `echo journey` para investigar un camino más peligroso.",
      "La exploración deja heridas. Usa `echo recover` para restaurar tu HP.",
      "Ya estás preparado. Usa `echo dungeon` para acercarte a la entrada de la mazmorra.",
    ]
    : [
      "First step: use `echo hunt` to face a creature in Velthar.",
      "Good start. Now use `echo journey` to investigate a more dangerous path.",
      "The ruins leave wounds behind. Use `echo recover` to restore your HP.",
      "You are ready. Use `echo dungeon` to approach the dungeon entrance.",
    ];

  return new EmbedBuilder()
    .setColor(0x3d2942)
    .setTitle(spanish ? `⚔️ Tutorial guiado · Paso ${step + 1}` : `⚔️ Guided tutorial · Step ${step + 1}`)
    .setDescription(prompts[step] || (spanish ? "Tutorial completo. Tu aventura continúa en Velthar." : "Tutorial complete. Your adventure continues in Velthar."))
    .setFooter({ text: spanish ? "Completa el comando para continuar." : "Complete the command to continue." });
}

async function sendGuidedCommandReply(message, action, payload) {
  const player = await getPlayer(message.author.id);
  if (!player || player.tutorial_mode !== "guided") {
    await message.channel.send(payload);
    return;
  }

  const expectedActions = ["hunt", "journey", "recover", "dungeon"];
  const step = player.tutorial_step ?? 0;
  if (expectedActions[step] !== action) {
    await message.channel.send(payload);
    return;
  }

  const nextStep = step + 1;
  await updatePlayerProgress(message.author.id, { tutorial_step: nextStep });

  const tutorialPrompt = createGuidedPrompt(player.tutorial_language ?? "en", nextStep);
  await message.channel.send({
    ...payload,
    embeds: [...(payload.embeds ?? []), tutorialPrompt],
  });
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Echoes of the Fallen is online as ${readyClient.user.tag} | inventory-enabled-build`);
});

client.on(Events.MessageCreate, async (message) => {
  try {
  if (message.author.bot || !message.content || !message.guild) return;

  const text = message.content.trim();
  const botMention = `<@${client.user.id}>`;
  const botMentionNick = `<@!${client.user.id}>`;

  let commandText = text;
  if (text.toLowerCase().startsWith(botMention.toLowerCase())) {
    commandText = text.slice(botMention.length).trim();
  } else if (text.toLowerCase().startsWith(botMentionNick.toLowerCase())) {
    commandText = text.slice(botMentionNick.length).trim();
  }

  const typedLanguage = commandText.toLowerCase();
  if (pendingBegins.has(message.author.id) && ["english", "en", "español", "espanol", "spanish", "es"].includes(typedLanguage)) {
    commandText = `echo ${commandText}`;
  }

  if (!commandText.toLowerCase().startsWith("echo ")) return;

  const args = commandText.slice(5).trim();
  const [command, ...rest] = args.split(/\s+/);
  let normalized = (command || "").toLowerCase();
  const directGamblingCommands = ["cf", "slots", "rigged", "rgc", "poker17", "lottery"];
  if (normalized === "rigged" && rest[0]?.toLowerCase() === "card" && rest[1]?.toLowerCase() === "game") {
    rest.splice(0, 2);
  }
  if (directGamblingCommands.includes(normalized)) {
    rest.unshift(normalized);
    normalized = "gamble";
  }

  if (pendingBegins.has(message.author.id) && ["english", "en", "español", "espanol", "spanish", "es"].includes(normalized)) {
    const language = ["español", "espanol", "spanish", "es"].includes(normalized) ? "es" : "en";
    pendingLanguages.set(message.author.id, language);
    pendingBegins.delete(message.author.id);

    const { awakening, weapons } = createWeaponPrompt(message.author.id);
    await message.channel.send({ embeds: [awakening], components: [weapons] });
    return;
  }

  if (!normalized) {
    await message.channel.send("Use `echo help`, `echo begin`, `echo reset`, `echo profile`, `echo inventory`, `echo hunt`, `echo journey`, `echo recover`, `echo shop`, or `echo dungeon`.");
    return;
  }

  if (normalized === "help") {
    await sendGuidedCommandReply(message, "hunt", {
      embeds: [
        new EmbedBuilder()
          .setColor(0x3d2942)
          .setTitle("⚔️ Echoes of the Fallen — Commands")
          .setDescription(
            "`echo help` — show available commands\n"
            + "`echo begin` — begin your story in Velthar\n"
            + "`echo reset` — delete your Soul Record so you can test the beginning again\n"
            + "`echo profile` — check your Soul Record\n"
            + "`echo inventory` — view your items and equipped weapon\n"
            + "`echo encounter` — face the first enemy\n"
            + "`echo attack` · `echo defend` · `echo flee` — combat actions\n"
            + "`echo hunt` — gain XP and coins\n"
            + "`echo journey` — earn bigger rewards\n"
            + "`echo recover` — restore HP\n"
            + "`echo shop` — open the Velthar supply house\n"
            + "`echo cf <value> <heads|tails>` — flip a coin for a 50/50 chance\n"
            + "`echo use potion` — drink a Healing Potion\n"
            + "`echo dungeon` — prepare for the next dungeon floor",
          )
          .setFooter({ text: "Your choices shape the story of Velthar." }),
      ],
    });
    return;
  }

  if (normalized === "begin") {
    const existing = await getPlayer(message.author.id);

    if (existing) {
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b1f2b)
            .setTitle("Soul Record Found")
            .setDescription(
              `Your Echo already walks the ruins of Velthar, wielding the **${existing.weapon}**.\n\n`
              + `Currently on **Chapter ${existing.chapter}**.`,
            )
            .setFooter({ text: "Soul Record I · The Awakening" }),
        ],
      });
      return;
    }

    const languagePrompt = createLanguagePrompt(message.author.id);
    pendingBegins.set(message.author.id, true);
    await message.channel.send({ embeds: [languagePrompt.embed], components: [languagePrompt.components] });
    return;
  }

  if (normalized === "reset") {
    await deletePlayer(message.author.id);
    pendingBegins.delete(message.author.id);
    pendingLanguages.delete(message.author.id);
    await message.channel.send("Your Soul Record was reset for testing. Use `echo begin` to start the awakening again.");
    return;
  }

  if (["p", "pr", "profile"].includes(normalized)) {
    await sendProfileReply(message, message.author.id, { isEphemeral: false });
    return;
  }

  if (["i", "inv", "inventory"].includes(normalized)) {
    await sendInventoryReply(message, message.author.id, { isEphemeral: false });
    return;
  }

  if (normalized === "shop") {
    const shop = createShopPrompt();
    await message.channel.send({ embeds: [shop.embed], components: shop.components });
    return;
  }

  if (["encounter", "attack", "defend", "flee"].includes(normalized)) {
    await handleCombatCommand(message, normalized);
    return;
  }

  if (normalized === "gamble") {
    if (rest.length === 0) {
      await message.channel.send({ embeds: [createGamblingMenu()] });
      return;
    }

    if (rest[0]?.toLowerCase() === "slots") {
      const wager = Number(rest[1]);
      if (!Number.isSafeInteger(wager) || wager < 1) {
        await message.channel.send("Choose a whole-number wager. Example: `echo slots 25`.");
        return;
      }
      await message.channel.send(await playSimpleGamble(message, "slots", wager));
      return;
    }

    if (["rigged", "rgc"].includes(rest[0]?.toLowerCase())) {
      const opponentToken = rest[1];
      const wagerToken = rest[2];
      const opponentId = opponentToken?.match(/^<@!?(\d+)>$/)?.[1];
      const wager = Number(wagerToken);
      if (!opponentId || !Number.isSafeInteger(wager) || wager < 1) {
        await message.channel.send("Mention the opponent first, then place the bet: `echo rgc @player <value>`");
        return;
      }
      await message.channel.send(createCardGameChallenge(message.author.id, opponentId, wager));
      return;
    }

    if (["poker17", "lottery"].includes(rest[0]?.toLowerCase())) {
      const game = rest[0].toLowerCase();
      const wager = Number(rest[1]);
      if (!Number.isSafeInteger(wager) || wager < 1) {
        await message.channel.send(`Choose a whole-number wager. Example: \`echo ${game} 25\`.`);
        return;
      }
      await message.channel.send(await playSimpleGamble(message, game, wager));
      return;
    }

    const firstAmount = Number(rest[0]);
    const secondAmount = Number(rest[1]);
    const firstSide = rest[0]?.toLowerCase() === "cf" ? rest[2]?.toLowerCase() : rest[0]?.toLowerCase();
    const secondSide = rest[1]?.toLowerCase() === "cf" ? rest[2]?.toLowerCase() : rest[1]?.toLowerCase();
    const wager = Number.isSafeInteger(firstAmount) ? firstAmount : secondAmount;
    const chosenSide = Number.isSafeInteger(firstAmount) ? secondSide : firstSide;

    if (!["heads", "tails"].includes(chosenSide)) {
      await message.channel.send("Choose `heads` or `tails`. Example: `echo cf 25 heads`.");
      return;
    }

    if (!Number.isSafeInteger(wager) || wager < 1) {
      await message.channel.send("Choose a whole-number wager. Example: `echo cf 25 heads`.");
      return;
    }

    const player = await ensurePlayerRecord(message.author.id);
    const gold = player.coins ?? 0;
    if (!isOwner(message.author.id) && wager > gold) {
      await message.channel.send(`You only have **${gold} Gold Coins**, so you cannot wager **${wager}**.`);
      return;
    }

    const result = randomInt(0, 2) === 1 ? "heads" : "tails";
    const won = result === chosenSide;
    const updated = await adjustCoins(message.author.id, won ? wager : -wager, {
      allowNegative: isOwner(message.author.id),
    });
    if (!updated) {
      await message.channel.send("Your wager could not be settled because your balance changed. Please try again.");
      return;
    }
    const nextGold = updated.coins;
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(won ? 0x3d6b4f : 0x6b1f2b)
          .setTitle(`${emojiMarkup(botEmojis.coin)} ${won ? "The coin favors you" : "The coin turns away"}`)
          .setDescription(
            `${message.author} wagered **${wager} Gold Coins** and called **${chosenSide}**.\n\n`
            + `**Coin:** ${result}\n`
            + (won
              ? `**Won:** +${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`
              : `**Lost:** -${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`),
          )
          .setFooter({ text: "Heads and tails each have a 50/50 chance." }),
      ],
    });
    return;
  }

  if (normalized === "use" && rest[0]?.toLowerCase() === "potion") {
    const player = await ensurePlayerRecord(message.author.id);
    const inventory = Array.isArray(player.inventory) ? player.inventory : [];
    const potionIndex = inventory.indexOf("Healing Potion");

    if (!isOwner(message.author.id) && potionIndex === -1) {
      await message.channel.send("You do not have a Healing Potion. Use `echo shop` to visit the supply house.");
      return;
    }

    const currentHp = player.hp ?? 100;
    const maxHp = player.max_hp ?? 100;
    if (!isOwner(message.author.id) && currentHp >= maxHp) {
      await message.channel.send("Your HP is already full. Save the Healing Potion for a dangerous encounter.");
      return;
    }

    const nextInventory = [...inventory];
    nextInventory.splice(potionIndex, 1);
    const healed = Math.min(maxHp, currentHp + 25);
    await updatePlayerProgress(message.author.id, { hp: healed, inventory: nextInventory });
    await message.channel.send(`🧪 ${message.author} drinks a Healing Potion and restores **${healed - currentHp} HP** (**${healed}/${maxHp} HP**).`);
    return;
  }

  if (normalized === "admin") {
    if (!isOwner(message.author.id)) {
      await message.channel.send("That command is restricted.");
      return;
    }

    const [adminAction, targetMention, value] = rest;
    const targetId = targetMention?.match(/^<@!?(\d+)>$/)?.[1];
    if (!adminAction || !targetId) {
      await message.channel.send("Admin command format is invalid.");
      return;
    }

    const updates = {};
    if (adminAction === "setrank" && value) updates.rank = value;
    if (adminAction === "settitle" && value) updates.title = rest.slice(2).join(" ");
    if (adminAction === "setfloor" && Number.isInteger(Number(value))) updates.dungeon_floor = Math.max(0, Number(value));
    if (adminAction === "givegold" && Number.isInteger(Number(value))) updates.coins = (await ensurePlayerRecord(targetId)).coins + Math.max(0, Number(value));
    if (adminAction === "givestellars" && Number.isInteger(Number(value))) updates.stellars = (await ensurePlayerRecord(targetId)).stellars + Math.max(0, Number(value));

    if (Object.keys(updates).length === 0) {
      await message.channel.send("Unknown admin action.");
      return;
    }

    await updatePlayerProgress(targetId, updates);
    await message.channel.send("Admin update applied.");
    return;
  }

  const hiddenAdminActions = [
    "setmoney",
    "setexp",
    "setlvl",
    "settitle",
    "setrank",
    "setfloor",
    "setchapter",
    "sethp",
    "setdamage",
    "setattack",
    "setdefense",
    "setweapon",
    "setstellars",
    "giveitem",
  ];

  if (hiddenAdminActions.includes(normalized)) {
    if (!isOwner(message.author.id)) {
      await message.channel.send("That command is restricted.");
      return;
    }

    const targetId = rest[0]?.match(/^<@!?(\d+)>$/)?.[1] || message.author.id;
    const value = rest[1];
    const numericValue = Number(value);
    const updates = {};

    if (normalized === "setmoney" && Number.isSafeInteger(numericValue)) updates.coins = numericValue;
    if (normalized === "setexp" && Number.isSafeInteger(numericValue)) updates.xp = numericValue;
    if (normalized === "setlvl" && Number.isSafeInteger(numericValue)) updates.level = numericValue;
    if (normalized === "settitle" && rest.slice(1).join(" ")) updates.title = rest.slice(1).join(" ");
    if (normalized === "setrank" && value) updates.rank = value;
    if (normalized === "setfloor" && Number.isSafeInteger(numericValue)) updates.dungeon_floor = numericValue;
    if (normalized === "setchapter" && Number.isSafeInteger(numericValue)) updates.chapter = numericValue;
    if (normalized === "sethp" && Number.isSafeInteger(numericValue)) updates.hp = numericValue;
    if (normalized === "setdamage" && Number.isSafeInteger(numericValue)) updates.attack = numericValue;
    if (normalized === "setattack" && Number.isSafeInteger(numericValue)) updates.attack = numericValue;
    if (normalized === "setdefense" && Number.isSafeInteger(numericValue)) updates.defense = numericValue;
    if (normalized === "setweapon" && value) {
      updates.weapon = rest.slice(1).join(" ");
      if (updates.weapon === "Sage Sword Oblivion") updates.attack = OBLIVION_DAMAGE;
    }
    if (normalized === "setstellars" && Number.isSafeInteger(numericValue)) updates.stellars = numericValue;
    if (normalized === "giveitem" && rest.slice(1).join(" ")) {
      const player = await ensurePlayerRecord(targetId);
      updates.inventory = [...(Array.isArray(player.inventory) ? player.inventory : []), rest.slice(1).join(" ")];
    }

    if (Object.keys(updates).length === 0) {
      await message.channel.send("Invalid admin command values.");
      return;
    }

    await ensurePlayerRecord(targetId);
    await updatePlayerProgress(targetId, updates);
    await message.channel.send("Admin update applied.");
    return;
  }

  if (normalized === "hunt") {
    const player = await ensurePlayerRecord(message.author.id);
    const encounter = resolveSlimeEncounter(player);

    if (!isOwner(message.author.id) && (player.hp ?? 100) <= encounter.damageTaken) {
      await updatePlayerProgress(message.author.id, { hp: 0 });
      await message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x6b1f2b)
            .setTitle(`${emojiMarkup(botEmojis.slime)} The slime overwhelms you`)
            .setDescription(
              `${message.author} faces a Velthar slime, but your HP is too low to survive the encounter.\n\n`
              + `**Slime HP:** ${encounter.slime.hp}\n`
              + `**Damage taken:** ${encounter.damageTaken}\n`
              + `**HP:** 0/${player.max_hp ?? 100}\n\n`
              + "Use `echo recover` before trying again.",
            )
            .setFooter({ text: "Every encounter is shaped by your stats." }),
        ],
      });
      return;
    }

    const updated = await grantPlayerReward(message.author.id, "hunt", {
      damageTaken: encounter.damageTaken,
    });
    const updatedHp = updated?.hp ?? Math.max(0, (player.hp ?? 100) - encounter.damageTaken);

    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3d2942)
          .setTitle(`${emojiMarkup(botEmojis.slime)} Slime defeated`)
          .setDescription(
            `${message.author} defeats a slime at the edge of Velthar.\n\n`
            + `**Slime HP:** ${encounter.slime.hp}\n`
            + `**Your damage:** ${encounter.playerDamage} × ${encounter.strikes} strikes\n`
            + `**HP lost:** ${encounter.damageTaken}\n`
            + `**HP:** ${updatedHp}/${player.max_hp ?? 100}\n\n`
            + `**+${24} XP** • **+${18} Copper Coins** • **Level ${player.level ?? 1}**`,
          )
          .setFooter({ text: "The world grows louder with every step." }),
      ],
    });
    return;
  }

  if (normalized === "journey") {
    const updated = await grantPlayerReward(message.author.id, "journey");
    const player = updated || (await ensurePlayerRecord(message.author.id));

    await sendGuidedCommandReply(message, "journey", {
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b1f2b)
          .setTitle("🗺️ Journey deepens")
          .setDescription(
            `${message.author} ventures beyond the ruined gates and returns changed.\n\n`
            + `**+${42} XP** • **+${32} Copper Coins** • **Level ${player.level ?? 1}**`,
          )
          .setFooter({ text: "Every journey pushes your story forward." }),
      ],
    });
    return;
  }

  if (normalized === "recover") {
    const player = await ensurePlayerRecord(message.author.id);
    const healed = Math.min(player.max_hp ?? 100, (player.hp ?? 100) + 6);
    await updatePlayerProgress(message.author.id, {
      hp: healed,
    });

    await sendGuidedCommandReply(message, "recover", {
      embeds: [
        new EmbedBuilder()
          .setColor(0x3d2942)
          .setTitle(`${emojiMarkup(botEmojis.heal)} Recovery complete`)
          .setDescription(`${message.author} steadies their breath and restores **${healed}/${player.max_hp ?? 100} HP**.`)
          .setFooter({ text: "Prepare for what comes next." }),
      ],
    });
    return;
  }

  if (normalized === "dungeon") {
    await sendGuidedCommandReply(message, "dungeon", {
      embeds: [
        new EmbedBuilder()
          .setColor(0x3d2942)
          .setTitle("🕳️ Dungeon gate")
          .setDescription(
            `${message.author} stands before the sealed dungeon gate. The next floor awaits beyond it, but the doors will not open until the challenge is earned.`,
          )
          .setFooter({ text: "Prepare. Then descend." }),
      ],
    });
    return;
  }

  await message.channel.send("Unknown echo command. Try `echo help`.");
  } catch (error) {
    console.error("Prefix command error:", error);
    try {
      await message.channel.send("Something went wrong while processing that command. Please try again.");
    } catch (sendError) {
      console.error("Prefix error reply failed:", sendError);
    }
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton() && interaction.customId.startsWith("card_")) {
      const [kind, action, ...idParts] = interaction.customId.split("_");
      const token = idParts.join("_");
      const challenge = pendingCardGames.get(token);
      if (!challenge) {
        await interaction.reply({ content: "This card-game challenge has expired.", ephemeral: true });
        return;
      }
      if (interaction.user.id !== challenge.opponentId) {
        await interaction.reply({ content: "Only the challenged player can answer this wager.", ephemeral: true });
        return;
      }
      pendingCardGames.delete(token);
      if (action === "decline") {
        await interaction.update({ content: "The Rigged Card Game challenge was declined.", components: [] });
        return;
      }
      await interaction.deferUpdate();
      const result = await playRiggedCardGame({
        user: { id: challenge.opponentId },
        author: { id: challenge.challengerId, toString: () => `<@${challenge.challengerId}>` },
      }, challenge.opponentId, challenge.wager);
      if (typeof result === "string") {
        await interaction.editReply({ content: result, components: [] });
      } else {
        await interaction.editReply({ ...result, components: [] });
      }
      return;
    }

    if (interaction.isButton() && [
      "tutorial_guided",
      "tutorial_long",
      "tutorial_start_guided",
      "tutorial_open_long",
    ].includes(interaction.customId)) {
      await interaction.deferUpdate();

      const player = await getPlayer(interaction.user.id);
      const language = player?.tutorial_language ?? "en";

      if (interaction.customId === "tutorial_guided" || interaction.customId === "tutorial_long") {
        const mode = interaction.customId === "tutorial_guided" ? "guided" : "long";
        const startPrompt = createTutorialStartPrompt(language, mode);
        await interaction.editReply({
          embeds: [startPrompt.embed],
          components: [startPrompt.components],
        });
        return;
      }

      if (interaction.customId === "tutorial_open_long") {
        await updatePlayerProgress(interaction.user.id, {
          tutorial_mode: "long",
          tutorial_step: 0,
        });
        await interaction.editReply({
          embeds: [createFullGuide(language)],
          components: [],
        });
        return;
      }

      await updatePlayerProgress(interaction.user.id, {
        tutorial_mode: "guided",
        tutorial_step: 0,
      });
      await interaction.editReply({
        embeds: [createGuidedPrompt(language, 0)],
        components: [],
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("shop_buy_")) {
      await interaction.deferReply();

      const itemId = interaction.customId.slice("shop_buy_".length);
      const item = shopItems[itemId];
      if (!item) {
        await interaction.editReply("That shop item is no longer available.");
        return;
      }

      const player = await ensurePlayerRecord(interaction.user.id);
      const gold = player.coins ?? 0;
      if (!isOwner(interaction.user.id) && gold < item.price) {
        await interaction.editReply(`You need **${item.price} Gold Coins**, but only have **${gold}**.`);
        return;
      }

        const updated = await purchaseItem(interaction.user.id, item.price, item.name);
        if (!updated) {
          await interaction.editReply("That purchase could not be completed because your balance changed. Please try again.");
          return;
        }

      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x3d2942)
            .setTitle("Purchase recorded")
            .setDescription(
              `${interaction.user} purchased **${item.name}** for **${item.price} Gold Coins**.\n\n`
              + `**Gold Coins remaining:** ${updated?.coins ?? gold - item.price}\n`
              + `**Stored in:** Soul Record inventory`,
            )
            .setFooter({ text: "Stellars remain reserved for the Empire." }),
        ],
      });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("language_")) {
      const [, languageCode, ownerId] = interaction.customId.split("_");
      if (ownerId !== interaction.user.id) {
        await interaction.reply({ content: "This awakening belongs to another player.", ephemeral: true });
        return;
      }
      const language = languageCode === "es" ? "es" : "en";
      pendingLanguages.set(interaction.user.id, language);
      pendingBegins.delete(interaction.user.id);
      await interaction.deferUpdate();

      const { awakening, weapons } = createWeaponPrompt(interaction.user.id);
      await interaction.editReply({ embeds: [awakening], components: [weapons] });
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith("begin_")) {
    const [, weaponCode, ownerId] = interaction.customId.split("_");
    if (ownerId !== interaction.user.id) {
      await interaction.reply({ content: "This awakening belongs to another player.", ephemeral: true });
      return;
    }
    const choices = {
      light_sword: {
        name: "Light Sword",
        emoji: weaponEmojis.lightSword,
        text: "A precise blade settles easily into your hand. The reflection in the fog nods once.",
      },
      daggers: {
        name: "Daggers",
        emoji: weaponEmojis.daggers,
        text: "Twin blades disappear into your palms. Somewhere in the mist, something begins to laugh.",
      },
      heavy_sword: {
        name: "Heavy Sword",
        emoji: weaponEmojis.heavySword,
        text: "The great blade is almost too heavy to lift. Yet it feels as though it remembers you.",
      },
    };

    const choice = choices[weaponCode];

    await interaction.deferUpdate();

    const language = pendingLanguages.get(interaction.user.id) || "en";
    pendingLanguages.delete(interaction.user.id);

    await createPlayer(interaction.user.id, choice.name, {
      chapter: 1,
      hp: 100,
      maxHp: 100,
      attack: 1,
      defense: 1,
      rank: "Bronze",
      title: "Newbie",
      tutorialLanguage: language,
      inventory: ["Ashen charm", "Torn map"],
    });

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x3d2942)
          .setTitle("The weapon answers...")
          .setDescription("The fog draws close. For one breath, the world is silent."),
      ],
      components: [],
    });

    await sleep(700);

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x6b1f2b)
          .setTitle(`${emojiMarkup(choice.emoji)} Soul Record Created · ${choice.name}`)
          .setDescription(
            `${choice.text}\n\n`
            + "**Chapter I: The Awakening** has begun. Your Echo moves beyond the ruined gates of Velthar and into the first chapter of its journey.",
          )
          .setFooter({ text: "Your Soul Record has been saved." }),
      ],
      components: [],
    });

    const tutorialPrompt = createTutorialModePrompt(language);
    await interaction.followUp({ embeds: [tutorialPrompt.embed], components: [tutorialPrompt.components] });
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "ping") {
    await interaction.reply("⚔️ The echo answers: Pong!");
    return;
  }

  if (interaction.commandName === "profile") {
    try {
      const existing = await getPlayer(interaction.user.id);

      if (!existing) {
        await safeInteractionReply(interaction, {
          content: "You do not have a Soul Record yet. Use `/begin` or `echo begin` to awaken in Velthar.",
        });
        return;
      }

      const createdAt = new Date(existing.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      const profileAvatar = interaction.user.displayAvatarURL({ extension: "png", size: 256 });

      await safeInteractionReply(interaction, {
        embeds: [
          applyWeaponImage(new EmbedBuilder()
            .setColor(0x6b1f2b)
            .setTitle(`${emojiMarkup(botEmojis.profile)} Soul Record`)
            .setThumbnail(profileAvatar)
            .setAuthor({
              name: `${interaction.user.username} — profile`,
              iconURL: profileAvatar,
            })
            .setDescription("Soul Record I · The Awakening")
            .addFields(
              {
                name: "PROGRESS",
                value:
                `**Title:** ${existing.title ?? "Newbie"}\n` +
                `**Level:** ${existing.level ?? 1}\n` +
                `**Guild Rank:** ${existing.rank ?? "Bronze"}\n` +
                `**XP:** ${existing.xp ?? 0}\n` +
                `**Floor:** ${existing.dungeon_floor > 0 ? existing.dungeon_floor : "Locked"}\n` +
                  "\u200b",
                inline: true,
              },
              {
                name: "STATS",
                value:
                `**HP:** ${existing.hp}/${existing.max_hp}\n` +
                `**Attack:** ${existing.weapon === "Sage Sword Oblivion" && !isOwner(interaction.user.id) ? "Unknown" : existing.attack}\n` +
                `**Defense:** ${existing.defense}`,
                inline: true,
              },
              {
                name: "EQUIPMENT",
                value: `**Sword:** ${emojiMarkup(getWeaponEmoji(existing.weapon))} ${existing.weapon}\n**Armor:** No Armor`,
                inline: true,
              },
              {
                name: "CURRENCY",
                value: `**Gold Coins:** ${existing.coins ?? 0}\n**Stellars:** ${existing.stellars ?? 0}`,
                inline: true,
              },
              {
                name: "AWAKENED",
                value: createdAt,
                inline: false,
              },
            )
            .setFooter({ text: "The fallen do not die. We awaken." }), existing.weapon),
        ],
        allowedMentions: { parse: [] },
      });
      return;
    } catch (error) {
      if (error?.code !== 10062) {
        console.error("Profile interaction error:", error);
      }
      return;
    }
  }

  if (interaction.commandName === "inventory") {
    await interaction.deferReply({ ephemeral: true });
    await sendInventoryReply(interaction, interaction.user.id, { isEphemeral: true });
    return;
  }

  if (interaction.commandName === "shop") {
    const shop = createShopPrompt();
    await interaction.reply({ embeds: [shop.embed], components: shop.components });
    return;
  }

  if (interaction.commandName === "gamble") {
    const game = interaction.options.getString("game");
    const wager = interaction.options.getInteger("amount");
    const chosenSide = interaction.options.getString("side");
    const opponent = interaction.options.getUser("opponent");

    if (!game && !wager && !chosenSide) {
      await interaction.reply({ embeds: [createGamblingMenu()] });
      return;
    }

    if (game && game !== "cf") {
      if (game === "rigged") {
        if (!wager || !opponent) {
          await interaction.reply("For Rigged Card Game, choose an opponent and a Gold Coin wager.");
          return;
        }
        await interaction.reply(createCardGameChallenge(interaction.user.id, opponent.id, wager));
        return;
      }
      if (!wager) {
        await interaction.reply(`For ${game}, choose a whole-number Gold Coin wager.`);
        return;
      }
      await interaction.reply(await playSimpleGamble(interaction, game, wager));
      return;
    }

    if (!wager || !chosenSide) {
      await interaction.reply("For Coin Flip, choose a wager and `heads` or `tails`. Use `/gamble` to view all gambling commands.");
      return;
    }

    const player = await ensurePlayerRecord(interaction.user.id);
    const gold = player.coins ?? 0;

    if (!isOwner(interaction.user.id) && wager > gold) {
      await interaction.reply(`You only have **${gold} Gold Coins**, so you cannot wager **${wager}**.`);
      return;
    }

    const result = randomInt(0, 2) === 1 ? "heads" : "tails";
    const won = result === chosenSide;
    const updated = await adjustCoins(interaction.user.id, won ? wager : -wager, {
      allowNegative: isOwner(interaction.user.id),
    });
    if (!updated) {
      await interaction.reply("Your wager could not be settled because your balance changed. Please try again.");
      return;
    }
    const nextGold = updated.coins;
    await interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(won ? 0x3d6b4f : 0x6b1f2b)
          .setTitle(`${emojiMarkup(botEmojis.coin)} ${won ? "The coin favors you" : "The coin turns away"}`)
          .setDescription(
            `${interaction.user} wagered **${wager} Gold Coins** and called **${chosenSide}**.\n\n`
            + `**Coin:** ${result}\n`
            + (won
              ? `**Won:** +${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`
              : `**Lost:** -${wager} Gold Coins\n**Balance:** ${nextGold} Gold Coins`),
          )
          .setFooter({ text: "Heads and tails each have a 50/50 chance." }),
      ],
    });
    return;
  }

  if (interaction.commandName === "begin") {
    try {
      await interaction.deferReply();

      const existing = await getPlayer(interaction.user.id);

      if (existing) {
        await safeInteractionEdit(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x6b1f2b)
              .setTitle("Soul Record Found")
              .setDescription(
                `Your Echo already walks the ruins of Velthar, wielding the **${existing.weapon}**.\n\n`
                + `Currently on **Chapter ${existing.chapter}**.`,
              )
              .setFooter({ text: "Soul Record I · The Awakening" }),
          ],
        });
        return;
      }

    const scenes = [
      {
        title: "⚔️ Echoes of the Fallen",
        text: "The ruined bells of **Velthar** ring once...",
      },
      {
        title: "⚔️ Echoes of the Fallen",
        text: "A cold wind carries ash across the empty streets.",
      },
      {
        title: "⚔️ Echoes of the Fallen",
        text: "In a shattered window, your reflection opens its eyes before you do.",
      },
    ];

      for (const scene of scenes) {
        await safeInteractionEdit(interaction, {
          embeds: [
            new EmbedBuilder()
              .setColor(0x3d2942)
              .setTitle(scene.title)
              .setDescription(scene.text)
              .setFooter({ text: "Soul Record I · The Awakening" }),
          ],
          components: [],
        });

        await sleep(700);
      }

      const languagePrompt = createLanguagePrompt(interaction.user.id);
      pendingBegins.set(interaction.user.id, true);

      await safeInteractionEdit(interaction, {
        embeds: [languagePrompt.embed],
        components: [languagePrompt.components],
      });
    } catch (error) {
      if (error?.code !== 10062) {
        console.error("Begin interaction error:", error);
      }
      return;
    }
  }
  } catch (error) {
    if (error?.code === 10062) {
      return;
    }
    console.error("Unhandled interaction error:", error);
  }
});

init()
  .then(() => {
    console.log("Database ready.");
    return client.login(process.env.DISCORD_TOKEN);
  })
  .catch((error) => {
    console.error("Failed to connect to the database:", error);
    process.exit(1);
  });