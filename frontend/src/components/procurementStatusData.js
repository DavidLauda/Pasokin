export const statuses = {
  parsing: ['Memahami kebutuhan', 'bg-slate-100 text-slate-700'],
  optimizing: ['Menghitung alokasi', 'bg-slate-100 text-slate-700'],
  awaiting_approval: ['Menunggu persetujuan', 'bg-slate-100 text-slate-700'],
  dispatched: ['RFQ terkirim', 'bg-slate-100 text-slate-700'],
  triaging: ['Menunggu balasan', 'bg-slate-100 text-slate-700'],
  needs_manual_review: ['Perlu review manual', 'bg-amber-100 text-amber-800'],
  awaiting_summary_confirmation: ['Menunggu konfirmasi supplier', 'bg-amber-100 text-amber-800'],
  completed: ['Selesai', 'bg-emerald-100 text-emerald-800']
};

export const activeStatusFilters = [
  ['all', 'Semua'],
  ...['awaiting_approval', 'dispatched', 'triaging', 'needs_manual_review', 'awaiting_summary_confirmation']
    .map(value => [value, statuses[value][0]])
];

export function formatProcurementDate(value) {
  return value ? new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
}
