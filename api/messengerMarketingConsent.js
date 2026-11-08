'use strict';

async function setMarketingConsent(db, { tenantId, storeId, customerId, provider, consented, source: sourceValue }) {
  const source = sourceValue === 'storefront' ? 'storefront' : 'bot';
  await db.query(
    `INSERT INTO mkt_messenger_marketing_consents
       (tenant_id,store_id,customer_id,provider,consented,consented_at,revoked_at,source)
     VALUES (?,?,?,?,?,IF(?=1,CURRENT_TIMESTAMP(3),NULL),IF(?=0,CURRENT_TIMESTAMP(3),NULL),?)
     ON DUPLICATE KEY UPDATE
       consented=VALUES(consented),
       consented_at=IF(VALUES(consented)=1,CURRENT_TIMESTAMP(3),consented_at),
       revoked_at=IF(VALUES(consented)=0,CURRENT_TIMESTAMP(3),NULL),
       source=VALUES(source)`,
    [tenantId, storeId, customerId, provider, consented ? 1 : 0, consented ? 1 : 0, consented ? 1 : 0, source]
  );
}

module.exports = { setMarketingConsent };
