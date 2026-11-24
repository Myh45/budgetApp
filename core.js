export const CATEGORIES = ['Без категорії', 'Продукти', 'Транспорт', 'Кафе', 'Покупки', 'Здоров’я', 'Розваги', 'Подарунки', 'Зарплата', 'Інше'];
export const SCHEMA_VERSION = 2;
export const money = cents => `${(cents / 100).toLocaleString('uk-UA', {minimumFractionDigits:2,maximumFractionDigits:2})} ₴`;
export function parseMoney(value) {
  const raw = String(value ?? '').trim().replace(/\s|\u00a0|\u202f/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Введіть коректну суму з максимум двома знаками після коми.');
  const [whole, frac = ''] = raw.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error('Сума має бути більшою за нуль.');
  return cents;
}
export function parseSignedLegacy(value) {
  const raw = String(value ?? '').trim().replace(/\s|\u00a0|\u202f/g, '').replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Некоректна сума у старому записі.');
  const negative = raw.startsWith('-');
  const positive = raw.replace(/^[+-]/, '');
  if (/^0+(?:\.0+)?$/.test(positive)) throw new Error('Нульова сума.');
  return (negative ? -1 : 1) * parseMoney(positive);
}
export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
};
export function newState() { return {version: SCHEMA_VERSION, currency:'UAH', openingBalanceCents:0, openingConfigured:false, transactions:[], categories:[...CATEGORIES]}; }
export function uuid() { return globalThis.crypto?.randomUUID?.() ?? `tx-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export function validateTransaction(t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || !['income','expense'].includes(t.type) ||
      !Number.isSafeInteger(t.amountCents) || t.amountCents <= 0 ||
      typeof t.description !== 'string' || !t.description.trim() || t.description.length > 160 ||
      typeof t.category !== 'string' || !t.category.trim() || t.category.length > 60 ||
      typeof t.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t.date) || Number.isNaN(Date.parse(t.date+'T12:00:00Z'))) {
    throw new Error('Пошкоджений запис операції.');
  }
  return t;
}
export function validateState(input) {
  if (!input || input.version !== SCHEMA_VERSION || input.currency !== 'UAH' || !Number.isSafeInteger(input.openingBalanceCents) ||
    typeof input.openingConfigured !== 'boolean' || !Array.isArray(input.transactions) || input.transactions.length > 200000 ||
    !Array.isArray(input.categories) || input.categories.length > 100) throw new Error('Непідтримуваний або пошкоджений формат даних.');
  const ids = new Set();
  for (const t of input.transactions) {validateTransaction(t); if(ids.has(t.id)) throw new Error('Повторюваний ID транзакції.'); ids.add(t.id);}
  if (!input.categories.every(c=>typeof c==='string' && c.trim() && c.length<=60)) throw new Error('Некоректні категорії.');
  if (!Number.isSafeInteger(balanceCents(input))) throw new Error('Баланс виходить за допустимі межі.');
  return input;
}
export function totals(state) { return state.transactions.reduce((a,t) => {a[t.type] += t.amountCents; return a;}, {income:0,expense:0}); }
export function balanceCents(state) { const {income,expense} = totals(state); return state.openingBalanceCents + income - expense; }
export function migrateLegacy(itemRaw, listRaw) {
  if (itemRaw == null && listRaw == null) return null;
  let oldCash = {}, oldList = [];
  try { if(itemRaw != null) oldCash = JSON.parse(itemRaw); if(listRaw != null) oldList = JSON.parse(listRaw); }
  catch {throw new Error('Старі дані містять пошкоджений JSON. Спочатку збережіть їх резервну копію.');}
  if (!oldCash || typeof oldCash !== 'object' || !Array.isArray(oldList)) throw new Error('Некоректний старий формат.');
  const state = newState();
  const warnings=[];
  for (const [i,old] of oldList.entries()) {
    try {
      const signed = parseSignedLegacy(old.amount);
      const description = String(old.description ?? '').trim().slice(0,160) || `Операція ${i+1}`;
      state.transactions.push({id:uuid(),type:signed>0?'income':'expense',amountCents:Math.abs(signed),description,category:'Без категорії',date:todayLocal(),createdAt:new Date().toISOString(),legacyId:old.id ?? null});
    } catch {warnings.push(`Запис №${i+1} пропущено: некоректна сума.`);}
  }
  // Original app has no transaction dates. The import date is used as a placeholder.
  if (state.transactions.length) warnings.push('У старих операцій немає дат: встановлено дату імпорту.');
  const sum = state.transactions.reduce((n,t)=>n+(t.type==='income'?t.amountCents:-t.amountCents),0);
  let oldBalance = null;
  if (oldCash.balance !== undefined) {
    try {oldBalance = signedMoneyToCents(oldCash.balance);} catch {warnings.push('Не вдалося прочитати старий баланс; використано суму операцій.');}
  }
  state.openingBalanceCents = oldBalance === null ? 0 : oldBalance - sum;
  state.openingConfigured = true;
  if (oldBalance !== null && oldBalance !== sum) warnings.push('Старий баланс не дорівнює сумі записаних операцій. Різницю враховано в початковому балансі, щоб зберегти поточний залишок.');
  validateState(state);
  return {state,warnings,originalBalanceCents:oldBalance,imported:state.transactions.length,total:oldList.length};
}
function signedMoneyToCents(v) {
  const raw=String(v).trim().replace(/\s|\u00a0|\u202f/g,'').replace(',','.');
  if(!/^[+-]?\d+(?:\.\d{1,2})?$/.test(raw)) throw new Error('Bad balance');
  if(Number(raw)===0) return 0;
  return (raw.startsWith('-')?-1:1)*parseMoney(raw.replace(/^[+-]/,''));
}
