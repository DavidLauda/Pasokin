const { createClient } = require('@supabase/supabase-js');

let client;

function getClient() {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set on the backend');
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return client;
}

async function result(query) {
  const { data, error } = await query;
  if (error) throw new Error(`Supabase: ${error.message}`);
  return data;
}

async function list(table, orderBy = 'created_at') {
  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = getClient().from(table).select('*').range(from, from + pageSize - 1);
    if (orderBy) query = query.order(orderBy, { ascending: true });
    const page = await result(query);
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function findOne(table, column, value) {
  return result(getClient().from(table).select('*').eq(column, value).maybeSingle());
}

function insert(table, row) {
  return result(getClient().from(table).insert(row).select('*').single());
}

function insertMany(table, rows) {
  return result(getClient().from(table).insert(rows).select('*'));
}

function upsert(table, rows, onConflict) {
  return result(getClient().from(table).upsert(rows, { onConflict }).select('*'));
}

function update(table, column, value, changes) {
  return result(getClient().from(table).update(changes).eq(column, value).select('*'));
}

function remove(table, column, value) {
  return result(getClient().from(table).delete().eq(column, value).select('*'));
}

function subscribeToProcurements(onChange, onStatus) {
  return getClient()
    .channel(`procurements-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'procurements' }, onChange)
    .subscribe(onStatus);
}

function unsubscribe(channel) {
  return getClient().removeChannel(channel);
}

function procurementsChangedSince(timestamp) {
  return result(getClient().from('procurements')
    .select('id,status,updated_at')
    .gt('updated_at', timestamp)
    .order('updated_at', { ascending: true }));
}

module.exports = { getClient, list, findOne, insert, insertMany, upsert, update, remove,
  subscribeToProcurements, unsubscribe, procurementsChangedSince };
