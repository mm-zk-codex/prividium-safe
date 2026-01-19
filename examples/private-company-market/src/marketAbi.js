export const PRIVATE_MARKET_ABI = [
  {
    type: 'function',
    name: 'createMarket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'question', type: 'string' },
      { name: 'closeTime', type: 'uint64' }
    ],
    outputs: [{ name: 'marketId', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getMarketsCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getRecentMarkets',
    stateMutability: 'view',
    inputs: [
      { name: 'limit', type: 'uint256' },
      { name: 'offset', type: 'uint256' }
    ],
    outputs: [
      {
        name: 'markets',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'question', type: 'string' },
          { name: 'closeTime', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'totalYes', type: 'uint256' },
          { name: 'totalNo', type: 'uint256' },
          { name: 'outcome', type: 'uint8' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getMarket',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      {
        name: 'market',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'question', type: 'string' },
          { name: 'closeTime', type: 'uint64' },
          { name: 'status', type: 'uint8' },
          { name: 'totalYes', type: 'uint256' },
          { name: 'totalNo', type: 'uint256' },
          { name: 'outcome', type: 'uint8' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'betYes',
    stateMutability: 'payable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'betNo',
    stateMutability: 'payable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'getMyPosition',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'yesAmount', type: 'uint256' },
      { name: 'noAmount', type: 'uint256' }
    ]
  },
  {
    type: 'function',
    name: 'quotePayout',
    stateMutability: 'view',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getMyClaimStatus',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'resolve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'outcomeYes', type: 'bool' }
    ],
    outputs: []
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: []
  },
  {
    type: 'function',
    name: 'isMember',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'isCreator',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }]
  },
  {
    type: 'function',
    name: 'isResolver',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ type: 'bool' }]
  }
];
