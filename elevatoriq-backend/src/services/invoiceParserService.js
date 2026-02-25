function parseMoneyToNumber(value) {
  if (!value) return null;
  const cleaned = String(value).replace(/[^0-9.-]/g, '');
  if (!cleaned) return null;
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLine(line) {
  return line.replace(/\s+/g, ' ').trim();
}

function extractVendor(lines) {
  const vendorLabel = lines.find((line) => /^vendor\s*:/i.test(line));
  if (vendorLabel) {
    return vendorLabel.split(':').slice(1).join(':').trim() || null;
  }

  const fromLabel = lines.find((line) => /^from\s*:/i.test(line));
  if (fromLabel) {
    return fromLabel.split(':').slice(1).join(':').trim() || null;
  }

  // Fallback: first meaningful line if it looks like a company name
  const first = lines.find((line) => /[a-z]/i.test(line));
  if (first && /(inc\.?|llc|corp\.?|co\.?|elevator|thyssenkrupp|otis|schindler|kone|tke)/i.test(first)) {
    return first;
  }

  return null;
}

function extractElevatorBrand(lines) {
  const brandLabel = lines.find((line) => /^(brand|manufacturer)\s*:/i.test(line));
  if (brandLabel) {
    return brandLabel.split(':').slice(1).join(':').trim() || null;
  }

  const knownBrands = ['otis', 'schindler', 'kone', 'thyssenkrupp', 'tk elevator', 'tke', 'mitsubishi', 'fujitec', 'hyundai'];
  const match = lines.find((line) => knownBrands.some((brand) => line.toLowerCase().includes(brand)));
  if (!match) return null;

  for (const brand of knownBrands) {
    if (match.toLowerCase().includes(brand)) {
      return brand.toUpperCase();
    }
  }

  return null;
}

function extractElevatorModel(lines) {
  const modelLine = lines.find((line) => /^(model|elevator model|unit model)\s*:/i.test(line));
  if (!modelLine) return null;
  return modelLine.split(':').slice(1).join(':').trim() || null;
}

function extractTotals(lines) {
  const totals = {
    subtotal: null,
    tax: null,
    total: null,
  };

  for (const line of lines) {
    const normalized = line.toLowerCase();

    if (totals.subtotal == null && /^subtotal\b/.test(normalized)) {
      const m = line.match(/(-?\$?[\d,]+(?:\.\d{2})?)/);
      totals.subtotal = parseMoneyToNumber(m?.[1]);
    }

    if (totals.tax == null && /\b(tax|sales tax)\b/.test(normalized)) {
      const m = line.match(/(-?\$?[\d,]+(?:\.\d{2})?)/);
      totals.tax = parseMoneyToNumber(m?.[1]);
    }

    if (totals.total == null && /\b(total due|amount due|grand total|invoice total|total)\b/.test(normalized)) {
      const m = line.match(/(-?\$?[\d,]+(?:\.\d{2})?)/);
      totals.total = parseMoneyToNumber(m?.[1]);
    }
  }

  return totals;
}

function extractLineItems(lines) {
  const items = [];

  for (const line of lines) {
    // Typical line item format examples:
    // 2 Brake pads $120.00 $240.00
    // Door operator replacement ....... $3,300.00
    const hasMoney = /\$?[\d,]+\.\d{2}/.test(line);
    if (!hasMoney) continue;

    if (/\b(subtotal|tax|total due|amount due|grand total|invoice total|total)\b/i.test(line)) {
      continue;
    }

    const normalized = normalizeLine(line);
    const moneyMatches = [...normalized.matchAll(/(\$?[\d,]+\.\d{2})/g)].map((m) => m[1]);
    if (!moneyMatches.length) continue;

    let quantity = null;
    const qtyMatch = normalized.match(/^(\d+(?:\.\d+)?)\s+/);
    if (qtyMatch) quantity = Number.parseFloat(qtyMatch[1]);

    const total = parseMoneyToNumber(moneyMatches[moneyMatches.length - 1]);
    const unit_price = moneyMatches.length > 1 ? parseMoneyToNumber(moneyMatches[moneyMatches.length - 2]) : null;

    const description = normalized
      .replace(/^(\d+(?:\.\d+)?)\s+/, '')
      .replace(/(\$?[\d,]+\.\d{2}).*$/, '')
      .replace(/[.]{2,}/g, ' ')
      .trim();

    if (!description) continue;

    items.push({ description, quantity, unit_price, total });
  }

  return items.slice(0, 50);
}

function parseInvoiceText(rawText = '') {
  const lines = rawText
    .split(/\n/)
    .map((line) => normalizeLine(line))
    .filter(Boolean);

  return {
    vendor: extractVendor(lines),
    elevator_brand: extractElevatorBrand(lines),
    elevator_model: extractElevatorModel(lines),
    line_items: extractLineItems(lines),
    totals: extractTotals(lines),
  };
}

module.exports = {
  parseInvoiceText,
  parseMoneyToNumber,
};
