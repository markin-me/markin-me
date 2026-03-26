let checkoutBenefitsPreviewProvider = null;

function registerCheckoutBenefitsPreviewProvider(provider) {
  checkoutBenefitsPreviewProvider = provider && typeof provider === 'object'
    ? { ...provider }
    : null;
  return checkoutBenefitsPreviewProvider;
}

function getCheckoutBenefitsPreviewProvider() {
  return checkoutBenefitsPreviewProvider;
}

module.exports = {
  registerCheckoutBenefitsPreviewProvider,
  getCheckoutBenefitsPreviewProvider,
};
