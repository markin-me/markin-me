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
    courierAvailableStatusIds: [0, 1, 2],
    courierTransitStatusId: 3,
    courierDeliveredStatusId: 4,
    courierCanceledStatusIds: [5],
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
