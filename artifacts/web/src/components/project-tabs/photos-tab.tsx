import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjectPhotos,
  useCreateSitePhoto,
  getListProjectPhotosQueryKey,
  getGetProjectDashboardQueryKey,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Camera, Upload, MapPin, Loader2, X, AlertCircle } from "lucide-react";
import { formatDate } from "@/lib/ocms-format";

type Geo = { lat: number; lng: number; accuracy: number } | null;
type GeoStatus = "idle" | "requesting" | "granted" | "denied" | "unavailable";

function useGeolocation() {
  const [coords, setCoords] = useState<Geo>(null);
  const [status, setStatus] = useState<GeoStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const request = () => {
    if (!("geolocation" in navigator)) {
      setStatus("unavailable");
      setError("Geolocation is not available in this browser.");
      return;
    }
    setStatus("requesting");
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setStatus("granted");
      },
      (err) => {
        setStatus("denied");
        setError(err.message || "Location permission denied.");
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
    );
  };

  return { coords, status, error, request, reset: () => { setCoords(null); setStatus("idle"); setError(null); } };
}

const TAGS = ["progress", "qc", "safety", "milestone", "defect"] as const;

export function PhotosTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [tag, setTag] = useState<(typeof TAGS)[number]>("progress");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const geo = useGeolocation();
  const { data, refetch } = useListProjectPhotos(projectId, {
    query: { enabled: !!projectId, queryKey: getListProjectPhotosQueryKey(projectId) },
  });
  const upload = useUpload();
  const create = useCreateSitePhoto();

  // Build/clean preview URL whenever the file changes
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Auto-request GPS when the dialog opens
  useEffect(() => {
    if (open && geo.status === "idle") geo.request();
    if (!open) {
      // Reset on close
      setFile(null);
      setCaption("");
      setTag("progress");
      setSubmitError(null);
      geo.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const openCamera = () => {
    setMode("camera");
    cameraInputRef.current?.click();
  };
  const openFilePicker = () => {
    setMode("upload");
    uploadInputRef.current?.click();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
    e.target.value = ""; // allow re-picking the same file
  };

  const submit = async () => {
    if (!file) {
      setSubmitError("Please capture or select a photo first.");
      return;
    }
    setSubmitError(null);
    const uploaded = await upload.uploadFile(file);
    if (!uploaded) {
      setSubmitError(upload.error?.message ?? "Upload failed.");
      return;
    }
    const servingUrl = `/api/storage${uploaded.objectPath}`;
    create.mutate(
      {
        projectId,
        data: {
          url: servingUrl,
          caption: caption || undefined,
          tag,
          capturedAt: new Date().toISOString(),
          latitude: geo.coords?.lat,
          longitude: geo.coords?.lng,
        },
      },
      {
        onSuccess: () => {
          setOpen(false);
          qc.invalidateQueries({ queryKey: getListProjectPhotosQueryKey(projectId) });
          qc.invalidateQueries({ queryKey: getGetProjectDashboardQueryKey(projectId) });
          refetch();
        },
        onError: (err: unknown) => {
          setSubmitError(err instanceof Error ? err.message : "Failed to save photo.");
        },
      },
    );
  };

  const busy = upload.isUploading || create.isPending;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Site Photos</CardTitle>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setMode("upload"); setOpen(true); setTimeout(() => uploadInputRef.current?.click(), 50); }}
                data-testid="photo-upload-btn"
              >
                <Upload className="h-4 w-4 mr-1" /> Upload
              </Button>
            </TooltipTrigger>
            <TooltipContent>Pick an existing photo from this device</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                onClick={() => { setMode("camera"); setOpen(true); setTimeout(() => cameraInputRef.current?.click(), 50); }}
                data-testid="photo-camera-btn"
              >
                <Camera className="h-4 w-4 mr-1" /> Capture
              </Button>
            </TooltipTrigger>
            <TooltipContent>Take a live photo with GPS tagging</TooltipContent>
          </Tooltip>
        </div>
      </CardHeader>

      {/* Hidden inputs — `capture="environment"` opens the rear camera on mobile;
          falls back to file picker on desktop. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onPick}
        data-testid="photo-input-camera"
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={onPick}
        data-testid="photo-input-upload"
      />

      <CardContent>
        {!data?.length ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No photos uploaded yet. Click <strong>Capture</strong> to take a live photo or <strong>Upload</strong> to pick one.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {data.map((p) => {
              const hasGeo = p.latitude !== null && p.longitude !== null;
              const mapsUrl = hasGeo
                ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}`
                : null;
              return (
                <div key={p.id} className="group rounded-lg overflow-hidden border bg-card">
                  <div className="aspect-video bg-muted overflow-hidden">
                    <img
                      src={p.url}
                      alt={p.caption ?? ""}
                      className="w-full h-full object-cover group-hover:scale-105 transition"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <div className="text-sm font-medium line-clamp-1">{p.caption || "Untitled"}</div>
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                      <span>{formatDate(p.capturedAt)}</span>
                      {p.tag && (
                        <span className="px-1.5 py-0.5 rounded bg-muted text-[10px] uppercase tracking-wide">
                          {p.tag}
                        </span>
                      )}
                      {hasGeo && mapsUrl && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={mapsUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="flex items-center gap-0.5 hover:text-primary"
                              data-testid={`photo-geo-${p.id}`}
                            >
                              <MapPin className="h-3 w-3" />
                              <span className="tabular-nums text-[10px]">
                                {Number(p.latitude).toFixed(4)}, {Number(p.longitude).toFixed(4)}
                              </span>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Open in Google Maps</TooltipContent>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "camera" ? "Capture Site Photo" : "Upload Site Photo"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview */}
            {previewUrl ? (
              <div className="relative rounded-lg overflow-hidden border bg-muted aspect-video">
                <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                <button
                  type="button"
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80"
                  onClick={() => setFile(null)}
                  aria-label="Remove photo"
                  data-testid="photo-remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-border bg-muted/40 aspect-video flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                {mode === "camera" ? <Camera className="h-8 w-8" /> : <Upload className="h-8 w-8" />}
                <span>No photo yet</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={openCamera} type="button">
                    <Camera className="h-3.5 w-3.5 mr-1" /> Camera
                  </Button>
                  <Button size="sm" variant="outline" onClick={openFilePicker} type="button">
                    <Upload className="h-3.5 w-3.5 mr-1" /> Choose file
                  </Button>
                </div>
              </div>
            )}

            {/* GPS status */}
            <div className="rounded-lg border bg-card p-3 text-xs flex items-start gap-2">
              <MapPin className={`h-4 w-4 mt-0.5 ${geo.status === "granted" ? "text-emerald-600" : "text-muted-foreground"}`} />
              <div className="flex-1">
                {geo.status === "requesting" && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Getting your location…
                  </span>
                )}
                {geo.status === "granted" && geo.coords && (
                  <span className="tabular-nums">
                    {geo.coords.lat.toFixed(6)}, {geo.coords.lng.toFixed(6)}{" "}
                    <span className="text-muted-foreground">±{Math.round(geo.coords.accuracy)}m</span>
                  </span>
                )}
                {(geo.status === "denied" || geo.status === "unavailable") && (
                  <span className="text-amber-700">
                    {geo.error ?? "Location unavailable."} Photo will be saved without GPS.
                  </span>
                )}
                {geo.status === "idle" && <span className="text-muted-foreground">Location not requested.</span>}
              </div>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={geo.request}
                disabled={geo.status === "requesting"}
                className="h-6 px-2 text-xs"
                data-testid="photo-geo-refresh"
              >
                Retry
              </Button>
            </div>

            {/* Metadata */}
            <div>
              <Label htmlFor="photo-caption">Caption</Label>
              <Input
                id="photo-caption"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="e.g. Footing reinforcement complete – Block A"
                data-testid="photo-caption-input"
              />
            </div>
            <div>
              <Label htmlFor="photo-tag">Tag</Label>
              <select
                id="photo-tag"
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                value={tag}
                onChange={(e) => setTag(e.target.value as (typeof TAGS)[number])}
                data-testid="photo-tag-select"
              >
                {TAGS.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded p-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} type="button">
              Cancel
            </Button>
            <Button onClick={submit} disabled={busy || !file} data-testid="photo-save">
              {busy ? (
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {upload.isUploading ? "Uploading…" : "Saving…"}
                </span>
              ) : (
                "Save photo"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
