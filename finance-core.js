export const CATEGORIES = [
  "Moradia",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Educação",
  "Lazer",
  "Compras",
  "Assinaturas",
  "Família",
  "Salário",
  "Investimentos",
  "Outros"
];

const CATEGORY_COLORS = {
  Moradia: "#2d6bff",
  Alimentação: "#ff9f43",
  Transporte: "#8557e8",
  Saúde: "#19b995",
  Educação: "#3b82f6",
  Lazer: "#ef5da8",
  Compras: "#f76767",
  Assinaturas: "#21a6b8",
  Família: "#7b61ff",
  Salário: "#18a77b",
  Investimentos: "#0ea5e9",
  Outros: "#7c879d"
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Outros;
}

export function pad(value) {
  return String(value).padStart(2, "0");
}

export function localISODate(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function currentMonthKey(date = new Date()) {
  return localISODate(date).slice(0, 7);
}

export function monthKey(dateISO) {
  return String(dateISO || "").slice(0, 7);
}

export function shiftMonth(month, amount) {
  const [year, index] = month.split("-").map(Number);
  const date = new Date(year, index - 1 + amount, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthLabel(month, format = "long") {
  const [year, index] = month.split("-").map(Number);
  const value = new Intl.DateTimeFormat("pt-BR", { month: format, year: "numeric" })
    .format(new Date(year, index - 1, 1));
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function dateLabel(dateISO, options = {}) {
  if (!dateISO) return "—";
  const [year, month, day] = dateISO.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: options.short ? "short" : "2-digit",
    ...(options.year ? { year: "numeric" } : {})
  }).format(new Date(year, month - 1, day));
}

export function money(value, compact = false) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? "compact" : "standard"
  }).format(Number(value) || 0);
}

export function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function addMonthsISO(dateISO, amount) {
  const [year, month, day] = dateISO.split("-").map(Number);
  const target = new Date(year, month - 1 + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(day, lastDay));
  return localISODate(target);
}

export function daysBetween(fromISO, toISO) {
  const [fy, fm, fd] = fromISO.split("-").map(Number);
  const [ty, tm, td] = toISO.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

export function uid(prefix = "item") {
  const raw = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${raw}`;
}

export function createEmptyState() {
  return {
    version: 2,
    settings: { selectedMonth: currentMonthKey(), firstRun: true },
    transactions: [],
    cards: [],
    purchases: [],
    bills: [],
    budgets: [],
    goals: []
  };
}

export function normalizeState(input) {
  const blank = createEmptyState();
  if (!input || typeof input !== "object") return blank;
  return {
    ...blank,
    ...input,
    version: 2,
    settings: { ...blank.settings, ...(input.settings || {}) },
    transactions: Array.isArray(input.transactions) ? input.transactions : [],
    cards: Array.isArray(input.cards) ? input.cards : [],
    purchases: Array.isArray(input.purchases) ? input.purchases : [],
    bills: Array.isArray(input.bills) ? input.bills : [],
    budgets: Array.isArray(input.budgets) ? input.budgets : [],
    goals: Array.isArray(input.goals) ? input.goals : []
  };
}

export function purchaseInstallments(purchase) {
  const count = Math.max(1, Number(purchase.installmentCount) || 1);
  const total = roundMoney(purchase.totalAmount);
  const regular = roundMoney(total / count);
  let allocated = 0;
  const paid = new Set((purchase.paidInstallments || []).map(Number));

  return Array.from({ length: count }, (_, index) => {
    const number = index + 1;
    const amount = number === count ? roundMoney(total - allocated) : regular;
    allocated = roundMoney(allocated + amount);
    return {
      id: `${purchase.id}-${number}`,
      purchaseId: purchase.id,
      cardId: purchase.cardId,
      description: purchase.description,
      category: purchase.category || "Compras",
      number,
      count,
      amount,
      dueDate: addMonthsISO(purchase.firstDueDate, index),
      paid: paid.has(number)
    };
  });
}

export function allInstallments(state) {
  return state.purchases.flatMap(purchaseInstallments);
}

export function billDisplayStatus(bill, today = localISODate()) {
  if (bill.status === "paid") return "paid";
  if (bill.dueDate < today) return "overdue";
  return "pending";
}

export function summaryForMonth(state, month) {
  const transactions = state.transactions.filter(item => monthKey(item.date) === month);
  const bills = state.bills.filter(item => monthKey(item.dueDate) === month);
  const installments = allInstallments(state).filter(item => monthKey(item.dueDate) === month);

  const income = transactions
    .filter(item => item.type === "income")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cashExpenses = transactions
    .filter(item => item.type === "expense")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const billsTotal = bills.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const cardsTotal = installments.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expenses = roundMoney(cashExpenses + billsTotal + cardsTotal);

  const incomePaid = transactions
    .filter(item => item.type === "income" && item.status !== "pending")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const expensePaid = transactions
    .filter(item => item.type === "expense" && item.status !== "pending")
    .reduce((sum, item) => sum + Number(item.amount || 0), 0)
    + bills.filter(item => item.status === "paid").reduce((sum, item) => sum + Number(item.amount || 0), 0)
    + installments.filter(item => item.paid).reduce((sum, item) => sum + Number(item.amount || 0), 0);

  return {
    income: roundMoney(income),
    expenses,
    balance: roundMoney(income - expenses),
    incomePaid: roundMoney(incomePaid),
    expensePaid: roundMoney(expensePaid),
    realizedBalance: roundMoney(incomePaid - expensePaid),
    billsPending: bills.filter(item => item.status !== "paid").length,
    cardTotal: roundMoney(cardsTotal)
  };
}

export function expenseCategoriesForMonth(state, month) {
  const totals = new Map();
  const add = (category, amount) => {
    const key = category || "Outros";
    totals.set(key, roundMoney((totals.get(key) || 0) + Number(amount || 0)));
  };

  state.transactions
    .filter(item => item.type === "expense" && monthKey(item.date) === month)
    .forEach(item => add(item.category, item.amount));
  state.bills
    .filter(item => monthKey(item.dueDate) === month)
    .forEach(item => add(item.category, item.amount));
  allInstallments(state)
    .filter(item => monthKey(item.dueDate) === month)
    .forEach(item => add(item.category, item.amount));

  return [...totals.entries()]
    .map(([category, amount]) => ({ category, amount, color: categoryColor(category) }))
    .sort((a, b) => b.amount - a.amount);
}

export function budgetProgress(state, month) {
  const expenses = expenseCategoriesForMonth(state, month);
  const spentByCategory = new Map(expenses.map(item => [item.category, item.amount]));
  return state.budgets
    .filter(item => item.month === month)
    .map(item => {
      const spent = spentByCategory.get(item.category) || 0;
      const limit = Number(item.limit) || 0;
      return {
        ...item,
        spent,
        remaining: roundMoney(limit - spent),
        percent: limit > 0 ? Math.round((spent / limit) * 100) : 0
      };
    });
}

export function cardUsage(state, cardId, referenceMonth = currentMonthKey()) {
  const card = state.cards.find(item => item.id === cardId);
  if (!card) return { used: 0, available: 0, percent: 0 };
  const used = allInstallments(state)
    .filter(item => item.cardId === cardId && !item.paid && monthKey(item.dueDate) >= referenceMonth)
    .reduce((sum, item) => sum + item.amount, 0);
  const limit = Number(card.limit) || 0;
  return {
    used: roundMoney(used),
    available: roundMoney(limit - used),
    percent: limit > 0 ? Math.round((used / limit) * 100) : 0
  };
}

export function upcomingItems(state, today = localISODate(), horizonDays = 30) {
  const bills = state.bills
    .filter(item => item.status !== "paid")
    .map(item => ({
      id: item.id,
      source: "bill",
      title: item.description,
      subtitle: "Conta a pagar",
      amount: Number(item.amount) || 0,
      dueDate: item.dueDate,
      status: billDisplayStatus(item, today)
    }));
  const installments = allInstallments(state)
    .filter(item => !item.paid)
    .map(item => ({
      id: item.id,
      source: "installment",
      purchaseId: item.purchaseId,
      installmentNumber: item.number,
      title: item.description,
      subtitle: `Parcela ${item.number}/${item.count}`,
      amount: item.amount,
      dueDate: item.dueDate,
      status: item.dueDate < today ? "overdue" : "pending"
    }));

  return [...bills, ...installments]
    .filter(item => daysBetween(today, item.dueDate) <= horizonDays)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function trendForMonths(state, endingMonth, count = 6) {
  return Array.from({ length: count }, (_, index) => shiftMonth(endingMonth, index - count + 1))
    .map(month => ({ month, ...summaryForMonth(state, month) }));
}

export function createDemoState(reference = new Date()) {
  const state = createEmptyState();
  const month = currentMonthKey(reference);
  const [year, monthNumber] = month.split("-").map(Number);
  const day = value => `${year}-${pad(monthNumber)}-${pad(value)}`;
  const nextMonth = shiftMonth(month, 1);
  const [nextYear, nextNumber] = nextMonth.split("-").map(Number);
  const nextDay = value => `${nextYear}-${pad(nextNumber)}-${pad(value)}`;

  state.settings = { selectedMonth: month, firstRun: false, demo: true };
  state.transactions = [
    { id: uid("tx"), type: "income", description: "Salário", amount: 6110, category: "Salário", date: day(5), status: "paid" },
    { id: uid("tx"), type: "expense", description: "Supermercado", amount: 486.7, category: "Alimentação", date: day(8), status: "paid" },
    { id: uid("tx"), type: "expense", description: "Combustível", amount: 230, category: "Transporte", date: day(11), status: "paid" },
    { id: uid("tx"), type: "income", description: "Renda extra", amount: 420, category: "Outros", date: day(18), status: "pending" }
  ];
  state.bills = [
    { id: uid("bill"), description: "Energia", amount: 187.4, category: "Moradia", dueDate: day(20), status: "paid" },
    { id: uid("bill"), description: "Internet", amount: 109.9, category: "Assinaturas", dueDate: day(27), status: "pending" },
    { id: uid("bill"), description: "Seguro do carro", amount: 145, category: "Transporte", dueDate: nextDay(10), status: "pending" }
  ];
  const cardId = uid("card");
  state.cards = [
    { id: cardId, name: "Cartão principal", limit: 4000, closingDay: 4, dueDay: 12, color: "#2d6bff" }
  ];
  state.purchases = [
    { id: uid("purchase"), cardId, description: "Tênis de corrida", totalAmount: 639.9, installmentCount: 3, firstDueDate: day(12), purchaseDate: day(2), category: "Compras", paidInstallments: [1] },
    { id: uid("purchase"), cardId, description: "Farmácia", totalAmount: 128.5, installmentCount: 1, firstDueDate: day(12), purchaseDate: day(7), category: "Saúde", paidInstallments: [] }
  ];
  state.budgets = [
    { id: uid("budget"), month, category: "Alimentação", limit: 900 },
    { id: uid("budget"), month, category: "Transporte", limit: 650 },
    { id: uid("budget"), month, category: "Lazer", limit: 350 }
  ];
  state.goals = [
    { id: uid("goal"), name: "Reserva de emergência", target: 10000, current: 3250, deadline: `${year + 1}-06-30` }
  ];
  return state;
}
