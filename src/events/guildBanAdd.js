import { Events } from 'discord.js';
import { logEvent, EVENT_TYPES } from '../services/loggingService.js';
import { recordCensusBan } from '../services/serverstatsService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.GuildBanAdd,
  once: false,

  async execute(ban, client) {
    try {
      const { guild, user } = ban;

      try {
        await logEvent({
          client,
          guildId: guild.id,
          eventType: EVENT_TYPES.MODERATION_BAN,
          data: {
            title: 'User banned',
            lines: [
              `**User:** ${user.toString()} (${user.tag})`,
              `**ID:** \`${user.id}\``,
              `**Members:** ${guild.memberCount}`,
            ],
            quoted: false,
            thumbnail: user.displayAvatarURL({ dynamic: true }),
            userId: user.id,
          },
        });
      } catch (error) {
        logger.debug('Error logging member ban:', error);
      }

      await recordCensusBan(client, ban);
    } catch (error) {
      logger.error('Error in guildBanAdd event:', error);
    }
  },
};
