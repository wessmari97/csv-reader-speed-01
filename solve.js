// Fast drop-in for make.fun's csv-reader 1.0.0: run(input) returns exactly
// csv-reader's answer for {text, header}, the JSON value
// {columns, rows, errors}, only faster.
//
// The reading, as csv-reader does it: the text is read once, left to right.
// A U+FEFF at its very start is dropped. A record ends at LF or CRLF, and a
// line left with no characters is no record. Outside quotes a CR not
// followed by LF is dropped (error stray_cr). A field that opens with a
// quote runs to the next quote that is not doubled, "" inside it one quote
// and each CRLF or lone CR inside it read as LF; what follows its closing
// quote, up to the next comma or line break, is appended as it stands
// (quote_junk, when the field ends); a quote that never closes is a literal
// character, and the text after it is read again as unquoted
// (unterminated_quote). A quote inside an unquoted field is a literal
// character. Fields stay strings, never trimmed or converted. columns is
// the first record when header is true, else null; rows holds the records
// after it, each padded with empty strings (short_row, with fields: its
// field count) or cut (long_row, with extra: the cut fields) to the first
// record's width. Each error is {code, line, row}, in the order met, a
// record's short_row or long_row when it ends: line the 1-based line its
// record starts on, counting every LF, CRLF and lone CR inside quotes, and
// row its record's index in rows, null for the header.
//
// Speed comes from cutting fields out instead of reading them a character
// at a time: an unquoted field is the slice up to the next comma or LF,
// found with indexOf, and a quoted field is the slice up to its closing
// quote, found the same way. Only the rare broken pieces — a stray CR in
// an unquoted field, a line break or a doubled quote inside a quoted one —
// fall back to a character at a time. Nothing is kept from one call to the
// next, so every case is answered alone.

/** How a field ended: at a comma, at a line break, or at the end of the text. */
const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const len = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0; // the next character to read
  let line = 1; // the line that character is on

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header). Every error in the record carries these.
  let recordLine = 1;
  let recordRow = null;

  // One reusable out-box, so reading a field allocates nothing.
  const out = { value: '', ended: END, added: 0 };

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters from pos onto `value` up to the next comma or
  // line break; a CR not followed by LF is dropped (stray_cr). Returns out.
  // `added` counts the characters kept in this call.
  function readUnquoted(value) {
    let added = 0;
    const cIdx = text.indexOf(',', pos);
    const nIdx = text.indexOf('\n', pos);
    let d;
    let ended;
    if (cIdx === -1) {
      if (nIdx === -1) {
        d = len;
        ended = END;
      } else {
        d = nIdx;
        ended = LINE_BREAK;
      }
    } else if (nIdx === -1) {
      d = cIdx;
      ended = COMMA;
    } else if (cIdx < nIdx) {
      d = cIdx;
      ended = COMMA;
    } else {
      d = nIdx;
      ended = LINE_BREAK;
    }
    // A CR right before the LF is the CRLF ending the line, not a stray CR.
    let end = d;
    if (ended === LINE_BREAK && d > pos && text.charCodeAt(d - 1) === 13) end = d - 1;
    const piece = text.slice(pos, end);
    if (piece.indexOf('\r') === -1) {
      value += piece;
      added += piece.length;
      if (ended === LINE_BREAK) {
        pos = d + 1;
        line += 1;
      } else if (ended === COMMA) {
        pos = d + 1;
      } else {
        pos = len;
      }
      out.value = value;
      out.ended = ended;
      out.added = added;
      return out;
    }
    // A stray CR sits in this field: re-read it a character at a time.
    while (pos < len) {
      const ch = text[pos];
      if (ch === ',') {
        pos += 1;
        out.value = value;
        out.ended = COMMA;
        out.added = added;
        return out;
      }
      if (ch === '\n') {
        pos += 1;
        line += 1;
        out.value = value;
        out.ended = LINE_BREAK;
        out.added = added;
        return out;
      }
      if (ch === '\r') {
        if (text.charCodeAt(pos + 1) === 10) {
          pos += 2;
          line += 1;
          out.value = value;
          out.ended = LINE_BREAK;
          out.added = added;
          return out;
        }
        pushError('stray_cr');
        pos += 1;
        continue;
      }
      value += ch;
      added += 1;
      pos += 1;
    }
    out.value = value;
    out.ended = END;
    out.added = added;
    return out;
  }

  // Appends text[start..end) to value, turning each CRLF or lone CR into
  // one LF and counting the line breaks it holds.
  function appendPiece(value, start, end) {
    const piece = text.slice(start, end);
    if (piece.indexOf('\n') === -1 && piece.indexOf('\r') === -1) return value + piece;
    const breaks = piece.match(/\r\n|\r|\n/g);
    if (breaks !== null) line += breaks.length;
    return value + piece.replace(/\r\n?/g, '\n');
  }

  // Reads a quoted field whose opening quote is at pos. Returns out.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    let start = pos + 1;
    for (;;) {
      const q = text.indexOf('"', start);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote is one quote inside the field; the field goes on.
        value = appendPiece(value, start, q);
        value += '"';
        start = q + 2;
        continue;
      }
      value = appendPiece(value, start, q);
      pos = q + 1;
      break;
    }
    if (pos >= len) {
      out.value = value;
      out.ended = END;
      out.added = 0;
      return out;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      out.value = value;
      out.ended = COMMA;
      out.added = 0;
      return out;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      out.value = value;
      out.ended = LINE_BREAK;
      out.added = 0;
      return out;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      out.value = value;
      out.ended = LINE_BREAK;
      out.added = 0;
      return out;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) pushError('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    let fields;
    let quoted = false;
    // Fast path: a record whose first line holds no quote. No field on
    // that line can be quoted, so the record ends at its line break, and
    // its fields are the line split on commas. A stray CR anywhere, or a
    // quote, falls through to the field-by-field reading below.
    const nIdx = text.indexOf('\n', pos);
    const lineEnd = nIdx === -1 ? len : nIdx;
    const lineStr = text.slice(pos, lineEnd);
    if (lineStr.indexOf('"') === -1) {
      const cr = lineStr.indexOf('\r');
      if (cr === -1) {
        fields = lineStr.split(',');
        pos = lineEnd + (nIdx === -1 ? 0 : 1);
        if (nIdx !== -1) line += 1;
      } else if (nIdx !== -1 && cr === lineStr.length - 1) {
        fields = lineStr.slice(0, -1).split(',');
        pos = lineEnd + 1;
        line += 1;
      }
    }
    if (fields === undefined) {
      fields = [];
      let field;
      do {
        if (text.charCodeAt(pos) === 34) {
          quoted = true;
          field = readQuoted();
        } else {
          quoted = false;
          field = readUnquoted('');
        }
        fields.push(field.value);
      } while (field.ended === COMMA);

      // A line that held only stray CRs is left with no characters: no
      // record (its stray_cr errors stay).
      if (fields.length === 1 && fields[0] === '' && !quoted) continue;
    }

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
