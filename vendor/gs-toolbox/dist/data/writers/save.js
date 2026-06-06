// Unified save + browser download helper
import { savePLY } from './ply-writer';
import { saveSplat } from './splat-writer';
import { saveSPZ } from './spz-writer';
/** Save a GaussianCloud to the specified format. */
export function save(cloud, format) {
    switch (format) {
        case 'ply': return savePLY(cloud);
        case 'splat': return saveSplat(cloud);
        case 'spz': return saveSPZ(cloud);
        default:
            throw new Error(`Unsupported save format: ${format}`);
    }
}
/** Trigger browser download of an ArrayBuffer as a file. */
export function downloadBlob(data, filename) {
    const blob = new Blob([data]);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    // Clean up after a short delay to allow download to start
    setTimeout(() => {
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    }, 100);
}
