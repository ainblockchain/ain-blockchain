const path = require('path');
const { signAndSendTx, confirmTransaction } = require('../util');

let config = {};

function buildCreateAppTxBody(address, timestamp) {
  return {
    operation: {
      type: 'SET_VALUE',
      ref: `/manage_app/chatbots/create/${timestamp}`,
      value: {
        admin: { [address]: true },
      }
    },
    timestamp,
    nonce: -1
  }
}

function buildChatbotConfigTxBody(timestamp) {
  return {
    operation: {
      type: "SET",
      op_list: [
        {
          type: "SET_OWNER",
          ref: "/apps/chatbots/common/message",
          value: {
            ".owner": {
              owners: {
                "*": {
                  branch_owner: true,
                  write_function: true,
                  write_owner: true,
                  write_rule: true
                }
              }
            }
          }
        },
        {
          type: "SET_RULE",
          ref: "/apps/chatbots/common/message/$key",
          value: {
            ".rule": {
              "write": true
            }
          }
        },
        {
          type: "SET_FUNCTION",
          ref: "/apps/chatbots/common/message/$key",
          value: {
            ".function": {
              "liayoo-ainjs": {
                function_type: "REST",
                event_listener: "https://events.ainetwork.ai/trigger",
                service_name: "https://ainize.ai",
                function_id: "liayoo-ainjs"
              }
            }
          }
        }
      ]
    },
    timestamp,
    nonce: -1
  };
}

async function sendTransaction() {
  console.log('\n*** sendTransaction():');
  let timestamp = Date.now();

  const createAppTxBody = buildCreateAppTxBody(config.serviceOwnerAddr, timestamp);
  console.log(`createAppTxBody: ${JSON.stringify(createAppTxBody, null, 2)}`);

  const createAppTxInfo = await signAndSendTx(config.endpointUrl, createAppTxBody, config.serviceOwnerPrivateKey);
  console.log(`createAppTxInfo: ${JSON.stringify(createAppTxInfo, null, 2)}`);
  if (!createAppTxInfo.success) {
    console.log(`Create app transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, createAppTxInfo.txHash);

  timestamp = Date.now();
  const chatbotConfigTxBody = buildChatbotConfigTxBody(timestamp);
  console.log(`chatbotConfigTxBody: ${JSON.stringify(chatbotConfigTxBody, null, 2)}`);
  const chatbotConfigTxInfo = await signAndSendTx(config.endpointUrl, chatbotConfigTxBody, config.serviceOwnerPrivateKey);
  console.log(`chatbotConfigTxInfo: ${JSON.stringify(chatbotConfigTxInfo, null, 2)}`);
  if (!chatbotConfigTxInfo.success) {
    console.log(`Chatbot config transaction failed.`);
    process.exit(0);
  }
  await confirmTransaction(config.endpointUrl, timestamp, chatbotConfigTxInfo.txHash);
}

async function processArguments() {
  if (process.argv.length !== 3) {
    usage();
  }
  config = require(path.resolve(__dirname, process.argv[2]));
  await sendTransaction();
}

function usage() {
  console.log('\nExample commandlines:\n  node sendCreateAppAndConfigTx.js config_local.js\n')
  process.exit(0)
}

processArguments();