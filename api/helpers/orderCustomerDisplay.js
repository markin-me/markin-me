'use strict';

// Display only: a guest phone must never assign ownership of an order.
const orderCustomerDisplayNameSql = `CASE
  WHEN o.customer_id IS NOT NULL THEN COALESCE(
    (SELECT NULLIF(TRIM(c.name),'') FROM cust_customers c
      WHERE c.tenant_id=o.tenant_id AND c.id=o.customer_id LIMIT 1),o.customer_name)
  WHEN o.guest_session_hash IS NOT NULL THEN COALESCE(
    (SELECT NULLIF(TRIM(c.name),'') FROM cust_customers c
      WHERE c.tenant_id=o.tenant_id AND c.phone=o.customer_phone AND c.is_active=1
      ORDER BY c.id LIMIT 1),'Гость')
  ELSE o.customer_name END`;
const orderCustomerDisplayPhotoSql = `(SELECT c.photo FROM cust_customers c WHERE c.tenant_id=o.tenant_id
  AND c.is_active=1 AND (o.customer_id IS NOT NULL AND c.id=o.customer_id
    OR o.customer_id IS NULL AND o.guest_session_hash IS NOT NULL AND c.phone=o.customer_phone)
  ORDER BY c.id LIMIT 1)`;

async function publishCustomerNameChanged({db,ordersEvents,tenantId,guestSessionHash,customerId}) {
  const owner = guestSessionHash ? 'o.guest_session_hash=? AND o.customer_id IS NULL' : 'o.customer_id=?';
  if (!guestSessionHash && !(Number(customerId)>0)) return;
  const [orders] = await db.query(`SELECT o.id,o.store_id,${orderCustomerDisplayNameSql} AS customer_name
    FROM order_orders o WHERE o.tenant_id=? AND o.is_active=1 AND ${owner}`,
  [tenantId,guestSessionHash || customerId]);
  for (const order of orders) ordersEvents?.publish(tenantId,order.store_id,'order.customer-name',{
    id:Number(order.id),store_id:Number(order.store_id),customer_name:order.customer_name,
  });
}

module.exports = {orderCustomerDisplayNameSql,orderCustomerDisplayPhotoSql,publishCustomerNameChanged};
