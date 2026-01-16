export const REVEAL_SOON_ABI = [
  {
    type: 'function',
    name: 'createMessage',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'publicText', type: 'string' },
      { name: 'privateText', type: 'string' },
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
    name: 'getMessageHeader',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'author', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'revealAt', type: 'uint64' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getMessagesRange',
    stateMutability: 'view',
    inputs: [
      { name: 'start', type: 'uint256' },
      { name: 'count', type: 'uint256' }
    ],
    outputs: [
      {
        name: '',
        type: 'tuple[]',
        components: [
          { name: 'id', type: 'uint256' },
          { name: 'author', type: 'address' },
          { name: 'createdAt', type: 'uint64' },
          { name: 'revealAt', type: 'uint64' }
        ]
      }
    ]
  },
  {
    type: 'function',
    name: 'getPublicText',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    type: 'function',
    name: 'getPrivateText',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }]
  },
  {
    type: 'function',
    name: 'isRevealed',
    stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  }
];
