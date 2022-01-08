module.exports = {
  data: [
    {
      path: ['rules', 'checkin', 'requests', '$network_name', '$chain_id', '$token_id', '$user_addr', '$checkin_id'],
      value: {
        '.rule': {
          'write': '((auth.fid === \'_closeCheckin\' || auth.addr === $user_addr) && data !== null && newData === null) || (data === null && auth.addr === $user_addr && util.validateCheckinRequestData($network_name, $chain_id, $token_id, auth.addr, $checkin_id, newData, currentTime, getValue)) && util.checkValuePathLen(parsedValuePath, 7) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': '((auth.fid === \'_closeCheckin\' || auth.addr === $user_addr) && data !== null && newData === null) || (data === null && auth.addr === $user_addr && util.validateCheckinRequestData($network_name, $chain_id, $token_id, auth.addr, $checkin_id, newData, currentTime, getValue))'
        }
      }
    },
    {
      path: ['rules', 'checkout', 'requests', '$network_name', '$chain_id', '$token_id', '$user_addr', '$checkout_id'],
      value: {
        '.rule': {
          'write': '(auth.fid === \'_closeCheckout\' && newData === null) || (data === null && auth.addr === $user_addr && util.validateCheckoutRequestData($network_name, $chain_id, $token_id, auth.addr, $checkout_id, newData, currentTime, getValue)) && util.checkValuePathLen(parsedValuePath, 7) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': '(auth.fid === \'_closeCheckout\' && newData === null) || (data === null && auth.addr === $user_addr && util.validateCheckoutRequestData($network_name, $chain_id, $token_id, auth.addr, $checkout_id, newData, currentTime, getValue))'
        }
      }
    },
    {
      path: ['rules', 'consensus', 'number', '$number', 'propose'],
      value: {
        '.rule': {
          'write': 'util.validateConsensusProposalData(newData, auth.addr, $number, getValue) === true && util.checkValuePathLen(parsedValuePath, 4) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'util.validateConsensusProposalData(newData, auth.addr, $number, getValue) === true'
        }
      }
    },
    {
      path: ['rules', 'consensus', 'number', '$number', '$block_hash', 'vote', '$user_addr'],
      value: {
        '.rule': {
          'write': 'auth.addr === $user_addr && data === null && util.validateConsensusVoteData(newData, auth.addr, $block_hash, getValue) === true && util.checkValuePathLen(parsedValuePath, 6) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'auth.addr === $user_addr && data === null && util.validateConsensusVoteData(newData, auth.addr, $block_hash, getValue) === true'
        }
      }
    },
    {
      path: ['rules', 'escrow', '$source_account', '$target_account', '$escrow_key', 'hold', '$record_id'],
      value: {
        '.rule': {
          'write': '((util.isServAcntName($source_account) && util.isAppAdminFromServAcntName($source_account, auth.addr, getValue) === true) || (util.isCksumAddr($source_account) && $source_account === auth.addr)) && getValue(\'/escrow/\' + $source_account + \'/\' + $target_account + \'/\' + $escrow_key + \'/config\') !== null && data === null && util.isDict(newData) && util.checkValuePathLen(parsedValuePath, 6) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': '((util.isServAcntName($source_account) && util.isAppAdminFromServAcntName($source_account, auth.addr, getValue) === true) || (util.isCksumAddr($source_account) && $source_account === auth.addr)) && getValue(\'/escrow/\' + $source_account + \'/\' + $target_account + \'/\' + $escrow_key + \'/config\') !== null && data === null && util.isDict(newData)'
        }
      }
    },
    {
      path: ['rules', 'escrow', '$source_account', '$target_account', '$escrow_key', 'release', '$record_id'],
      value: {
        '.rule': {
          'write': 'getValue(\'/escrow/\' + $source_account + \'/\' + $target_account + \'/\' + $escrow_key + \'/config/admin/\' + auth.addr) === true && data === null && util.isDict(newData) && util.isNumber(newData.ratio) && 0 <= newData.ratio && newData.ratio <= 1 && util.checkValuePathLen(parsedValuePath, 6) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'getValue(\'/escrow/\' + $source_account + \'/\' + $target_account + \'/\' + $escrow_key + \'/config/admin/\' + auth.addr) === true && data === null && util.isDict(newData) && util.isNumber(newData.ratio) && 0 <= newData.ratio && newData.ratio <= 1'
        }
      }
    },
    {
      path: ['rules', 'gas_fee', 'claim', '$user_addr', '$record_id'],
      value: {
        '.rule': {
          'write': 'auth.addr === $user_addr && util.validateClaimRewardData(auth.addr, newData, getValue) === true && util.checkValuePathLen(parsedValuePath, 4) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'auth.addr === $user_addr && util.validateClaimRewardData(auth.addr, newData, getValue) === true'
        }
      }
    },
    {
      path: ['rules', 'manage_app', '$app_name'],
      value: {
        'config': {
          'admin': {
            '.rule': {
              'write': '(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppAdminConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true'
            }
          },
          'billing': {
            '.rule': {
              'write': '(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppBillingConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true'
            }
          },
          'is_public': {
            '.rule': {
              'write': '(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppIsPublicConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true'
            }
          },
          'service': {
            '.rule': {
              'write': '(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppServiceConfig(newData) && util.checkValuePathLen(parsedValuePath, 4) === true'
            }
          }
        },
        'create': {
          '$record_id': {
            '.rule': {
              'write': 'data === null && getValue(\'/manage_app/\' + $app_name + \'/config\') === null && util.isDict(newData) && util.checkValuePathLen(parsedValuePath, 4) === true'
            }
          }
        }
      },
      prevValue: {
        'config': {
          'admin': {
            '.rule': {
              'write': `(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppAdminConfig(newData)`
            }
          },
          'billing': {
            '.rule': {
              'write': `(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppBillingConfig(newData)`
            }
          },
          'is_public': {
            '.rule': {
              'write': `(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppIsPublicConfig(newData)`
            }
          },
          'service': {
            '.rule': {
              'write': `(auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true) && util.validateManageAppServiceConfig(newData)`
            }
          }
        },
        'create': {
          '$record_id': {
            '.rule': {
              'write': `data === null && getValue(\'/manage_app/\' + $app_name + \'/config\') === null && util.isDict(newData)`
            }
          }
        }
      }
    },
    {
      path: ['rules', 'payments', '$service_name', '$user_addr', '$payment_key', 'claim', '$record_id'],
      value: {
        '.rule': {
          'write': 'util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0 && (util.isCksumAddr(newData.target) || util.isServAcntName(newData.target)) && util.checkValuePathLen(parsedValuePath, 6) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0 && (util.isCksumAddr(newData.target) || util.isServAcntName(newData.target))'
        }
      }
    },
    {
      path: ['rules', 'payments', '$service_name', '$user_addr', '$payment_key', 'pay', '$record_id'],
      value: {
        '.rule': {
          'write': 'util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0 && util.checkValuePathLen(parsedValuePath, 6) === true'
        }
      },
      prevValue: {
        '.rule': {
          'write': 'util.isAppAdmin($service_name, auth.addr, getValue) === true && data === null && util.isDict(newData) && util.isNumber(newData.amount) && newData.amount > 0'
        }
      }
    }
  ]
};

