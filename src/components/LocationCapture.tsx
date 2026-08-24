'use client';

import { useEffect, useMemo, useState } from "react";
import styles from "./LocationCapturePermission.module.css";

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

type GeolocationPermissionState = PermissionState | "unknown";

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

export function LocationCapture({
  value,
  onChange,
  title = "Location",
  description = "Share the exact service location only when it helps Centrum handle your request.",
  preset = null,
  presetLabel = "Use saved location",
  disabled = false,
  allowClear = true,
}: LocationCaptureProps) {
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState("");
  const [manualLatitude, setManualLatitude] = useState(value ? String(value.latitude) : "");
  const [manualLongitude, setManualLongitude] = useState(value ? String(value.longitude) : "");
  const [permissionState, setPermissionState] = useState<GeolocationPermissionState>("unknown");
  const [showPermissionPrompt, setShowPermissionPrompt] = useState(false);

  const accuracyLabel = useMemo(() => {
    if (!value?.accuracyM || !Number.isFinite(value.accuracyM)) return null;
    return `±${Math.round(value.accuracyM)} m`;
  }, [value]);

  useEffect(() => {
    let active = true;
    let permissionStatus: PermissionStatus | null = null;

    async function watchPermission() {
      if (!navigator.permissions?.query) return;
      try {
        permissionStatus = await navigator.permissions.query({ name: "geolocation" });
        if (!active) return;
        setPermissionState(permissionStatus.state);
        permissionStatus.onchange = () => {
          if (!active || !permissionStatus) return;
          setPermissionState(permissionStatus.state);
          if (permissionStatus.state === "granted") setShowPermissionPrompt(false);
        };
      } catch {
        // Some browsers support geolocation but not querying its permission state.
        // In that case getCurrentPosition() below will trigger the native prompt.
      }
    }

    void watchPermission();
    return () => {
      active = false;
      if (permissionStatus) permissionStatus.onchange = null;
    };
  }, []);

  async function readPermissionState(): Promise<GeolocationPermissionState> {
    if (!navigator.permissions?.query) return "unknown";
    try {
      const status = await navigator.permissions.query({ name: "geolocation" });
      setPermissionState(status.state);
      return status.state;
    } catch {
      return "unknown";
    }
  }

  function captureCurrentLocation() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location access is unavailable in this browser. You can enter coordinates manually instead.");
      return;
    }

    if (!window.isSecureContext) {
      setError("Your browser only allows GPS location on HTTPS or localhost. Open the secure Centrum site or enter coordinates manually.");
      return;
    }

    setCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next: CapturedLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
          capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        };
        setManualLatitude(String(next.latitude));
        setManualLongitude(String(next.longitude));
        setPermissionState("granted");
        setShowPermissionPrompt(false);
        onChange(next);
        setCapturing(false);
      },
      (cause) => {
        const denied = cause.code === cause.PERMISSION_DENIED;
        if (denied) setPermissionState("denied");
        const message = denied
          ? "Location access is blocked for Centrum. Allow Location for this site in your browser settings, then try again."
          : cause.code === cause.TIMEOUT
            ? "Location capture timed out. Try again outside or enter coordinates manually."
            : "Your location could not be read right now. Try again or enter coordinates manually.";
        setError(message);
        setCapturing(false);
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  async function useCurrentLocation() {
    setError("");

    if (!navigator.geolocation) {
      setError("Location access is unavailable in this browser. You can enter coordinates manually instead.");
      return;
    }

    if (!window.isSecureContext) {
      setError("Your browser only allows GPS location on HTTPS or localhost. Open the secure Centrum site or enter coordinates manually.");
      return;
    }

    const currentPermission = await readPermissionState();

    // If location is already allowed, do not interrupt the user with another
    // Centrum prompt. Capture immediately.
    if (currentPermission === "granted") {
      captureCurrentLocation();
      return;
    }

    // When the browser says permission still needs a decision (or is already
    // blocked), explain why Centrum needs it before invoking the native prompt.
    if (currentPermission === "prompt" || currentPermission === "denied") {
      setShowPermissionPrompt(true);
      return;
    }

    // Permissions API is not available in every browser. Calling the
    // Geolocation API here lets that browser show its own native permission UI.
    captureCurrentLocation();
  }

  async function retryAfterPermissionChange() {
    setError("");
    const currentPermission = await readPermissionState();

    if (currentPermission === "denied") {
      setError("Location is still blocked for this site. Change the browser's Location permission to Allow, then press retry.");
      return;
    }

    setShowPermissionPrompt(false);
    captureCurrentLocation();
  }

  function useManualCoordinates() {
    setError("");
    const latitude = Number(manualLatitude);
    const longitude = Number(manualLongitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      setError("Enter a valid latitude between -90 and 90.");
      return;
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      setError("Enter a valid longitude between -180 and 180.");
      return;
    }
    onChange({ latitude, longitude, accuracyM: null, capturedAt: new Date().toISOString() });
  }

  const permissionBlocked = permissionState === "denied";

  return (
    <div className="location-capture">
      <div className="location-capture-heading">
        <div>
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {value ? <span className="status-pill status-active">Location ready</span> : <span className="status-pill status-inactive">Optional</span>}
      </div>

      {value ? (
        <div className="location-capture-value">
          <div>
            <span className="location-capture-coordinates">{formatLocationCoordinates(value)}</span>
            <small>{accuracyLabel ? `${accuracyLabel} accuracy · ` : ""}Captured {new Date(value.capturedAt).toLocaleString()}</small>
          </div>
          <a className="text-link location-map-link" href={locationMapUrl(value)} target="_blank" rel="noreferrer">Open in Maps ↗</a>
        </div>
      ) : (
        <p className="field-note location-capture-empty">No location attached yet.</p>
      )}

      <div className="location-capture-actions">
        <button type="button" className="btn btn-secondary btn-compact" disabled={disabled || capturing} onClick={() => void useCurrentLocation()}>
          {capturing ? "Getting location..." : "Use my current location"}
        </button>
        {preset && !isSameLocation(value, preset) ? (
          <button type="button" className="btn btn-secondary btn-compact" disabled={disabled} onClick={() => {
            setManualLatitude(String(preset.latitude));
            setManualLongitude(String(preset.longitude));
            onChange(preset);
            setError("");
          }}>{presetLabel}</button>
        ) : null}
        {allowClear && value ? <button type="button" className="btn btn-secondary btn-compact" disabled={disabled} onClick={() => onChange(null)}>Remove</button> : null}
      </div>

      <details className="location-manual-entry">
        <summary>Enter coordinates manually</summary>
        <div className="location-manual-grid">
          <label>Latitude<input type="number" inputMode="decimal" min="-90" max="90" step="0.000001" value={manualLatitude} onChange={(event) => setManualLatitude(event.target.value)} placeholder="34.123456" disabled={disabled} /></label>
          <label>Longitude<input type="number" inputMode="decimal" min="-180" max="180" step="0.000001" value={manualLongitude} onChange={(event) => setManualLongitude(event.target.value)} placeholder="36.123456" disabled={disabled} /></label>
          <button type="button" className="btn btn-secondary btn-compact" onClick={useManualCoordinates} disabled={disabled}>Use coordinates</button>
        </div>
      </details>

      {error ? <p className="form-alert form-alert-error location-capture-error">{error}</p> : null}
      <p className="field-note location-privacy-note">Browser GPS works on HTTPS or localhost. On an HTTP LAN preview, use manual coordinates instead.</p>

      {showPermissionPrompt ? (
        <div className={styles.permissionBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setShowPermissionPrompt(false);
        }}>
          <div className={styles.permissionDialog} role="dialog" aria-modal="true" aria-labelledby="location-permission-title">
            <div className={styles.permissionIcon} aria-hidden="true">⌖</div>
            <div className="badge card-badge">Location Permission</div>
            <h3 id="location-permission-title">{permissionBlocked ? "Turn on location access" : "Allow location access?"}</h3>
            <p>
              {permissionBlocked
                ? "Centrum cannot read your current location because location access is blocked for this site."
                : "To attach your exact service location, Centrum needs permission to read your device's current location."}
            </p>

            {permissionBlocked ? (
              <div className={styles.permissionSteps}>
                <strong>Enable it in your browser:</strong>
                <ol>
                  <li>Open the site controls or settings for this page.</li>
                  <li>Set <strong>Location</strong> to <strong>Allow</strong>.</li>
                  <li>Come back here and press <strong>I enabled it — retry</strong>.</li>
                </ol>
              </div>
            ) : (
              <p className={styles.permissionNote}>Your browser will show its own permission request next. Choose <strong>Allow</strong> to continue.</p>
            )}

            <div className={styles.permissionActions}>
              {permissionBlocked ? (
                <button type="button" className="btn btn-primary" onClick={() => void retryAfterPermissionChange()} disabled={capturing}>
                  I enabled it — retry
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => {
                  setShowPermissionPrompt(false);
                  captureCurrentLocation();
                }} disabled={capturing}>
                  Continue & allow location
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={() => setShowPermissionPrompt(false)}>Not now</button>
            </div>
            <small>Centrum only saves the coordinates you choose to attach or save to your account.</small>
          </div>
        </div>
      ) : null}
    </div>
  );
}
