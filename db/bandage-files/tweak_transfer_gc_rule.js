module.exports = {
  data: [
    {
      path: ['rules', 'transfer', '$from', '$to', '$key', '.rule' ],
      value: {
        "state": {
          "gc_max_siblings": 10,
          "gc_num_siblings_deleted": 10
        }
      },
      prevValue: {
        "state": {
          "gc_max_siblings": 200,
          "gc_num_siblings_deleted": 100
        }
      }
    }
  ]
};
