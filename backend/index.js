/* GeoHistory Backend – MVP-02
 * Endpoints:
 *  - GET  /health
 *  - GET  /api/events
 *  - GET  /api/options  (type=continents|countries|locations|groups)
 *  - POST /generate      (genera Excel da istruzioni toolbox)
 *
 * NOTE:
 * 1) Se esistono in DB le RPC (events_public, options_*), il backend le usa.
 * 2) Se NON esistono, usa un fallback lato Node (funzionale).
 */

const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const XLSX = require("xlsx");
require("dotenv").config();

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

const app = express();
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: "4mb" }));

// ---------- Helpers ----------
const toInt = (v, def = null) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const sanitizeLike = (s = "") =>
  String(s).replace(/[%_]/g, m => "\\" + m); // escape % and _

const computeYears = (row) => {
  const exact = row.exact_date ? new Date(row.exact_date).getFullYear() : null;
  const fromY = row.event_year ?? row.year_from ?? exact ?? null;
  const toY = row.year_to ?? fromY ?? null;
  return { from_year: fromY, to_year: toY };
};

// ---------- Health ----------
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "geohistory-backend", ts: new Date().toISOString() });
});

// ---------- /api/events ----------
app.get("/api/events", async (req, res) => {
  try {
    const {
      lang = "IT",
      q = null,
      continent = null,
      country = null,
      location = null,
      group = null,
      year_start = null,
      year_end = null,
      limit = "1000",
      offset = "0"
    } = req.query;

    const lim = toInt(limit, 1000);
    const off = toInt(offset, 0);
    const yStart = toInt(year_start, null);
    const yEnd = toInt(year_end, null);

    // ---- 1) Prova RPC se presente (events_public)
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc("events_public", {
        lang,
        q: q || null,
        continent_filter: continent || null,
        country_filter: country || null,
        location_filter: location || null,
        group_filter: group || null,
        year_start: yStart,
        year_end: yEnd,
        limit_rows: lim,
        offset_rows: off
      });
      if (!rpcErr && Array.isArray(rpcData)) {
        return res.json({ rows: rpcData, source: "rpc" });
      }
    } catch (_e) {
      /* fallback */
    }

    // ---- 2) Fallback diretto su tabella events
    let query = supabase
      .from("events")
      .select(
        [
          "id",
          "event_en", "event_it",
          "description_en", "description_it",
          "description_short_en", "description_short_it",
          "group_event_en", "group_event_it",
          "type_event",
          "continent", "country", "location",
          "latitude", "longitude",
          "wikipedia_en", "wikipedia_it",
          "year_from", "year_to", "exact_date", "event_year",
          "created_at",
          "image_url"
        ].join(","),
        { count: "exact" }
      );

    if (continent) query = query.eq("continent", continent);
    if (country)   query = query.eq("country", country);
    if (location)  query = query.eq("location", location);

    if (group) {
      query = query.or(
        `group_event_en.eq.${group},group_event_it.eq.${group}`
      );
    }

    if (q) {
      const s = sanitizeLike(q);
      query = query.or([
        `event_en.ilike.%${s}%`,
        `event_it.ilike.%${s}%`,
        `description_en.ilike.%${s}%`,
        `description_it.ilike.%${s}%`,
        `description_short_en.ilike.%${s}%`,
        `description_short_it.ilike.%${s}%`,
        `group_event_en.ilike.%${s}%`,
        `group_event_it.ilike.%${s}%`,
        `continent.ilike.%${s}%`,
        `country.ilike.%${s}%`,
        `location.ilike.%${s}%`
      ].join(","));
    }

    query = query
      .order("year_from", { ascending: true, nullsFirst: false })
      .order("event_year", { ascending: true, nullsFirst: false })
      .order("exact_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true, nullsFirst: false })
      .range(off, off + lim - 1);

    const { data, error } = await query;
    if (error) throw error;

    const baseEvents = data || [];
    const eventIds = baseEvents.map(r => r.id).filter(Boolean);
    const coverByEvent = new Map();
    const galleryByEvent = new Map();

    const shapeAttachment = (row) => ({
      attachment_id: row.id,
      media_id: row.media_id,
      role: row.role,
      title: row.title,
      caption: row.caption,
      alt_text: row.alt_text,
      is_primary: Boolean(row.is_primary),
      sort_order: typeof row.sort_order === "number" ? row.sort_order : 0,
      storage_bucket: row.storage_bucket,
      storage_path: row.storage_path,
      media_type: row.media_type,
      status: row.status,
      mime_type: row.mime_type,
      original_filename: row.original_filename,
      file_size_bytes: row.file_size_bytes,
      checksum_sha256: row.checksum_sha256,
      width: row.width,
      height: row.height,
      duration_seconds: row.duration_seconds,
      public_url: row.public_url,
      preview_url: row.preview_url,
      source_url: row.source_url,
      credits: row.credits,
      attachment_metadata: row.attachment_metadata || {},
      asset_metadata: row.asset_metadata || {}
    });

    if (eventIds.length) {
      try {
        const attachmentColumns = [
          "id",
          "media_id",
          "event_id",
          "role",
          "title",
          "caption",
          "alt_text",
          "is_primary",
          "sort_order",
          "storage_bucket",
          "storage_path",
          "media_type",
          "status",
          "mime_type",
          "original_filename",
          "file_size_bytes",
          "checksum_sha256",
          "width",
          "height",
          "duration_seconds",
          "public_url",
          "preview_url",
          "source_url",
          "credits",
          "attachment_metadata",
          "asset_metadata"
        ].join(",");

        const { data: mediaRows, error: mediaError } = await supabase
          .from("media_attachments_expanded")
          .select(attachmentColumns)
          .in("event_id", eventIds);

        if (mediaError) throw mediaError;

        for (const row of mediaRows || []) {
          if (!row || !row.event_id) continue;
          const shaped = shapeAttachment(row);
          if (row.role === "cover") {
            const existing = coverByEvent.get(row.event_id);
            if (!existing) {
              coverByEvent.set(row.event_id, shaped);
              continue;
            }
            const scoreExisting = (existing.is_primary ? 1 : 0);
            const scoreIncoming = (shaped.is_primary ? 1 : 0);
            if (scoreIncoming > scoreExisting) {
              coverByEvent.set(row.event_id, shaped);
            } else if (scoreIncoming === scoreExisting) {
              const sortExisting = existing.sort_order ?? 0;
              const sortIncoming = shaped.sort_order ?? 0;
              if (sortIncoming < sortExisting) {
                coverByEvent.set(row.event_id, shaped);
              }
            }
          } else {
            const list = galleryByEvent.get(row.event_id) || [];
            list.push(shaped);
            galleryByEvent.set(row.event_id, list);
          }
        }

        for (const list of galleryByEvent.values()) {
          list.sort((a, b) => {
            const sortDiff = (a.sort_order ?? 0) - (b.sort_order ?? 0);
            if (sortDiff !== 0) return sortDiff;
            if (a.is_primary === b.is_primary) return 0;
            return a.is_primary ? -1 : 1;
          });
        }
      } catch (mediaErr) {
        console.warn("Media lookup fallback error:", mediaErr?.message || mediaErr);
      }
    }

    const upperLang = String(lang).toUpperCase();
    const rows = baseEvents.map(r => {
      const { from_year, to_year } = computeYears(r);
      const event =
        upperLang === "IT" ? (r.event_it ?? r.event_en) : (r.event_en ?? r.event_it);
      const description =
        upperLang === "IT"
          ? (r.description_it ?? r.description_en ?? r.description_short_it ?? r.description_short_en)
          : (r.description_en ?? r.description_it ?? r.description_short_en ?? r.description_short_it);
      const group_event =
        upperLang === "IT" ? (r.group_event_it ?? r.group_event_en) : (r.group_event_en ?? r.group_event_it);
      const wikipedia =
        upperLang === "IT" ? (r.wikipedia_it ?? r.wikipedia_en) : (r.wikipedia_en ?? r.wikipedia_it);

      const coverAttachment = coverByEvent.get(r.id) || null;
      const gallery = galleryByEvent.get(r.id) || [];
      const coverUrl = coverAttachment
        ? (coverAttachment.public_url || coverAttachment.preview_url || coverAttachment.source_url)
        : (r.image_url ?? null);
      const galleryUrls = gallery
        .map(item => item.public_url || item.preview_url || item.source_url)
        .filter(Boolean);

      return {
        id: r.id,
        event,
        description,
        group_event,
        type_event: r.type_event,
        continent: r.continent,
        country: r.country,
        location: r.location,
        latitude: r.latitude,
        longitude: r.longitude,
        wikipedia,
        from_year,
        to_year,
        image_url: coverUrl,
        images: galleryUrls,
        media: {
          cover: coverAttachment,
          gallery
        }
      };
    });

    const filtered = rows.filter(r => {
      if (yStart == null && yEnd == null) return true;
      const fromOk = (yEnd == null) ? true : (r.from_year == null ? true : r.from_year <= yEnd);
      const toOk   = (yStart == null) ? true : (r.to_year   == null ? true : r.to_year   >= yStart);
      return fromOk && toOk;
    });

    return res.json({ rows: filtered, source: "fallback" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
});

// ---------- /api/options ----------
app.get("/api/options", async (req, res) => {
  try {
    const {
      type,              // "continents" | "countries" | "locations" | "groups"
      lang = "IT",
      q = null,
      continent = null,
      country = null,
      location = null
    } = req.query;

    if (!type) return res.status(400).json({ error: "Missing 'type' param" });

    // 1) Tenta RPC se presenti
    const tryRPC = async () => {
      if (type === "continents") {
        const { data, error } = await supabase.rpc("options_continents", { q: q || null });
        if (error) throw error;
        return data.map(r => ({ value: r.continent, count: r.n }));
      }
      if (type === "countries") {
        const { data, error } = await supabase.rpc("options_countries", {
          continent: continent || null,
          q: q || null
        });
        if (error) throw error;
        return data.map(r => ({ value: r.country, count: r.n }));
      }
      if (type === "locations") {
        const { data, error } = await supabase.rpc("options_locations", {
          continent: continent || null,
          country: country || null,
          q: q || null
        });
        if (error) throw error;
        return data.map(r => ({ value: r.location, count: r.n }));
      }
      if (type === "groups") {
        const { data, error } = await supabase.rpc("options_groups", {
          lang,
          continent: continent || null,
          country: country || null,
          location: location || null,
          q: q || null
        });
        if (error) throw error;
        return data
          .sort((a, b) => (a.first_year ?? 999999) - (b.first_year ?? 999999))
          .map(r => ({ value: r.group_event, count: r.n, first_year: r.first_year }));
      }
      throw new Error("Unknown type");
    };

    try {
      const out = await tryRPC();
      return res.json({ rows: out, source: "rpc" });
    } catch {
      // 2) Fallback senza RPC
      let cols = ["continent", "country", "location", "group_event_en", "group_event_it", "event_year", "year_from", "year_to", "exact_date"];
      let query = supabase.from("events").select(cols.join(","));

      if (continent) query = query.eq("continent", continent);
      if (country)   query = query.eq("country", country);
      if (location)  query = query.eq("location", location);
      if (q) {
        const s = sanitizeLike(q);
        query = query.or([
          `group_event_en.ilike.%${s}%`,
          `group_event_it.ilike.%${s}%`,
          `continent.ilike.%${s}%`,
          `country.ilike.%${s}%`,
          `location.ilike.%${s}%`
        ].join(","));
      }

      query = query.limit(100000);

      const { data, error } = await query;
      if (error) throw error;

      const mapCount = new Map();

      if (type === "continents") {
        for (const r of data) {
          const k = r.continent;
          if (!k) continue;
          mapCount.set(k, (mapCount.get(k) || 0) + 1);
        }
        const rows = [...mapCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count }));
        return res.json({ rows, source: "fallback" });
      }

      if (type === "countries") {
        for (const r of data) {
          const k = r.country;
          if (!k) continue;
          mapCount.set(k, (mapCount.get(k) || 0) + 1);
        }
        const rows = [...mapCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count }));
        return res.json({ rows, source: "fallback" });
      }

      if (type === "locations") {
        for (const r of data) {
          const k = r.location;
          if (!k) continue;
          mapCount.set(k, (mapCount.get(k) || 0) + 1);
        }
        const rows = [...mapCount.entries()].sort((a, b) => a[0].localeCompare(b[0]))
          .map(([value, count]) => ({ value, count }));
        return res.json({ rows, source: "fallback" });
      }

      if (type === "groups") {
        const upperLang = String(lang).toUpperCase();
        const firstYear = (r) => {
          const exact = r.exact_date ? new Date(r.exact_date).getFullYear() : null;
          const first = r.event_year ?? r.year_from ?? exact ?? null;
          return first == null ? 999999 : first;
        };
        const mapGroup = new Map();
        for (const r of data) {
          const name = upperLang === "IT" ? (r.group_event_it || r.group_event_en) : (r.group_event_en || r.group_event_it);
          if (!name) continue;
          const obj = mapGroup.get(name) || { count: 0, first_year: 999999 };
          obj.count += 1;
          const f = firstYear(r);
          if (f < obj.first_year) obj.first_year = f;
          mapGroup.set(name, obj);
        }
        const rows = [...mapGroup.entries()]
          .map(([value, meta]) => ({ value, count: meta.count, first_year: meta.first_year }))
          .sort((a, b) => a.first_year - b.first_year);
        return res.json({ rows, source: "fallback" });
      }

      return res.status(400).json({ error: "Unknown type" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal error", detail: String(err?.message || err) });
  }
});

// ---------- /generate (Excel) ----------
app.post("/generate", async (req, res) => {
  try {
    const { language = "IT", group_event = "", continent = "", description = "", count = "" } = req.body || {};
    if (!group_event) return res.status(400).send("Missing 'group_event'");

    // prova a ricavare un numero da 'count'
    let n = toInt(count, null);
    if (n == null) {
      const m = String(count || "").match(/(\d{1,4})/);
      n = m ? parseInt(m[1], 10) : 20;
    }
    n = Math.max(1, Math.min(n, 1000)); // safe guard

    // colonne principali coerenti con la tabella "events"
    const headers = [
      "continent_group_event",
      "group_event_en", "group_event_it",
      "event_en", "event_it",
      "type_event",
      "description_en", "description_it",
      "year_from", "year_to", "exact_date",
      "continent", "country", "location",
      "latitude", "longitude",
      "wikipedia_en", "wikipedia_it",
      "description_short_en", "description_short_it",
      "event_year"
    ];

    // righe placeholder precompilate con il group_event e continente
    const rows = [];
    for (let i = 0; i < n; i++) {
      const base = {
        continent_group_event: continent || "",
        group_event_en: language.toUpperCase() === "IT" ? "" : group_event,
        group_event_it: language.toUpperCase() === "IT" ? group_event : "",
        event_en: "",
        event_it: "",
        type_event: "",
        description_en: "",
        description_it: "",
        year_from: "",
        year_to: "",
        exact_date: "",
        continent: continent || "",
        country: "",
        location: "",
        latitude: "",
        longitude: "",
        wikipedia_en: "",
        wikipedia_it: "",
        description_short_en: "",
        description_short_it: "",
        event_year: ""
      };
      rows.push(base);
    }

    const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
    // Intestazione (riga 1) in alto già gestita da 'header'
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "events");

    const fileName = `group_events_${group_event.replace(/[^\w\d]+/g, "_")}_${Date.now()}.xlsx`;
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(fileName)}"`);
    return res.send(buf);
  } catch (err) {
    console.error(err);
    res.status(500).send("Generate error: " + (err?.message || err));
  }
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log(`✅ GeoHistory Backend listening on http://localhost:${PORT}`);
});
