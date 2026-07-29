// server/utils/csvParser.js

/** Splits one CSV line into fields, honoring double-quoted fields with embedded commas/escaped quotes. */
function splitLine(line) {
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (inQuotes) {
            if (char === '"' && line[i + 1] === '"') { current += '"'; i++; }
            else if (char === '"') { inQuotes = false; }
            else { current += char; }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ',') {
            fields.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    fields.push(current);
    return fields;
}

/**
 * Header-driven CSV parser (no external dependency). Returns one object per
 * data row keyed by header name, plus a list of row-level errors for rows
 * whose field count doesn't match the header — those rows are skipped, not
 * fatal to the rest of the file (see spec: "filas corruptas se listan como
 * error por fila sin abortar el resto del archivo").
 */
export function parseCsv(text) {
    const lines = text.split(/\r\n|\n/).filter(l => l.length > 0);
    if (lines.length === 0) return { rows: [], errors: [] };

    const headers = splitLine(lines[0]).map(h => h.trim());
    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
        const fields = splitLine(lines[i]);
        if (fields.length !== headers.length) {
            errors.push({ row: i + 1, message: `Expected ${headers.length} columns, got ${fields.length}` });
            continue;
        }
        const row = {};
        headers.forEach((h, idx) => { row[h] = fields[idx]; });
        rows.push(row);
    }
    return { rows, errors };
}
