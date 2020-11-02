
class Ref {
  balance(a) {
    return 'balance/' + a;
  }

  activity_profit(a) {
    return 'activity_profit/' + a;
  }

  invest_profit(a) {
    return 'invest_profit/' + a;
  }

  ads_profit(a) {
    return 'ads_profit/' + a;
  }

  invest_total(a) {
    return 'invest_total/' + a;
  }

  invest_net_total(a) {
    return 'invest_net_total/' + a;
  }

  fan_count(a) {
    return 'users/' + a + '/fan_count';
  }

  username(a) {
    return '/users/' + a + '/username';
  }

  investors(to) {
    return 'investors/' + to;
  }

  investors_amount(to, from) {
    return 'investors/' + to + '/' + from;
  }

  popular_users(to) {
    return 'popular_users/' + to + '/score';
  }

  user_posts(to, puid) {
    return 'user_posts/' + to + '/' + puid;
  }

  user_posts_crushOns(to, puid, from) {
    return 'user_posts/' + to + '/' + puid + '/crushOns/' + from;
  }

  replies_crushOns(puid, rid, from) {
    return 'replies/' + puid + '/' + rid + '/crushOns/' + from;
  }

  portfolio_profit(to, from) {
    return 'portfolio/' + to + '/' + from + '/profit';
  }

  portfolio_invest(from, to) {
    return 'portfolio/' + from + '/' + to + '/invest';
  }

  replies(puid, rid) {
    return 'replies/' + puid + '/' + rid;
  }

  adagency_state(from, to) {
    return 'adagency/' + from + '/' + to + '/state';
  }

  advertisers_state(to, from) {
    return 'advertisers/' + to + '/' + from + '/state';
  }
}

module.exports = new Ref();
