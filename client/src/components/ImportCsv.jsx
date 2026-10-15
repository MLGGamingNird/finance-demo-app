import { useState } from 'react';
import { apiFetch } from '../lib/api';
import { formatAmount, formatDate } from '../lib/format';
import { sampleBankCsv } from '../lib/sampleBankCsv';

const MAX_FILE_BYTES = 1_500_000;
const NO_COLUMNS = { date: -1, description: -1, amount: -1, debit: -1, credit: -1 };

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

// Upload a bank export, check what was understood, then import. The server
// re-reads the file on every step, so changing a column or the sign setting
// just asks for a fresh preview.
export function ImportCsv({ token, onImported, onClose }) {
  const [file, setFile] = useState(null);
  const [columns, setColumns] = useState(null);
  const [header, setHeader] = useState(null);
  const [flipSigns, setFlipSigns] = useState(false);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const requestBody = (csv, cols, flip) => ({ csv, flip_signs: flip, ...(cols && { columns: cols }) });

  async function runPreview(csv, cols, flip) {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch('/api/imports/preview', { token, method: 'POST', body: requestBody(csv, cols, flip) });
      setPreview(data);
      setHeader(data.header);
      setColumns(data.columns);
    } catch (err) {
      setPreview(null);
      if (err.data?.header) {
        setHeader(err.data.header);
        setColumns((current) => current ?? NO_COLUMNS);
      }
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function start(next) {
    setFile(next);
    setColumns(null);
    setHeader(null);
    setFlipSigns(false);
    setResult(null);
    runPreview(next.csv, null, false);
  }

  async function chooseFile(e) {
    const chosen = e.target.files[0];
    e.target.value = '';
    if (!chosen) return;
    if (chosen.size > MAX_FILE_BYTES) {
      setError('That file is over 1.5 MB. Try exporting a shorter date range.');
      return;
    }
    start({ name: chosen.name, csv: await chosen.text() });
  }

  function changeColumn(key, value) {
    const next = { ...columns, [key]: Number(value) };
    setColumns(next);
    runPreview(file.csv, next, flipSigns);
  }

  function changeFlip(checked) {
    setFlipSigns(checked);
    runPreview(file.csv, columns, checked);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setHeader(null);
    setColumns(null);
    setError(null);
  }

  async function runImport() {
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch('/api/imports', { token, method: 'POST', body: requestBody(file.csv, columns, flipSigns) });
      reset();
      setResult(data);
      onImported();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const newCount = preview ? preview.total - preview.duplicates : 0;
  const columnSelect = (key, label) => (
    <label key={key}>
      <span>{label}</span>
      <select value={columns[key]} onChange={(e) => changeColumn(key, e.target.value)} disabled={busy}>
        <option value={-1}>None</option>
        {header.map((name, i) => (
          <option key={i} value={i}>
            {name || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="import-panel">
      <div className="import-head">
        <h3>Import from your bank</h3>
        <button type="button" className="link" onClick={onClose}>
          Close
        </button>
      </div>

      {result && (
        <p className="import-result" role="status">
          Imported {plural(result.imported, 'transaction')}
          {result.categorized > 0 && `, ${result.categorized} categorized automatically`}.
          {result.duplicates > 0 && ` ${plural(result.duplicates, 'row')} ${result.duplicates === 1 ? 'was' : 'were'} already there.`}
        </p>
      )}

      {file ? (
        <p className="import-file">
          {file.name}{' '}
          <button type="button" className="link" onClick={reset} disabled={busy}>
            Choose another
          </button>
        </p>
      ) : (
        <>
          <p className="import-help">
            Download your transactions as a CSV file from your bank's website, then choose it here. Rows you've
            imported before are skipped.
          </p>
          <div className="import-actions">
            <label className="file-button">
              Choose CSV file
              <input type="file" accept=".csv,text/csv" onChange={chooseFile} className="sr-only" />
            </label>
            <button type="button" className="secondary" onClick={() => start({ name: 'sample-bank-export.csv', csv: sampleBankCsv() })}>
              Try a sample bank export
            </button>
          </div>
        </>
      )}

      {file && header && columns && (
        <fieldset className="column-picker" disabled={busy}>
          <legend>Columns</legend>
          {columnSelect('date', 'Date')}
          {columnSelect('description', 'Description')}
          {columnSelect('amount', 'Amount')}
          {columns.amount === -1 && columnSelect('debit', 'Money out')}
          {columns.amount === -1 && columnSelect('credit', 'Money in')}
        </fieldset>
      )}

      {preview && (
        <label className="flip-signs">
          <input type="checkbox" checked={flipSigns} onChange={(e) => changeFlip(e.target.checked)} disabled={busy} />
          My bank lists spending as positive numbers
          {preview.suggest_flip && <span className="hint"> (most amounts here are positive, so this looks likely)</span>}
        </label>
      )}

      {busy && <p className="empty">Reading the file…</p>}
      {error && <p className="error">{error}</p>}

      {preview && (
        <>
          <p className="import-summary">
            Found {plural(preview.total, 'transaction')}
            {preview.duplicates > 0 && `, ${preview.duplicates} already imported`}
            {preview.error_count > 0 && `. ${plural(preview.error_count, 'row')} couldn't be read`}.
          </p>
          {preview.errors.length > 0 && (
            <details className="import-errors">
              <summary>Rows that couldn't be read</summary>
              <ul>
                {preview.errors.map((e) => (
                  <li key={e.line}>
                    Line {e.line}: {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {preview.sample.length > 0 && (
            <table className="import-table">
              <caption className="sr-only">First rows of the file</caption>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Description</th>
                  <th scope="col">Amount</th>
                </tr>
              </thead>
              <tbody>
                {preview.sample.map((row, i) => (
                  <tr key={i} className={row.duplicate ? 'duplicate' : ''}>
                    <td>{formatDate(row.occurred_at)}</td>
                    <td>
                      {row.description}
                      {row.duplicate && <span className="hint"> · already imported</span>}
                    </td>
                    <td className={row.amount > 0 ? 'income' : 'expense'}>{formatAmount(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {preview.total > preview.sample.length && (
            <p className="hint">Showing the first {preview.sample.length} of {preview.total}.</p>
          )}
          <button type="button" onClick={runImport} disabled={busy || newCount === 0}>
            {newCount === 0 ? 'Nothing new to import' : `Import ${plural(newCount, 'transaction')}`}
          </button>
        </>
      )}
    </div>
  );
}
