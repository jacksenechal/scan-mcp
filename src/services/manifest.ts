import { z } from "zod";

// On-disk shape of <run_dir>/manifest.json. The Manifest type is derived from this
// schema, so the written format and its documentation cannot drift.
export const ManifestSchema = z.object({
  job_id: z.string(),
  device_id: z.string().nullable(),
  created_at: z.string(),
  state: z.enum(["running", "completed", "cancelled", "error"]),
  // Effective (resolved) scan parameters. `source` is widened to a string because it
  // may be a device-specific value mapped from the requested one.
  params: z.object({
    device_id: z.string().optional(),
    resolution_dpi: z.number().int().optional(),
    color_mode: z.string().optional(),
    source: z.string().optional(),
    duplex: z.boolean().optional(),
    page_size: z.enum(["Letter", "A4", "Legal", "Custom"]).optional(),
    custom_size_mm: z.object({ width: z.number(), height: z.number() }).optional(),
    doc_break_policy: z
      .object({
        type: z.enum(["page_count", "none"]).optional(),
        page_count: z.number().int().optional(),
      })
      .optional(),
    output_format: z.string().optional(),
    tmp_dir: z.string().optional(),
    crop_carrier_sheets: z.boolean().optional(),
  }),
  pages: z.array(
    z.object({
      index: z.number().int(),
      path: z.string(),
      sha256: z.string(),
      carrier_sheet: z.object({ detected: z.literal(true), band_rows: z.tuple([z.number(), z.number()]) }).optional(),
      cropped_path: z.string().optional(),
      cropped_sha256: z.string().optional(),
    })
  ),
  documents: z.array(
    z.object({
      index: z.number().int(),
      pages: z.array(z.number().int()),
      path: z.string(),
      sha256: z.string(),
    })
  ),
});

export type Manifest = z.infer<typeof ManifestSchema>;
