// Settings-only templates and trusted demonstration fragments. No real-order rendering.
const titles = {
  assembly: "Лист сборки заказа",
  assembly_batch: "Общий лист сборки",
  delivery: "Лист доставки",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function getAssemblyHeaderHtml() {
  return '<header style="text-align:center"><div style="font-size:calc(15px + 2pt)">№{{ order.id }}</div><div style="font-size:10px;font-weight:normal;margin-top:4px">{{ order.schedule_date }}</div><div style="font-size:13px;margin-top:7px">{{ delivery.type }} · {{ order.schedule_text }}</div></header>';
}

function getLabelHeaderHtml() {
  return '<div class="label-header" style="display:block;text-align:center"><div class="label-order" style="font-size:11pt">№{{ order.id }}</div><div class="label-datetime" style="margin-top:0.5mm;font-size:7pt;font-weight:normal;text-align:center">{{ order.schedule_date }}</div></div><div class="label-schedule" style="text-align:center;padding-bottom:1.2mm;border-bottom:1px solid #111">{{ delivery.type }} · {{ order.schedule_text }}</div>';
}

function getDeliveryTearLineHtml() {
  return '<div style="margin-top:6mm;padding-top:1mm;border-top:1px dashed #000;break-inside:avoid" aria-hidden="true"></div>';
}

// Upgrade known legacy markup without replacing custom template bodies or styles.
function normalizeSettingsHtml(type, html) {
  let result = String(html || '');
  if (type === 'assembly' || type === 'assembly_batch') {
    result = result.replace(/<thead\b[^>]*>[\s\S]*?<\/thead\s*>/gi, '');
  }
  if (type === 'assembly') result = result.replace('<header>?{{ order.id }} ? {{ order.schedule_text }} ? {{ delivery.type }}</header>', getAssemblyHeaderHtml());
  if (type === 'delivery') {
    result = result.replace('<header>?{{ order.id }} ? {{ order.schedule_text }}</header>', getAssemblyHeaderHtml());
    if (!/\{\{\s*delivery.tear_line_html\s*\}\}/.test(result)) result = result.replace(/<\/body\s*>/i, '{{ delivery.tear_line_html }}</body>');
  }
  if (type === 'assembly_batch') {
    result = result.replace(/<table\b([^>]*)>([\s\S]*?\{\{\s*assembly.items_html\s*\}\}[\s\S]*?)<\/table>/i, (match, attributes, body) => `<table${attributes}>${/<colgroup\b/i.test(body) ? '' : '<colgroup><col style="width:22px"><col><col style="width:43px"></colgroup>'}${body}</table>`);
  }
  return result;
}

function getDefaultHtml(type) {
  if (!Object.hasOwn(titles, type)) return "";
  const table = '<table>' + (type==='assembly_batch'?'<colgroup><col style="width:22px"><col><col style="width:43px"></colgroup>':'') + '<tbody>{{ assembly.items_html }}</tbody></table>';
  const body = type === "delivery"
    ? '<article>' + getAssemblyHeaderHtml() + '<div>{{ customer.name }} · {{ customer.phone }}</div><div class="address">{{ delivery.address }}</div>{{ delivery.comment_html }}{{ payment.summary_html }}</article>{{ delivery.tear_line_html }}'
    : (type === "assembly" ? getAssemblyHeaderHtml() + '{{ assembly.comment_html }}' : '<header>Общий лист сборки</header>') + table;
  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${titles[type]}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0;color:#000;background:#fff;font:11px Arial,sans-serif}
body{width:80mm;padding:3mm}header{font-size:15px;font-weight:bold;border-bottom:2px solid #000;padding-bottom:9px;margin-bottom:12px;overflow-wrap:anywhere}
table{width:100%;border-collapse:collapse;table-layout:fixed}th{text-align:left;font-size:9px;border-bottom:2px solid #000;padding:7px 3px}td{vertical-align:top;border-bottom:1px solid #888;padding:10px 3px;overflow-wrap:anywhere}
.check{width:22px}.qty{width:43px;text-align:right;white-space:nowrap;font-weight:bold;font-size:13px}.box{display:inline-block;width:13px;height:13px;border:1.5px solid #000}
.detail{font-size:10px;line-height:1.5;margin:5px 0 0 6px}.detail.sub{margin-left:12px}.note{border-top:1px solid #888;border-bottom:1px solid #888;margin:10px 0;padding:8px 0;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}
.address{font-size:13px;margin:12px 0 7px;line-height:1.5;overflow-wrap:anywhere}.pay{display:flex;justify-content:space-between;gap:8px;margin-top:12px;font-weight:bold;overflow-wrap:anywhere}.pay span:last-child{white-space:nowrap}
@page{margin:0}thead{display:table-header-group}tr,.note,.pay{break-inside:avoid}
</style></head><body>${body}</body></html>`;
}

function note(text) {
  return text ? `<div class="note">${escapeHtml(text)}</div>` : "";
}

// Display hierarchy follows api/print.js: first variant before name, then
// additional variants, positive ingredients and options; combo selections one level deeper.
// These are already formatted samples, not a second real-order formatter.
function rows(batch, detailed) {
  const items = [
    ["150 г Котлета говяжья", ["200 г Пюре картофельное", "30 г Соус грибной"], batch ? 5 : 3],
    ["150 г Котлета говяжья", ["150 г Гречка"], batch ? 7 : 2],
    ["120 г Котлета рыбная", ["200 г Гречка"], batch ? 6 : 3],
    ...(batch ? [["120 г Котлета рыбная", ["150 г Пюре картофельное"], 4]] : []),
    ["500 мл Морс ягодный", [], batch ? 8 : 2],
  ];
  if (detailed) items.push(
    ["350 г Салат с запечёнными овощами и сыром", ["Острый", "20 г Сыр", "30 г Соус чесночный", "2 Дополнительный хлеб"], 1],
    ["Обеденное комбо", ["1 x 150 г Котлета говяжья", ["200 г Пюре картофельное", "30 г Соус грибной"], "1 x 500 мл Морс ягодный"], 2]
  );
  return items.map(([title, details, qty]) => `<tr><td class="check"><span class="box"></span></td><td><b>${escapeHtml(title)}</b>${details.map(line => Array.isArray(line) ? line.map(sub => `<div class="detail sub">• ${escapeHtml(sub)}</div>`).join("") : `<div class="detail">• ${escapeHtml(line)}</div>`).join("")}</td><td class="qty">${qty}</td></tr>`).join("");
}

function getSamples(type) {
  if (!Object.hasOwn(titles, type)) return [];
  if (type !== "delivery") return [
    { title: "Как в макете", values: { "order.id": "592", "order.schedule_text": "К 13:00", "delivery.type": "Доставка", "assembly.comment_html": note("Комментарий к заказу\nСоус упаковать отдельно."), "assembly.items_html": rows(type === "assembly_batch", false) } },
    { title: "Варианты, состав, опции, комбо", values: { "order.id": "593", "order.schedule_text": "Как можно быстрее", "delivery.type": "Самовывоз", "assembly.comment_html": "", "assembly.items_html": rows(type === "assembly_batch", true) } },
    { title: "На другую дату, без комментария", values: { "order.id": "594", "order.schedule_text": "На дату: 19.10.2026 14:00", "delivery.type": "С собой", "assembly.comment_html": "", "assembly.items_html": rows(type === "assembly_batch", false) } },
    { title: "В зале, ко времени", values: { "order.id": "595", "order.schedule_text": "Ко времени: 13:00", "delivery.type": "В зале", "assembly.comment_html": "", "assembly.items_html": rows(type === "assembly_batch", false) } },
  ].map(sample => {
    if(type !== 'assembly')return sample;
    const schedule=sample.values['order.schedule_text'];
    const date=schedule.match(/\d{2}\.\d{2}\.\d{4}/);
    return {...sample,values:{...sample.values,'order.schedule_date':date ? date[0] : '18.10.2026','order.schedule_text':date ? 'Ко времени: '+schedule.slice(-5) : schedule}};
  });
  const payment = (label, amount) => `<div style="margin-top:12px">${escapeHtml(label)}</div><div style="margin-top:12px;text-align:center;font-size:20px;font-weight:bold">ПРИНЯТЬ: ${escapeHtml(amount)}</div>`;
  return [
    ["Наличные", "592", "18.10 · К 13:00", "Анна", "+7 (900) 000-00-01", "ул. Примерная, 12, кв. 45, подъезд 2, этаж 4, домофон 45", "Позвонить за 5 минут.", payment("Наличными к получению", "2 400 ₽")],
    ["Оплачено онлайн", "593", "18.10 · Как можно быстрее", "Михаил", "+7 (900) 000-00-02", "ул. Учебная, 8, офис 21, вход со двора, этаж 2", "Передать администратору.", '<div style="margin-top:12px;text-align:center;font-size:18px;font-weight:bold">ОПЛАЧЕНО</div>'],
    ["Картой при получении", "594", "19.10 · К 14:00", "Ольга", "+7 (900) 000-00-03", "пр-т Тестовый, 30, кв. 7, подъезд 1, этаж 2", "", payment("Картой при получении", "1 850 ₽")],
    // Explicit demo amounts only (2400 = 1000 paid + 1400 due).
    ["Смешанная оплата", "595", "19.10 · К 14:00", "Иван", "+7 (900) 000-00-04", "ул. Примерная, 12, кв. 45, подъезд 2, этаж 4, домофон 45", "", payment("Наличными", "1 400 ₽")],
  ].map(([title, id, schedule, name, phone, address, comment, summary]) => ({ title, values: { "order.id": id, "order.schedule_date":schedule.slice(0,5)+'.2026', "order.schedule_text":/\d{2}:\d{2}$/.test(schedule)?'Ко времени: '+schedule.slice(-5):'Быстрее', "delivery.type":"Доставка", "delivery.tear_line_html":getDeliveryTearLineHtml(), "customer.name": name, "customer.phone": phone, "delivery.address": address, "delivery.comment_html": note(comment), "payment.summary_html": summary } }));
}
module.exports = { normalizeSettingsHtml, titles, getDefaultHtml, getSamples, getAssemblyHeaderHtml, getLabelHeaderHtml, getDeliveryTearLineHtml };
