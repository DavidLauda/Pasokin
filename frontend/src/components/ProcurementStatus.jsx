import { statuses } from './procurementStatusData';

export default function ProcurementStatus({ value, compact = false }) {
  const [label, color] = statuses[value] || [value || 'Belum diketahui', 'bg-slate-100 text-slate-700'];
  return <span className={`inline-flex rounded-full font-semibold ${color} ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs'}`}>{label}</span>;
}
