const _ = require('lodash');
const Ref = require('./ref');
const axios = require('axios');

class RequestManager {
  constructor(endpoint, root) {
    this.endpoint = endpoint;
    this.root = root;
    this.updates = [];
  }

  send() {
    return axios.post(this.endpoint + '/set', { op_list: this.updates })
    .then((resp) => {
      return _.get(resp, 'data', null);
    }).catch((err) => {
      console.log(err);
      return null;
    });
  }

  getRef(ref) {
    return axios.get(this.endpoint + `/get_value?ref=${this.root}/${ref}`)
    .then((resp) => {
      return _.get(resp, 'data', null);
    }).catch((err) => {
      console.log(err);
      return null;
    });
  }

  getInvestors(uid) {
    return this.getRef(Ref.investors(uid));
  }

  getAdState(from, to) {
    return this.getRef(Ref.adagency_state(from, to));
  }

  update(ref, value) {
    this.updates.push({type: 'SET_VALUE', ref: this.root + '/' + ref, value});
  }

  setAdState(from, to) {
    this.update(Ref.adagency_state(from, to), 0);
    this.update(Ref.advertisers_state(to, from), 0);
  }

  increase(ref, value) {
    if (value > 0) {
      this.updates.push({type: 'INC_VALUE', ref: this.root + '/' + ref, value});
    } else {
      this.updates.push({type: 'DEC_VALUE', ref: this.root + '/' + ref, value: value * -1});
    }
  }

  increaseBalance(a, value) {
    this.increase(Ref.balance(a), value);
  }

  increaseActivityProfit(to, value) {
    this.increase(Ref.activity_profit(to), value);
  }

  increaseInvestProfit(to, value) {
    this.increase(Ref.invest_profit(to), value);
  }

  increaseAdsProfit(to, value) {
    this.increase(Ref.ads_profit(to), value);
  }

  increaseInvestTotal(to, value) {
    this.increase(Ref.invest_total(to), value);
  }

  increaseInvestNetTotal(to, value) {
    this.increase(Ref.invest_net_total(to), value);
  }

  increaseInvestorBalance(to, from, value) {
    this.increase(Ref.investors_amount(to, from), value);
  }

  increasePostCrushOn(to, puid, from, value) {
    this.increase(Ref.user_posts_crushOns(to, puid, from), value);
  }

  increaseReplyCrushOn(puid, rid, from, value) {
    this.increase(Ref.replies_crushOns(puid, rid, from), value);
  }

  increasePortfolioProfit(to, from, value) {
    this.increase(Ref.portfolio_profit(to, from), value);
  }

  increasePortfolioInvest(from, to, value) {
    this.increase(Ref.portfolio_invest(from, to), value);
  }
}

module.exports = RequestManager;
