import { Boxes } from 'lucide-react';

export default function BrandMark({ compact = false, inverted = false }) {
  return <div className="flex items-center gap-3" aria-label="Pasokin">
    <span className={`brand-mark ${inverted ? 'brand-mark-inverted' : ''}`}><Boxes size={compact ? 18 : 21} strokeWidth={2.1} /></span>
    <span className={`font-extrabold tracking-[-0.045em] ${compact ? 'text-lg' : 'text-[22px]'} ${inverted ? 'text-white' : 'text-slate-900'}`}>pasokin<span className="text-teal-500">.</span></span>
  </div>;
}
