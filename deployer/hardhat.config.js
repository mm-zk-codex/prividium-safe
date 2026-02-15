/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: {
    version: '0.8.23',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  paths: {
    sources: './contracts',
    artifacts: './artifacts',
    cache: './cache'
  }
};
