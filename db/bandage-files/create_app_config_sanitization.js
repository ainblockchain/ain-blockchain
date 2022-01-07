module.exports = {
  data: [
    {
      path: ['rules', 'manage_app', '$app_name'],
      value: {
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
      },
      prevValue: {
        'config': {
          '.rule': {
            'write': 'auth.fid === \'_createApp\' || util.isAppAdmin($app_name, auth.addr, getValue) === true'
          }
        },
        'create': {
          '$record_id': {
            '.rule': {
              'write': 'data === null && getValue(\'/manage_app/\' + $app_name + \'/config\') === null && util.isDict(newData)'
            }
          }
        }
      }
    }
  ]
};
