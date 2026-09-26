import { useEffect, useRef, useState } from 'react';

const TILE_SIZE = 256;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function project(lat, lng, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const latitude = clamp(lat, -85.0511, 85.0511) * Math.PI / 180;
  return {
    x: (lng + 180) / 360 * scale,
    y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 * scale
  };
}

function unproject(x, y, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  return {
    lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y / scale))) * 180 / Math.PI,
    lng: x / scale * 360 - 180
  };
}

export default function SupplierLocationPicker({ lat, lng, onChange, locationLabel = 'supplier' }) {
  const mapRef = useRef(null);
  const [size, setSize] = useState({ width: 600, height: 260 });
  const [center, setCenter] = useState({ lat: Number(lat) || -6.2088, lng: Number(lng) || 106.8456 });
  const [zoom, setZoom] = useState(11);

  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const bounds = entries[0].contentRect;
      setSize({ width: bounds.width, height: bounds.height });
    });
    if (mapRef.current) observer.observe(mapRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (lat !== '' && lng !== '' && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      setCenter({ lat: Number(lat), lng: Number(lng) });
    }
  }, [lat, lng]);

  const origin = project(center.lat, center.lng, zoom);
  const left = origin.x - size.width / 2;
  const top = origin.y - size.height / 2;
  const tiles = [];
  const maxTile = 2 ** zoom;
  for (let y = Math.floor(top / TILE_SIZE); y <= Math.floor((top + size.height) / TILE_SIZE); y++) {
    if (y < 0 || y >= maxTile) continue;
    for (let x = Math.floor(left / TILE_SIZE); x <= Math.floor((left + size.width) / TILE_SIZE); x++) {
      tiles.push({ x, y, key: `${zoom}-${x}-${y}` });
    }
  }

  const choose = event => {
    const rect = mapRef.current.getBoundingClientRect();
    const point = unproject(left + event.clientX - rect.left, top + event.clientY - rect.top, zoom);
    onChange({ lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) });
  };

  const move = (dx, dy) => {
    const point = unproject(origin.x + dx * 130, origin.y + dy * 130, zoom);
    setCenter({ lat: clamp(point.lat, -85, 85), lng: clamp(point.lng, -180, 180) });
  };

  const pin = lat !== '' && lng !== '' ? project(Number(lat), Number(lng), zoom) : null;

  return <div className="space-y-2">
    <div ref={mapRef} onClick={choose} role="button" tabIndex={0}
      onKeyDown={event => { if (event.key === 'Enter') onChange(center); }}
      aria-label={`Peta. Klik untuk menentukan pin lokasi ${locationLabel}`}
      className="relative h-64 w-full cursor-crosshair overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
      {tiles.map(tile => <img key={tile.key} alt="" draggable="false"
        src={`https://tile.openstreetmap.org/${zoom}/${((tile.x % maxTile) + maxTile) % maxTile}/${tile.y}.png`}
        className="pointer-events-none absolute max-w-none"
        style={{ width: TILE_SIZE, height: TILE_SIZE, left: tile.x * TILE_SIZE - left, top: tile.y * TILE_SIZE - top }} />)}
      {pin && <div className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-full rounded-full border-2 border-white bg-teal-700 shadow-lg"
        style={{ left: pin.x - left, top: pin.y - top }} />}
      <div className="absolute left-2 top-2 flex flex-col gap-1" onClick={event => event.stopPropagation()}>
        <button type="button" onClick={() => setZoom(value => Math.min(17, value + 1))} className="rounded bg-white px-2 py-1 font-bold shadow">+</button>
        <button type="button" onClick={() => setZoom(value => Math.max(3, value - 1))} className="rounded bg-white px-2 py-1 font-bold shadow">−</button>
      </div>
      <div className="absolute right-2 top-2 grid grid-cols-3 gap-0.5 rounded bg-white p-1 text-xs shadow" onClick={event => event.stopPropagation()}>
        <span /><button type="button" onClick={() => move(0, -1)}>▲</button><span />
        <button type="button" onClick={() => move(-1, 0)}>◀</button><span /><button type="button" onClick={() => move(1, 0)}>▶</button>
        <span /><button type="button" onClick={() => move(0, 1)}>▼</button><span />
      </div>
      <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer"
        className="absolute bottom-1 right-1 rounded bg-white/90 px-1 text-[10px] text-slate-600" onClick={event => event.stopPropagation()}>
        © OpenStreetMap contributors
      </a>
    </div>
    <p className="text-xs text-slate-500">Klik peta untuk memasang pin. Gunakan tombol pan dan zoom untuk mencari lokasi.</p>
  </div>;
}
