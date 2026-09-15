// serverstatsService.js

import { logger } from '../utils/logger.js';
import { logEvent, EVENT_TYPES } from './loggingService.js';
import { formatLogLine } from '../utils/logging/logEmbeds.js';
import { getServerCountersKey, getCensusStatsKey, getCensusConfigKey } from '../utils/database/keys.js';
import botConfig from '../config/bot.js';

export const COUNTER_TYPE_CONFIG = {
  members: {
    label: 'Members + Bots',
    baseName: 'Members & Bots',
    emoji: '👥'
  },
  members_only: {
    label: 'Members Only',
    baseName: 'Members',
    emoji: '👤'
  },
  bots: {
    label: 'Bots Only',
    baseName: 'Bots',
    emoji: '🤖'
  }
};

function getCounterConfig(type) {
  return COUNTER_TYPE_CONFIG[type] || {
    label: 'Unknown',
    baseName: 'Counter',
    emoji: '❓'
  };
}

export function getCounterTypeLabel(type) {
  return getCounterConfig(type).label;
}

export function getCounterBaseName(type) {
  return getCounterConfig(type).baseName;
}

export function getCounterEmoji(type) {
  return getCounterConfig(type).emoji;
}

export function formatCounterChannelName(type, count) {
  const template = botConfig.counters?.defaults?.channelName || '{name}-{count}';
  const baseName = getCounterBaseName(type);
  return template
    .replaceAll('{name}', baseName)
    .replaceAll('{count}', String(count));
}

export function getCounterActionMessage(action, values = {}) {
  const template = botConfig.counters?.messages?.[action];
  if (!template) {
    return null;
  }

  return Object.entries(values).reduce(
    (message, [key, value]) => message.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export async function getGuildCounterStats(guild) {
  let memberCollection = guild.members.cache;

  try {
    memberCollection = await guild.members.fetch();
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Failed to fetch all guild members for ${guild.id}, using cache only`, error);
    }
  }

  const botCount = memberCollection.filter((member) => member.user.bot).size;
  const totalCount = typeof guild.memberCount === 'number' ? guild.memberCount : memberCollection.size;
  const humanCount = Math.max(totalCount - botCount, 0);

  return {
    totalCount,
    botCount,
    humanCount
  };
}

export async function getCounterCount(guild, type) {
  const stats = await getGuildCounterStats(guild);

  switch (type) {
    case 'members':
      return stats.totalCount;
    case 'bots':
      return stats.botCount;
    case 'members_only':
      return stats.humanCount;
    default:
      return null;
  }
}

function isValidCounterShape(counter) {
  return Boolean(
    counter &&
    typeof counter === 'object' &&
    typeof counter.id === 'string' &&
    counter.id.length > 0 &&
    typeof counter.type === 'string' &&
    typeof counter.channelId === 'string' &&
    counter.channelId.length > 0
  );
}

function normalizeCounter(counter, guildId) {
  const normalized = {
    id: String(counter.id),
    type: String(counter.type),
    channelId: String(counter.channelId),
    guildId: String(counter.guildId || guildId),
    createdAt: counter.createdAt || new Date().toISOString(),
    enabled: typeof counter.enabled === 'boolean' ? counter.enabled : true
  };

  if (counter.updatedAt) {
    normalized.updatedAt = counter.updatedAt;
  }

  return normalized;
}

function sanitizeCounters(counters, guildId) {
  if (!Array.isArray(counters)) {
    return [];
  }

  return counters
    .filter(isValidCounterShape)
    .map(counter => normalizeCounter(counter, guildId));
}

export async function updateCounter(client, guild, counter) {
  try {
    if (!counter || !counter.type || !counter.channelId) {
      logger.warn('Skipping invalid counter in updateCounter:', counter);
      return false;
    }
    
    const { type, channelId } = counter;
    let channel = guild.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await guild.channels.fetch(channelId);
      } catch {
        channel = null;
      }
    }
    if (!channel) {
      logger.warn(`Counter channel ${channelId} not found in guild ${guild.id}, skipping update`);
      return false;
    }

    const count = await getCounterCount(guild, type);
    if (count === null) {
      logger.error('Unknown counter type:', type);
      return false;
    }

    const baseName = getCounterBaseName(type);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Base name: "${baseName}", Current name: "${channel.name}"`);
    }
    
    const newName = formatCounterChannelName(type, count);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`New name would be: "${newName}"`);
    }
    
    if (channel.name !== newName) {
      try {
        await channel.setName(newName);
        if (process.env.NODE_ENV !== 'production') {
          logger.debug(`Updated channel name to: "${newName}"`);
        }

        try {
          await logEvent({
            client,
            guildId: guild.id,
            eventType: EVENT_TYPES.COUNTER_UPDATE,
            data: {
              title: 'Counter Updated',
              lines: [
                formatLogLine('Type', getCounterTypeLabel(type)),
                formatLogLine('Count', count.toString()),
                formatLogLine('Channel', channel.toString()),
              ],
              channelId: channel.id,
            },
          });
        } catch (error) {
          logger.debug('Error logging counter update:', error);
        }

      } catch (error) {
        logger.error(`Failed to update channel name for ${channel.id}:`, error);
        return false;
      }
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Channel name already correct, no update needed');
      }
    }
    return true;
  } catch (error) {
    logger.error("Error updating counter:", error);
    return false;
  }
}

export async function getServerCounters(client, guildId) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for getServerCounters');
      return [];
    }
    
    const data = await client.db.get(getServerCountersKey(guildId));
    
    let counters = [];
    
    if (data && typeof data === 'object' && data.ok && Array.isArray(data.value)) {
      counters = data.value;
    } else if (Array.isArray(data)) {
      counters = data;
    } else if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        counters = Array.isArray(parsed) ? parsed : [];
      } catch {
        counters = [];
      }
    } else if (data && typeof data === 'object' && !data.ok && isValidCounterShape(data)) {
      counters = [data];
    } else {
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('No counter data found, returning empty array');
      }
      return [];
    }

    return sanitizeCounters(counters, guildId);
  } catch (error) {
    logger.error("Error getting server counters:", error);
    return [];
  }
}

export async function saveServerCounters(client, guildId, counters) {
  try {
    if (!client || !client.db) {
      logger.warn('Database not available for saveServerCounters');
      return false;
    }
    
    const sanitizedCounters = sanitizeCounters(counters, guildId);

    if (process.env.NODE_ENV !== 'production') {
      logger.debug(`Saving ${sanitizedCounters.length} counters for guild ${guildId}:`, sanitizedCounters);
    }

    await client.db.set(getServerCountersKey(guildId), sanitizedCounters);
    if (process.env.NODE_ENV !== 'production') {
      logger.debug('Counters saved successfully');
    }
    return true;
  } catch (error) {
    logger.error("Error saving server counters:", error);
    return false;
  }
}

/**
 * =========================
 * CENSUS / KINGDOM REGISTER
 * =========================
 *
 * These values are stored independently from the generic counter list so the
 * last join/ban survives bot restarts when PostgreSQL is available.
 */
export const DEFAULT_CENSUS_CONFIG = {
  countMode: 'all',
  countRoleId: null,
  membersChannelId: null,
  lastJoinChannelId: null,
  lastBanChannelId: null,
  names: {
    members: '👥・Members {count}',
    lastJoin: '🆕・Last arrival {user}',
    lastBan: '☠️・Last execution {user}',
  },
};

function cloneDefaultCensusConfig() {
  return {
    ...DEFAULT_CENSUS_CONFIG,
    names: { ...DEFAULT_CENSUS_CONFIG.names },
  };
}

function mergeCensusConfig(value) {
  const base = cloneDefaultCensusConfig();
  if (!value || typeof value !== 'object') return base;

  return {
    ...base,
    countMode: value.countMode === 'role' ? 'role' : 'all',
    countRoleId: typeof value.countRoleId === 'string' ? value.countRoleId : null,
    membersChannelId: typeof value.membersChannelId === 'string' ? value.membersChannelId : null,
    lastJoinChannelId: typeof value.lastJoinChannelId === 'string' ? value.lastJoinChannelId : null,
    lastBanChannelId: typeof value.lastBanChannelId === 'string' ? value.lastBanChannelId : null,
    names: {
      ...base.names,
      ...(value.names && typeof value.names === 'object' ? value.names : {}),
    },
  };
}

export async function getCensusConfig(client, guildId) {
  const defaults = cloneDefaultCensusConfig();
  try {
    if (!client?.db) return defaults;
    const data = await client.db.get(getCensusConfigKey(guildId));
    if (data) return mergeCensusConfig(data);

    // Backwards compatibility with the first census implementation.
    const legacy = {
      membersChannelId: process.env.CENSUS_MEMBERS_CHANNEL_ID?.trim() || null,
      lastJoinChannelId: process.env.CENSUS_LAST_JOIN_CHANNEL_ID?.trim() || null,
      lastBanChannelId: process.env.CENSUS_LAST_BAN_CHANNEL_ID?.trim() || null,
      countRoleId: process.env.CENSUS_RESIDENT_ROLE_ID?.trim() || null,
      countMode: process.env.CENSUS_RESIDENT_ROLE_ID?.trim() ? 'role' : 'all',
    };
    const hasLegacy = Object.values(legacy).some(Boolean);
    return hasLegacy ? mergeCensusConfig(legacy) : defaults;
  } catch (error) {
    logger.error(`Error getting census config for guild ${guildId}:`, error);
    return defaults;
  }
}

export async function saveCensusConfig(client, guildId, config) {
  try {
    if (!client?.db) return false;
    const normalized = mergeCensusConfig(config);
    await client.db.set(getCensusConfigKey(guildId), normalized);
    return true;
  } catch (error) {
    logger.error(`Error saving census config for guild ${guildId}:`, error);
    return false;
  }
}

export async function getCensusStats(client, guildId) {
  const empty = { lastJoin: null, lastBan: null };
  try {
    if (!client?.db) return empty;
    const data = await client.db.get(getCensusStatsKey(guildId), empty);
    if (!data || typeof data !== 'object') return empty;
    return {
      lastJoin: data.lastJoin && typeof data.lastJoin === 'object' ? data.lastJoin : null,
      lastBan: data.lastBan && typeof data.lastBan === 'object' ? data.lastBan : null,
    };
  } catch (error) {
    logger.error(`Error getting census stats for guild ${guildId}:`, error);
    return empty;
  }
}

async function saveCensusStats(client, guildId, stats) {
  try {
    if (!client?.db) return false;
    return await client.db.set(getCensusStatsKey(guildId), {
      lastJoin: stats.lastJoin ?? null,
      lastBan: stats.lastBan ?? null,
    });
  } catch (error) {
    logger.error(`Error saving census stats for guild ${guildId}:`, error);
    return false;
  }
}

function cleanChannelNamePart(value, fallback = 'Unknown') {
  const cleaned = String(value ?? '')
    .replace(/[\\/@#:`<>|*?]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || fallback).slice(0, 70);
}

async function fetchGuildChannel(guild, channelId) {
  if (!channelId) return null;
  let channel = guild.channels.cache.get(channelId);
  if (!channel) {
    try {
      channel = await guild.channels.fetch(channelId);
    } catch {
      channel = null;
    }
  }
  return channel;
}

async function renameCensusChannel(guild, channelId, newName) {
  if (!channelId) return false;
  const channel = await fetchGuildChannel(guild, channelId);
  if (!channel || typeof channel.setName !== 'function') return false;
  if (channel.name === newName) return true;

  try {
    await channel.setName(newName);
    return true;
  } catch (error) {
    logger.error(`Failed to rename census channel ${channelId} in guild ${guild.id}:`, error);
    return false;
  }
}

function applyCensusTemplate(template, values, fallback) {
  const source = typeof template === 'string' && template.trim() ? template.trim() : fallback;
  return source
    .replaceAll('{count}', String(values.count ?? 0))
    .replaceAll('{user}', cleanChannelNamePart(values.user, 'Unknown'))
    .slice(0, 100);
}

/**
 * Update all configured Census channels. Configuration is stored per guild in the database.
 */
export async function updateCensusChannels(client, guild) {
  try {
    if (!client?.db || !guild) return false;

    const config = await getCensusConfig(client, guild.id);
    const hasAnyChannel = config.membersChannelId || config.lastJoinChannelId || config.lastBanChannelId;
    if (!hasAnyChannel) return false;

    let memberCollection = guild.members.cache;
    try {
      memberCollection = await guild.members.fetch();
    } catch {
      // Cache fallback remains available.
    }

    let residentCount;
    if (config.countMode === 'role' && config.countRoleId) {
      const role = guild.roles.cache.get(config.countRoleId);
      residentCount = role ? role.members.size : 0;
    } else {
      residentCount = typeof guild.memberCount === 'number' ? guild.memberCount : memberCollection.size;
    }

    const stats = await getCensusStats(client, guild.id);
    const joinUser = stats.lastJoin?.displayName || stats.lastJoin?.tag || stats.lastJoin?.username;
    const banUser = stats.lastBan?.displayName || stats.lastBan?.tag || stats.lastBan?.username;

    const countName = applyCensusTemplate(config.names.members, { count: residentCount }, DEFAULT_CENSUS_CONFIG.names.members.replace('{count}', residentCount));
    const joinName = stats.lastJoin
      ? applyCensusTemplate(config.names.lastJoin, { user: joinUser }, DEFAULT_CENSUS_CONFIG.names.lastJoin.replace('{user}', cleanChannelNamePart(joinUser)))
      : applyCensusTemplate(config.names.lastJoin, { user: 'None' }, '🆕・Last arrival None');
    const banName = stats.lastBan
      ? applyCensusTemplate(config.names.lastBan, { user: banUser }, DEFAULT_CENSUS_CONFIG.names.lastBan.replace('{user}', cleanChannelNamePart(banUser)))
      : applyCensusTemplate(config.names.lastBan, { user: 'None' }, '☠️・Last execution None');

    await Promise.all([
      renameCensusChannel(guild, config.membersChannelId, countName),
      renameCensusChannel(guild, config.lastJoinChannelId, joinName),
      renameCensusChannel(guild, config.lastBanChannelId, banName),
    ]);

    return true;
  } catch (error) {
    logger.error(`Error updating census channels in guild ${guild?.id}:`, error);
    return false;
  }
}

export async function recordCensusJoin(client, member) {
  if (!member?.guild || !isCensusGuild(member.guild.id)) return false;

  const user = member.user;
  const stats = await getCensusStats(client, member.guild.id);
  stats.lastJoin = {
    id: user.id,
    username: user.username,
    displayName: member.displayName || user.displayName || user.username,
    tag: user.tag,
    timestamp: new Date().toISOString(),
  };

  await saveCensusStats(client, member.guild.id, stats);
  return updateCensusChannels(client, member.guild);
}

export async function recordCensusBan(client, ban) {
  if (!ban?.guild || !isCensusGuild(ban.guild.id)) return false;

  const user = ban.user;
  const stats = await getCensusStats(client, ban.guild.id);
  stats.lastBan = {
    id: user.id,
    username: user.username,
    displayName: user.globalName || user.username,
    tag: user.tag,
    timestamp: new Date().toISOString(),
  };

  await saveCensusStats(client, ban.guild.id, stats);
  return updateCensusChannels(client, ban.guild);
}

