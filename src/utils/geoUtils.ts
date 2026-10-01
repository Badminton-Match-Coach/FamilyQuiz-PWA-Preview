import { Location } from '../types';
import { Language } from '../i18n';

export function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export function calculatePathDistance(points: Location[]): number {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += calculateDistanceMeters(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
  }
  return total;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (Math.round((θ * 180) / Math.PI) + 360) % 360;
}

export function getCompassDirection(bearing: number, lang: Language = 'sv'): { label: string; arrow: string; full: string } {
  const compassPoints: Record<Language, string[]> = {
    sv: ['N', 'NÖ', 'Ö', 'SÖ', 'S', 'SV', 'V', 'NV'],
    en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
    fr: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    es: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    de: ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'],
    no: ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'],
    da: ['N', 'NØ', 'Ø', 'SØ', 'S', 'SV', 'V', 'NV'],
    fi: ['P', 'KO', 'I', 'KA', 'E', 'LO', 'L', 'LU'],
    it: ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'],
    et: ['P', 'KI', 'I', 'KA', 'L', 'ED', 'LÄ', 'LO'],
    lv: ['Z', 'ZA', 'A', 'DA', 'D', 'DR', 'R', 'ZR'],
    lt: ['Š', 'ŠR', 'R', 'PR', 'P', 'PV', 'V', 'ŠV'],
    uk: ['Пн', 'Пн-Сх', 'Сх', 'Пд-Сх', 'Пд', 'Пд-Зх', 'Зх', 'Пн-Зх'],
    is: ['N', 'NA', 'A', 'SA', 'S', 'SV', 'V', 'NV'],
    se: ['D', 'DN', 'N', 'MN', 'M', 'MO', 'O', 'DO'],
    nl: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'],
    be: ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'],
  };

  const arrows = ['⬆️', '↗️', '➡️', '↘️', '⬇️', '↙️', '⬅️', '↖️'];
  const index = Math.round(bearing / 45) % 8;
  const label = (compassPoints[lang] || compassPoints.sv)[index];
  const arrow = arrows[index];
  return { label, arrow, full: `${label} ${arrow}` };
}

export function calculateWalkingTimeMinutes(distanceMeters: number, speedKmH: number = 4.5): number {
  if (distanceMeters <= 0) return 0;
  const hours = distanceMeters / 1000 / speedKmH;
  return Math.ceil(hours * 60);
}

export interface InterpolatedPoint {
  lat: number;
  lng: number;
  index: number;
  distanceFromStartMeters: number;
}

export function interpolatePointsAlongPolyline(waypoints: Location[], count: number): InterpolatedPoint[] {
  if (count <= 0 || waypoints.length === 0) return [];

  if (waypoints.length === 1) {
    return Array.from({ length: count }, (_, i) => ({
      lat: waypoints[0].lat,
      lng: waypoints[0].lng,
      index: i,
      distanceFromStartMeters: 0,
    }));
  }

  const segmentDistances: number[] = [];
  let totalDistance = 0;
  for (let k = 0; k < waypoints.length - 1; k++) {
    const d = calculateDistanceMeters(
      waypoints[k].lat,
      waypoints[k].lng,
      waypoints[k + 1].lat,
      waypoints[k + 1].lng
    );
    segmentDistances.push(d);
    totalDistance += d;
  }

  if (totalDistance === 0 || count === 1) {
    return Array.from({ length: count }, (_, i) => ({
      lat: waypoints[0].lat,
      lng: waypoints[0].lng,
      index: i,
      distanceFromStartMeters: 0,
    }));
  }

  const cumulativeDistances: number[] = [0];
  for (let k = 0; k < segmentDistances.length; k++) {
    cumulativeDistances.push(cumulativeDistances[k] + segmentDistances[k]);
  }

  const result: InterpolatedPoint[] = [];
  const step = totalDistance / (count - 1);

  for (let i = 0; i < count; i++) {
    const targetDist = i * step;

    let segIdx = 0;
    for (let k = 0; k < segmentDistances.length; k++) {
      if (
        targetDist >= cumulativeDistances[k] &&
        (targetDist <= cumulativeDistances[k + 1] || k === segmentDistances.length - 1)
      ) {
        segIdx = k;
        break;
      }
    }

    const segLen = segmentDistances[segIdx];
    const segStartDist = cumulativeDistances[segIdx];
    const fraction = segLen === 0 ? 0 : Math.min(1, Math.max(0, (targetDist - segStartDist) / segLen));

    const pStart = waypoints[segIdx];
    const pEnd = waypoints[segIdx + 1];

    const lat = pStart.lat + fraction * (pEnd.lat - pStart.lat);
    const lng = pStart.lng + fraction * (pEnd.lng - pStart.lng);

    result.push({
      lat,
      lng,
      index: i,
      distanceFromStartMeters: Math.round(targetDist),
    });
  }

  return result;
}
