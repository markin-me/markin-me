let orderBenefitsAccrualProvider = null;

function registerOrderBenefitsAccrualProvider(provider) {
  orderBenefitsAccrualProvider = provider && typeof provider === 'object'
    ? { ...provider }
    : null;
  return orderBenefitsAccrualProvider;
}

function getOrderBenefitsAccrualProvider() {
  return orderBenefitsAccrualProvider;
}

module.exports = {
  registerOrderBenefitsAccrualProvider,
  getOrderBenefitsAccrualProvider,
};
