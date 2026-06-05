const SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/1z01drUB4oa08cLlq_NggAQqicCdnVbb8wido-9-U9_I/export?format=csv&gid=1457070184';
const APPS_SCRIPT_URL = process.env.EXPO_PUBLIC_APPS_SCRIPT_URL || '';

export interface LogEntry {
  Date: string;
  Description: string;
  Timing: string;
  Status: string;
}

const parseCSV = (csv: string): LogEntry[] => {
  if (!csv) return [];

  const rows: string[][] = [];
  let currentField = '';
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    const nextChar = csv[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i++; // skip next quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++; // skip \n
      } else if (char === '\n' || char === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map(h => h.trim());
  const results: any[] = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row.length <= 1 && (!row[0] || row[0].trim() === '')) continue;
    const obj: any = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] !== undefined ? row[index].trim() : '';
    });
    results.push(obj);
  }
  return results;
};

export const fetchSheetData = async (): Promise<LogEntry[]> => {
  try {
    const response = await fetch(SHEET_CSV_URL);
    const csvData = await response.text();
    return parseCSV(csvData);
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    return [];
  }
};

export const createSheetRow = async (rowData: LogEntry): Promise<{ success: boolean; error?: any; mock?: boolean }> => {
  if (!APPS_SCRIPT_URL) return { success: true, mock: true };
  try {
    const payload = encodeURIComponent(JSON.stringify({ action: 'add', data: rowData }));
    const url = `${APPS_SCRIPT_URL}${APPS_SCRIPT_URL.includes('?') ? '&' : '?'}payload=${payload}`;
    await fetch(url, { mode: 'no-cors' });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const updateSheetRow = async (rowIndex: number, rowData: LogEntry): Promise<{ success: boolean; error?: any; mock?: boolean }> => {
  if (!APPS_SCRIPT_URL) return { success: true, mock: true };
  try {
    const payload = encodeURIComponent(JSON.stringify({ action: 'update', index: rowIndex, data: rowData }));
    const url = `${APPS_SCRIPT_URL}${APPS_SCRIPT_URL.includes('?') ? '&' : '?'}payload=${payload}`;
    await fetch(url, { mode: 'no-cors' });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};

export const deleteSheetRow = async (rowIndex: number): Promise<{ success: boolean; error?: any; mock?: boolean }> => {
  if (!APPS_SCRIPT_URL) return { success: true, mock: true };
  try {
    const payload = encodeURIComponent(JSON.stringify({ action: 'delete', index: rowIndex }));
    const url = `${APPS_SCRIPT_URL}${APPS_SCRIPT_URL.includes('?') ? '&' : '?'}payload=${payload}`;
    await fetch(url, { mode: 'no-cors' });
    return { success: true };
  } catch (error) {
    return { success: false, error };
  }
};