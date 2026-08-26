import {
  CATEGORIES,
  allInstallments,
  billDisplayStatus,
  budgetProgress,
  cardUsage,
  categoryColor,
  createDemoState,
  createEmptyState,
  currentMonthKey,
  dateLabel,
  expenseCategoriesForMonth,
  localISODate,
  money,
  monthKey,
  monthLabel,
  normalizeState,
  purchaseInstallments,
  shiftMonth,
  summaryForMonth,
  trendForMonths,
  upcomingItems,
  uid
} from "./finance-core.js";

const STORAGE_KEY = "meu-controle-financeiro:v1";
const SCREEN_TITLES = {
  dashboard: "Visão geral",
  transactions: "Lançamentos",
  cards: "Cartões e parcelas",
  planning: "Planejamento"
};

const ICONS = {
  arrowDown: '<path d="M12 4v16m0 0 6-6m-6 6-6-6"/>',
  arrowUp: '<path d="M12 20V4m0 0 6 6m-6-6-6 6"/>',
  wallet: '<path d="M4 7V5a2 2 0 0 1 2-2h12v4M4 7h16a1 1 0 0 1 1 1v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1Z"/><path d="M16 13h5v4h-5a2 2 0 0 1 0-4Z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  chart: '<path d="M4 20V10m6 10V4m6 16v-7m4 7H2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 3V1m0 22v-2M3 12H1m22 0h-2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m4 16-1 5 5-1L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  undo: '<path d="M9 7 4 12l5 5"/><path d="M5 12h8a6 6 0 0 1 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 20h14"/>',
  upload: '<path d="M12 16V4m0 0 4 4m-4-4-4 4M5 20h14"/>',
  reset: '<path d="M4 4v6h6M20 20v-6h-6"/><path d="M5.1 15a8 8 0 0 0 13.2 2M18.9 9A8 8 0 0 0 5.7 7"/>',
  shield: '<path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6m-6 4h6"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M15 8.5c-.7-.5-1.5-.8-2.5-.8-1.4 0-2.5.7-2.5 1.8 0 2.8 5.5 1.2 5.5 4 0 1.2-1.2 2-2.8 2-.9 0-1.9-.3-2.7-.9M12.5 6v12"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>'
};

const dom = {
  title: document.querySelector("#screen-title"),
  monthLabel: document.querySelector("#month-label"),
  monthToolbar: document.querySelector("#month-toolbar"),
  dashboard: document.querySelector("#dashboard-content"),
  transactions: document.querySelector("#transactions-content"),
  cards: document.querySelector("#cards-content"),
  planning: document.querySelector("#planning-content"),
  dialog: document.querySelector("#app-dialog"),
  dialogTitle: document.querySelector("#dialog-title"),
  dialogEyebrow: document.querySelector("#dialog-eyebrow"),
  dialogContent: document.querySelector("#dialog-content"),
  toast: document.querySelector("#toast"),
  importFile: document.querySelector("#import-file"),
  installButton: document.querySelector("#install-button")
};

let state = loadState();
let deferredInstallPrompt = null;
let toastTimer = null;
const ui = {
  screen: "dashboard",
  month: state.settings.selectedMonth || currentMonthKey(),
  transactionFilter: "all",
  search: ""
};

function icon(name, className = "") {
  return `<svg class="${escapeHTML(className)}" aria-hidden="true" viewBox="0 0 24 24">${ICONS[name] || ICONS.info}</svg>`;
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value)) ? value : "#2d6bff";
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalizeState(JSON.parse(raw)) : createEmptyState();
  } catch {
    return createEmptyState();
  }
}

function saveState(message = "") {
  state.settings.selectedMonth = ui.month;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (message) showToast(message);
  } catch {
    showToast("Não foi possível salvar os dados neste aparelho.", true);
  }
}

function commit(message) {
  state.settings.firstRun = false;
  saveState(message);
  renderAll();
}

function showToast(message, isError = false) {
  clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.toggle("is-error", isError);
  dom.toast.classList.add("is-visible");
  toastTimer = setTimeout(() => dom.toast.classList.remove("is-visible"), 2800);
}

function hasAnyData() {
  return ["transactions", "cards", "purchases", "bills", "budgets", "goals"]
    .some(key => state[key].length > 0);
}

function emptyState(title, copy, action, label, secondary = "") {
  return `
    <div class="empty-state">
      <div class="empty-illustration">${icon("chart")}</div>
      <h3>${escapeHTML(title)}</h3>
      <p>${escapeHTML(copy)}</p>
      <div class="empty-actions">
        ${action ? `<button class="button button-primary" type="button" data-action="${action}">${icon("plus")} ${escapeHTML(label)}</button>` : ""}
        ${secondary}
      </div>
    </div>`;
}

function statusLabel(status) {
  return { paid: "Pago", pending: "Pendente", overdue: "Atrasado" }[status] || "Pendente";
}

function statusChip(status) {
  return `<span class="status-chip status-${status}">${statusLabel(status)}</span>`;
}

function renderAll() {
  dom.monthLabel.textContent = monthLabel(ui.month);
  dom.title.textContent = SCREEN_TITLES[ui.screen];
  renderDashboard();
  renderTransactions();
  renderCards();
  renderPlanning();
  document.querySelectorAll("[data-screen]").forEach(section => {
    section.classList.toggle("is-active", section.dataset.screen === ui.screen);
  });
  document.querySelectorAll("[data-nav]").forEach(button => {
    const active = button.dataset.nav === ui.screen;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-current", active ? "page" : "false");
  });
}

function renderDashboard() {
  const summary = summaryForMonth(state, ui.month);
  const categories = expenseCategoriesForMonth(state, ui.month);
  const trends = trendForMonths(state, ui.month, 6);
  const maxTrend = Math.max(1, ...trends.flatMap(item => [item.income, item.expenses]));
  const maxCategory = Math.max(1, ...categories.map(item => item.amount));
  const upcoming = upcomingItems(state, localISODate(), 30).slice(0, 4);
  const activities = monthActivities(ui.month).slice(0, 5);
  const empty = !hasAnyData();

  dom.dashboard.innerHTML = `
    <div class="stack-lg">
      <article class="dashboard-hero">
        <div class="hero-top">
          <span class="hero-label">Saldo previsto do mês</span>
          ${icon("wallet")}
        </div>
        <h2 class="hero-value ${summary.balance < 0 ? "is-negative" : ""}">${money(summary.balance)}</h2>
        <div class="hero-bottom">
          <div class="hero-stat">
            <span>Já realizado</span>
            <strong>${money(summary.realizedBalance)}</strong>
          </div>
          <div class="hero-stat">
            <span>Contas pendentes</span>
            <strong>${summary.billsPending}</strong>
          </div>
        </div>
      </article>

      ${state.settings.demo ? `
        <div class="demo-banner">
          ${icon("info")}
          <span>Você está vendo dados de demonstração. Explore todas as telas ou</span>
          <button type="button" data-action="clear-data">comece do zero</button>
        </div>` : ""}

      <div class="summary-grid">
        ${summaryCard("arrowDown", "tone-income", "Receitas", summary.income)}
        ${summaryCard("arrowUp", "tone-expense", "Despesas", summary.expenses)}
        ${summaryCard("card", "tone-card", "Parcelas", summary.cardTotal)}
        ${summaryCard("calendar", "tone-bill", "A pagar", summary.billsPending, false)}
      </div>

      ${empty ? `
        <section class="panel">
          ${emptyState(
            "Comece seu controle hoje",
            "Adicione sua primeira receita ou carregue dados de exemplo para conhecer o aplicativo.",
            "add-transaction",
            "Novo lançamento",
            '<button class="button button-secondary" type="button" data-action="load-demo">Ver demonstração</button>'
          )}
        </section>` : ""}

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Gastos por categoria</h3>
            <p>Onde seu dinheiro está sendo usado</p>
          </div>
        </div>
        ${categories.length ? `
          <div class="category-list">
            ${categories.slice(0, 6).map(item => `
              <div class="category-item">
                <span class="category-color" style="background:${item.color}"></span>
                <div class="category-copy">
                  <div><span>${escapeHTML(item.category)}</span><strong>${money(item.amount)}</strong></div>
                  <div class="category-track"><div class="category-fill" style="width:${Math.max(3, (item.amount / maxCategory) * 100)}%;background:${item.color}"></div></div>
                </div>
              </div>`).join("")}
          </div>` : emptyState("Sem despesas neste mês", "Os gastos aparecerão aqui por categoria.", "add-transaction", "Adicionar despesa")}
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Evolução financeira</h3>
            <p>Receitas e despesas nos últimos 6 meses</p>
          </div>
        </div>
        <div class="trend-chart">
          ${trends.map(item => `
            <div class="trend-column" title="${escapeHTML(monthLabel(item.month))}: receitas ${money(item.income)}, despesas ${money(item.expenses)}">
              <div class="trend-bars">
                <div class="trend-bar income" style="height:${Math.max(3, (item.income / maxTrend) * 100)}%"></div>
                <div class="trend-bar expense" style="height:${Math.max(3, (item.expenses / maxTrend) * 100)}%"></div>
              </div>
              <span>${escapeHTML(monthLabel(item.month, "short").split(" de ")[0].replace(".", ""))}</span>
            </div>`).join("")}
        </div>
        <div class="chart-legend">
          <span><i class="legend-dot" style="background:var(--mint-500)"></i>Receitas</span>
          <span><i class="legend-dot" style="background:var(--blue-600)"></i>Despesas</span>
        </div>
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Próximos vencimentos</h3>
            <p>Contas e parcelas dos próximos 30 dias</p>
          </div>
          <button class="text-button" type="button" data-action="go-planning">Ver todos</button>
        </div>
        ${upcoming.length ? `<div class="activity-list">${upcoming.map(upcomingRow).join("")}</div>` : emptyState("Tudo em dia", "Não há vencimentos pendentes nos próximos 30 dias.", "add-bill", "Adicionar conta")}
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Últimos lançamentos</h3>
            <p>Movimentações de ${escapeHTML(monthLabel(ui.month, "long").toLowerCase())}</p>
          </div>
          <button class="text-button" type="button" data-action="go-transactions">Ver todos</button>
        </div>
        ${activities.length ? `<div class="activity-list">${activities.map(activityRow).join("")}</div>` : emptyState("Nenhum lançamento", "Suas movimentações aparecerão aqui.", "add-transaction", "Adicionar")}
      </section>
    </div>`;
}

function summaryCard(iconName, tone, label, value, isMoney = true) {
  return `
    <article class="summary-card">
      <div class="summary-icon ${tone}">${icon(iconName)}</div>
      <span>${escapeHTML(label)}</span>
      <strong>${isMoney ? money(value) : escapeHTML(value)}</strong>
    </article>`;
}

function monthActivities(month) {
  const transactions = state.transactions
    .filter(item => monthKey(item.date) === month)
    .map(item => ({
      id: item.id,
      kind: "transaction",
      title: item.description,
      meta: `${item.category} • ${dateLabel(item.date)}`,
      date: item.date,
      amount: Number(item.amount) || 0,
      direction: item.type === "income" ? "income" : "expense",
      status: item.status === "pending" ? "pending" : "paid",
      icon: item.type === "income" ? "arrowDown" : "arrowUp"
    }));
  const bills = state.bills
    .filter(item => monthKey(item.dueDate) === month)
    .map(item => ({
      id: item.id,
      kind: "bill",
      title: item.description,
      meta: `${item.category} • vence ${dateLabel(item.dueDate)}`,
      date: item.dueDate,
      amount: Number(item.amount) || 0,
      direction: "expense",
      status: billDisplayStatus(item),
      icon: "receipt"
    }));
  const installments = allInstallments(state)
    .filter(item => monthKey(item.dueDate) === month)
    .map(item => ({
      id: item.id,
      kind: "installment",
      title: item.description,
      meta: `Parcela ${item.number}/${item.count} • ${dateLabel(item.dueDate)}`,
      date: item.dueDate,
      amount: item.amount,
      direction: "expense",
      status: item.paid ? "paid" : item.dueDate < localISODate() ? "overdue" : "pending",
      icon: "card"
    }));
  return [...transactions, ...bills, ...installments].sort((a, b) => b.date.localeCompare(a.date));
}

function activityRow(item) {
  return `
    <div class="list-row">
      <div class="row-icon ${item.direction === "income" ? "tone-income" : "tone-expense"}">${icon(item.icon)}</div>
      <div class="row-main">
        <div class="row-title">${escapeHTML(item.title)}</div>
        <p class="row-meta">${escapeHTML(item.meta)}</p>
      </div>
      <div class="row-value">
        <strong class="amount-${item.direction}">${item.direction === "income" ? "+" : "−"} ${money(item.amount)}</strong>
        ${statusChip(item.status)}
      </div>
    </div>`;
}

function upcomingRow(item) {
  return `
    <div class="list-row">
      <div class="row-icon ${item.status === "overdue" ? "tone-expense" : "tone-bill"}">${icon(item.source === "bill" ? "receipt" : "card")}</div>
      <div class="row-main">
        <div class="row-title">${escapeHTML(item.title)}</div>
        <p class="row-meta">${escapeHTML(item.subtitle)} • ${dateLabel(item.dueDate, { short: true })}</p>
      </div>
      <div class="row-value"><strong>${money(item.amount)}</strong>${statusChip(item.status)}</div>
    </div>`;
}

function renderTransactions() {
  const query = ui.search.trim().toLocaleLowerCase("pt-BR");
  let rows = [];

  if (["all", "income", "expense"].includes(ui.transactionFilter)) {
    rows.push(...state.transactions
      .filter(item => monthKey(item.date) === ui.month)
      .filter(item => ui.transactionFilter === "all" || item.type === ui.transactionFilter)
      .map(item => ({ ...item, kind: "transaction", sortDate: item.date })));
  }
  if (["all", "bills"].includes(ui.transactionFilter)) {
    rows.push(...state.bills
      .filter(item => monthKey(item.dueDate) === ui.month)
      .map(item => ({ ...item, kind: "bill", sortDate: item.dueDate })));
  }
  rows = rows
    .filter(item => !query || `${item.description} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query))
    .sort((a, b) => b.sortDate.localeCompare(a.sortDate));

  dom.transactions.innerHTML = `
    <div class="stack">
      <div class="search-box">
        ${icon("search")}
        <input id="transaction-search" type="search" value="${escapeHTML(ui.search)}" placeholder="Buscar lançamento" autocomplete="off" />
      </div>
      <div class="filter-row" aria-label="Filtrar lançamentos">
        ${filterChip("all", "Todos")}
        ${filterChip("income", "Receitas")}
        ${filterChip("expense", "Despesas")}
        ${filterChip("bills", "Contas")}
      </div>
      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>${rows.length} ${rows.length === 1 ? "registro" : "registros"}</h3>
            <p>${escapeHTML(monthLabel(ui.month))}</p>
          </div>
          <button class="text-button" type="button" data-action="quick-add">+ Adicionar</button>
        </div>
        ${rows.length ? `<div class="activity-list">${rows.map(manageableRow).join("")}</div>` : emptyState("Nada por aqui", "Nenhum registro corresponde a este filtro.", "quick-add", "Adicionar item")}
      </section>
    </div>`;
}

function filterChip(value, label) {
  return `<button class="filter-chip ${ui.transactionFilter === value ? "is-active" : ""}" type="button" data-filter="${value}">${escapeHTML(label)}</button>`;
}

function manageableRow(item) {
  const isTransaction = item.kind === "transaction";
  const status = isTransaction ? (item.status === "pending" ? "pending" : "paid") : billDisplayStatus(item);
  const direction = isTransaction && item.type === "income" ? "income" : "expense";
  const date = isTransaction ? item.date : item.dueDate;
  const editAction = isTransaction ? "edit-transaction" : "edit-bill";
  const deleteKind = isTransaction ? "transaction" : "bill";
  return `
    <div class="list-row">
      <div class="row-icon ${direction === "income" ? "tone-income" : isTransaction ? "tone-expense" : "tone-bill"}">${icon(isTransaction ? (direction === "income" ? "arrowDown" : "arrowUp") : "receipt")}</div>
      <div class="row-main">
        <div class="row-title">${escapeHTML(item.description)}</div>
        <p class="row-meta">${escapeHTML(item.category)} • ${isTransaction ? dateLabel(date) : `vence ${dateLabel(date)}`}</p>
      </div>
      <div class="row-value">
        <strong class="amount-${direction}">${direction === "income" ? "+" : "−"} ${money(item.amount)}</strong>
        ${statusChip(status)}
      </div>
      <div class="row-actions">
        ${!isTransaction ? `<button class="icon-button" type="button" data-action="toggle-bill" data-id="${escapeHTML(item.id)}" aria-label="${item.status === "paid" ? "Marcar como pendente" : "Marcar como pago"}" title="${item.status === "paid" ? "Desfazer pagamento" : "Marcar como pago"}">${icon(item.status === "paid" ? "undo" : "check")}</button>` : ""}
        <button class="icon-button" type="button" data-action="${editAction}" data-id="${escapeHTML(item.id)}" aria-label="Editar">${icon("edit")}</button>
        <button class="icon-button" type="button" data-action="delete-item" data-kind="${deleteKind}" data-id="${escapeHTML(item.id)}" data-label="${escapeHTML(item.description)}" aria-label="Excluir">${icon("trash")}</button>
      </div>
    </div>`;
}

function renderCards() {
  const cards = state.cards;
  const purchases = [...state.purchases].sort((a, b) => (b.purchaseDate || "").localeCompare(a.purchaseDate || ""));
  dom.cards.innerHTML = `
    <div class="stack-lg">
      <section>
        <div class="section-heading">
          <div>
            <h3>Meus cartões</h3>
            <p>Limites e valores ainda comprometidos</p>
          </div>
          <button class="text-button" type="button" data-action="add-card">+ Cartão</button>
        </div>
        ${cards.length ? `<div class="cards-grid">${cards.map(cardVisual).join("")}</div>` : `
          <div class="panel">${emptyState("Cadastre seu cartão", "Acompanhe o limite e todas as compras parceladas.", "add-card", "Adicionar cartão")}</div>`}
      </section>

      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Compras parceladas</h3>
            <p>${purchases.length} ${purchases.length === 1 ? "compra cadastrada" : "compras cadastradas"}</p>
          </div>
          <button class="text-button" type="button" data-action="add-purchase">+ Compra</button>
        </div>
        ${purchases.length ? `<div class="purchase-list">${purchases.map(purchaseRow).join("")}</div>` : emptyState("Sem compras parceladas", "Cadastre uma compra e as parcelas serão calculadas automaticamente.", "add-purchase", "Adicionar compra")}
      </section>
    </div>`;
}

function cardVisual(card) {
  const usage = cardUsage(state, card.id, currentMonthKey());
  return `
    <article class="credit-card" style="--card-color:${safeColor(card.color)}">
      <button class="icon-button card-menu" type="button" data-action="card-actions" data-id="${escapeHTML(card.id)}" aria-label="Opções do cartão">${icon("more")}</button>
      <div class="card-heading">
        <span class="card-name">${escapeHTML(card.name)}</span>
        <span class="card-chip" aria-hidden="true"></span>
      </div>
      <div class="card-usage">
        <span>Limite comprometido</span>
        <strong>${money(usage.used)}</strong>
        <div class="card-progress"><div style="width:${Math.min(100, Math.max(2, usage.percent))}%"></div></div>
      </div>
      <div class="card-dates">
        <span>Disponível ${money(usage.available)}</span>
        <span>Fecha dia ${escapeHTML(card.closingDay)} • vence dia ${escapeHTML(card.dueDay)}</span>
      </div>
    </article>`;
}

function purchaseRow(purchase) {
  const card = state.cards.find(item => item.id === purchase.cardId);
  const installments = purchaseInstallments(purchase);
  const paidCount = installments.filter(item => item.paid).length;
  const next = installments.find(item => !item.paid);
  return `
    <div class="list-row">
      <div class="row-icon tone-card">${icon("card")}</div>
      <div class="row-main">
        <div class="row-title">${escapeHTML(purchase.description)}</div>
        <p class="row-meta">${escapeHTML(card?.name || "Cartão removido")} • ${paidCount}/${installments.length} parcelas pagas</p>
      </div>
      <div class="row-value">
        <strong>${money(purchase.totalAmount)}</strong>
        ${next ? `<span class="status-chip status-pending">Próxima ${money(next.amount)}</span>` : statusChip("paid")}
      </div>
      <div class="row-actions">
        ${next ? `<button class="icon-button" type="button" data-action="toggle-installment" data-id="${escapeHTML(purchase.id)}" data-number="${next.number}" aria-label="Marcar próxima parcela como paga" title="Pagar parcela ${next.number}">${icon("check")}</button>` : ""}
        <button class="icon-button" type="button" data-action="edit-purchase" data-id="${escapeHTML(purchase.id)}" aria-label="Editar">${icon("edit")}</button>
        <button class="icon-button" type="button" data-action="delete-item" data-kind="purchase" data-id="${escapeHTML(purchase.id)}" data-label="${escapeHTML(purchase.description)}" aria-label="Excluir">${icon("trash")}</button>
      </div>
    </div>`;
}

function renderPlanning() {
  const bills = state.bills
    .filter(item => monthKey(item.dueDate) === ui.month)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const budgets = budgetProgress(state, ui.month);
  const goals = [...state.goals].sort((a, b) => (a.deadline || "9999").localeCompare(b.deadline || "9999"));

  dom.planning.innerHTML = `
    <div class="stack-lg">
      <section class="panel">
        <div class="section-heading">
          <div>
            <h3>Contas a pagar</h3>
            <p>${escapeHTML(monthLabel(ui.month))}</p>
          </div>
          <button class="text-button" type="button" data-action="add-bill">+ Conta</button>
        </div>
        ${bills.length ? `<div class="bill-list">${bills.map(item => manageableRow({ ...item, kind: "bill" })).join("")}</div>` : emptyState("Nenhuma conta cadastrada", "Organize os vencimentos e marque cada conta quando pagar.", "add-bill", "Adicionar conta")}
      </section>

      <section>
        <div class="section-heading">
          <div>
            <h3>Orçamento por categoria</h3>
            <p>Defina limites para não perder o controle</p>
          </div>
          <button class="text-button" type="button" data-action="add-budget">+ Limite</button>
        </div>
        ${budgets.length ? `<div class="budget-list">${budgets.map(budgetCard).join("")}</div>` : `<div class="panel">${emptyState("Crie seu primeiro orçamento", "Escolha uma categoria e defina quanto pretende gastar no mês.", "add-budget", "Criar orçamento")}</div>`}
      </section>

      <section>
        <div class="section-heading">
          <div>
            <h3>Metas financeiras</h3>
            <p>Acompanhe seus objetivos</p>
          </div>
          <button class="text-button" type="button" data-action="add-goal">+ Meta</button>
        </div>
        ${goals.length ? `<div class="goal-list">${goals.map(goalCard).join("")}</div>` : `<div class="panel">${emptyState("Transforme planos em metas", "Defina um valor, um prazo e registre cada contribuição.", "add-goal", "Criar meta")}</div>`}
      </section>

      <section class="panel settings-panel">
        <div class="section-heading">
          <div>
            <h3>Seus dados</h3>
            <p>Backup, restauração e privacidade</p>
          </div>
        </div>
        <div class="data-actions">
          <button class="button button-secondary" type="button" data-action="export-data">${icon("download")} Exportar backup</button>
          <button class="button button-secondary" type="button" data-action="import-data">${icon("upload")} Importar backup</button>
          <button class="button button-danger" type="button" data-action="clear-data">${icon("reset")} Apagar dados</button>
        </div>
        <p class="privacy-note">${icon("shield")} <span>Os dados ficam armazenados somente neste aparelho. Faça um backup regularmente para não perder suas informações.</span></p>
      </section>
    </div>`;
}

function budgetCard(item) {
  const width = Math.min(100, Math.max(0, item.percent));
  const tone = item.percent >= 100 ? "is-danger" : item.percent >= 80 ? "is-warning" : "";
  return `
    <article class="budget-card">
      <div class="card-heading">
        <div>
          <h3>${escapeHTML(item.category)}</h3>
          <span class="metric-label">${item.percent}% do limite usado</span>
        </div>
        <div class="row-actions">
          <button class="icon-button" type="button" data-action="edit-budget" data-id="${escapeHTML(item.id)}" aria-label="Editar orçamento">${icon("edit")}</button>
          <button class="icon-button" type="button" data-action="delete-item" data-kind="budget" data-id="${escapeHTML(item.id)}" data-label="orçamento de ${escapeHTML(item.category)}" aria-label="Excluir orçamento">${icon("trash")}</button>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill ${tone}" style="width:${width}%"></div></div>
      <div class="budget-stats">
        <span>Gasto: <strong>${money(item.spent)}</strong></span>
        <span>${item.remaining >= 0 ? "Restante" : "Excedido"}: <strong>${money(Math.abs(item.remaining))}</strong></span>
        <span>Limite: <strong>${money(item.limit)}</strong></span>
      </div>
    </article>`;
}

function goalCard(goal) {
  const target = Number(goal.target) || 0;
  const current = Number(goal.current) || 0;
  const percent = target > 0 ? Math.round((current / target) * 100) : 0;
  return `
    <article class="goal-card">
      <div class="card-heading">
        <div>
          <h3>${escapeHTML(goal.name)}</h3>
          <span class="metric-label">${goal.deadline ? `Prazo: ${dateLabel(goal.deadline, { year: true })}` : "Sem prazo definido"}</span>
        </div>
        <div class="row-actions">
          <button class="icon-button" type="button" data-action="contribute-goal" data-id="${escapeHTML(goal.id)}" aria-label="Adicionar valor à meta" title="Adicionar valor">${icon("plus")}</button>
          <button class="icon-button" type="button" data-action="edit-goal" data-id="${escapeHTML(goal.id)}" aria-label="Editar meta">${icon("edit")}</button>
          <button class="icon-button" type="button" data-action="delete-item" data-kind="goal" data-id="${escapeHTML(goal.id)}" data-label="${escapeHTML(goal.name)}" aria-label="Excluir meta">${icon("trash")}</button>
        </div>
      </div>
      <div class="progress-track"><div class="progress-fill" style="width:${Math.min(100, Math.max(0, percent))}%"></div></div>
      <div class="goal-stats">
        <span>Guardado: <strong>${money(current)}</strong></span>
        <span>${Math.min(100, percent)}%</span>
        <span>Meta: <strong>${money(target)}</strong></span>
      </div>
    </article>`;
}

function openDialog(title, eyebrow, content) {
  if (dom.dialog.open) dom.dialog.close();
  dom.dialogTitle.textContent = title;
  dom.dialogEyebrow.textContent = eyebrow;
  dom.dialogContent.innerHTML = content;
  dom.dialog.showModal();
  requestAnimationFrame(() => dom.dialogContent.querySelector("input:not([type=hidden]), select, button")?.focus());
}

function closeDialog() {
  if (dom.dialog.open) dom.dialog.close();
}

function formActions(submitLabel = "Salvar") {
  return `
    <div class="form-actions">
      <button class="button button-secondary" type="button" data-close-dialog>Cancelar</button>
      <button class="button button-primary" type="submit">${escapeHTML(submitLabel)}</button>
    </div>`;
}

function categoryOptions(selected = "Outros") {
  return CATEGORIES.map(category => `<option value="${escapeHTML(category)}" ${category === selected ? "selected" : ""}>${escapeHTML(category)}</option>`).join("");
}

function selectedOption(value, selected) {
  return String(value) === String(selected) ? "selected" : "";
}

function defaultDateForMonth() {
  return ui.month === currentMonthKey() ? localISODate() : `${ui.month}-01`;
}

function showTransactionForm(id = "") {
  const item = state.transactions.find(entry => entry.id === id) || {
    type: "expense",
    description: "",
    amount: "",
    category: "Outros",
    date: defaultDateForMonth(),
    status: "paid"
  };
  openDialog(id ? "Editar lançamento" : "Novo lançamento", id ? "ATUALIZAR" : "RECEITA OU DESPESA", `
    <form data-form="transaction" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <span>Tipo</span>
          <div class="segmented">
            <input id="type-expense" type="radio" name="type" value="expense" ${item.type === "expense" ? "checked" : ""} />
            <label for="type-expense">Despesa</label>
            <input id="type-income" type="radio" name="type" value="income" ${item.type === "income" ? "checked" : ""} />
            <label for="type-income">Receita</label>
          </div>
        </div>
        <div class="field field-full">
          <label for="tx-description">Descrição</label>
          <input id="tx-description" name="description" maxlength="70" value="${escapeHTML(item.description)}" placeholder="Ex.: Salário ou supermercado" required />
        </div>
        <div class="field">
          <label for="tx-amount">Valor (R$)</label>
          <input id="tx-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHTML(item.amount)}" placeholder="0,00" required />
        </div>
        <div class="field">
          <label for="tx-date">Data</label>
          <input id="tx-date" name="date" type="date" value="${escapeHTML(item.date)}" required />
        </div>
        <div class="field">
          <label for="tx-category">Categoria</label>
          <select id="tx-category" name="category">${categoryOptions(item.category)}</select>
        </div>
        <div class="field">
          <label for="tx-status">Situação</label>
          <select id="tx-status" name="status">
            <option value="paid" ${selectedOption("paid", item.status)}>Efetivado</option>
            <option value="pending" ${selectedOption("pending", item.status)}>Previsto</option>
          </select>
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Adicionar")}
    </form>`);
}

function showBillForm(id = "") {
  const item = state.bills.find(entry => entry.id === id) || {
    description: "",
    amount: "",
    category: "Moradia",
    dueDate: defaultDateForMonth(),
    status: "pending"
  };
  openDialog(id ? "Editar conta" : "Nova conta a pagar", id ? "ATUALIZAR" : "VENCIMENTO", `
    <form data-form="bill" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <label for="bill-description">Descrição</label>
          <input id="bill-description" name="description" maxlength="70" value="${escapeHTML(item.description)}" placeholder="Ex.: Energia" required />
        </div>
        <div class="field">
          <label for="bill-amount">Valor (R$)</label>
          <input id="bill-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHTML(item.amount)}" required />
        </div>
        <div class="field">
          <label for="bill-due">Vencimento</label>
          <input id="bill-due" name="dueDate" type="date" value="${escapeHTML(item.dueDate)}" required />
        </div>
        <div class="field">
          <label for="bill-category">Categoria</label>
          <select id="bill-category" name="category">${categoryOptions(item.category)}</select>
        </div>
        <div class="field">
          <label for="bill-status">Situação</label>
          <select id="bill-status" name="status">
            <option value="pending" ${selectedOption("pending", item.status)}>Pendente</option>
            <option value="paid" ${selectedOption("paid", item.status)}>Pago</option>
          </select>
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Adicionar")}
    </form>`);
}

function showCardForm(id = "") {
  const item = state.cards.find(entry => entry.id === id) || {
    name: "",
    limit: "",
    closingDay: 5,
    dueDay: 12,
    color: "#2d6bff"
  };
  openDialog(id ? "Editar cartão" : "Novo cartão", id ? "ATUALIZAR" : "LIMITE DE CRÉDITO", `
    <form data-form="card" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <label for="card-name">Nome do cartão</label>
          <input id="card-name" name="name" maxlength="45" value="${escapeHTML(item.name)}" placeholder="Ex.: Cartão principal" required />
        </div>
        <div class="field field-full">
          <label for="card-limit">Limite total (R$)</label>
          <input id="card-limit" name="limit" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHTML(item.limit)}" required />
        </div>
        <div class="field">
          <label for="card-closing">Dia do fechamento</label>
          <input id="card-closing" name="closingDay" type="number" inputmode="numeric" min="1" max="31" value="${escapeHTML(item.closingDay)}" required />
        </div>
        <div class="field">
          <label for="card-due">Dia do vencimento</label>
          <input id="card-due" name="dueDay" type="number" inputmode="numeric" min="1" max="31" value="${escapeHTML(item.dueDay)}" required />
        </div>
        <div class="field field-full">
          <label for="card-color">Cor do cartão</label>
          <input id="card-color" name="color" type="color" value="${safeColor(item.color)}" />
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Adicionar")}
    </form>`);
}

function showPurchaseForm(id = "", preferredCardId = "") {
  if (!state.cards.length) {
    showToast("Cadastre um cartão antes de adicionar a compra.");
    showCardForm();
    return;
  }
  const item = state.purchases.find(entry => entry.id === id) || {
    cardId: preferredCardId || state.cards[0].id,
    description: "",
    totalAmount: "",
    installmentCount: 1,
    purchaseDate: defaultDateForMonth(),
    firstDueDate: defaultDateForMonth(),
    category: "Compras"
  };
  openDialog(id ? "Editar compra" : "Nova compra parcelada", id ? "ATUALIZAR" : "CARTÃO E PARCELAS", `
    <form data-form="purchase" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <label for="purchase-card">Cartão</label>
          <select id="purchase-card" name="cardId" required>
            ${state.cards.map(card => `<option value="${escapeHTML(card.id)}" ${selectedOption(card.id, item.cardId)}>${escapeHTML(card.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field field-full">
          <label for="purchase-description">Descrição</label>
          <input id="purchase-description" name="description" maxlength="70" value="${escapeHTML(item.description)}" placeholder="Ex.: Celular" required />
        </div>
        <div class="field">
          <label for="purchase-total">Valor total (R$)</label>
          <input id="purchase-total" name="totalAmount" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHTML(item.totalAmount)}" required />
        </div>
        <div class="field">
          <label for="purchase-count">Quantidade de parcelas</label>
          <input id="purchase-count" name="installmentCount" type="number" inputmode="numeric" min="1" max="60" value="${escapeHTML(item.installmentCount)}" required />
        </div>
        <div class="field">
          <label for="purchase-date">Data da compra</label>
          <input id="purchase-date" name="purchaseDate" type="date" value="${escapeHTML(item.purchaseDate)}" required />
        </div>
        <div class="field">
          <label for="purchase-due">Vencimento da 1ª parcela</label>
          <input id="purchase-due" name="firstDueDate" type="date" value="${escapeHTML(item.firstDueDate)}" required />
        </div>
        <div class="field field-full">
          <label for="purchase-category">Categoria</label>
          <select id="purchase-category" name="category">${categoryOptions(item.category)}</select>
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Adicionar compra")}
    </form>`);
}

function showBudgetForm(id = "") {
  const item = state.budgets.find(entry => entry.id === id) || { month: ui.month, category: "Alimentação", limit: "" };
  openDialog(id ? "Editar orçamento" : "Novo orçamento", id ? "ATUALIZAR" : "LIMITE POR CATEGORIA", `
    <form data-form="budget" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <label for="budget-month">Mês</label>
          <input id="budget-month" name="month" type="month" value="${escapeHTML(item.month)}" required />
        </div>
        <div class="field field-full">
          <label for="budget-category">Categoria</label>
          <select id="budget-category" name="category">${categoryOptions(item.category)}</select>
        </div>
        <div class="field field-full">
          <label for="budget-limit">Limite de gasto (R$)</label>
          <input id="budget-limit" name="limit" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHTML(item.limit)}" required />
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Criar orçamento")}
    </form>`);
}

function showGoalForm(id = "") {
  const item = state.goals.find(entry => entry.id === id) || { name: "", target: "", current: 0, deadline: "" };
  openDialog(id ? "Editar meta" : "Nova meta financeira", id ? "ATUALIZAR" : "SEU OBJETIVO", `
    <form data-form="goal" data-id="${escapeHTML(id)}">
      <div class="field-grid">
        <div class="field field-full">
          <label for="goal-name">Nome da meta</label>
          <input id="goal-name" name="name" maxlength="70" value="${escapeHTML(item.name)}" placeholder="Ex.: Reserva de emergência" required />
        </div>
        <div class="field">
          <label for="goal-target">Valor da meta (R$)</label>
          <input id="goal-target" name="target" type="number" inputmode="decimal" min="0.01" step="0.01" value="${escapeHTML(item.target)}" required />
        </div>
        <div class="field">
          <label for="goal-current">Já guardado (R$)</label>
          <input id="goal-current" name="current" type="number" inputmode="decimal" min="0" step="0.01" value="${escapeHTML(item.current)}" required />
        </div>
        <div class="field field-full">
          <label for="goal-deadline">Prazo (opcional)</label>
          <input id="goal-deadline" name="deadline" type="date" value="${escapeHTML(item.deadline || "")}" />
        </div>
      </div>
      ${formActions(id ? "Atualizar" : "Criar meta")}
    </form>`);
}

function showContributionForm(id) {
  const goal = state.goals.find(item => item.id === id);
  if (!goal) return;
  openDialog("Adicionar à meta", "CONTRIBUIÇÃO", `
    <form data-form="contribution" data-id="${escapeHTML(id)}">
      <p class="confirm-copy">Meta: <strong>${escapeHTML(goal.name)}</strong><br />Guardado até agora: <strong>${money(goal.current)}</strong></p>
      <div class="field">
        <label for="contribution-amount">Valor da contribuição (R$)</label>
        <input id="contribution-amount" name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" required />
      </div>
      ${formActions("Adicionar valor")}
    </form>`);
}

function showMonthForm() {
  openDialog("Selecionar período", "MÊS DE REFERÊNCIA", `
    <form data-form="month">
      <div class="field">
        <label for="selected-month">Mês</label>
        <input id="selected-month" name="month" type="month" value="${escapeHTML(ui.month)}" required />
      </div>
      ${formActions("Exibir mês")}
    </form>`);
}

function showQuickAdd() {
  openDialog("O que deseja adicionar?", "NOVO REGISTRO", `
    <div class="quick-grid">
      <button class="quick-action" type="button" data-action="add-transaction"><span class="quick-icon tone-income">${icon("arrowDown")}</span><span>Receita ou despesa</span></button>
      <button class="quick-action" type="button" data-action="add-bill"><span class="quick-icon tone-bill">${icon("receipt")}</span><span>Conta a pagar</span></button>
      <button class="quick-action" type="button" data-action="add-purchase"><span class="quick-icon tone-card">${icon("card")}</span><span>Compra parcelada</span></button>
      <button class="quick-action" type="button" data-action="add-goal"><span class="quick-icon tone-income">${icon("target")}</span><span>Meta financeira</span></button>
    </div>`);
}

function showCardActions(id) {
  const card = state.cards.find(item => item.id === id);
  if (!card) return;
  openDialog(card.name, "OPÇÕES DO CARTÃO", `
    <div class="stack">
      <button class="button button-primary button-block" type="button" data-action="add-purchase" data-card-id="${escapeHTML(id)}">${icon("plus")} Adicionar compra</button>
      <button class="button button-secondary button-block" type="button" data-action="edit-card" data-id="${escapeHTML(id)}">${icon("edit")} Editar cartão</button>
      <button class="button button-danger button-block" type="button" data-action="delete-item" data-kind="card" data-id="${escapeHTML(id)}" data-label="${escapeHTML(card.name)}">${icon("trash")} Excluir cartão</button>
    </div>`);
}

function showDeleteConfirm(kind, id, label) {
  const cardWarning = kind === "card" ? " As compras e parcelas ligadas a ele também serão excluídas." : "";
  openDialog("Confirmar exclusão", "ATENÇÃO", `
    <p class="confirm-copy">Deseja excluir <strong>${escapeHTML(label)}</strong>?${escapeHTML(cardWarning)} Esta ação não pode ser desfeita.</p>
    <div class="form-actions">
      <button class="button button-secondary" type="button" data-close-dialog>Cancelar</button>
      <button class="button button-danger" type="button" data-action="confirm-delete" data-kind="${escapeHTML(kind)}" data-id="${escapeHTML(id)}">Excluir</button>
    </div>`);
}

function showResetConfirm(useDemo = false) {
  openDialog(useDemo ? "Carregar demonstração?" : "Apagar todos os dados?", "CONFIRMAÇÃO", `
    <p class="confirm-copy">${useDemo
      ? "Os dados atuais serão substituídos por informações de exemplo para você conhecer o aplicativo."
      : "Receitas, despesas, cartões, contas, orçamentos e metas serão apagados deste aparelho. Faça um backup antes, se precisar."}</p>
    <div class="form-actions">
      <button class="button button-secondary" type="button" data-close-dialog>Cancelar</button>
      <button class="button ${useDemo ? "button-primary" : "button-danger"}" type="button" data-action="${useDemo ? "confirm-demo" : "confirm-clear"}">${useDemo ? "Carregar" : "Apagar tudo"}</button>
    </div>`);
}

function upsert(collectionName, item) {
  const collection = state[collectionName];
  const index = collection.findIndex(entry => entry.id === item.id);
  if (index >= 0) collection[index] = item;
  else collection.unshift(item);
}

function handleFormSubmit(form) {
  const type = form.dataset.form;
  const id = form.dataset.id || "";
  const data = Object.fromEntries(new FormData(form));

  if (type === "transaction") {
    upsert("transactions", {
      id: id || uid("tx"),
      type: data.type,
      description: data.description.trim(),
      amount: Number(data.amount),
      category: data.category,
      date: data.date,
      status: data.status
    });
    ui.month = monthKey(data.date);
    closeDialog();
    commit(id ? "Lançamento atualizado." : "Lançamento adicionado.");
  }

  if (type === "bill") {
    upsert("bills", {
      id: id || uid("bill"),
      description: data.description.trim(),
      amount: Number(data.amount),
      category: data.category,
      dueDate: data.dueDate,
      status: data.status
    });
    ui.month = monthKey(data.dueDate);
    closeDialog();
    commit(id ? "Conta atualizada." : "Conta adicionada.");
  }

  if (type === "card") {
    upsert("cards", {
      id: id || uid("card"),
      name: data.name.trim(),
      limit: Number(data.limit),
      closingDay: Number(data.closingDay),
      dueDay: Number(data.dueDay),
      color: safeColor(data.color)
    });
    closeDialog();
    commit(id ? "Cartão atualizado." : "Cartão adicionado.");
  }

  if (type === "purchase") {
    const existing = state.purchases.find(item => item.id === id);
    upsert("purchases", {
      id: id || uid("purchase"),
      cardId: data.cardId,
      description: data.description.trim(),
      totalAmount: Number(data.totalAmount),
      installmentCount: Number(data.installmentCount),
      purchaseDate: data.purchaseDate,
      firstDueDate: data.firstDueDate,
      category: data.category,
      paidInstallments: existing?.paidInstallments || []
    });
    ui.month = monthKey(data.firstDueDate);
    closeDialog();
    commit(id ? "Compra atualizada." : "Compra parcelada adicionada.");
  }

  if (type === "budget") {
    const duplicate = state.budgets.find(item => item.id !== id && item.month === data.month && item.category === data.category);
    const targetId = id || duplicate?.id || uid("budget");
    upsert("budgets", {
      id: targetId,
      month: data.month,
      category: data.category,
      limit: Number(data.limit)
    });
    ui.month = data.month;
    closeDialog();
    commit(id || duplicate ? "Orçamento atualizado." : "Orçamento criado.");
  }

  if (type === "goal") {
    upsert("goals", {
      id: id || uid("goal"),
      name: data.name.trim(),
      target: Number(data.target),
      current: Number(data.current),
      deadline: data.deadline || ""
    });
    closeDialog();
    commit(id ? "Meta atualizada." : "Meta criada.");
  }

  if (type === "contribution") {
    const goal = state.goals.find(item => item.id === id);
    if (goal) goal.current = Number(goal.current || 0) + Number(data.amount);
    closeDialog();
    commit("Valor adicionado à meta.");
  }

  if (type === "month") {
    ui.month = data.month;
    closeDialog();
    saveState();
    renderAll();
  }
}

function deleteItem(kind, id) {
  const collections = {
    transaction: "transactions",
    bill: "bills",
    card: "cards",
    purchase: "purchases",
    budget: "budgets",
    goal: "goals"
  };
  const collection = collections[kind];
  if (!collection) return;
  state[collection] = state[collection].filter(item => item.id !== id);
  if (kind === "card") state.purchases = state.purchases.filter(item => item.cardId !== id);
  closeDialog();
  commit("Item excluído.");
}

function toggleBill(id) {
  const bill = state.bills.find(item => item.id === id);
  if (!bill) return;
  bill.status = bill.status === "paid" ? "pending" : "paid";
  commit(bill.status === "paid" ? "Conta marcada como paga." : "Pagamento desfeito.");
}

function toggleInstallment(id, number) {
  const purchase = state.purchases.find(item => item.id === id);
  if (!purchase) return;
  const paid = new Set((purchase.paidInstallments || []).map(Number));
  if (paid.has(Number(number))) paid.delete(Number(number));
  else paid.add(Number(number));
  purchase.paidInstallments = [...paid].sort((a, b) => a - b);
  commit("Parcela marcada como paga.");
}

function exportData() {
  const payload = {
    app: "Meu Controle Financeiro",
    exportedAt: new Date().toISOString(),
    data: state
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `backup-financeiro-${localISODate()}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("Backup exportado.");
}

async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    const source = parsed?.data || parsed;
    if (!source || typeof source !== "object") throw new Error("invalid");
    state = normalizeState(source);
    ui.month = state.settings.selectedMonth || currentMonthKey();
    state.settings.demo = false;
    saveState("Backup importado com sucesso.");
    renderAll();
  } catch {
    showToast("Arquivo de backup inválido.", true);
  } finally {
    dom.importFile.value = "";
  }
}

function setScreen(screen) {
  if (!SCREEN_TITLES[screen]) return;
  ui.screen = screen;
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#app-content")?.focus({ preventScroll: true });
}

document.addEventListener("submit", event => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  handleFormSubmit(form);
});

document.addEventListener("input", event => {
  if (event.target.id === "transaction-search") {
    const cursor = event.target.selectionStart;
    ui.search = event.target.value;
    renderTransactions();
    const input = document.querySelector("#transaction-search");
    input?.focus();
    input?.setSelectionRange(cursor, cursor);
  }
});

document.addEventListener("click", async event => {
  const nav = event.target.closest("[data-nav]");
  if (nav) {
    setScreen(nav.dataset.nav);
    return;
  }

  const monthStep = event.target.closest("[data-month-step]");
  if (monthStep) {
    ui.month = shiftMonth(ui.month, Number(monthStep.dataset.monthStep));
    saveState();
    renderAll();
    return;
  }

  const filter = event.target.closest("[data-filter]");
  if (filter) {
    ui.transactionFilter = filter.dataset.filter;
    renderTransactions();
    return;
  }

  if (event.target.closest("[data-close-dialog]")) {
    closeDialog();
    return;
  }

  const target = event.target.closest("[data-action]");
  if (!target) return;
  const { action, id, kind, label } = target.dataset;

  const actions = {
    "quick-add": showQuickAdd,
    "add-transaction": () => showTransactionForm(),
    "edit-transaction": () => showTransactionForm(id),
    "add-bill": () => showBillForm(),
    "edit-bill": () => showBillForm(id),
    "add-card": () => showCardForm(),
    "edit-card": () => showCardForm(id),
    "add-purchase": () => showPurchaseForm("", target.dataset.cardId || ""),
    "edit-purchase": () => showPurchaseForm(id),
    "add-budget": () => showBudgetForm(),
    "edit-budget": () => showBudgetForm(id),
    "add-goal": () => showGoalForm(),
    "edit-goal": () => showGoalForm(id),
    "contribute-goal": () => showContributionForm(id),
    "choose-month": showMonthForm,
    "card-actions": () => showCardActions(id),
    "delete-item": () => showDeleteConfirm(kind, id, label),
    "confirm-delete": () => deleteItem(kind, id),
    "toggle-bill": () => toggleBill(id),
    "toggle-installment": () => toggleInstallment(id, target.dataset.number),
    "go-transactions": () => setScreen("transactions"),
    "go-planning": () => setScreen("planning"),
    "export-data": exportData,
    "import-data": () => dom.importFile.click(),
    "load-demo": () => hasAnyData() ? showResetConfirm(true) : loadDemo(),
    "clear-data": () => showResetConfirm(false),
    "confirm-demo": loadDemo,
    "confirm-clear": clearData,
    "install-app": installApp
  };
  actions[action]?.();
});

function loadDemo() {
  state = createDemoState();
  ui.month = state.settings.selectedMonth;
  closeDialog();
  saveState("Demonstração carregada.");
  renderAll();
}

function clearData() {
  state = createEmptyState();
  state.settings.selectedMonth = ui.month;
  state.settings.firstRun = false;
  state.settings.demo = false;
  closeDialog();
  saveState("Todos os dados foram apagados.");
  renderAll();
}

async function installApp() {
  if (!deferredInstallPrompt) {
    showToast("No Android, abra o menu do navegador e toque em “Instalar aplicativo”.");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  dom.installButton.classList.add("is-hidden");
}

dom.installButton.dataset.action = "install-app";
dom.importFile.addEventListener("change", () => {
  const [file] = dom.importFile.files;
  if (file) importData(file);
});

dom.dialog.addEventListener("click", event => {
  if (event.target !== dom.dialog) return;
  const bounds = dom.dialog.getBoundingClientRect();
  const inside = event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
  if (!inside) closeDialog();
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  dom.installButton.classList.remove("is-hidden");
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  dom.installButton.classList.add("is-hidden");
  showToast("Aplicativo instalado com sucesso.");
});

window.addEventListener("storage", event => {
  if (event.key !== STORAGE_KEY) return;
  state = loadState();
  ui.month = state.settings.selectedMonth || ui.month;
  renderAll();
});

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}

renderAll();

const initialAction = new URLSearchParams(location.search).get("action");
if (["transaction", "bill", "purchase", "goal"].includes(initialAction)) {
  setTimeout(() => ({
    transaction: showTransactionForm,
    bill: showBillForm,
    purchase: showPurchaseForm,
    goal: showGoalForm
  })[initialAction]?.(), 160);
}
