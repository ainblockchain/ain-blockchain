module.exports = {
  data: [
    {
      path: ['rules', 'escrow', '$source_account', '$target_account', '$escrow_key', 'hold', '$record_id'],
      value: {
        ".rule": {
          "state": {
            "gc_max_siblings": 200,
            "gc_num_siblings_deleted": 100
          },
          "write": "((util.isServAcntName($source_account, blockNumber) && util.isAppAdminFromServAcntName($source_account, auth.addr, getValue) === true) || (util.isCksumAddr($source_account) && $source_account === auth.addr)) && getValue('/escrow/' + $source_account + '/' + $target_account + '/' + $escrow_key + '/config') !== null && data === null && util.isDict(newData)"
        }
      },
      prevValue: {
        ".rule": {
          "state": {
            "gc_max_siblings": 200,
            "gc_num_siblings_deleted": 100
          },
          "write": "((util.isServAcntName($source_account) && util.isAppAdminFromServAcntName($source_account, auth.addr, getValue) === true) || (util.isCksumAddr($source_account) && $source_account === auth.addr)) && getValue('/escrow/' + $source_account + '/' + $target_account + '/' + $escrow_key + '/config') !== null && data === null && util.isDict(newData)"
        }
      }
    },
    {
      path: ['rules', 'gas_fee', 'collect', '$block_number', '$from', '$tx_hash'],
      value: {
        ".rule": {
          "write": "(auth.addr === $from || (util.isServAcntName($from, blockNumber) && util.isBillingUser($from, auth.addr, getValue) === true)) && util.validateCollectFeeData(data, newData, $from, getValue)"
        }
      },
      prevValue: {
        ".rule": {
          "write": "(auth.addr === $from || (util.isServAcntName($from) && util.isBillingUser($from, auth.addr, getValue) === true)) && util.validateCollectFeeData(data, newData, $from, getValue)"
        }
      },
    },
    {
      path: ['rules', 'payments', '$service_name', '$user_addr', '$payment_key', 'claim', '$record_id'],
      value: {
        ".rule": {
          "state": {
            "gc_max_siblings": 200,
            "gc_num_siblings_deleted": 100
          },
          "write": "util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0 && (util.isCksumAddr(newData.target) || util.isServAcntName(newData.target, blockNumber))"
        }
      },
      prevValue: {
        ".rule": {
          "state": {
            "gc_max_siblings": 200,
            "gc_num_siblings_deleted": 100
          },
          "write": "util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0 && (util.isCksumAddr(newData.target) || util.isServAcntName(newData.target))"
        }
      }
    },
    {
      path: ['rules', 'transfer', '$from', '$to', '$key', 'value'],
      value: {
        ".rule": {
          "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from, blockNumber) || util.isCksumAddr($from)) && (util.isServAcntName($to, blockNumber) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && util.getBalance($from, getValue) >= newData"
        }
      },
      prevValue: {
        ".rule": {
          "write": "(auth.addr === $from || auth.fid === '_stake' || auth.fid === '_unstake' || auth.fid === '_pay' || auth.fid === '_claim' || auth.fid === '_hold' || auth.fid === '_release' || auth.fid === '_collectFee' || auth.fid === '_claimReward' || auth.fid === '_openCheckout' || auth.fid === '_closeCheckout' || auth.fid === '_closeCheckin') && !getValue('transfer/' + $from + '/' + $to + '/' + $key) && (util.isServAcntName($from) || util.isCksumAddr($from)) && (util.isServAcntName($to) || util.isCksumAddr($to)) && $from !== $to && util.isNumber(newData) && util.getBalance($from, getValue) >= newData"
        }
      }
    }
  ]
};
