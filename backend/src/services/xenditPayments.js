const axios = require('axios');

const BANK_CHANNELS = Object.freeze({
  BCA: 'BCA_VIRTUAL_ACCOUNT'
});

async function createVirtualAccount(payment, bank = 'BCA') {
  const channelCode = BANK_CHANNELS[bank];
  if (!channelCode) throw Object.assign(new Error('Bank VA belum didukung'), { status: 400 });
  const key = process.env.XENDIT_SECRET_KEY;
  if (!key?.startsWith('xnd_development_')) {
    throw Object.assign(new Error('Kunci Xendit sandbox belum dikonfigurasi'), { status: 503 });
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const request = {
    reference_id: `pasokin-${payment.id}`,
    type: 'PAY', country: 'ID', currency: 'IDR',
    request_amount: Number(payment.amount),
    channel_code: channelCode,
    channel_properties: { display_name: 'Pasokin', expires_at: expiresAt },
    metadata: { payment_id: payment.id, procurement_id: payment.procurement_id }
  };
  try {
    const { data } = await axios.post('https://api.xendit.co/v3/payment_requests', request, {
      auth: { username: key, password: '' },
      headers: { 'api-version': '2024-11-11', 'Content-Type': 'application/json' },
      timeout: 20000
    });
    const account = data.actions?.find(action => action.descriptor === 'VIRTUAL_ACCOUNT_NUMBER')?.value;
    if (!data.payment_request_id || !account) {
      throw new Error('Xendit tidak mengembalikan nomor Virtual Account');
    }
    return {
      gateway_request_id: data.payment_request_id,
      va_reference: account,
      payment_method: bank,
      expires_at: data.channel_properties?.expires_at || expiresAt
    };
  } catch (error) {
    if (error.response) {
      console.error('Xendit VA request failed', error.response.status, error.response.data?.error_code);
      if (error.response.status === 403 && error.response.data?.error_code === 'REQUEST_FORBIDDEN_ERROR') {
        throw Object.assign(new Error('Kunci Xendit sandbox belum memiliki izin Money-in Write untuk membuat VA.'), { status: 503 });
      }
      throw Object.assign(new Error('Virtual Account belum dapat dibuat. Coba lagi atau gunakan mode simulasi.'), { status: 502 });
    }
    throw Object.assign(new Error('Virtual Account belum dapat dibuat. Coba lagi atau gunakan mode simulasi.'), { status: 502 });
  }
}

module.exports = { BANK_CHANNELS, createVirtualAccount };
