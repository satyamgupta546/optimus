/**
 * BigQueryService — BigQuery client for Optimus.
 *
 * Replaces SupabaseService.js. All data now in BigQuery (apna-mart-data.optimus).
 *
 * On Vercel: reads GOOGLE_APPLICATION_CREDENTIALS_JSON env var.
 * Locally: uses Application Default Credentials (gcloud auth).
 */
import { BigQuery } from '@google-cloud/bigquery';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const PROJECT_ID = 'apna-mart-data';
const DATASET = 'optimus';

let bigquery = null;

// Try to init BigQuery — handle Vercel env var for credentials
try {
  const credJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (credJson) {
    // Parse credentials directly — no temp file needed
    const credentials = JSON.parse(credJson);
    bigquery = new BigQuery({ projectId: PROJECT_ID, credentials });
    console.log(`[BigQueryService] Connected via env credentials → ${PROJECT_ID}.${DATASET} ✓`);
  } else {
    // Local dev — uses Application Default Credentials
    bigquery = new BigQuery({ projectId: PROJECT_ID });
    console.log(`[BigQueryService] Connected via ADC → ${PROJECT_ID}.${DATASET} ✓`);
  }
} catch (err) {
  console.warn('[BigQueryService] Failed to init BigQuery:', err.message);
}

const T = (table) => `\`${PROJECT_ID}.${DATASET}.${table}\``;

export function isAvailable() {
  return !!bigquery;
}

/**
 * Run a parameterized SQL query.
 */
export async function query(sql, params = []) {
  if (!bigquery) throw new Error('BigQuery not configured');
  const options = { query: sql };
  if (params.length > 0) options.params = params;
  const [rows] = await bigquery.query(options);
  return rows;
}

/**
 * SELECT rows from a table with filters.
 */
export async function selectRows(table, { where, orderBy, limit } = {}) {
  let sql = `SELECT * FROM ${T(table)}`;
  if (where) sql += ` WHERE ${where}`;
  if (orderBy) sql += ` ORDER BY ${orderBy}`;
  if (limit) sql += ` LIMIT ${limit}`;
  return query(sql);
}

/**
 * INSERT a single row via DML (not streaming API).
 * DML inserts are immediately available for UPDATE/DELETE — no streaming buffer delay.
 */
export async function insertRow(table, row) {
  if (!bigquery) throw new Error('BigQuery not configured');
  const keys = Object.keys(row);
  const vals = keys.map(k => formatVal(row[k]));
  const sql = `INSERT INTO ${T(table)} (${keys.join(', ')}) VALUES (${vals.join(', ')})`;
  await query(sql);
  return row;
}

/**
 * UPDATE rows by condition using DML.
 */
export async function updateRows(table, updates, where) {
  if (!bigquery) throw new Error('BigQuery not configured');
  const setClauses = Object.entries(updates)
    .map(([k, v]) => `${k} = ${formatVal(v)}`)
    .join(', ');
  const sql = `UPDATE ${T(table)} SET ${setClauses} WHERE ${where}`;
  await query(sql);
}

/**
 * Escape string for SQL.
 */
export function esc(val) {
  if (val === null || val === undefined) return '';
  return String(val).replace(/'/g, "\\'");
}

function formatVal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "\\'")}'`;
  return `'${esc(v)}'`;
}
