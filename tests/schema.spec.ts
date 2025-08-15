import path from "path";
import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import Ajv from "ajv";

const schemasDir = path.resolve(__dirname, "..", "schemas");

// Function to load all schemas
function loadAllSchemas(dir: string): Record<string, any> {
  const schemas: Record<string, any> = {};
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (file.endsWith(".json")) {
      const filePath = path.join(dir, file);
      const schema = JSON.parse(fs.readFileSync(filePath, "utf8"));
      schemas[file] = schema;
    }
  }
  return schemas;
}

describe("JSON Schemas", () => {
  let ajv: Ajv;
  let loadedSchemas: Record<string, any>;

  beforeEach(() => {
    ajv = new Ajv();
    loadedSchemas = loadAllSchemas(schemasDir);
    // Add all loaded schemas to Ajv instance for $ref resolution
    for (const key in loadedSchemas) {
      ajv.addSchema(loadedSchemas[key], key);
    }
  });

  it("should load all schemas without error", () => {
    expect(Object.keys(loadedSchemas).length).toBeGreaterThan(0);
  });

  it("should validate a simple schema (e.g., list_devices)", () => {
    const listDevicesSchema = loadedSchemas["list_devices.schema.json"];
    expect(listDevicesSchema).toBeDefined();

    const validate = ajv.compile(listDevicesSchema);

    // Example of valid data for list_devices (adjust based on actual schema)
    const validData = {
      devices: [
        {
          id: "device1",
          vendor: "Vendor A",
          model: "Model X",
          saneName: "sane:device1",
          capabilities: {
            adf: true,
            duplex: false,
            color_modes: ["Color", "Gray"],
            resolutions: [100, 200],
            page_sizes: ["A4"],
          },
        },
      ],
    };
    expect(validate(validData)).toBe(true);
    expect(validate.errors).toBeNull();

    // Example of invalid data
    const invalidData = {
      devices: [
        {
          id: 123, // Invalid type
        },
      ],
    };
    expect(validate(invalidData)).toBe(false);
    expect(validate.errors).not.toBeNull();
  });

  // Add more tests for specific schemas and validation rules
  it("should validate start_scan_job schema", () => {
    const startScanJobSchema = loadedSchemas["start_scan_job.schema.json"];
    expect(startScanJobSchema).toBeDefined();
    const validate = ajv.compile(startScanJobSchema);

    const validData = {
      device_id: "my_scanner",
      resolution_dpi: 300,
      color_mode: "Color",
      source: "ADF",
      duplex: true,
      page_size: "Letter",
      custom_size_mm: { width: 215.9, height: 279.4 },
      doc_break_policy: { type: "page_count", page_count: 1 },
      output_format: "pdf",
      tmp_dir: "/tmp/scans",
    };
    expect(validate(validData)).toBe(true);
    expect(validate.errors).toBeNull();

    const invalidData = {
      resolution_dpi: "high", // Invalid type
    };
    expect(validate(invalidData)).toBe(false);
    expect(validate.errors).not.toBeNull();
  });
});