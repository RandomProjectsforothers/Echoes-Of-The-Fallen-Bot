# Echoes of the Fallen Bot

Discord RPG bot for **Echoes of the Fallen**. The current flow introduces the player to Velthar and lets them choose a starter weapon.

## Journey Checklist

### Finished

- [x] Create the Node.js Discord bot project.
- [x] Connect the bot to Discord with `discord.js`.
- [x] Add `/ping` and `/begin` slash commands.
- [x] Build the Velthar awakening scene.
- [x] Add Light Sword, Daggers, and Heavy Sword starter choices.
- [x] Add custom sword emoji support with Unicode fallbacks.
- [x] Set up Neon and link the `production` branch.
- [x] Add Postgres persistence for player Soul Records.
- [x] Create the `players` table automatically on startup.
- [x] Confirm the bot reaches Discord and logs `Database ready.`
- [x] Create this project reminder and command guide.

### Authoritative Roadmap

#### Phase 1: Core RPG Loop

- [x] Player creation and database persistence.
- [x] Starter weapons, profile, and inventory.
- [x] Level, XP, and Guild Rank.
- [x] Random hunt enemies with different stats and loot chances.
- [x] Stat-based hunt resolution with victory and defeat states.
- [x] XP and Gold Coin rewards.
- [ ] Item rewards and complete chapter progression.

#### Phase 2: Equipment

- [x] Auto-equip purchased weapons and armor with attack and defense bonuses.
- [x] Add usable consumable items through `echo use`.

#### Phase 3: Content

- [ ] Complete Chapter 1 and add more Velthar dialogue.
- [x] Add more enemies and stat-based hunts with loot chances.
- [x] Require two or more keyed players for dungeon floors.
- [ ] Add quests and boss encounters.

#### Phase 4: Economy

- [x] Gold Coins and shop.
- [x] Sell unequipped items for half price.
- [ ] Balance item prices.
- [ ] Introduce Stellar Gold and the Empire economy.

#### Phase 5: Reliability

- [x] Duplicate database and command error handling.
- [ ] Combat state validation and automated tests.
- [ ] Add structured logging and backup/recovery strategy.
- [x] Choose Railway for hosting.

### Current Starting Point

The bot is online locally, Neon is connected, and the next practical step is testing `/begin` and the tutorial choice in Discord. After that, continue with the first unchecked milestone above.

## Current Status

- Discord slash commands are registered: `/ping`, `/begin`, `/profile`, `/inventory`, `/shop`, and `/gamble`.
- Neon project is linked to project `sweet-dream-11556954`.
- Neon branch: `production`.
- Neon deployment completed successfully.
- `neon.ts` uses an empty policy: `defineConfig({})`.
- Neon variables are pulled into `.env`.
- The sword selection flow is implemented in `index.js`.
- Player records are stored in Postgres through `db.js`.
- The bot currently starts successfully on Railway and reaches Discord.
- Prefix commands, language selection, and the guided/full tutorial flow are implemented in `index.js`.
- Players have a separate numeric Level and Guild Rank starting at Bronze.
- Copper Coins are the current everyday currency. Stellar Gold is planned for the Empire after Dungeon Floor 15.
- Profiles use Gold Coins and Stellars. The dungeon Floor remains Locked until dungeon progression is implemented.
- Set `OWNER_USER_ID` in `.env` to give one Discord account highest authority. Owner-only commands are intentionally hidden from `echo help`:
	- `echo admin setrank @user Bronze|Iron|Steel|Silver|Gold|Platinum|Mithril|Adamantine|Orichalcum`
	- `echo admin settitle @user New Title`
	- `echo admin setfloor @user 15`
	- `echo admin givegold @user amount`
	- `echo admin givestellars @user amount`
- JavaScript syntax check passes with `node --check index.js`.
- The three custom sword emoji IDs are configured in `.env`.
- Hunts now resolve random combat encounters from player and enemy stats with `echo hunt`.

## Run the Bot

From the project directory:

```powershell
node index.js
```

## Register Slash Commands

Run this when adding or changing slash commands in `deploy-commands.js`:

```powershell
node deploy-commands.js
```

## Command Guide

### Prefix commands

Type these commands in a Discord server where the bot is present:

```text
echo help
echo begin
echo profile
echo inventory
echo reset
echo hunt
echo journey
echo recover
echo shop
echo sell Healing Potion
echo dungeon
echo use potion
echo use antidote
```

You can also mention the bot before a command, for example `@Echoes of The Fallen echo profile`.

When starting with `echo begin` or `/begin`, choose Light Sword, Daggers, or Heavy Sword.

### Gambling commands

Use either the prefix format or the `/gamble` slash command:

```text
echo cf 25 heads
echo slots 25
echo rgc @player 25
echo poker17 25
echo lottery 25
```

The player must have enough Gold Coins for the wager. Use `echo profile` to check your balance.

### Shop

Run `echo shop` or `/shop`, then click an item button to buy it. Purchases are saved to the player's Soul Record and subtract Gold Coins. Weapons and armor are equipped automatically and affect attack and defense. Use `echo sell <item>` to sell unequipped items for half price. Available items are Antidote, Healing Potion, Iron Sword, Twin Daggers, Leather Armor, Chain Armor, and Dungeon Key.

### Private owner commands

These commands are hidden from `echo help` and only work for the Discord user whose ID is set in `OWNER_USER_ID` in `.env`:

```text
echo setmoney @user amount
echo setexp @user amount
echo setlvl @user level
echo settitle @user title
echo setrank @user rank
echo setfloor @user floor
echo setchapter @user chapter
echo sethp @user hp
echo setdamage @user damage
echo setattack @user attack
echo setdefense @user defense
echo setweapon @user weapon name
echo setstellars @user amount
echo giveitem @user item name
```

Sage Sword Oblivion is an admin-only weapon. Players cannot select it during `begin`; the owner can assign it with `echo setweapon @user Sage Sword Oblivion`.

Available ranks are:

```text
Bronze
Iron
Steel
Silver
Gold
Platinum
Mithril
Adamantine
Orichalcum
```

Example:

```text
echo setrank @Player Mithril
```

Example:

```text
echo setmoney @Player 10000
echo setlvl @Player 25
echo settitle @Player Guardian of Velthar
echo giveitem @Player Healing Potion
```

Check the current Neon setup:

```powershell
& "C:\Users\cuajo\AppData\Roaming\npm\neon.cmd" status
```

Deploy the current `neon.ts` policy:

```powershell
& "C:\Users\cuajo\AppData\Roaming\npm\neon.cmd" deploy
```

Pull the current branch variables into `.env`:

```powershell
& "C:\Users\cuajo\AppData\Roaming\npm\neon.cmd" env pull
```

If the `neon` command works directly in your terminal, the shorter form is fine:

```powershell
neon deploy
neon env pull
```

The absolute path is the reliable fallback when npm's global bin directory is missing from PATH.

## Custom Sword Emojis

The uploaded sword image is configured as three Discord custom emojis:

```env
LIGHT_SWORD_EMOJI_ID=1545045078144450610
DAGGERS_EMOJI_ID=1545044964352987236
HEAVY_SWORD_EMOJI_ID=1545045006186717194
```

Restart the bot after changing `.env`. The buttons use Unicode fallback emojis if the IDs are removed.

## Useful Workflow

1. Edit `index.js` or `deploy-commands.js`.
2. Run `node --check index.js` for a quick syntax check.
3. If slash commands changed, run `node deploy-commands.js`.
4. Run `node index.js`.
5. Test `/ping`, then `/begin` in Discord.
6. Stop the bot with `Ctrl+C` when finished.

## Project Files

- `index.js` - Discord bot and starter weapon interaction flow.
- `enemies.js` - Enemy definitions and reward values.
- `deploy-commands.js` - Registers Discord slash commands.
- `neon.ts` - Neon configuration policy.
- `.neon` - Local Neon project and branch link; ignored by git.
- `.env` - Local secrets and Neon connection variables; ignored by git.
- `package.json` - Node project metadata and dependencies.
