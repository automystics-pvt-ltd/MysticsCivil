import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type CacheEntry = { address: string | null; expires: number };
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
let lastCallAt = 0;
const MIN_GAP_MS = 1100; // Nominatim usage policy: max 1 req/sec

function keyOf(lat: number, lon: number): string {
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

router.post("/geocode/reverse", requireAuth, async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const lat = Number(body.lat);
  const lon = Number(body.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    res.status(400).json({ error: "lat/lon required and must be valid coordinates" });
    return;
  }

  const key = keyOf(lat, lon);
  const cached = cache.get(key);
  const now = Date.now();
  if (cached && cached.expires > now) {
    res.json({ address: cached.address });
    return;
  }

  const gap = now - lastCallAt;
  if (gap < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - gap));
  }
  lastCallAt = Date.now();

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
      lat.toString(),
    )}&lon=${encodeURIComponent(lon.toString())}&zoom=18&addressdetails=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "OCMS-KattidaCore/1.0 (reverse geocode for project address suggestions)",
        Accept: "application/json",
      },
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      cache.set(key, { address: null, expires: Date.now() + 1000 * 60 * 5 });
      res.json({ address: null });
      return;
    }
    const data = (await resp.json()) as { display_name?: string };
    const address = typeof data.display_name === "string" && data.display_name ? data.display_name : null;
    cache.set(key, { address, expires: Date.now() + CACHE_TTL_MS });
    res.json({ address });
  } catch (err) {
    req.log.warn({ err }, "Reverse geocode failed");
    cache.set(key, { address: null, expires: Date.now() + 1000 * 60 * 5 });
    res.json({ address: null });
  }
});

export default router;
