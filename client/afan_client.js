
const RequestManager = require('./request_manager')
const ProfitManager = require('./profit_manager')

const INVEST_FEE = 0.1
const APP_NAME = 'afan'

class AfanClient {

  constructor(endpoint) {
    this.endpoint = endpoint
  }

  tx_invest(from, to, value) {
    let requestManager = new RequestManager(this.endpoint, APP_NAME)
    requestManager.increaseBalance(from, -value)
    requestManager.increaseInvestorBalance(to, from, value)
    requestManager.increaseInvestTotal(to, value)
    requestManager.increaseInvestNetTotal(to, value)
    const afterFee = value * (1 - INVEST_FEE)
    requestManager.increaseBalance(to, afterFee)
    requestManager.increaseActivityProfit(to, afterFee)
    requestManager.increasePortfolioInvest(from, to, value)
    return requestManager.send();
  }

  async shareProfit(requestManager, from , to, value) {
    let investorsResponse = await requestManager.getInvestors(to)
    let investors = investorsResponse.result
    requestManager.increaseBalance(from, -value)
    let profitManager = new ProfitManager(to, from, investors, requestManager,
        false)
    profitManager.updateProfit(value)
  }

  async tx_crushOnPost(from, to, pid, value) {
    let requestManager = new RequestManager(this.endpoint, APP_NAME)
    await this.shareProfit(requestManager, from , to, value)
    requestManager.increasePostCrushOn(to, pid, from, value)

    return requestManager.send();
  }

  async tx_crushOnReply(from, to, pid, rid, value) {
    let requestManager = new RequestManager(this.endpoint, APP_NAME)
    await this.shareProfit(requestManager, from , to, value)
    requestManager.increaseReplyCrushOn(pid, rid, from, value)

    return requestManager.send();
  }

  async tx_adpropose(from, to, value, intermed) {
    console.log('adpropose')
    let requestManager = new RequestManager(this.endpoint, APP_NAME)
    let state = await requestManager.getAdState(from, to)
    console.log('state: ' + state.result)
    if (state.result && state.result !==3) {
      return {code: -4, message: "Already proposed"}
    }
    requestManager.increaseBalance(from, -value)
    requestManager.increaseBalance(intermed, value)
    requestManager.setAdState(from, to, 0)
    return requestManager.send()
  }
}


module.exports = AfanClient
