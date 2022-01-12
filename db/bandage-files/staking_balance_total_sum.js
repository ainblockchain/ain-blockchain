module.exports = {
  data: [
    {
      path: ['rules', 'staking', 'balance_total_sum'],
      value: {
        '.rule': {
          'write': 'auth.fid === \'_stake\' || auth.fid === \'_unstake\''
        }
      },
      prevValue: null
    }
  ]
};
