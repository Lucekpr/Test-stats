import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  MessageFlags,
  ModalBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { createEmbed } from '../../../utils/embeds.js';
import {
  getCensusConfig,
  saveCensusConfig,
  updateCensusChannels,
} from '../../../services/serverstatsService.js';

export const CENSUS_COMPONENTS = {
  mode: 'census_cfg_mode',
  countChannel: 'census_cfg_count_channel',
  joinChannel: 'census_cfg_join_channel',
  banChannel: 'census_cfg_ban_channel',
  role: 'census_cfg_role',
  names: 'census_cfg_names',
  refresh: 'census_cfg_refresh',
};

function channelText(guild, id) {
  if (!id) return '`Not set`';
  const channel = guild.channels.cache.get(id);
  return channel ? `<#${id}>` : '`Missing channel`';
}

function roleText(guild, id) {
  if (!id) return '`Not set`';
  const role = guild.roles.cache.get(id);
  return role ? `<@&${id}>` : '`Missing role`';
}

function buildEmbed(config, guild) {
  config.guild = guild;
  return createEmbed({
    title: '🏛️ Census Configuration',
    description: 'Configure the Census entirely from Discord. No code or .env editing is required.',
    color: 'info',
    fields: [
      {
        name: '👥 Member Counter',
        value: `Mode: **${config.countMode === 'role' ? 'Role-based' : 'All members'}**\nRole: ${roleText(guild, config.countRoleId)}\nChannel: ${channelText(guild, config.membersChannelId)}`,
        inline: false,
      },
      {
        name: '🆕 Last Arrival',
        value: channelText(guild, config.lastJoinChannelId),
        inline: true,
      },
      {
        name: '☠️ Last Execution',
        value: channelText(guild, config.lastBanChannelId),
        inline: true,
      },
      {
        name: '✏️ Channel Name Templates',
        value: `Members: \`${config.names.members}\`\nArrival: \`${config.names.lastJoin}\`\nExecution: \`${config.names.lastBan}\``,
        inline: false,
      },
    ],
    footer: 'Use the buttons below to configure the Census.',
  });
}

function buildComponents(config) {
  const rows = [];

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.mode).setLabel('Counting mode').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.countChannel).setLabel('Member channel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.joinChannel).setLabel('Arrival channel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.banChannel).setLabel('Execution channel').setStyle(ButtonStyle.Secondary),
  ));

  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.role).setLabel('Select role').setStyle(ButtonStyle.Secondary).setDisabled(config.countMode !== 'role'),
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.names).setLabel('Edit names').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(CENSUS_COMPONENTS.refresh).setLabel('Refresh now').setStyle(ButtonStyle.Success),
  ));

  return rows;
}

export async function showCensusDashboard(interaction, client) {
  const config = await getCensusConfig(client, interaction.guildId);
  await interaction.reply({
    embeds: [buildEmbed(config, interaction.guild)],
    components: buildComponents(config),
    flags: MessageFlags.Ephemeral,
  });
}

export async function refreshCensusDashboard(interaction, client) {
  const config = await getCensusConfig(client, interaction.guildId);
  if (interaction.message?.editable) {
    await interaction.update({
      embeds: [buildEmbed(config, interaction.guild)],
      components: buildComponents(config),
    });
  } else {
    await interaction.reply({
      embeds: [buildEmbed(config, interaction.guild)],
      components: buildComponents(config),
      flags: MessageFlags.Ephemeral,
    });
  }
}

export async function handleCensusButton(interaction, client) {
  const config = await getCensusConfig(client, interaction.guildId);

  if (interaction.customId === CENSUS_COMPONENTS.mode) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`${CENSUS_COMPONENTS.mode}:select`)
      .setPlaceholder('Choose how the member counter should work')
      .addOptions(
        new StringSelectMenuOptionBuilder().setLabel('All members').setValue('all').setDescription('Count every member, including bots.'),
        new StringSelectMenuOptionBuilder().setLabel('Members with a role').setValue('role').setDescription('Count only members who have a selected role.'),
      );
    await interaction.reply({
      content: 'Choose the counting mode:',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === CENSUS_COMPONENTS.countChannel || interaction.customId === CENSUS_COMPONENTS.joinChannel || interaction.customId === CENSUS_COMPONENTS.banChannel) {
    const field = interaction.customId === CENSUS_COMPONENTS.countChannel ? 'membersChannelId' : interaction.customId === CENSUS_COMPONENTS.joinChannel ? 'lastJoinChannelId' : 'lastBanChannelId';
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(`${interaction.customId}:select`)
      .setPlaceholder('Select a channel...')
      .setChannelTypes([0, 2, 5, 13])
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: `Select the channel for **${field === 'membersChannelId' ? 'Member Counter' : field === 'lastJoinChannelId' ? 'Last Arrival' : 'Last Execution'}**.`,
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === CENSUS_COMPONENTS.role) {
    const menu = new RoleSelectMenuBuilder()
      .setCustomId(`${CENSUS_COMPONENTS.role}:select`)
      .setPlaceholder('Select the role to count...')
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.reply({
      content: 'Select the role whose members should be counted:',
      components: [new ActionRowBuilder().addComponents(menu)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (interaction.customId === CENSUS_COMPONENTS.names) {
    const modal = new ModalBuilder().setCustomId(CENSUS_COMPONENTS.names).setTitle('Edit Census channel names');
    const members = new TextInputBuilder().setCustomId('members_name').setLabel('Member counter').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(95).setValue(config.names.members);
    const lastJoin = new TextInputBuilder().setCustomId('last_join_name').setLabel('Last arrival').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(95).setValue(config.names.lastJoin);
    const lastBan = new TextInputBuilder().setCustomId('last_ban_name').setLabel('Last execution').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(95).setValue(config.names.lastBan);
    modal.addComponents(
      new ActionRowBuilder().addComponents(members),
      new ActionRowBuilder().addComponents(lastJoin),
      new ActionRowBuilder().addComponents(lastBan),
    );
    await interaction.showModal(modal);
    return;
  }

  if (interaction.customId === CENSUS_COMPONENTS.refresh) {
    await updateCensusChannels(client, interaction.guild);
    await interaction.update({
      embeds: [buildEmbed(await getCensusConfig(client, interaction.guildId), interaction.guild)],
      components: buildComponents(await getCensusConfig(client, interaction.guildId)),
    });
  }
}

export async function handleCensusSelect(interaction, client) {
  const [base, action] = interaction.customId.split(':');
  const config = await getCensusConfig(client, interaction.guildId);

  if (base === CENSUS_COMPONENTS.mode && action === 'select') {
    config.countMode = interaction.values[0];
    if (config.countMode === 'all') config.countRoleId = null;
    await saveCensusConfig(client, interaction.guildId, config);
    await updateCensusChannels(client, interaction.guild);
    await interaction.update({ content: `Counting mode set to **${config.countMode === 'all' ? 'All members' : 'Members with a role'}**.`, components: [] });
    return;
  }

  if ([CENSUS_COMPONENTS.countChannel, CENSUS_COMPONENTS.joinChannel, CENSUS_COMPONENTS.banChannel].includes(base) && action === 'select') {
    const id = interaction.values[0];
    if (base === CENSUS_COMPONENTS.countChannel) config.membersChannelId = id;
    if (base === CENSUS_COMPONENTS.joinChannel) config.lastJoinChannelId = id;
    if (base === CENSUS_COMPONENTS.banChannel) config.lastBanChannelId = id;
    await saveCensusConfig(client, interaction.guildId, config);
    await updateCensusChannels(client, interaction.guild);
    await interaction.update({ content: 'Saved. Close this small picker and press **Refresh now** on the Census dashboard.', components: [] });
    return;
  }

  if (base === CENSUS_COMPONENTS.role && action === 'select') {
    config.countMode = 'role';
    config.countRoleId = interaction.values[0];
    await saveCensusConfig(client, interaction.guildId, config);
    await updateCensusChannels(client, interaction.guild);
    await interaction.update({ content: `Counting role set to <@&${config.countRoleId}>.`, components: [] });
  }
}

export async function handleCensusModal(interaction, client) {
  if (interaction.customId !== CENSUS_COMPONENTS.names) return false;
  const config = await getCensusConfig(client, interaction.guildId);
  config.names.members = interaction.fields.getTextInputValue('members_name').trim() || config.names.members;
  config.names.lastJoin = interaction.fields.getTextInputValue('last_join_name').trim() || config.names.lastJoin;
  config.names.lastBan = interaction.fields.getTextInputValue('last_ban_name').trim() || config.names.lastBan;
  await saveCensusConfig(client, interaction.guildId, config);
  await updateCensusChannels(client, interaction.guild);
  await interaction.reply({ content: 'Census channel names saved and updated.', flags: MessageFlags.Ephemeral });
  return true;
}
