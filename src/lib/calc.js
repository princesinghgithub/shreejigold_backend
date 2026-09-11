// फ्रंटएंड के src/lib/calc.js जैसा ही हिसाब — दोनों तरफ एक जैसा total निकले.

export function computeItemValue(item, rates) {
  const rate = item.metal === 'Gold' ? rates.gold || 0 : rates.silver || 0;
  const w = Number(item.weight) || 0;
  const p = Number(item.purity) || 0;
  const mk = Number(item.making) || 0;
  const metalVal = w * (p / 100) * rate;
  let making = 0;
  if (item.makingType === 'perg') making = mk * w;
  else if (item.makingType === 'pct') making = metalVal * (mk / 100);
  else making = mk;
  const hallmark = Number(item.hallmark) || 0;
  return { rate: rate * (p / 100), metalVal, making, hallmark, itemTotal: metalVal + making + hallmark };
}

export function computeExchangeValue(ex = {}) {
  const w = Number(ex.weight) || 0;
  const p = Number(ex.purity) || 0;
  const d = Number(ex.deduct) || 0;
  const r = Number(ex.rate) || 0;
  return w * (p / 100) * (1 - d / 100) * r;
}

export function summarizeBill(items, rates, exchange, discType, discVal, gstPct, paid) {
  let subtotal = 0;
  let makingTotal = 0;
  let hallmarkTotal = 0;
  for (const it of items) {
    const c = computeItemValue(it, rates);
    subtotal += c.metalVal;
    makingTotal += c.making;
    hallmarkTotal += c.hallmark;
  }
  const gross = subtotal + makingTotal + hallmarkTotal;
  const discount = discType === 'pct' ? gross * (Number(discVal) / 100) : Number(discVal) || 0;
  const afterDisc = Math.max(0, gross - discount);
  const gstAmt = afterDisc * ((Number(gstPct) || 0) / 100);
  const exchangeVal = computeExchangeValue(exchange);
  // बिल की रकम पूरे रुपये में — पैसे का फ़र्क "Round Off" में दिखता है
  const exact = afterDisc + gstAmt - exchangeVal;
  const total = Math.round(exact);
  const roundOff = total - exact;
  const due = total - (Number(paid) || 0);
  return {
    subtotal,
    makingTotal,
    hallmarkTotal,
    gross,
    discount,
    afterDisc,
    gstPct: Number(gstPct) || 0,
    gstAmt,
    exchangeVal,
    roundOff,
    paid: Number(paid) || 0,
    total,
    due,
  };
}

export function summarizeInvoices(list) {
  const sale = list.filter((i) => i.type === 'sale');
  const purchase = list.filter((i) => i.type === 'purchase');
  return {
    saleCount: sale.length,
    saleTotal: sale.reduce((s, i) => s + i.total, 0),
    purchaseCount: purchase.length,
    purchaseTotal: purchase.reduce((s, i) => s + i.total, 0),
    gstTotal: list.reduce((s, i) => s + i.gst, 0),
    dueTotal: list.reduce((s, i) => s + (i.due > 0 ? i.due : 0), 0),
  };
}
