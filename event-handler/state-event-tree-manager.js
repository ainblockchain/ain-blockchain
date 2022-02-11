const logger = new (require('../logger'))('STATE_EVENT_TREE_MANAGER');
const CommonUtil = require('../common/common-util');
const { isValidStateLabel } = require('../db/state-util');
const EVENT_NODE_LABEL = '.event';
const WILDCARD_LABEL = '*';

class StateEventTreeManager {
  constructor() {
    this.stateEventTree = {};
  }

  static isValidPathForStateEventTree(parsedPath) {
    for (const label of parsedPath) {
      if (isValidStateLabel(label) === false) {
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
        label = WILDCARD_LABEL;
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
    // TODO(cshcomcom): Implement and connect with ain-js.
  }

  matchEventFilterPathRecursive(currNode, depth, parsedValuePath) {
    const matchedEventFilterIds = [];
    if (depth === parsedValuePath.length) { // Last node case
      const eventNode = currNode[EVENT_NODE_LABEL];
      if (eventNode) {
        const filterIdSet = eventNode.filterIdSet;
        matchedEventFilterIds.push(...filterIdSet);
      }
      return matchedEventFilterIds;
    }

    const wildcardNode = currNode[WILDCARD_LABEL];
    if (wildcardNode) {
      matchedEventFilterIds.push(
          ...this.matchEventFilterPathRecursive(wildcardNode, depth + 1, parsedValuePath));
    }

    const nextNode = currNode[parsedValuePath[depth + 1]];
    if (nextNode) {
      matchedEventFilterIds.push(
          ...this.matchEventFilterPathRecursive(nextNode, depth + 1, parsedValuePath));
    }

    return matchedEventFilterIds;
  }

  matchEventFilterPath(parsedValuePath) {
    return this.matchEventFilterPathRecursive(this.stateEventTree, 0, parsedValuePath)
  }
}

module.exports = StateEventTreeManager;
