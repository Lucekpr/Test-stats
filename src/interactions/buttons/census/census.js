import { handleCensusButton, CENSUS_COMPONENTS } from '../../../commands/ServerStats/modules/census_dashboard.js';

export default Object.values(CENSUS_COMPONENTS)
  .filter((name) => name !== CENSUS_COMPONENTS.names)
  .map((name) => ({
    name,
    execute: (interaction, client) => handleCensusButton(interaction, client),
  }))
  .concat({
    name: CENSUS_COMPONENTS.names,
    execute: (interaction, client) => handleCensusButton(interaction, client),
  });
