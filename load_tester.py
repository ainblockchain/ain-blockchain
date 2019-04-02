#!/usr/bin/env python3

RANDOM_OPERATION = [
  ["set", {"ref": "test/comeonnnnnnn", "value": "testme"}],
  ["set", {"ref": "test/comeonnnnnnn", "value": "no meeeee"}],
  ["set", {"ref": "test/comeon/nnnnnn", "value": "through"}],
  ["set", {"ref": "test/comeonnnnnnn/new", "value": {"new": "path"}}],
  ["set", {"ref": "test/builed/some/deep", "value": {"place": {"next":1, "level": "down"}}}],
  ["set", {"ref": "test/builed/heliii", "value": {"range": [1, 2, 3, 1, 4, 5]}}],
  ["set", {"ref": "test/b/u/i/l/e/d/hel", "value": {"range": [1, 4, 5], "another": [234]}}],
  ["set", {"ref": "test/b/u/i/l/e/d/hel", "value": "very nested"}],
  ["set", {"ref": "test/b/u/i/l/e/d/hel", "value": {1:2,3:4,5:6}}],
  ["set", {"ref": "test/new/final/path", "value": {"neste": [1, 2, 3, 4, 5]}}],
  ["set", {"ref": "test/new/final/path", "value": {"more": {"now":12, "hellloooo": 123}}}],
  ["increase", {"diff": {"test/increase/first/level": 10, "test/increase/first/level2": 20}}],
  ["increase", {"diff": {"test/increase/second/level/deeper": 20, "test/increase/second/level/deeper": 1000}}],
  ["increase", {"diff": {"test/increase": 1}}],
  ["increase", {"diff": {"test/new":1, "test/b": 30}}],
  ["increase", {"diff": {"test/increase": -10000, "test/increase": 10000}}],
  ["increase", {"diff": {"test/b/u": 10000}}],
  ["increase", {"diff": {"test/builed/some/deep/place/next": 100002}}],
  ["update", {"data": {"test/increase/first/level": 10, "test/increase/first/level2": 20}}],
  ["update", {"data": {"test/increase/second/level/deeper": 20, "test/increase/second/level/deeper": 1000}}],
  ["update", {"data": {"test/increase": 1}}],
  ["update", {"data": {"test/new":1, "test/b": 30}}],
  ["update", {"data": {"test/increase": 10000, "test/increase": 10000}}],
  ["update", {"data": {"test/b/u": 10000}}],
  ["update", {"data": {"test/builed/some/deep/place/next": 100002}}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/comeonnnnnnn", "value": "testme"}, {"op": "update", "data": {"test/b/u": 10000}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/comeonnnnnnn", "value": "no meeeee"}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/comeon/nnnnnn", "value": "through"}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/comeonnnnnnn/new", "value": {"new": "path"}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/builed/some/deep", "value": {"place": {"next":1, "level": "down"}}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/builed/heliii", "value": {"range": [1, 2, 3, 1, 4, 5]}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/b/u/i/l/e/d/hel", "value": {"range": [1, 4, 5], "another": [234]}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/b/u/i/l/e/d/hel", "value": "very nested"}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/b/u/i/l/e/d/hel", "value": {1:2,3:4,5:6}}]}],
  ["batch", {"batch_list": [{"op": "set", "ref": "test/new/final/path", "value": {"neste": [1, 2, 3, 4, 5]}}]}]
]


import random
import grequests
import time
import json
from itertools import cycle

urls = ['http://127.0.0.1:8080', 'http://127.0.0.1:8081', 'http://127.0.0.1:8082'] * 300
start = time.time()
rs = (grequests.post("{}/{}".format(url, op[0]), json=op[1]) for url, op in zip(urls, cycle(RANDOM_OPERATION)))
res = grequests.map(rs)
print("Time taken : {}".format(time.time() - start))
indices_of_none = []
indices_of_errors = []
total_requests = len(res)

for i in range(total_requests):
    if res[i] is None:
        indices_of_none.append(i)
    elif res[i].status_code >= 400:
        indices_of_errors.append(i)

print("Total Sent {}".format(total_requests))
print("Total Successful {}".format(total_requests - len(indices_of_none) - len(indices_of_errors)))
print("Indices of errored requests {}".format(indices_of_errors))
print("Indices of requests not returned {}".format(indices_of_none))



