require("dotenv").config();
const { REST, Routes, SlashCommandBuilder } = require("discord.js");

const commands = [
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Checks whether the bot is online.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("begin")
    .setDescription("Awaken in Velthar and create your first Soul Record.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View your Soul Record and current chapter.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your Soul Record inventory.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("shop")
    .setDescription("Open the Velthar supply house.")
    .toJSON(),
  new SlashCommandBuilder()
    .setName("gamble")
    .setDescription("Open the gambling hall or choose a game.")
    .addStringOption((option) => option
      .setName("game")
      .setDescription("Choose a gambling game, or leave blank to view the menu.")
      .addChoices(
        { name: "Coin Flip", value: "cf" },
        { name: "Slots", value: "slots" },
        { name: "Rigged Card Game", value: "rigged" },
        { name: "17 Poker", value: "poker17" },
        { name: "Lottery", value: "lottery" },
      ))
    .addIntegerOption((option) => option
      .setName("amount")
      .setDescription("Whole-number Gold Coin wager.")
      .setMinValue(1))
    .addUserOption((option) => option
      .setName("opponent")
      .setDescription("Opponent for Rigged Card Game.")
      .setRequired(false))
    .addStringOption((option) => option
      .setName("side")
      .setDescription("Choose heads or tails.")
      .addChoices(
        { name: "Heads", value: "heads" },
        { name: "Tails", value: "tails" },
      ))
    .toJSON(),
];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

async function deployCommands() {
  await rest.put(
    Routes.applicationGuildCommands(
      process.env.DISCORD_CLIENT_ID,
      process.env.DISCORD_GUILD_ID,
    ),
    { body: commands },
  );

  console.log("Slash commands registered.");
}

deployCommands().catch(console.error);
