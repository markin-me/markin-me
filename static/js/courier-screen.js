(function () {
  window.OrderWorkspaceConfig = {
    mode: "courier",
    cacheScope: "courier",
    deliveryMethodCode: "delivery",
    defaultBucketId: "available",
    courierBuckets: [
      { id: "available", title: "Свободные", icon: "fa-user-clock" },
      { id: "in-transit", title: "В пути", icon: "fa-truck" },
      { id: "delivered", title: "Доставлены", icon: "fa-circle-check" },
    ],
    courierTransitAliases: [
      "delivery",
      "delivering",
      "on_the_way",
      "on-the-way",
      "in_transit",
      "in-transit",
      "courier",
      "dispatch",
      "shipping",
      "в пути",
      "в_пути",
      "в_дороге",
      "на_доставке",
      "доставляется",
      "едет",
    ],
  };
})();
