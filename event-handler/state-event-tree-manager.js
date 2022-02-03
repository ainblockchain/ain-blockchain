const logger = new (require('../logger'))('STATE_EVENT_TREE_MANAGER');
const CommonUtil = require('../common/common-util');
const EVENT_NODE_LABEL = '.event';

class StateEventTreeManager {
  constructor() {
    this.stateEventTree = {};
  }

  isValidPathForStateEventTree(parsedPath) {
    const stateEventTreePathPatternRegex = /^\$?[a-zA-Z_]+$/;
    for (const label of parsedPath) {
      if (stateEventTreePathPatternRegex.test(label) === false) {
        return false;
      }
    }
    return true;
  }

  registerEventFilterId(valuePath, filterId) {
    const parsedValuePath = CommonUtil.parsePath(valuePath);
    let currNode = this.stateEventTree;
    for (let [idx, label] of parsedValuePath.entries()) {
      if (CommonUtil.isVariableLabel(label)) {
        label = '*';
      }
      if (!currNode[label]) {
        currNode[label] = {};
      }
      if (idx === parsedValuePath.length - 1) { // Last node case
        if (!currNode[label][EVENT_NODE_LABEL]) {
          currNode[label][EVENT_NODE_LABEL] = {
            filterIdSet: new Set(),
          };
        }
        currNode[label][EVENT_NODE_LABEL].filterIdSet.add(filterId);
      } else {
        currNode = currNode[label];
      }
    }
  }

  deregisterEventFilterId(filterId) {
    // TODO(cshcomcom): Implement and connect with ain-js
  }

  findMatchedEventFilterIdListRecursive(currNode, depth, parsedValuePath) {
    const matchedEventFilterIds = [];
    if (depth === parsedValuePath.length - 1) { // Last node case
      const eventNode = currNode[EVENT_NODE_LABEL];
      if (eventNode) {
        const filterIdSet = eventNode.filterIdSet;
        matchedEventFilterIds.push(...filterIdSet);
      }
      return matchedEventFilterIds;
    }

    const wildcardNode = currNode['*'];
    if (wildcardNode) {
      matchedEventFilterIds.push(
          ...this.findMatchedEventFilterIdListRecursive(wildcardNode, depth + 1, parsedValuePath));
    }

    const nextNode = currNode[parsedValuePath[depth + 1]];
    if (nextNode) {
      matchedEventFilterIds.push(
          ...this.findMatchedEventFilterIdListRecursive(nextNode, depth + 1, parsedValuePath));
    }

    return matchedEventFilterIds;
  }

  findMatchedEventFilterIdList(parsedValuePath) {
    return this.findMatchedEventFilterIdListRecursive(this.stateEventTree, -1, parsedValuePath)
  }
}

module.exports = StateEventTreeManager;
