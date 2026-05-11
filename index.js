const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  REST,
  Routes,
} = require('discord.js');
const fs = require('fs');
const path = require('path');

// ─── Config ───────────────────────────────────────────────────────────────────
const TOKEN           = process.env.DISCORD_TOKEN;
const CLIENT_ID       = process.env.CLIENT_ID;
const GUILD_ID        = process.env.GUILD_ID;

const LEAGUE_CHANNEL_ID    = '1498804106628956211'; // #league-host
const LEAGUE_HOST_ROLE_ID  = '1459877884645740846'; // League Host role
const LEAGUES_PING_ROLE_ID = '1451553808697266257'; // @leagues ping role

// ─── Database helpers ─────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'database.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ leagues: {} }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function generateLeagueId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMaxPlayers(format) {
  const map = { '2v2': 4, '3v3': 6, '4v4': 8 };
  return map[format] || 4;
}

function formatRegion(region) {
  const map = {
    europe:        'Europe',
    asia:          'Asia',
    north_america: 'North America',
    south_america: 'South America',
    oceania:       'Oceania',
  };
  return map[region] || region;
}

function formatType(type) {
  return type === 'swift' ? 'Swift Game' : 'War Game';
}

function formatPerks(perks) {
  return perks === 'perks' ? 'Perks' : 'No Perks';
}

// ─── Embed builder ────────────────────────────────────────────────────────────
function buildLeagueEmbed(league, started = false) {
  const spotsLeft = league.maxPlayers - league.players.length;

  const embed = new EmbedBuilder()
    .setTitle(started ? 'League — Started' : 'League — Open')
    .setColor(started ? 0x57F287 : 0x5865F2)
    .addFields(
      { name: 'Format',      value: league.format,               inline: true },
      { name: 'Match Type',  value: formatType(league.type),     inline: true },
      { name: 'Perks',       value: formatPerks(league.perks),   inline: true },
      { name: 'Region',      value: formatRegion(league.region), inline: true },
      { name: 'Host',        value: `<@${league.hostId}>`,       inline: true },
      { name: 'Players',     value: `${league.players.length} / ${league.maxPlayers}`, inline: true },
      { name: 'Spots Left',  value: `${spotsLeft}`,              inline: true },
      { name: 'League ID',   value: `\`${league.id}\``,          inline: true },
    )
    .setFooter({ text: started ? 'League is full. Check the private thread.' : 'Press the button below to join.' })
    .setTimestamp();

  return embed;
}

function buildJoinRow(leagueId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_league_${leagueId}`)
      .setLabel('Join League')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
  );
}

// ─── Slash commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('league')
    .setDescription('League management')
    .addSubcommand(sub =>
      sub
        .setName('host')
        .setDescription('Host a new league')
        .addStringOption(opt =>
          opt
            .setName('format')
            .setDescription('Match format')
            .setRequired(true)
            .addChoices(
              { name: '2v2', value: '2v2' },
              { name: '3v3', value: '3v3' },
              { name: '4v4', value: '4v4' },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('type')
            .setDescription('Match type')
            .setRequired(true)
            .addChoices(
              { name: 'Swift Game', value: 'swift' },
              { name: 'War Game',   value: 'war'   },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('perks')
            .setDescription('Match perks')
            .setRequired(true)
            .addChoices(
              { name: 'Perks',    value: 'perks'    },
              { name: 'No Perks', value: 'no_perks' },
            ),
        )
        .addStringOption(opt =>
          opt
            .setName('region')
            .setDescription('Region')
            .setRequired(true)
            .addChoices(
              { name: 'Europe',        value: 'europe'        },
              { name: 'Asia',          value: 'asia'          },
              { name: 'North America', value: 'north_america' },
              { name: 'South America', value: 'south_america' },
              { name: 'Oceania',       value: 'oceania'       },
            ),
        ),
    )
    .addSubcommand(sub =>
      sub
        .setName('cancel')
        .setDescription('Cancel an active league')
        .addStringOption(opt =>
          opt
            .setName('id')
            .setDescription('The League ID to cancel')
            .setRequired(true),
        ),
    )
    .toJSON(),
];

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once('ready', async () => {
  console.log(`Ready — logged in as ${client.user.tag}`);

  if (!CLIENT_ID || !GUILD_ID) {
    console.warn('CLIENT_ID or GUILD_ID not set — skipping command registration.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

// ─── Interaction handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {

  // ── Slash commands ──
  if (interaction.isChatInputCommand() && interaction.commandName === 'league') {
    const sub = interaction.options.getSubcommand();

    // ── /league host ──
    if (sub === 'host') {
      if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
        return interaction.reply({
          content: 'You do not have permission to host leagues.',
          ephemeral: true,
        });
      }

      if (interaction.channelId !== LEAGUE_CHANNEL_ID) {
        return interaction.reply({
          content: `Leagues can only be hosted in <#${LEAGUE_CHANNEL_ID}>.`,
          ephemeral: true,
        });
      }

      const format = interaction.options.getString('format');
      const type   = interaction.options.getString('type');
      const perks  = interaction.options.getString('perks');
      const region = interaction.options.getString('region');

      const leagueId  = generateLeagueId();
      const maxPlayers = getMaxPlayers(format);

      const league = {
        id:         leagueId,
        hostId:     interaction.user.id,
        format,
        type,
        perks,
        region,
        maxPlayers,
        players:    [],
        messageId:  null,
        channelId:  interaction.channelId,
        guildId:    interaction.guildId,
        active:     true,
        threadId:   null,
      };

      const embed = buildLeagueEmbed(league);
      const row   = buildJoinRow(leagueId);

      await interaction.reply({
        content: `<@&${LEAGUES_PING_ROLE_ID}>`,
        embeds:     [embed],
        components: [row],
      });

      const msg = await interaction.fetchReply();
      league.messageId = msg.id;

      const db = readDB();
      db.leagues[leagueId] = league;
      writeDB(db);

      return;
    }

    // ── /league cancel ──
    if (sub === 'cancel') {
      if (!interaction.member.roles.cache.has(LEAGUE_HOST_ROLE_ID)) {
        return interaction.reply({
          content: 'You do not have permission to cancel leagues.',
          ephemeral: true,
        });
      }

      const leagueId = interaction.options.getString('id').toUpperCase();
      const db       = readDB();
      const league   = db.leagues[leagueId];

      if (!league) {
        return interaction.reply({
          content: `No league found with ID \`${leagueId}\`.`,
          ephemeral: true,
        });
      }

      if (!league.active) {
        return interaction.reply({
          content: `League \`${leagueId}\` is already cancelled or has started.`,
          ephemeral: true,
        });
      }

      // Remove the league announcement message
      try {
        const ch  = await client.channels.fetch(league.channelId);
        const msg = await ch.messages.fetch(league.messageId);
        await msg.delete();
      } catch (_) { /* message may already be gone */ }

      league.active = false;
      db.leagues[leagueId] = league;
      writeDB(db);

      return interaction.reply({
        content: `League \`${leagueId}\` has been cancelled.`,
        ephemeral: true,
      });
    }
  }

  // ── Button: Join League ──
  if (interaction.isButton() && interaction.customId.startsWith('join_league_')) {
    const leagueId = interaction.customId.replace('join_league_', '');
    const db       = readDB();
    const league   = db.leagues[leagueId];

    if (!league || !league.active) {
      return interaction.reply({
        content: 'This league is no longer active.',
        ephemeral: true,
      });
    }

    if (league.players.includes(interaction.user.id)) {
      return interaction.reply({
        content: 'You have already joined this league.',
        ephemeral: true,
      });
    }

    if (league.players.length >= league.maxPlayers) {
      return interaction.reply({
        content: 'This league is already full.',
        ephemeral: true,
      });
    }

    league.players.push(interaction.user.id);
    const isFull = league.players.length >= league.maxPlayers;

    if (isFull) {
      league.active = false;

      // Update the public announcement embed — mark as started, disable button
      try {
        const ch  = await client.channels.fetch(league.channelId);
        const msg = await ch.messages.fetch(league.messageId);
        await msg.edit({
          embeds:     [buildLeagueEmbed(league, true)],
          components: [buildJoinRow(leagueId, true)],
        });
      } catch (_) { /* message may have been deleted */ }

      // Create a private thread visible only to players
      try {
        const ch = await client.channels.fetch(league.channelId);

        const thread = await ch.threads.create({
          name:      `League ${leagueId} — ${league.format} ${formatType(league.type)}`,
          type:      ChannelType.PrivateThread,
          invitable: false,
        });

        league.threadId = thread.id;

        // Add every player to the thread
        for (const playerId of league.players) {
          try {
            await thread.members.add(playerId);
          } catch (_) { /* user may have left the server */ }
        }

        const playerList = league.players.map(id => `<@${id}>`).join('\n');
        const pingList   = league.players.map(id => `<@${id}>`).join(' ');

        const startEmbed = new EmbedBuilder()
          .setTitle('League — Started')
          .setColor(0x57F287)
          .addFields(
            { name: 'Format',     value: league.format,               inline: true },
            { name: 'Match Type', value: formatType(league.type),     inline: true },
            { name: 'Perks',      value: formatPerks(league.perks),   inline: true },
            { name: 'Region',     value: formatRegion(league.region), inline: true },
            { name: 'Host',       value: `<@${league.hostId}>`,       inline: true },
            { name: 'League ID',  value: `\`${league.id}\``,          inline: true },
            { name: 'Players',    value: playerList,                  inline: false },
          )
          .setFooter({ text: 'This thread is private. Only league participants can see it.' })
          .setTimestamp();

        await thread.send({
          content: `${pingList}\n\nYour league is ready. Good luck.`,
          embeds:  [startEmbed],
        });
      } catch (err) {
        console.error('Failed to create private thread:', err);
      }
    } else {
      // Update the embed to reflect new player count
      try {
        const updatedEmbed = buildLeagueEmbed(league);
        await interaction.message.edit({
          embeds:     [updatedEmbed],
          components: [buildJoinRow(leagueId)],
        });
      } catch (_) { /* message may be gone */ }
    }

    db.leagues[leagueId] = league;
    writeDB(db);

    return interaction.reply({
      content: isFull
        ? 'You have joined the league. The league is now full — check your private thread.'
        : `You have joined league \`${leagueId}\`. Waiting for more players.`,
      ephemeral: true,
    });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
if (!TOKEN) {
  console.error('DISCORD_TOKEN is not set. Exiting.');
  process.exit(1);
}

client.login(TOKEN);
