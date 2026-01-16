export const REVEAL_SOON_ABI = [
  {
    type: 'function',
    name: 'createMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'payload', type: 'string' },
      { name: 'delaySeconds', type: 'uint32' }
    ],
    outputs: [{ name: 'id', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getMessagesCount',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    type: 'function',
    name: 'getRecentMessages',
    stateMutability: 'view',
    inputs: [
      { name: 'limit', type: 'uint256' },
      { name: 'offset', type: 'uint256' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'author', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'revealAt', type: 'uint64' },
          { name: 'isRevealedNow', type: 'bool' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getMessagePayload',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }]
  }
];
