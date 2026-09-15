# Census Configuration

The Census is configured entirely from Discord. You do not need to edit `.env` for Census settings.

## 1. Open the panel

Use:

`/serverstats census`

You need the **Manage Channels** permission.

## 2. Configure the member counter

Click **Counting mode** and choose:

- **All members** - counts every member of the server, including bots.
- **Members with a role** - counts only members who have the selected role.

When using role-based counting, click **Select role** and pick any server role.

## 3. Select the three channels

Use the channel buttons to select:

- **Member channel** - renamed to show the current count.
- **Arrival channel** - renamed to show the most recent member who joined.
- **Execution channel** - renamed to show the most recent member who was banned.

The selected channels can be voice or text channels as long as the bot can manage them.

## 4. Edit channel names

Click **Edit names** and use these placeholders:

- `{count}` - current member count.
- `{user}` - the display name of the last arrival/ban.

Example:

`Members {count}`

`Last arrival {user}`

`Last execution {user}`

Discord channel names are automatically limited to Discord's channel-name length limit and unsafe characters are stripped from user names.

## 5. Automatic updates

The Census updates when:

- a member joins;
- a member leaves;
- a member is banned;
- the bot starts/restarts;
- the scheduled statistics task runs.

The last arrival and last execution are stored in PostgreSQL, so they survive restarts when the database is working normally.

## Legacy environment variables

The older `CENSUS_*` environment variables are still accepted as a fallback for existing installations. Once you save settings from the Discord panel, the database configuration takes precedence.
