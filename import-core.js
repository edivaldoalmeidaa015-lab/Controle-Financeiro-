const BANK_LABELS = {
  inter: "Inter",
  mercado_pago: "Mercado Pago",
  santander: "Santander",
  caju: "Caju Alimentação"
};

const HEADER_ALIASES = {
  date: [
    "data", "date", "data movimento", "data do movimento", "data transacao",
    "data da transacao", "data operacao", "data da operacao", "data lancamento",
    "data do lancamento", "transaction date", "operation date", "release date",
    "creation date", "date created", "created at", "data e hora"
  ],
  description: [
    "descricao", "description", "detalhes", "details", "historico", "lancamento",
    "estabelecimento", "merchant", "nome estabelecimento", "nome", "name",
    "transaction description", "release description", "descricao da transacao",
    "descricao do lancamento"
  ],
  secondaryDescription: [
    "tipo transacao", "tipo da transacao", "transaction type", "release type",
    "categoria estabelecimento", "merchant category", "produto"
  ],
  amount: [
    "valor", "amount", "valor transacao", "valor da transacao", "valor operacao",
    "valor da operacao", "valor lancamento", "valor do lancamento", "valor liquido",
    "net amount", "transaction amount", "transaction net amount", "release amount",
    "total", "value"
  ],
  debit: ["debito", "debit", "valor debito", "valor do debito", "saida", "withdrawal"],
  credit: ["credito", "credit", "valor credito", "valor do credito", "entrada", "deposit"],
  direction: [
    "natureza", "tipo movimento", "tipo do movimento", "movimentacao", "direction",
    "debito credito", "credito debito"
  ],
  id: [
    "id", "transaction id", "id transacao", "id da transacao", "reference id",
    "referencia", "codigo", "identificador", "fitid", "external reference"
  ]
};

const CATEGORY_RULES = [
  ["Alimentação", [
    "mercado", "supermercado", "atacadao", "assai", "carrefour", "padaria", "restaurante",
    "lanchonete", "pizzaria", "hamburguer", "ifood", "delivery", "acai", "cafe", "alimentacao"
  ]],
  ["Transporte", [
    "combustivel", "gasolina", "etanol", "diesel", "posto", "uber", "99app", "taxi",
    "estacionamento", "pedagio", "oficina", "autopeca", "pneu"
  ]],
  ["Moradia", [
    "aluguel", "condominio", "energia", "eletricidade", "cosern", "agua", "caern",
    "gas", "material construcao", "moveis"
  ]],
  ["Saúde", [
    "farmacia", "drogaria", "hospital", "clinica", "laboratorio", "medico", "dentista",
    "plano de saude", "consulta"
  ]],
  ["Educação", ["escola", "faculdade", "universidade", "curso", "livraria", "mensalidade escolar"]],
  ["Assinaturas", [
    "netflix", "spotify", "amazon prime", "disney", "globoplay", "youtube premium",
    "internet", "telefone", "claro", "tim", "vivo", "assinatura"
  ]],
  ["Lazer", ["cinema", "parque", "show", "ingresso", "viagem", "hotel", "pousada", "jogo"]],
  ["Investimentos", ["investimento", "aplicacao", "tesouro", "cdb", "fundo", "corretora"]],
  ["Salário", ["salario", "pagamento salario", "folha pagamento", "remuneracao"]],
  ["Compras", [
    "mercado livre", "shopee", "magazine", "amazon", "loja", "shopping", "roupa",
    "calcado", "eletronico", "pix compra"
  ]]
];

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[_/\\-]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value);
}

function findColumn(headers, aliases) {
  const normalizedAliases = aliases.map(normalizeHeader);
  let index = headers.findIndex(header => normalizedAliases.includes(header));
  if (index >= 0) return index;
  index = headers.findIndex(header => normalizedAliases.some(alias => header.startsWith(`${alias} `) || header.endsWith(` ${alias}`)));
  return index;
}

function countDelimiter(line, delimiter) {
  let quoted = false;
  let count = 0;
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === '"') {
      if (quoted && line[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && line[index] === delimiter) {
      count += 1;
    }
  }
  return count;
}

export function detectDelimiter(text) {
  const firstLine = String(text).replace(/^\uFEFF/, "").split(/\r?\n/).find(line => line.trim()) || "";
  const options = [";", ",", "\t"];
  return options
    .map(delimiter => ({ delimiter, count: countDelimiter(firstLine, delimiter) }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ";";
}

export function parseDelimitedRows(text, delimiter = detectDelimiter(text)) {
  const source = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

export function parseMoneyValue(value) {
  let raw = String(value ?? "").trim();
  if (!raw || raw === "-") return null;
  const negativeParentheses = /^\(.*\)$/.test(raw);
  raw = raw
    .replace(/[()]/g, "")
    .replace(/R\$/gi, "")
    .replace(/\s|\u00a0/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw || !/[0-9]/.test(raw)) return null;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    raw = comma > dot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (comma >= 0) {
    raw = /,\d{1,2}$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if ((raw.match(/\./g) || []).length > 1) {
    const last = raw.lastIndexOf(".");
    raw = `${raw.slice(0, last).replace(/\./g, "")}${raw.slice(last)}`;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return Math.round((negativeParentheses ? -Math.abs(parsed) : parsed) * 100) / 100;
}

function isoDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > 31) return "";
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function parseStatementDate(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  if (match) return isoDate(match[1], match[2], match[3]);
  match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
  if (match) {
    const year = match[3].length === 2 ? Number(match[3]) + (Number(match[3]) >= 70 ? 1900 : 2000) : match[3];
    return isoDate(year, match[2], match[1]);
  }
  return "";
}

function humanizeDescription(value) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) return "Lançamento sem descrição";
  if (!/^[A-Z0-9 .,:;\-_/]+$/.test(cleaned) && !/^[a-z0-9 .,:;\-_/]+$/.test(cleaned)) return cleaned;
  const titled = cleaned.toLocaleLowerCase("pt-BR").replace(/(^|[\s/\-])([a-zà-ÿ])/g, (_, prefix, letter) => `${prefix}${letter.toLocaleUpperCase("pt-BR")}`);
  return titled
    .replace(/\bPix\b/g, "PIX")
    .replace(/\bTed\b/g, "TED")
    .replace(/\bDoc\b/g, "DOC")
    .replace(/\bCaju\b/g, "Caju")
    .replace(/\bInter\b/g, "Inter")
    .replace(/\bSantander\b/g, "Santander");
}

export function suggestCategory(description, bank = "") {
  if (bank === "caju") return "Alimentação";
  const normalized = normalizeText(description);
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some(keyword => normalized.includes(normalizeText(keyword)))) return category;
  }
  return "Outros";
}

function bankLabel(bank) {
  return BANK_LABELS[bank] || "Extrato importado";
}

function transactionKey(item, bank = item.sourceKey || item.source || "") {
  if (item.importKey) return item.importKey;
  if (item.externalId) return `${bank}|id|${String(item.externalId).trim()}`;
  return [
    bank,
    item.date,
    item.type,
    Number(item.amount || 0).toFixed(2),
    normalizeText(item.description)
  ].join("|");
}

function buildTransaction({ bank, date, description, signedAmount, externalId = "" }) {
  const amount = Math.abs(Number(signedAmount));
  if (!date || !description || !Number.isFinite(amount) || amount <= 0) return null;
  const type = signedAmount < 0 || bank === "caju" ? "expense" : "income";
  const transaction = {
    type,
    description: humanizeDescription(description),
    amount: Math.round(amount * 100) / 100,
    category: suggestCategory(description, bank),
    date,
    status: "paid",
    source: bankLabel(bank),
    sourceKey: bank,
    externalId: String(externalId || "").trim()
  };
  transaction.importKey = transactionKey(transaction, bank);
  return transaction;
}

function readOFXTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>\\s*([^<\\r\\n]+)`, "i"));
  return match?.[1]?.trim() || "";
}

export function parseOFX(text, bank) {
  const source = String(text).replace(/\0/g, "");
  const blocks = source.match(/<STMTTRN\b[^>]*>[\s\S]*?(?=<STMTTRN\b|<\/BANKTRANLIST>|<\/CCBANKTRANLIST>|<\/OFX>|$)/gi) || [];
  const transactions = [];
  let ignored = 0;

  blocks.forEach(block => {
    const signedAmount = parseMoneyValue(readOFXTag(block, "TRNAMT"));
    const date = parseStatementDate(readOFXTag(block, "DTPOSTED") || readOFXTag(block, "DTUSER"));
    const name = readOFXTag(block, "NAME");
    const memo = readOFXTag(block, "MEMO");
    const description = [name, memo].filter(Boolean).filter((value, index, list) => list.findIndex(entry => normalizeText(entry) === normalizeText(value)) === index).join(" — ");
    const transaction = buildTransaction({
      bank,
      date,
      description,
      signedAmount,
      externalId: readOFXTag(block, "FITID") || readOFXTag(block, "REFNUM")
    });
    if (transaction) transactions.push(transaction);
    else ignored += 1;
  });

  if (!blocks.length) throw new Error("Não encontrei lançamentos nesse arquivo OFX.");
  return { format: "OFX", transactions, ignored };
}

function directionFromValue(value) {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  if (/^(d|debito|debit|saida|expense|despesa)$/.test(normalized) || normalized.includes("debito")) return -1;
  if (/^(c|credito|credit|entrada|income|receita)$/.test(normalized) || normalized.includes("credito")) return 1;
  return 0;
}

export function parseCSV(text, bank) {
  const rows = parseDelimitedRows(text);
  if (rows.length < 2) throw new Error("O CSV não possui linhas suficientes.");
  const headers = rows[0].map(normalizeHeader);
  const indexes = Object.fromEntries(Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)]));
  if (indexes.date < 0) throw new Error("Não encontrei a coluna de data no CSV.");
  if (indexes.amount < 0 && indexes.debit < 0 && indexes.credit < 0) throw new Error("Não encontrei a coluna de valor no CSV.");

  const transactions = [];
  let ignored = 0;
  rows.slice(1).forEach((row, rowIndex) => {
    const date = parseStatementDate(row[indexes.date]);
    const primary = indexes.description >= 0 ? row[indexes.description] : "";
    const secondary = indexes.secondaryDescription >= 0 ? row[indexes.secondaryDescription] : "";
    const description = [primary, secondary]
      .filter(Boolean)
      .filter((value, index, list) => list.findIndex(entry => normalizeText(entry) === normalizeText(value)) === index)
      .join(" — ") || `Lançamento ${rowIndex + 1}`;

    let signedAmount = null;
    const debit = indexes.debit >= 0 ? parseMoneyValue(row[indexes.debit]) : null;
    const credit = indexes.credit >= 0 ? parseMoneyValue(row[indexes.credit]) : null;
    if (debit != null && Math.abs(debit) > 0) signedAmount = -Math.abs(debit);
    else if (credit != null && Math.abs(credit) > 0) signedAmount = Math.abs(credit);
    else if (indexes.amount >= 0) signedAmount = parseMoneyValue(row[indexes.amount]);

    const direction = indexes.direction >= 0 ? directionFromValue(row[indexes.direction]) : 0;
    if (signedAmount != null && direction) signedAmount = Math.abs(signedAmount) * direction;
    if (signedAmount != null && bank === "caju") signedAmount = -Math.abs(signedAmount);

    const transaction = buildTransaction({
      bank,
      date,
      description,
      signedAmount,
      externalId: indexes.id >= 0 ? row[indexes.id] : ""
    });
    if (transaction) transactions.push(transaction);
    else ignored += 1;
  });

  return { format: "CSV", transactions, ignored };
}

export function parseStatement({ text, fileName = "", bank }) {
  if (!BANK_LABELS[bank]) throw new Error("Selecione a instituição correta.");
  const source = String(text ?? "");
  const isOFX = /\.ofx$/i.test(fileName) || /<OFX[>\s]/i.test(source);
  const parsed = isOFX ? parseOFX(source, bank) : parseCSV(source, bank);
  return { bank, bankLabel: bankLabel(bank), ...parsed };
}

export function removeImportedDuplicates(imported, existing = []) {
  const seen = new Set(existing.map(item => transactionKey(item, item.sourceKey || item.source || "")));
  const unique = [];
  const duplicates = [];
  imported.forEach(item => {
    const key = transactionKey(item, item.sourceKey || item.source || "");
    if (seen.has(key)) duplicates.push(item);
    else {
      seen.add(key);
      unique.push({ ...item, importKey: key });
    }
  });
  return { unique, duplicates };
}

export function supportedBankLabel(bank) {
  return bankLabel(bank);
}
