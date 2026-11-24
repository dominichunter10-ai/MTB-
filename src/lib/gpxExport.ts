import { Trail } from '../types/trail';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function slugifyFilename(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${slug || 'hamsterley-trail'}.gpx`;
}

export function buildTrailGpx(trail: Trail): string {
  const safeName = escapeXml(trail.name);
  const safeDesc = escapeXml(
    `${trail.gradeLabel} · ${trail.sector} · ${trail.distanceKm} km (+${trail.elevationGainM}m / -${trail.elevationLossM}m) — ${trail.summary}`
  );
  const safeType = escapeXml(
    trail.trailType || (trail.category === 'off-piste' ? 'Off-Piste MTB' : 'Official MTB')
  );
  const timestamp = new Date().toISOString();

  const waypointsXml = trail.waypoints
    .map((wp) => {
      const wpName = escapeXml(wp.name);
      const wpDesc = escapeXml(`${wp.instruction} (${wp.distFromStartKm.toFixed(1)} km)`);
      return `  <wpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}">
    <name>${wpName}</name>
    <desc>${wpDesc}</desc>
    <sym>Trailhead</sym>
  </wpt>`;
    })
    .join('\n');

  const trackPointsXml = trail.coordinates
    .map(
      (pt) => `      <trkpt lat="${pt.lat.toFixed(6)}" lon="${pt.lng.toFixed(6)}">
        <ele>${Math.round(pt.ele)}</ele>
      </trkpt>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="HamsterleyMTB" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${safeName}</name>
    <desc>${safeDesc}</desc>
    <time>${timestamp}</time>
  </metadata>
${waypointsXml ? `${waypointsXml}\n` : ''}  <trk>
    <name>${safeName}</name>
    <type>${safeType}</type>
    <trkseg>
${trackPointsXml}
    </trkseg>
  </trk>
</gpx>
`;
}

export function downloadTrailGpx(trail: Trail): string {
  const gpxXml = buildTrailGpx(trail);
  const filename = slugifyFilename(trail.name);
  const blob = new Blob([gpxXml], { type: 'application/gpx+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1500);

  return filename;
}
