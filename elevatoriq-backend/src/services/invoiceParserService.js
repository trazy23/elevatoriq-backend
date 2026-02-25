function normalizeLine(line = '') {
  return String(line).replace(/\s+/g, ' ').trim();
}

function parseMoneyToNumber(value) {
  if (value == null) return null;

  let text = String(value).trim();
  if (!text) return null;

  const isNegative = /^\(.*\)$/.test(text) || /^-/.test(text);
  text = text.replace(/[()]/g, '').replace(/[^\d,.-]/g, '');

  if (!text) return null;

  const commaCount = (text.match(/,/g) || []).length;
  const dotCount = (text.match(/\./g) || []).length;

  // If only comma exists and last comma is followed by 2 digits, treat comma as decimal separator.
  if (commaCount > 0 && dotCount === 0 && /,\d{2}$/.test(text)) {
    text = text.replace(/,/g, '.');
  } else if (commaCount > 0 && dotCount > 0) {
    // Decimal separator is whichever appears last.
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');

    if (lastComma > lastDot) {
      text = text.replace(/\./g, '').replace(/,/g, '.');
    } else {
      text = text.replace(/,/g, '');
    }
  } else {
    text = text.replace(/,/g, '');
  }

  const parsed = Number.parseFloat(text);
  if (!Number.isFinite(parsed)) return null;
  return isNegative ? -Math.abs(parsed) : parsed;
}

function extractMoneyTokens(line) {
  const matches = line.match(/(?:\(?-?\$?\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})\)?|\(?-?\$?\d+(?:[,.]\d{2})\)?)/g) || [];
  return matches
    .map((raw) => parseMoneyToNumber(raw))
    .filter((n) => Number.isFinite(n));
}

function stripHeaderNoise(line) {
  return normalizeLine(line)
    .replace(/^\[(PDF|DOCX?):[^\]]+\]\s*/i, '')
    .replace(/^page\s+\d+\s+of\s+\d+$/i, '');
}

function extractVendor(lines) {
  const labeled = [
    /^(vendor|supplier|from|sold by|bill from|service provider)\s*:\s*(.+)$/i,
    /^(vendor|supplier|from|sold by|bill from|service provider)\s+(.+)$/i,
  ];

  for (const line of lines) {
    for (const pattern of labeled) {
      const m = line.match(pattern);
      if (m?.[2]) return m[2].trim();
    }
  }

  const stopWords = /\b(invoice|bill to|ship to|date|due date|subtotal|total|statement)\b/i;
  const candidate = lines.slice(0, 10).find((line) => {
    if (stopWords.test(line)) return false;
    if (line.length < 3 || line.length > 90) return false;
    if (/^[\d\W]+$/.test(line)) return false;
    return /(inc\.?|llc|ltd\.?|corp\.?|company|services?|elevator|schindler|otis|kone|thyssenkrupp|tk elevator|tke)/i.test(line);
  });

  return candidate || null;
}

function extractElevatorBrand(lines) {
  const brandMap = {
    otis: 'OTIS',
    schindler: 'SCHINDLER',
    kone: 'KONE',
    thyssenkrupp: 'THYSSENKRUPP',
    'tk elevator': 'TK ELEVATOR',
    tke: 'TK ELEVATOR',
    mitsubishi: 'MITSUBISHI',
    fujitec: 'FUJITEC',
    hyundai: 'HYUNDAI',
  };

  for (const line of lines) {
    const labelMatch = line.match(/^(brand|manufacturer|oem|elevator brand)\s*:\s*(.+)$/i);
    if (labelMatch?.[2]) {
      const labeled = labelMatch[2].trim();
      const canonical = Object.entries(brandMap).find(([k]) => labeled.toLowerCase().includes(k));
      return canonical ? canonical[1] : labeled;
    }

    const found = Object.entries(brandMap).find(([brand]) => line.toLowerCase().includes(brand));
    if (found) return found[1];
  }

  return null;
}

function extractElevatorModel(lines) {
  const patterns = [
    /^(model|elevator model|unit model|equipment model|controller model)\s*:\s*(.+)$/i,
    /\bmodel\s*#?\s*[:\-]\s*([a-z0-9 _./-]{2,})$/i,
  ];

  for (const line of lines) {
    for (const pattern of patterns) {
      const m = line.match(pattern);
      if (m?.[2]) return m[2].trim();
      if (m?.[1] && pattern.source.includes('\\bmodel')) return m[1].trim();
    }
  }

  return null;
}

function extractTotals(lines) {
  const totals = { subtotal: null, tax: null, total: null };

  const labels = {
    subtotal: /\b(subtotal|sub total|net amount|before tax)\b/i,
    tax: /\b(tax|sales tax|vat|gst|hst)\b/i,
    total: /\b(total due|amount due|grand total|invoice total|balance due|total)\b/i,
  };

  for (const line of lines) {
    const money = extractMoneyTokens(line);
    if (!money.length) continue;

    if (totals.subtotal == null && labels.subtotal.test(line)) totals.subtotal = money[money.length - 1];
    if (totals.tax == null && labels.tax.test(line)) totals.tax = money[money.length - 1];
    if (totals.total == null && labels.total.test(line)) totals.total = money[money.length - 1];
  }

  return totals;
}

function extractQuantity(line) {
  const leading = line.match(/^\s*(\d+(?:\.\d+)?)\s+(?:x\s+)?/i);
  if (leading) return Number.parseFloat(leading[1]);

  const inline = line.match(/\bqty\s*[:#]?\s*(\d+(?:\.\d+)?)/i);
  if (inline) return Number.parseFloat(inline[1]);

  return null;
}

function cleanItemDescription(line) {
  return normalizeLine(
    line
      .replace(/^\s*(\d+(?:\.\d+)?)\s+(?:x\s+)?/i, '')
      .replace(/\bqty\s*[:#]?\s*\d+(?:\.\d+)?/ig, '')
      .replace(/\(?-?\$?\d{1,3}(?:[,.]\d{3})*(?:[,.]\d{2})\)?/g, '')
      .replace(/[.]{2,}/g, ' ')
      .replace(/[|]+/g, ' ')
  );
}

function isLikelySummaryLine(line) {
  return /\b(subtotal|tax|total due|amount due|grand total|invoice total|balance due|total|payment|past due)\b/i.test(line);
}

function extractLineItems(lines) {
  const items = [];

  for (const line of lines) {
    if (isLikelySummaryLine(line)) continue;

    const money = extractMoneyTokens(line);
    if (!money.length) continue;

    const description = cleanItemDescription(line);
    if (!description || description.length < 2) continue;

    const quantity = extractQuantity(line);
    const total = money[money.length - 1] ?? null;
    const unitPrice = money.length > 1 ? money[money.length - 2] : null;

    if (quantity != null && unitPrice == null && total != null) {
      items.push({ description, quantity, unit_price: total / quantity, total });
      continue;
    }

    items.push({ description, quantity, unit_price: unitPrice, total });
  }

  return items.slice(0, 75);
}

function parseInvoiceText(rawText = '') {
  const lines = String(rawText)
    .split(/\n/)
    .map((line) => stripHeaderNoise(line))
    .filter(Boolean);

  const totals = extractTotals(lines);
  const lineItems = extractLineItems(lines);

  if (totals.subtotal == null && lineItems.length) {
    const sum = lineItems.reduce((acc, item) => acc + (item.total || 0), 0);
    if (sum > 0) totals.subtotal = Number(sum.toFixed(2));
  }

  return {
    vendor: extractVendor(lines),
    elevator_brand: extractElevatorBrand(lines),
    elevator_model: extractElevatorModel(lines),
    line_items: lineItems,
    totals,
  };
}

module.exports = {
  parseInvoiceText,
  parseMoneyToNumber,
};
