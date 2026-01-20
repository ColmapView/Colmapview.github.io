/**
 * Curated list of example COLMAP datasets from HuggingFace.
 * Used by the "Try a Toy!" button to load a random reconstruction.
 */

export const HUGGINGFACE_BASE_URL =
  "https://huggingface.co/datasets/OpsiClear/NGS/resolve/main/objects";

export interface ExampleDataset {
  name: string;
  scanId: string;
}

export const EXAMPLE_DATASETS: ExampleDataset[] = [
  { name: "Lady Bug Toy", scanId: "scan_20250714_170841_lady_bug_toy" },
  { name: "Red Car Toy", scanId: "scan_20250714_172700_red_car_toy" },
  { name: "USB Microscope", scanId: "scan_20250711_112222_usb_microscope" },
  { name: "Mouse on USB Cable", scanId: "scan_20250711_110733_mouse_on_top_of_usb_cable" },
  { name: "Abrasive on Torch", scanId: "scan_20250711_102546_abbrasive_on_torch" },
  { name: "Stamp (New Lighting)", scanId: "scan_20250711_113305_stamp_new_lighting" },
  { name: "Gold Cup with Mandarins", scanId: "scan_20250714_174136_goldcup_with_scar_mandarins" },
  { name: "Strawberry Hydro", scanId: "scan_20250713_155826_ilovehydros_strawberry" },
  { name: "Beef", scanId: "scan_20250713_042803_beef" },
  { name: "Potato Blend", scanId: "scan_20250713_142608_tasteful_selections_bite_size_creamers_sunburst_blend_potato" },
  { name: "Object Scan 1", scanId: "scan_20250403_094132" },
  { name: "Object Scan 2", scanId: "scan_20250408_172911" },
  { name: "Object Scan 3", scanId: "scan_20250521_153106" },
];

/**
 * Construct the full URL for a dataset scan.
 */
export function getDatasetUrl(scanId: string): string {
  return `${HUGGINGFACE_BASE_URL}/${scanId}/`;
}

/**
 * Get a random dataset from the example list.
 */
export function getRandomDataset(): ExampleDataset {
  return EXAMPLE_DATASETS[Math.floor(Math.random() * EXAMPLE_DATASETS.length)];
}
