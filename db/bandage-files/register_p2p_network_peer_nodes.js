module.exports = {
  data: [
    {
      path: ['rules', 'p2p_network', 'peer_nodes', '$node_addr'],
      value: {
        ".rule": {
          "write": "auth.addr === $node_addr && util.isString(newData) && util.length(newData) === 66"
        }
      },
      prevValue: null
    }
  ]
};
