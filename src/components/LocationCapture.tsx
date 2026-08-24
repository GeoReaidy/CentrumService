'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./GoogleMapsLocationPicker.module.css";

export type CapturedLocation = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
};

type LocationCaptureProps = {
  value: CapturedLocation | null;
  onChange: (location: CapturedLocation | null) => void;
  title?: string;
  description?: string;
  preset?: CapturedLocation | null;
  presetLabel?: string;
  disabled?: boolean;
  allowClear?: boolean;
};

type PickerProps = {
  initialLocation: CapturedLocation | null;
  onCancel: () => void;
  onConfirm: (location: CapturedLocation) => void;
};

type SelectedPoint = {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
};

declare global {
  interface Window {
    google?: any;
    __centrumGoogleMapsLoader?: Promise<any>;
  }
}

const DEFAULT_CENTER = { lat: 34.23, lng: 36.38 };
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function isSameLocation(a: CapturedLocation | null, b: CapturedLocation | null) {
  if (!a || !b) return false;
  return Math.abs(a.latitude - b.latitude) < 0.000001 && Math.abs(a.longitude - b.longitude) < 0.000001;
}

export function locationMapUrl(location: Pick<CapturedLocation, "latitude" | "longitude">) {
  return `https://www.google.com/maps?q=${encodeURIComponent(`${location.latitude},${location.longitude}`)}`;
}

export function formatLocationCoordinates(location: Pick<CapturedLocation, "latitude" | "longitude">) {
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function loadGoogleMaps(apiKey: string) {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps can only load in the browser."));
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google);
  if (window.__centrumGoogleMapsLoader) return window.__centrumGoogleMapsLoader;

  window.__centrumGoogleMapsLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-centrum-google-maps="true"]');
    if (existing) {
      existing.addEventListener("load", () => window.google?.maps ? resolve(window.google) : reject(new Error("Google Maps did not initialize.")), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Maps could not load.")), { once: true });
      return;
    }

    const callbackName = `__centrumGoogleMapsReady_${Math.random().toString(36).slice(2)}`;
    const runtimeWindow = window as typeof window & Record<string, unknown>;
    runtimeWindow[callbackName] = () => {
      delete runtimeWindow[callbackName];
      if (window.google?.maps) resolve(window.google);
      else reject(new Error("Google Maps did not initialize."));
    };

    const script = document.createElement("script");
    script.dataset.centrumGoogleMaps = "true";
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${encodeURIComponent(callbackName)}`;
    script.onerror = () => {
      delete runtimeWindow[callbackName];
      reject(new Error("Google Maps could not load."));
    };
    document.head.appendChild(script);
  });

  return window.__centrumGoogleMapsLoader;
}

function GoogleMapsPicker({ initialLocation, onCancel, onConfirm }: PickerProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const searchElementRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const accuracyRef = useRef<number | null>(initialLocation?.accuracyM ?? null);
  const selectedRef = useRef<SelectedPoint>({
    latitude: initialLocation?.latitude ?? DEFAULT_CENTER.lat,
    longitude: initialLocation?.longitude ?? DEFAULT_CENTER.lng,
    accuracyM: initialLocation?.accuracyM ?? null,
  });
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);
  const [helperMessage, setHelperMessage] = useState("Move the map until the pin is exactly where you want the technician to go.");
  const [hasSelection, setHasSelection] = useState(Boolean(initialLocation));

  const syncSelectedFromMap = useCallback(() => {
    const map = mapInstanceRef.current;
    const center = map?.getCenter?.();
    if (!center) return;
    selectedRef.current = {
      latitude: center.lat(),
      longitude: center.lng(),
      accuracyM: accuracyRef.current,
    };
  }, []);

  const locateMe = useCallback((quiet = false) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (!navigator.geolocation || !window.isSecureContext) {
      if (!quiet) setHelperMessage("Search for your home above, or move the map until the pin is on the right building.");
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        accuracyRef.current = Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null;
        selectedRef.current = {
          latitude: point.lat,
          longitude: point.lng,
          accuracyM: accuracyRef.current,
        };
        map.setCenter(point);
        map.setZoom(18);
        setHasSelection(true);
        setHelperMessage("We found your current location. Move the map only if the pin is not on the correct building.");
        setLocating(false);
      },
      () => {
        accuracyRef.current = null;
        setHelperMessage("We couldn't find your phone automatically. Search for your home above, or move the map until the pin is on the right building.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  useEffect(() => {
    let active = true;
    const mapListeners: any[] = [];
    let autocompleteElement: any = null;
    let autocompleteHandler: ((event: any) => void) | null = null;

    async function initializeMap() {
      if (!GOOGLE_MAPS_API_KEY) {
        setMapLoading(false);
        setMapError("Google Maps is not configured on this site yet.");
        return;
      }

      try {
        const google = await loadGoogleMaps(GOOGLE_MAPS_API_KEY);
        if (!active || !mapElementRef.current) return;

        const { Map } = await google.maps.importLibrary("maps");
        const map = new Map(mapElementRef.current, {
          center: initialLocation ? { lat: initialLocation.latitude, lng: initialLocation.longitude } : DEFAULT_CENTER,
          zoom: initialLocation ? 18 : 11,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
          gestureHandling: "greedy",
        });

        mapInstanceRef.current = map;
        mapListeners.push(map.addListener("dragstart", () => {
          accuracyRef.current = null;
          setHasSelection(true);
          setHelperMessage("Move the map until the pin is on the exact building, then press Send this location.");
        }));
        mapListeners.push(map.addListener("center_changed", syncSelectedFromMap));

        if (searchElementRef.current) {
          try {
            const { PlaceAutocompleteElement } = await google.maps.importLibrary("places");
            if (!active) return;
            autocompleteElement = new PlaceAutocompleteElement();
            autocompleteElement.placeholder = "Search village, street or building";
            autocompleteElement.setAttribute("aria-label", "Search location");
            autocompleteElement.style.width = "100%";
            autocompleteHandler = async (event: any) => {
              try {
                const place = event.placePrediction?.toPlace?.();
                if (!place) return;
                await place.fetchFields({ fields: ["displayName", "formattedAddress", "location"] });
                if (!place.location) return;
                accuracyRef.current = null;
                setHasSelection(true);
                map.panTo(place.location);
                map.setZoom(18);
                setHelperMessage("Place the pin on the exact building, then press Send this location.");
              } catch {
                setHelperMessage("That search result could not be opened. Try another nearby place or move the map manually.");
              }
            };
            autocompleteElement.addEventListener("gmp-select", autocompleteHandler);
            searchElementRef.current.replaceChildren(autocompleteElement);
          } catch {
            searchElementRef.current.replaceChildren();
          }
        }

        setMapLoading(false);
        if (!initialLocation) window.setTimeout(() => locateMe(true), 100);
      } catch (cause) {
        console.error("Google Maps location picker failed to load", cause);
        if (!active) return;
        setMapLoading(false);
        setMapError("Google Maps could not load right now. Please try again.");
      }
    }

    void initializeMap();

    return () => {
      active = false;
      mapListeners.forEach((listener) => listener?.remove?.());
      if (autocompleteElement && autocompleteHandler) autocompleteElement.removeEventListener("gmp-select", autocompleteHandler);
      mapInstanceRef.current = null;
    };
  }, [initialLocation, locateMe, syncSelectedFromMap]);

  function confirmSelection() {
    syncSelectedFromMap();
    const point = selectedRef.current;
    if (!hasSelection) return;
    onConfirm({
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyM: point.accuracyM,
      capturedAt: new Date().toISOString(),
    });
  }

  return (
    <div className={styles.backdrop} role="presentation" onMouseDown={(event: any) => {
      if (event.target === event.currentTarget) onCancel();
    }}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="centrum-location-picker-title">
        <header className={styles.header}>
          <div>
            <span className="badge card-badge">Google Maps</span>
            <h2 id="centrum-location-picker-title">Send your location</h2>
            <p>Find your home or service point, then leave the pin on the correct building.</p>
          </div>
          <button type="button" className={styles.closeButton} onClick={onCancel} aria-label="Close location picker">×</button>
        </header>

        <div className={styles.searchArea}>
          <div ref={searchElementRef} className={styles.searchHost} />
          <button type="button" className={`btn btn-secondary btn-compact ${styles.myLocationButton}`} onClick={() => locateMe(false)} disabled={mapLoading || locating || Boolean(mapError)}>
            {locating ? "Finding you..." : "Use my current location"}
          </button>
        </div>

        <div className={styles.mapFrame}>
          <div ref={mapElementRef} className={styles.map} aria-label="Google Map location picker" />
          {!mapError ? (
            <div className={styles.centerPin} aria-hidden="true">
              <span className={styles.pinHead} />
              <span className={styles.pinPoint} />
            </div>
          ) : null}
          {mapLoading ? <div className={styles.mapState}>Loading Google Maps...</div> : null}
          {mapError ? <div className={`${styles.mapState} ${styles.mapError}`}><strong>Map unavailable</strong><span>{mapError}</span></div> : null}
        </div>

        <div className={styles.helperRow}>
          <span className={styles.helperIcon} aria-hidden="true">⌖</span>
          <p>{helperMessage}</p>
        </div>

        <footer className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={confirmSelection} disabled={mapLoading || Boolean(mapError) || !hasSelection}>Send this location</button>
        </footer>
      </section>
    </div>
  );
}

export function LocationCapture({
  value,
  onChange,
  title = "Location",
  description = "Share the exact service point when it helps Centrum handle your request.",
  preset = null,
  presetLabel = "Use saved location",
  disabled = false,
  allowClear = true,
}: LocationCaptureProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const locationHint = useMemo(() => {
    if (!value) return "Tap Upload location and place the pin on your home or service point.";
    if (value.accuracyM && Number.isFinite(value.accuracyM)) return "Location selected from your phone and ready to send.";
    return "Location selected on Google Maps and ready to send.";
  }, [value]);

  return (
    <div className={`location-capture ${styles.captureShell}`}>
      <div className="location-capture-heading">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {value ? <span className="status-pill status-active">Location ready</span> : <span className="status-pill status-inactive">Optional</span>}
      </div>

      <div className={value ? styles.readyState : styles.emptyState}>
        <span className={styles.stateIcon} aria-hidden="true">{value ? "✓" : "⌖"}</span>
        <div>
          <strong>{value ? "Location uploaded" : "No location uploaded yet"}</strong>
          <small>{locationHint}</small>
        </div>
      </div>

      <div className="location-capture-actions">
        <button type="button" className={`btn btn-primary ${styles.uploadButton}`} disabled={disabled} onClick={() => setPickerOpen(true)}>
          {value ? "Change location" : "Upload location"}
        </button>
        {preset && !isSameLocation(value, preset) ? (
          <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => onChange(preset)}>{presetLabel}</button>
        ) : null}
        {allowClear && value ? <button type="button" className="btn btn-secondary" disabled={disabled} onClick={() => onChange(null)}>Remove location</button> : null}
      </div>

      {pickerOpen ? (
        <GoogleMapsPicker
          initialLocation={value ?? preset}
          onCancel={() => setPickerOpen(false)}
          onConfirm={(location) => {
            onChange(location);
            setPickerOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
