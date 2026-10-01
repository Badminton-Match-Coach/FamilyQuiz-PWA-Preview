import React, { useEffect, useRef, useState, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Question, Location, UserType } from '../types';
import { Language, t } from '../i18n';
import { MapPin, Undo2, Trash2, Check, X, Navigation, Compass, ArrowUpRight, RotateCcw, Footprints, Clock, CheckCircle2, Lock, Sparkles } from 'lucide-react';

export {
  calculateDistanceMeters,
  calculatePathDistance,
  formatDistance,
  calculateBearing,
  getCompassDirection,
  calculateWalkingTimeMinutes,
  type InterpolatedPoint,
  interpolatePointsAlongPolyline
} from '../utils/geoUtils';

import {
  calculateDistanceMeters,
  calculatePathDistance,
  formatDistance,
  calculateBearing,
  getCompassDirection,
  calculateWalkingTimeMinutes,
  interpolatePointsAlongPolyline
} from '../utils/geoUtils';

// Custom DivIcons for crisp modern rendering
export const createCustomIcon = (
  type: 'user' | 'unanswered-barn' | 'unanswered-vuxen' | 'answered' | 'in-range' | 'locked' | 'points' | 'text',
  label?: string,
  pulse: boolean = false
) => {
  let bgColor = '#4f46e5'; // indigo
  let border = '#ffffff';
  let content = label || '';

  if (type === 'user') {
    return L.divIcon({
      className: 'custom-map-pin',
      html: `
        <div style="
          position: relative;
          width: 32px;
          height: 32px;
          background: #2563eb;
          border: 3.5px solid #ffffff;
          border-radius: 50%;
          box-shadow: 0 0 20px rgba(37, 99, 235, 0.9), 0 4px 10px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-weight: 900;
          font-size: 10px;
          letter-spacing: -0.5px;
        ">
          DU
          <div style="
            position: absolute;
            top: -7px; left: -7px; right: -7px; bottom: -7px;
            border: 3px solid #60a5fa;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
            opacity: 0.85;
          "></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });
  }

  if (type === 'answered') {
    bgColor = '#10b981'; // green
  } else if (type === 'in-range') {
    bgColor = '#059669'; // rich emerald with glow
  } else if (type === 'unanswered-barn') {
    bgColor = '#f59e0b'; // amber
  } else if (type === 'unanswered-vuxen') {
    bgColor = '#ec4899'; // pink
  } else if (type === 'locked') {
    bgColor = '#64748b'; // slate
  } else if (type === 'points') {
    bgColor = '#8b5cf6'; // violet
  } else if (type === 'text') {
    bgColor = '#0284c7'; // sky
  }

  const pulseEffect = pulse || type === 'in-range'
    ? `<div style="position: absolute; top: -5px; left: -5px; right: -5px; bottom: -5px; border-radius: 50% 50% 50% 0; border: 2.5px solid ${bgColor}; animation: pulse 1.5s infinite; opacity: 0.8;"></div>`
    : '';

  return L.divIcon({
    className: 'custom-map-pin',
    html: `
      <div style="position: relative;">
        <div style="
          background: ${bgColor};
          color: white;
          width: 36px;
          height: 36px;
          border-radius: 50% 50% 50% 0;
          transform: rotate(-45deg);
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2.5px solid ${border};
          box-shadow: 0 5px 14px rgba(0,0,0,0.3);
          font-weight: 900;
          font-size: 13px;
        ">
          <span style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">${content}</span>
        </div>
        ${pulseEffect}
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

/* -------------------------------------------------------------
   Compass Direction Badge (Fågelvägspil & Avståndsmätare)
---------------------------------------------------------------- */
interface CompassDirectionBadgeProps {
  userLocation: Location | null;
  targetLocation: Location | null;
  unlockDistance?: number;
  lang?: Language;
  compact?: boolean;
}

export const CompassDirectionBadge: React.FC<CompassDirectionBadgeProps> = ({
  userLocation,
  targetLocation,
  unlockDistance = 20,
  lang = 'sv' as Language,
  compact = false,
}) => {
  if (!targetLocation) return null;

  if (!userLocation) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold border border-slate-200">
        <Compass className="w-4 h-4 text-slate-400" />
        <span>{t(lang, 'requiresGPS')}</span>
      </div>
    );
  }

  const dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, targetLocation.lat, targetLocation.lng);
  const bearing = calculateBearing(userLocation.lat, userLocation.lng, targetLocation.lat, targetLocation.lng);
  const dir = getCompassDirection(bearing, lang);
  const isInRange = dist <= unlockDistance;

  if (isInRange) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 text-xs font-black border border-emerald-300 shadow-sm animate-pulse">
        <Sparkles className="w-4 h-4 text-emerald-600" />
        <span>{t(lang, 'inUnlockRange')}</span>
        <span className="text-[10px] bg-emerald-200 text-emerald-900 px-1.5 py-0.5 rounded-md font-extrabold">{formatDistance(dist)}</span>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-950 font-bold shadow-sm ${compact ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'}`}>
      <div 
        className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center font-black shadow-sm shrink-0 transition-transform duration-500 ease-out"
        style={{ transform: `rotate(${bearing}deg)` }}
        title={`${t(lang, 'compassDirection')}: ${bearing}° (${dir.label})`}
      >
        <Navigation className="w-3.5 h-3.5 fill-current" />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-indigo-900 font-black">{formatDistance(dist)}</span>
        <span className="text-indigo-600 font-extrabold">({dir.label})</span>
      </div>
      {!compact && dist > unlockDistance && (
        <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
          • {t(lang, 'walkCloser', { meters: (dist - unlockDistance).toString() })}
        </span>
      )}
    </div>
  );
};

/* -------------------------------------------------------------
   Mini Station Map (Embedded in Question View)
---------------------------------------------------------------- */
interface MiniStationMapProps {
  userLocation: Location | null;
  targetLocation: Location;
  unlockDistance?: number;
  stationNumber: number;
  isAnswered?: boolean;
  questionType?: 'options' | 'points' | 'text';
  lang?: Language;
  walkedPath?: Location[];
  onExpand?: () => void;
}

export const MiniStationMap: React.FC<MiniStationMapProps> = ({
  userLocation,
  targetLocation,
  unlockDistance = 20,
  stationNumber,
  isAnswered = false,
  questionType = 'options',
  lang = 'sv' as Language,
  walkedPath,
  onExpand,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const targetMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const lineRef = useRef<L.Polyline | null>(null);
  const walkedLineRef = useRef<L.Polyline | null>(null);

  const dist = userLocation
    ? calculateDistanceMeters(userLocation.lat, userLocation.lng, targetLocation.lat, targetLocation.lng)
    : null;

  const isInRange = isAnswered || (dist !== null && dist <= unlockDistance);

  // Initialize mini map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      const centerLat = userLocation ? (userLocation.lat + targetLocation.lat) / 2 : targetLocation.lat;
      const centerLng = userLocation ? (userLocation.lng + targetLocation.lng) / 2 : targetLocation.lng;

      const map = L.map(mapRef.current, {
        zoomControl: false,
        attributionControl: false,
      }).setView([centerLat, centerLng], 16);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(map);

      leafletMap.current = map;

      // Station Marker
      const stationIcon = createCustomIcon(
        isAnswered ? 'answered' : isInRange ? 'in-range' : questionType === 'points' ? 'points' : 'unanswered-barn',
        isAnswered ? '✓' : questionType === 'points' ? '🎯' : `${stationNumber}`,
        isInRange && !isAnswered
      );

      targetMarkerRef.current = L.marker([targetLocation.lat, targetLocation.lng], { icon: stationIcon }).addTo(map);

      // Unlock Radius Geofence Circle
      circleRef.current = L.circle([targetLocation.lat, targetLocation.lng], {
        radius: unlockDistance,
        color: isInRange ? '#10b981' : '#6366f1',
        fillColor: isInRange ? '#10b981' : '#6366f1',
        fillOpacity: isInRange ? 0.25 : 0.1,
        weight: 2,
        dashArray: isInRange ? undefined : '4, 4',
      }).addTo(map);

      // Fit bounds
      setTimeout(() => {
        map.invalidateSize();
        if (userLocation) {
          const bounds = L.latLngBounds([
            [userLocation.lat, userLocation.lng],
            [targetLocation.lat, targetLocation.lng],
          ]);
          map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
        } else {
          map.setView([targetLocation.lat, targetLocation.lng], 16);
        }
      }, 150);
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        userMarkerRef.current = null;
        targetMarkerRef.current = null;
        circleRef.current = null;
        lineRef.current = null;
        walkedLineRef.current = null;
      }
    };
  }, [targetLocation.lat, targetLocation.lng]);

  // Update walked line on mini map
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (walkedLineRef.current) {
      walkedLineRef.current.remove();
      walkedLineRef.current = null;
    }

    if (walkedPath && walkedPath.length >= 2) {
      const coords: [number, number][] = walkedPath.map((p) => [p.lat, p.lng]);
      walkedLineRef.current = L.polyline(coords, {
        color: '#10b981',
        weight: 4,
        opacity: 0.9,
        dashArray: '2, 6',
        lineCap: 'round',
      }).addTo(map);
    }
  }, [walkedPath]);

  // Update user & connection line on userLocation change
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (userLocation) {
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(userLatLng);
      } else {
        userMarkerRef.current = L.marker(userLatLng, { icon: createCustomIcon('user'), zIndexOffset: 1000 }).addTo(map);
      }

      // Draw dashed connection line
      if (lineRef.current) {
        lineRef.current.setLatLngs([userLatLng, [targetLocation.lat, targetLocation.lng]]);
      } else {
        lineRef.current = L.polyline([userLatLng, [targetLocation.lat, targetLocation.lng]], {
          color: isInRange ? '#10b981' : '#6366f1',
          weight: 3,
          dashArray: '6, 6',
          opacity: 0.85,
        }).addTo(map);
      }
    } else {
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      if (lineRef.current) {
        lineRef.current.remove();
        lineRef.current = null;
      }
    }
  }, [userLocation, targetLocation, isInRange]);

  const recenter = () => {
    const map = leafletMap.current;
    if (!map) return;
    if (userLocation) {
      const bounds = L.latLngBounds([
        [userLocation.lat, userLocation.lng],
        [targetLocation.lat, targetLocation.lng],
      ]);
      map.fitBounds(bounds, { padding: [30, 30], maxZoom: 17 });
    } else {
      map.setView([targetLocation.lat, targetLocation.lng], 16);
    }
  };

  return (
    <div className="relative isolate z-0 w-full h-44 sm:h-52 rounded-2xl overflow-hidden border-2 border-indigo-200/80 shadow-md bg-slate-100">
      <div ref={mapRef} className="w-full h-full z-0" />
      
      {/* Top action badge */}
      <div className="absolute top-2 left-2 right-2 z-10 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto">
          <CompassDirectionBadge 
            userLocation={userLocation}
            targetLocation={targetLocation}
            unlockDistance={unlockDistance}
            lang={lang}
            compact
          />
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={recenter}
            className="bg-white/90 hover:bg-white text-indigo-700 px-2.5 py-1 rounded-xl text-[11px] font-black shadow border border-slate-200 active:scale-95 transition-all"
            title="Centrera"
          >
            🎯
          </button>
          {onExpand && (
            <button
              onClick={onExpand}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1 rounded-xl text-[11px] font-black shadow active:scale-95 transition-all flex items-center gap-1"
            >
              <span>{t(lang, 'allQuestionsAndMap')}</span>
              <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
   Trail Progress Bar (Visuell slinga med framsteg & status)
---------------------------------------------------------------- */
interface TrailProgressBarProps {
  questions: {
    q?: Question;
    index: number;
    isAnswered: boolean;
    isUnlocked?: boolean;
    hasLocation?: boolean;
    dist?: number | null;
  }[];
  activeIndex: number | null;
  onSelectQuestion: (index: number) => void;
  lang?: Language;
  totalDistance?: number;
}

export const TrailProgressBar: React.FC<TrailProgressBarProps> = ({
  questions,
  activeIndex,
  onSelectQuestion,
  lang = 'sv' as Language,
  totalDistance,
}) => {
  const answeredCount = questions.filter((q) => q.isAnswered).length;
  const totalCount = questions.length;
  const progressPercent = totalCount > 0 ? Math.round((answeredCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white rounded-2xl p-4 sm:p-5 border border-indigo-100 shadow-lg space-y-3">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-black">
            <Footprints className="w-3.5 h-3.5" />
          </div>
          <span className="font-black text-slate-800 uppercase tracking-wider">{t(lang, 'trailProgressTitle')}</span>
        </div>
        <div className="flex items-center gap-2 font-black">
          <span className="text-slate-500">{answeredCount}/{totalCount} {t(lang, 'completed')}</span>
          <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[11px]">{progressPercent}%</span>
        </div>
      </div>

      {/* Progress Track */}
      <div className="relative pt-2 pb-1">
        {/* Background line */}
        <div className="absolute top-1/2 left-4 right-4 h-1.5 bg-slate-100 rounded-full -translate-y-1/2" />
        <div 
          className="absolute top-1/2 left-4 h-1.5 bg-gradient-to-r from-emerald-500 to-indigo-600 rounded-full -translate-y-1/2 transition-all duration-500"
          style={{ width: `${Math.min(100, Math.max(0, (answeredCount / Math.max(1, totalCount - 1)) * 100))}%` }}
        />

        {/* Stations Steps */}
        <div className="relative flex items-center justify-between overflow-x-auto py-1 no-scrollbar gap-2 px-1">
          {questions.map((item, idx) => {
            const isCurrent = activeIndex === item.index;
            const isAnswered = item.isAnswered;
            const isUnlocked = item.isUnlocked;

            return (
              <button
                key={idx}
                onClick={() => onSelectQuestion(item.index)}
                className={`flex flex-col items-center gap-1 shrink-0 transition-all group focus:outline-none ${
                  isCurrent ? 'scale-110' : 'hover:scale-105 active:scale-95'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all shadow-sm ${
                    isAnswered
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                      : isCurrent
                      ? 'bg-indigo-600 text-white ring-4 ring-indigo-200 animate-pulse'
                      : isUnlocked
                      ? 'bg-white text-indigo-700 border-2 border-indigo-600 hover:bg-indigo-50'
                      : 'bg-slate-200 text-slate-500 border border-slate-300'
                  }`}
                  title={`${t(lang, 'question')} ${idx + 1}`}
                >
                  {isAnswered ? <Check className="w-4 h-4 stroke-[3]" /> : idx + 1}
                </div>
                <span className={`text-[10px] font-extrabold ${isCurrent ? 'text-indigo-600' : 'text-slate-500'}`}>
                  #{idx + 1}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
   Admin Map Picker (Single Question Location Picker)
---------------------------------------------------------------- */
interface AdminMapPickerProps {
  initialLocation?: Location;
  fallbackCenter?: Location | null;
  unlockDistance?: number;
  onSelectLocation: (loc: Location) => void;
  questionsWithLocations?: { q: Question; index: number; type: 'barn' | 'vuxen' }[];
  activeQuestionId?: string;
}

export const AdminMapPicker: React.FC<AdminMapPickerProps> = ({
  initialLocation,
  fallbackCenter,
  unlockDistance = 20,
  onSelectLocation,
  questionsWithLocations = [],
  activeQuestionId,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const selectedMarker = useRef<L.Marker | null>(null);
  const radiusCircle = useRef<L.Circle | null>(null);

  const defaultCenter: [number, number] = initialLocation
    ? [initialLocation.lat, initialLocation.lng]
    : fallbackCenter
    ? [fallbackCenter.lat, fallbackCenter.lng]
    : [59.3293, 18.0686];

  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      const map = L.map(mapRef.current).setView(defaultCenter, initialLocation || fallbackCenter ? 15 : 12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(map);

      leafletMap.current = map;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        onSelectLocation({ lat, lng });
      });
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Update selected marker and its unlock radius geofence
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (initialLocation) {
      const latlng: [number, number] = [initialLocation.lat, initialLocation.lng];

      if (selectedMarker.current) {
        selectedMarker.current.setLatLng(latlng);
      } else {
        selectedMarker.current = L.marker(latlng, {
          icon: createCustomIcon('unanswered-barn', '🎯'),
          draggable: true,
        }).addTo(map);

        selectedMarker.current.on('dragend', (e) => {
          const marker = e.target;
          const pos = marker.getLatLng();
          onSelectLocation({ lat: pos.lat, lng: pos.lng });
        });
      }

      // Draw/Update Unlock Radius Circle
      if (radiusCircle.current) {
        radiusCircle.current.setLatLng(latlng);
        radiusCircle.current.setRadius(unlockDistance);
      } else {
        radiusCircle.current = L.circle(latlng, {
          radius: unlockDistance,
          color: '#4f46e5',
          fillColor: '#4f46e5',
          fillOpacity: 0.15,
          weight: 2,
          dashArray: '4, 4',
        }).addTo(map);
      }

      map.panTo(latlng);
    } else {
      if (selectedMarker.current) {
        selectedMarker.current.remove();
        selectedMarker.current = null;
      }
      if (radiusCircle.current) {
        radiusCircle.current.remove();
        radiusCircle.current = null;
      }
      if (fallbackCenter) {
        map.panTo([fallbackCenter.lat, fallbackCenter.lng]);
      }
    }
  }, [initialLocation, fallbackCenter, unlockDistance]);

  // Context markers for other questions
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    const existingMarkers: L.Marker[] = [];

    questionsWithLocations.forEach(({ q, index, type }) => {
      if (q.id === activeQuestionId || !q.location) return;

      const icon = createCustomIcon(
        type === 'barn' ? 'unanswered-barn' : 'unanswered-vuxen',
        `${index + 1}`
      );

      const isHidden = !!q.hideLocationOnMap || !!q.location.hideOnMap;
      const m = L.marker([q.location.lat, q.location.lng], { icon })
        .addTo(map)
        .bindPopup(`<b>${type === 'barn' ? 'Barn' : 'Vuxen'} #${index + 1}${isHidden ? ' 🕵️‍♂️ (Skattjakt/Dold)' : ''}</b><br/>${q.text}`);

      existingMarkers.push(m);
    });

    return () => {
      existingMarkers.forEach((m) => m.remove());
    };
  }, [questionsWithLocations, activeQuestionId]);

  return (
    <div className="relative isolate z-0 w-full h-64 sm:h-80 rounded-2xl overflow-hidden border-2 border-indigo-200 shadow-md">
      <div ref={mapRef} className="w-full h-full z-0" />
      <div className="absolute top-2 right-2 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-700 shadow border border-slate-200 flex items-center gap-1.5">
        <span>💡 Dra nålen för att finjustera positionen</span>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
   Participant Map (Full Interactive Map for Walkers)
---------------------------------------------------------------- */
interface ParticipantMapProps {
  questions: { q: Question; index: number; isAnswered: boolean; isCorrect?: boolean }[];
  userType: 'barn' | 'vuxen';
  userLocation: Location | null;
  unlockDistance?: number;
  onSelectQuestion: (index: number) => void;
  lang?: Language;
  walkedPath?: Location[];
  isLiveTracking?: boolean;
  onClearWalkedPath?: () => void;
}

export const ParticipantMap: React.FC<ParticipantMapProps> = ({
  questions,
  userType,
  userLocation,
  unlockDistance = 20,
  onSelectQuestion,
  lang = 'sv' as Language,
  walkedPath,
  isLiveTracking = false,
  onClearWalkedPath,
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const trailLineRef = useRef<L.Polyline | null>(null);
  const walkedLineRef = useRef<L.Polyline | null>(null);
  const geofenceCirclesRef = useRef<L.Circle[]>([]);

  // Geotagged questions filter:
  // Visible on map: all geotagged questions EXCEPT those where hideLocationOnMap is true and not yet answered!
  const visibleGeotagged = useMemo(() => {
    return questions.filter(
      (item) => item.q.location && (!item.q.hideLocationOnMap && !item.q.location?.hideOnMap || item.isAnswered)
    );
  }, [questions]);

  const hiddenTreasureCount = useMemo(() => {
    return questions.filter(
      (item) => item.q.location && (item.q.hideLocationOnMap || item.q.location?.hideOnMap) && !item.isAnswered
    ).length;
  }, [questions]);

  const walkedDistanceMeters = useMemo(() => {
    if (!walkedPath || walkedPath.length < 2) return 0;
    return calculatePathDistance(walkedPath);
  }, [walkedPath]);

  const fitAllBounds = () => {
    const map = leafletMap.current;
    if (!map) return;

    const allCoords: [number, number][] = [];
    if (userLocation) {
      allCoords.push([userLocation.lat, userLocation.lng]);
    }
    visibleGeotagged.forEach(({ q }) => {
      if (q.location) {
        allCoords.push([q.location.lat, q.location.lng]);
      }
    });
    if (walkedPath && walkedPath.length > 0) {
      walkedPath.forEach((p) => {
        allCoords.push([p.lat, p.lng]);
      });
    }

    if (allCoords.length === 1) {
      map.setView(allCoords[0], 16);
    } else if (allCoords.length > 1) {
      const bounds = L.latLngBounds(allCoords);
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 16 });
      }
    }
  };

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (!leafletMap.current) {
      const defaultLat = userLocation?.lat || visibleGeotagged[0]?.q.location?.lat || 59.3293;
      const defaultLng = userLocation?.lng || visibleGeotagged[0]?.q.location?.lng || 18.0686;

      const map = L.map(mapRef.current).setView([defaultLat, defaultLng], 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      leafletMap.current = map;

      setTimeout(() => {
        map.invalidateSize();
        fitAllBounds();
      }, 200);
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        userMarkerRef.current = null;
        trailLineRef.current = null;
        walkedLineRef.current = null;
        geofenceCirclesRef.current = [];
      }
    };
  }, []);

  // Update user position marker
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    map.invalidateSize();

    if (userLocation) {
      const userLatLng: [number, number] = [userLocation.lat, userLocation.lng];
      if (userMarkerRef.current) {
        userMarkerRef.current.setLatLng(userLatLng);
      } else {
        userMarkerRef.current = L.marker(userLatLng, {
          icon: createCustomIcon('user'),
          zIndexOffset: 1000,
        })
          .addTo(map)
          .bindPopup('<b>Du är här! 📍</b>');
      }
    } else if (userMarkerRef.current) {
      userMarkerRef.current.remove();
      userMarkerRef.current = null;
    }
  }, [userLocation]);

  // Update walked route polyline (dotted line)
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (walkedLineRef.current) {
      walkedLineRef.current.remove();
      walkedLineRef.current = null;
    }

    if (walkedPath && walkedPath.length >= 2) {
      const walkedCoords: [number, number][] = walkedPath.map((p) => [p.lat, p.lng]);
      walkedLineRef.current = L.polyline(walkedCoords, {
        color: '#10b981', // Emerald vibrant dotted line
        weight: 5,
        opacity: 0.95,
        dashArray: '3, 8',
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    }
  }, [walkedPath]);

  // Render station pins, trail lines & geofence rings
  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    const markers: L.Marker[] = [];
    const MAX_UNLOCK_DISTANCE = Math.max(5, unlockDistance || 20);

    // Clean up old circles
    geofenceCirclesRef.current.forEach((c) => c.remove());
    geofenceCirclesRef.current = [];

    // Clean up old polyline
    if (trailLineRef.current) {
      trailLineRef.current.remove();
      trailLineRef.current = null;
    }

    // Draw trail connection line if >= 2 visible geotagged stations
    if (visibleGeotagged.length >= 2) {
      const trailCoords: [number, number][] = visibleGeotagged.map((item) => [item.q.location!.lat, item.q.location!.lng]);
      trailLineRef.current = L.polyline(trailCoords, {
        color: '#6366f1',
        weight: 4,
        opacity: 0.7,
        dashArray: '6, 8',
      }).addTo(map);
    }

    visibleGeotagged.forEach(({ q, index, isAnswered }) => {
      if (!q.location) return;

      const latlng: [number, number] = [q.location.lat, q.location.lng];

      let dist: number | null = null;
      let bearing: number | null = null;
      if (userLocation) {
        dist = calculateDistanceMeters(userLocation.lat, userLocation.lng, q.location.lat, q.location.lng);
        bearing = calculateBearing(userLocation.lat, userLocation.lng, q.location.lat, q.location.lng);
      }

      const isUnlocked = isAnswered || (dist !== null && dist <= MAX_UNLOCK_DISTANCE);
      const isApproaching = !isUnlocked && dist !== null && dist <= MAX_UNLOCK_DISTANCE * 2.5;

      // Draw Geofence Radius Circle with live state colors
      const circleColor = isUnlocked ? '#10b981' : isApproaching ? '#f59e0b' : '#6366f1';
      const circle = L.circle(latlng, {
        radius: MAX_UNLOCK_DISTANCE,
        color: circleColor,
        fillColor: circleColor,
        fillOpacity: isUnlocked ? 0.25 : isApproaching ? 0.15 : 0.08,
        weight: isUnlocked ? 2.5 : 1.5,
        dashArray: isUnlocked ? undefined : '4, 4',
      }).addTo(map);
      geofenceCirclesRef.current.push(circle);

      // Pick appropriate pin icon
      const typeKey = isAnswered
        ? 'answered'
        : isUnlocked
        ? 'in-range'
        : q.type === 'points'
        ? 'points'
        : userType === 'barn'
        ? 'unanswered-barn'
        : 'unanswered-vuxen';

      const icon = createCustomIcon(
        typeKey,
        isAnswered ? '✓' : q.type === 'points' ? '🎯' : `${index + 1}`,
        isUnlocked && !isAnswered
      );

      const marker = L.marker(latlng, { icon }).addTo(map);

      let statusHtml = '';
      let distHtml = '';

      if (isAnswered) {
        statusHtml = `<span style="color:#10b981; font-weight:bold;">Besvarad ✓</span>`;
      } else if (isUnlocked) {
        statusHtml = `<span style="color:#10b981; font-weight:bold;">🟢 Upplåst - Du är inom zonen!</span>`;
      } else if (!userLocation) {
        statusHtml = `<span style="color:#ef4444; font-weight:bold;">🔒 Låst (Slå på GPS)</span>`;
      } else {
        statusHtml = `<span style="color:#f59e0b; font-weight:bold;">🔒 Gå närmare (${MAX_UNLOCK_DISTANCE}m radie)</span>`;
      }

      if (dist !== null && bearing !== null) {
        const dir = getCompassDirection(bearing, lang);
        const colorClass = isUnlocked ? '#10b981' : '#4f46e5';
        distHtml = `<div style="font-size:11px; color:${colorClass}; font-weight:bold; margin-bottom:6px;">📍 ${formatDistance(dist)} (${dir.full})</div>`;
      } else {
        distHtml = `<div style="font-size:11px; color:#ef4444; font-weight:bold; margin-bottom:6px;">📍 Kräver GPS-position</div>`;
      }

      const popupContent = document.createElement('div');
      popupContent.className = 'text-center p-1';
      popupContent.innerHTML = `
        <div style="font-size:11px; margin-bottom:2px;">${statusHtml}</div>
        <div style="font-weight:bold; font-size:13px; margin-bottom:4px; line-height:1.2;">Fråga ${index + 1}: ${q.text}</div>
        ${distHtml}
      `;

      const btn = document.createElement('button');
      if (isAnswered) {
        btn.className = 'px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg w-full shadow cursor-pointer';
        btn.innerText = 'Visa fråga ✓';
      } else if (isUnlocked) {
        btn.className = 'px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg w-full shadow cursor-pointer animate-pulse';
        btn.innerText = 'Svara på fråga 🎯';
      } else {
        btn.className = 'px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-lg w-full shadow flex items-center justify-center gap-1 cursor-pointer';
        btn.innerText = `🔒 Gå inom ${MAX_UNLOCK_DISTANCE}m`;
      }

      btn.onclick = () => {
        onSelectQuestion(index);
      };
      popupContent.appendChild(btn);

      marker.bindPopup(popupContent);
      markers.push(marker);
    });

    fitAllBounds();

    return () => {
      markers.forEach((m) => m.remove());
    };
  }, [visibleGeotagged, userType, userLocation, unlockDistance]);

  return (
    <div className="relative isolate z-0 w-full h-80 sm:h-96 rounded-3xl overflow-hidden border-4 border-white shadow-xl">
      <div ref={mapRef} className="w-full h-full z-0" />

      {/* Live Walked Distance / Status Badge top-left */}
      {walkedPath && walkedPath.length >= 1 && (
        <div className="absolute top-3 left-3 z-10 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-2xl shadow-lg border border-emerald-100 flex items-center gap-2 max-w-[220px] sm:max-w-xs transition-all">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            {isLiveTracking && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isLiveTracking ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </span>
          <div className="min-w-0">
            <span className="text-[9px] uppercase tracking-wider text-slate-500 font-black block leading-none">
              {t(lang, 'walkedRoute')}
            </span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-black text-emerald-700">
                {formatDistance(walkedDistanceMeters)}
              </span>
              {isLiveTracking ? (
                <span className="text-[9px] px-1.5 py-0.2 bg-emerald-100 text-emerald-700 rounded-full font-bold">
                  Live 👣
                </span>
              ) : (
                <span className="text-[9px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full font-bold">
                  {t(lang, 'goalPoint')}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Control buttons top right */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        <button
          onClick={fitAllBounds}
          className="bg-white/95 hover:bg-white text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-black shadow-lg border border-indigo-100 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
        >
          🗺️ Visa hela slingan
        </button>
        {userLocation && (
          <button
            onClick={() => {
              if (leafletMap.current && userLocation) {
                leafletMap.current.setView([userLocation.lat, userLocation.lng], 17);
              }
            }}
            className="bg-white/95 hover:bg-white text-indigo-600 px-3 py-1.5 rounded-xl text-xs font-black shadow-lg border border-indigo-100 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer"
          >
            📍 Min position
          </button>
        )}
      </div>

      {/* Legend overlay */}
      <div className="absolute bottom-3 left-3 right-3 z-10 bg-white/95 backdrop-blur-md p-2.5 rounded-2xl shadow-lg border border-slate-100 flex items-center justify-around text-[10px] font-black text-slate-600 flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <span className="w-3.5 h-3.5 rounded-full bg-blue-600 border-2 border-white ring-2 ring-blue-300 animate-pulse flex items-center justify-center text-[7px] text-white font-black">
            DU
          </span>
          <span>Position</span>
        </div>
        {walkedPath && walkedPath.length >= 2 && (
          <div className="flex items-center gap-1.5 text-emerald-700">
            <span className="w-3.5 h-1 rounded-full bg-emerald-500 border border-emerald-600 border-dashed" />
            <span>{t(lang, 'walkedPathLegend')}</span>
          </div>
        )}
        {visibleGeotagged.length >= 2 && (
          <div className="flex items-center gap-1.5 text-indigo-600">
            <span className="w-3.5 h-1 rounded-full bg-indigo-500 border border-indigo-600 border-dashed" />
            <span>{t(lang, 'plannedRouteLegend')}</span>
          </div>
        )}
        {hiddenTreasureCount > 0 && (
          <div className="flex items-center gap-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded-lg border border-amber-200">
            <span>🕵️‍♂️</span>
            <span>{hiddenTreasureCount} {t(lang, 'treasureHuntBadge')}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-500" />
          <span>Svarad ✓</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-emerald-600 ring-2 ring-emerald-300 animate-pulse" />
          <span>I zonen 🎯</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-slate-400" />
          <span>Låst 🔒</span>
        </div>
      </div>
    </div>
  );
};

/* -------------------------------------------------------------
   RouteGeoTagModal (Auto-Slinga ritare med drag-and-drop & vänd rutt)
---------------------------------------------------------------- */
interface RouteGeoTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  barnQuestions: Question[];
  vuxenQuestions: Question[];
  initialCategory?: UserType | 'both';
  userLocation: Location | null;
  lang: Language;
  onApplyGeoTags: (category: UserType | 'both', locations: Location[]) => void;
}

export const RouteGeoTagModal: React.FC<RouteGeoTagModalProps> = ({
  isOpen,
  onClose,
  barnQuestions,
  vuxenQuestions,
  initialCategory = 'barn',
  userLocation,
  lang,
  onApplyGeoTags,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<UserType | 'both'>(initialCategory);
  const [waypoints, setWaypoints] = useState<Location[]>([]);

  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const waypointMarkersRef = useRef<L.Marker[]>([]);
  const stationMarkersRef = useRef<L.Marker[]>([]);

  const activeQuestions =
    selectedCategory === 'both'
      ? barnQuestions.length >= vuxenQuestions.length
        ? barnQuestions
        : vuxenQuestions
      : selectedCategory === 'barn'
      ? barnQuestions
      : vuxenQuestions;

  const questionsCount = activeQuestions.length;

  useEffect(() => {
    if (!isOpen) return;
    if (waypoints.length > 0) return;

    const existingLocations = activeQuestions
      .filter((q) => q.location)
      .map((q) => q.location!);

    if (existingLocations.length >= 2) {
      setWaypoints(existingLocations);
    }
  }, [isOpen, selectedCategory]);

  let totalDistance = 0;
  for (let k = 0; k < waypoints.length - 1; k++) {
    totalDistance += calculateDistanceMeters(
      waypoints[k].lat,
      waypoints[k].lng,
      waypoints[k + 1].lat,
      waypoints[k + 1].lng
    );
  }

  const estWalkingTime = calculateWalkingTimeMinutes(totalDistance);
  const stepDistance = questionsCount > 1 && totalDistance > 0 ? Math.round(totalDistance / (questionsCount - 1)) : 0;

  const waypointIcon = L.divIcon({
    className: 'custom-waypoint-pin',
    html: `<div style="
      width: 22px;
      height: 22px;
      background: #4f46e5;
      border: 3.5px solid #ffffff;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(79, 70, 229, 0.9);
      cursor: grab;
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });

  useEffect(() => {
    if (!isOpen || !mapRef.current) return;

    if (!leafletMap.current) {
      const defaultCenter: [number, number] = userLocation
        ? [userLocation.lat, userLocation.lng]
        : waypoints[0]
        ? [waypoints[0].lat, waypoints[0].lng]
        : [59.3293, 18.0686];

      const map = L.map(mapRef.current).setView(defaultCenter, 15);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      leafletMap.current = map;

      map.on('click', (e: L.LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        setWaypoints((prev) => [...prev, { lat, lng }]);
      });

      setTimeout(() => {
        map.invalidateSize();
      }, 200);
    }

    return () => {
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
        polylineRef.current = null;
        waypointMarkersRef.current = [];
        stationMarkersRef.current = [];
      }
    };
  }, [isOpen]);

  useEffect(() => {
    const map = leafletMap.current;
    if (!map) return;

    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }
    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = [];

    stationMarkersRef.current.forEach((m) => m.remove());
    stationMarkersRef.current = [];

    if (waypoints.length === 0) return;

    const coords: [number, number][] = waypoints.map((w) => [w.lat, w.lng]);
    if (coords.length >= 2) {
      polylineRef.current = L.polyline(coords, {
        color: '#6366f1',
        weight: 6,
        opacity: 0.9,
        dashArray: '8, 8',
      }).addTo(map);
    }

    // Draggable Waypoint Pins
    waypoints.forEach((wp, idx) => {
      const marker = L.marker([wp.lat, wp.lng], {
        icon: waypointIcon,
        draggable: true,
        zIndexOffset: 500,
      }).addTo(map);

      marker.on('drag', (e) => {
        const pos = e.target.getLatLng();
        setWaypoints((prev) => {
          const updated = [...prev];
          updated[idx] = { lat: pos.lat, lng: pos.lng };
          return updated;
        });
      });

      waypointMarkersRef.current.push(marker);
    });

    // Interpolated Station Pins
    if (waypoints.length >= 2 && questionsCount > 0) {
      const interpolated = interpolatePointsAlongPolyline(waypoints, questionsCount);

      interpolated.forEach((pt, idx) => {
        const q = activeQuestions[idx];
        const pinType =
          selectedCategory === 'both'
            ? 'unanswered-vuxen'
            : selectedCategory === 'barn'
            ? 'unanswered-barn'
            : 'unanswered-vuxen';

        const icon = createCustomIcon(pinType, `${idx + 1}`);

        const m = L.marker([pt.lat, pt.lng], { icon, zIndexOffset: 1000, draggable: false }).addTo(map);

        const popupDiv = document.createElement('div');
        popupDiv.className = 'p-1 text-center';
        popupDiv.innerHTML = `
          <div style="font-weight:900; font-size:13px; color:#1e293b; margin-bottom:2px;">Station ${idx + 1}</div>
          <div style="font-size:12px; font-weight:600; color:#475569; margin-bottom:4px;">${q ? q.text : ''}</div>
          <div style="font-size:10px; color:#6366f1; font-weight:800;">📍 ${formatDistance(pt.distanceFromStartMeters)} från start</div>
        `;

        m.bindPopup(popupDiv);
        stationMarkersRef.current.push(m);
      });
    }
  }, [waypoints, selectedCategory, questionsCount]);

  if (!isOpen) return null;

  const handleApply = () => {
    if (waypoints.length < 2 || questionsCount === 0) return;

    const interpolated = interpolatePointsAlongPolyline(waypoints, questionsCount);
    const locations: Location[] = interpolated.map((pt, idx) => ({
      lat: pt.lat,
      lng: pt.lng,
      name: `Station ${idx + 1}`,
    }));

    onApplyGeoTags(selectedCategory, locations);
    onClose();
  };

  const handleUndo = () => {
    setWaypoints((prev) => prev.slice(0, prev.length - 1));
  };

  const handleReverseRoute = () => {
    if (waypoints.length < 2) return;
    setWaypoints((prev) => [...prev].reverse());
  };

  const handleClear = () => {
    setWaypoints([]);
  };

  const handleUseLocation = () => {
    if (userLocation) {
      setWaypoints((prev) => [...prev, { lat: userLocation.lat, lng: userLocation.lng }]);
      if (leafletMap.current) {
        leafletMap.current.setView([userLocation.lat, userLocation.lng], 16);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 flex flex-col font-sans text-white animate-in fade-in duration-200">
      {/* Top Header Controls */}
      <div className="bg-slate-900 border-b border-slate-800 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <MapPin className="w-5 h-5 text-yellow-300" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
              <span>{t(lang, 'drawRouteTitle')}</span>
            </h2>
            <p className="text-[11px] text-slate-400 font-medium">
              {t(lang, 'drawHintStart')}
            </p>
          </div>
        </div>

        {/* Category Pill Switcher */}
        <div className="flex items-center gap-1.5 bg-slate-800/90 p-1 rounded-2xl border border-slate-700 overflow-x-auto no-scrollbar max-w-full">
          <button
            onClick={() => setSelectedCategory('barn')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'barn'
                ? 'bg-amber-400 text-slate-950 shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            🧒 Barn ({barnQuestions.length})
          </button>
          <button
            onClick={() => setSelectedCategory('vuxen')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'vuxen'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            🧔 Vuxen ({vuxenQuestions.length})
          </button>
          <button
            onClick={() => setSelectedCategory('both')}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
              selectedCategory === 'both'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            👥 {t(lang, 'bothCategories')}
          </button>
        </div>

        {/* Close Modal */}
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition-all border border-slate-700 active:scale-95 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sub-bar Stats & Quick Actions */}
      <div className="bg-slate-900/95 border-b border-slate-800/80 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Live Trail Stats */}
        <div className="flex flex-wrap items-center gap-2 font-extrabold text-slate-300">
          <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5">
            📍 {t(lang, 'waypointsLabel')}: <strong className="text-white">{waypoints.length}</strong>
          </span>
          <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5">
            📏 {t(lang, 'trailLength')}: <strong className="text-indigo-400">{formatDistance(totalDistance)}</strong>
          </span>
          {totalDistance > 0 && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5">
              ⏱️ {t(lang, 'estWalkTime')}: <strong className="text-amber-300">~{estWalkingTime} min</strong>
            </span>
          )}
          {waypoints.length >= 2 && stepDistance > 0 && (
            <span className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/60 flex items-center gap-1.5">
              📐 {t(lang, 'stationDistance')}: <strong className="text-emerald-400">~{formatDistance(stepDistance)}</strong>
            </span>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {waypoints.length >= 2 && (
            <button
              onClick={handleReverseRoute}
              className="px-3 py-1.5 bg-slate-800 hover:bg-indigo-900/80 text-indigo-300 font-extrabold rounded-xl border border-indigo-500/40 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
              title="Kasta om start och mål"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{t(lang, 'reverseRouteBtn')}</span>
            </button>
          )}

          {userLocation && (
            <button
              onClick={handleUseLocation}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-indigo-300 font-extrabold rounded-xl border border-indigo-500/30 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
            >
              <Navigation className="w-3.5 h-3.5 text-indigo-400" />
              <span>{t(lang, 'useMyPositionBtn')}</span>
            </button>
          )}

          <button
            onClick={handleUndo}
            disabled={waypoints.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 font-extrabold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>{t(lang, 'undoPointBtn')}</span>
          </button>

          <button
            onClick={handleClear}
            disabled={waypoints.length === 0}
            className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/80 hover:text-rose-300 disabled:opacity-40 text-slate-300 font-extrabold rounded-xl border border-slate-700 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{t(lang, 'clearLineBtn')}</span>
          </button>

          <button
            onClick={handleApply}
            disabled={waypoints.length < 2 || questionsCount === 0}
            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 font-black rounded-xl shadow-lg shadow-emerald-500/20 flex items-center gap-2 transition-all active:scale-95 cursor-pointer"
          >
            <Check className="w-4 h-4" />
            <span>{t(lang, 'applyGeoTagsBtn', { count: questionsCount.toString() })}</span>
          </button>
        </div>
      </div>

      {/* Map Canvas */}
      <div className="relative isolate z-0 flex-1 w-full h-full">
        <div ref={mapRef} className="w-full h-full z-0 cursor-crosshair" />

        {/* Floating Instruction Banner */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 max-w-lg w-11/12 bg-slate-900/95 text-white px-5 py-3 rounded-2xl shadow-2xl border border-indigo-500/40 backdrop-blur-md text-xs font-extrabold text-center flex items-center justify-center gap-2">
          {waypoints.length < 2 ? (
            <span className="text-yellow-300 flex items-center gap-2">
              💡 {t(lang, 'drawHintStart')}
            </span>
          ) : (
            <span className="text-emerald-400 flex items-center gap-2">
              ✨ {t(lang, 'drawHintSuccess', { count: questionsCount.toString() })} ({t(lang, 'dragPinToAdjust')})
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
