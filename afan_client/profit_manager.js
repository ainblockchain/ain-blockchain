
class ProfitManager {
  constructor(to, from, investors, requestManager, isAds) {
    this.to = to;
    this.from = from;
    this.investors = investors;
    this.requestManager = requestManager;
    this.isAds = isAds;
  }

  increaseProfit(value) {
    this.requestManager.increaseBalance(this.to, value);
    if (this.isAds) {
      this.requestManager.increaseAdsProfit(this.to, value);
    } else {
      this.requestManager.increaseActivityProfit(this.to, value);
    }
  }

  updateProfit(value) {
    let sum = 0.0;
    if (this.investors) {
      for (const key in this.investors) {
        if (key !== this.from && key !== this.to) {
          sum += this.investors[key];
        }
      }
    }

    if (sum === 0.0) {
      this.increaseProfit(value);
    } else {
      const half_value = value * 0.5;
      this.increaseProfit(half_value);
      for (const key in this.investors) {
        if (key !== this.from && key !== this.to) {
          const portion = half_value * this.investors[key] / sum;
          this.requestManager.increaseBalance(key, portion);
          this.requestManager.increaseInvestProfit(key, portion);
          this.requestManager.increasePortfolioProfit(key, this.to, portion);
        }
      }
    }
  }
}

module.exports = ProfitManager;
