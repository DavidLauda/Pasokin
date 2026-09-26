const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const db = require('../db');

function authClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase Auth belum dikonfigurasi');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.user_metadata?.name || user.email,
    role: user.app_metadata?.pasokin_role || null
  };
}

function credentialsError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function signIn(email, password, role) {
  if (!['buyer', 'supplier'].includes(role)) {
    throw credentialsError('Pilih peran Buyer atau Supplier sebelum masuk');
  }
  const { data, error } = await authClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !['buyer', 'supplier'].includes(data.user?.app_metadata?.pasokin_role)) {
    throw credentialsError('Email atau kata sandi tidak valid', 401);
  }
  if (data.user.app_metadata.pasokin_role !== role) {
    const accountRole = data.user.app_metadata.pasokin_role === 'buyer' ? 'Buyer' : 'Supplier';
    throw credentialsError(`Akun ini terdaftar sebagai ${accountRole}. Pilih peran yang sesuai.`, 403);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: publicUser(data.user)
  };
}

async function signInQuick() {
  if (process.env.QUICK_LOGIN_ENABLED !== 'true') {
    throw credentialsError('Quick Login belum diaktifkan pada server', 403);
  }
  const email = process.env.QUICK_LOGIN_EMAIL;
  const password = process.env.QUICK_LOGIN_PASSWORD;
  if (!email || !password) throw credentialsError('Quick Login belum dikonfigurasi pada server', 503);
  // Credentials stay on the backend. The browser only receives a normal
  // Supabase Auth session; all protected routes still enforce the buyer role.
  return signIn(email, password, 'buyer');
}

async function register({ email, password, name, role }) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const normalizedName = String(name || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) ||
      typeof password !== 'string' || password.length < 8 || password.length > 128 ||
      normalizedName.length < 2 || normalizedName.length > 120 ||
      !['buyer', 'supplier'].includes(role)) {
    throw credentialsError('Isi nama, email, peran, dan kata sandi minimal 8 karakter');
  }
  const appMetadata = { pasokin_role: role };
  if (role === 'supplier') appMetadata.supplier_id = `sup-${crypto.randomUUID()}`;
  const { error } = await db.getClient().auth.admin.createUser({
    email: normalizedEmail, password, email_confirm: true,
    user_metadata: { name: normalizedName }, app_metadata: appMetadata
  });
  if (error) throw credentialsError(
    /already|registered|exists/i.test(error.message) ? 'Email sudah terdaftar' : 'Gagal membuat akun',
    /already|registered|exists/i.test(error.message) ? 409 : 400
  );
  return signIn(normalizedEmail, password, role);
}

async function refresh(refreshToken) {
  if (!refreshToken) throw credentialsError('Sesi tidak valid', 401);
  const { data, error } = await authClient().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session || !['buyer', 'supplier'].includes(data.user?.app_metadata?.pasokin_role)) {
    throw credentialsError('Sesi berakhir. Silakan masuk kembali.', 401);
  }
  return {
    access_token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    expires_at: data.session.expires_at,
    user: publicUser(data.user)
  };
}

async function getUser(accessToken) {
  if (!accessToken) return null;
  const { data, error } = await db.getClient().auth.getUser(accessToken);
  return error ? null : data.user;
}

async function signOut(accessToken) {
  const { error } = await db.getClient().auth.admin.signOut(accessToken, 'local');
  if (error) throw credentialsError('Gagal mengakhiri sesi', 400);
}

module.exports = { register, signIn, signInQuick, refresh, getUser, signOut, publicUser };
