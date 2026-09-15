import { handleCensusSelect } from '../../../commands/ServerStats/modules/census_dashboard.js';

export default [
  { name: 'census_cfg_mode', execute: handleCensusSelect },
  { name: 'census_cfg_count_channel', execute: handleCensusSelect },
  { name: 'census_cfg_join_channel', execute: handleCensusSelect },
  { name: 'census_cfg_ban_channel', execute: handleCensusSelect },
  { name: 'census_cfg_role', execute: handleCensusSelect },
];
