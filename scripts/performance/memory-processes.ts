import { execFileSync } from 'node:child_process';
import type { Browser } from '@playwright/test';

interface CpuSample { Id: number; ProcessName: string; PrivateMemorySize64: number; WorkingSet64: number }
interface GpuSample { InstanceName: string; Path: string; CookedValue: number; Timestamp: string; Status: number }

export async function sampleMemoryProcesses(browser: Browser) {
  const session = await browser.newBrowserCDPSession();
  const startedAt = new Date().toISOString();
  try {
    const { processInfo } = await session.send('SystemInfo.getProcessInfo');
    const ids = processInfo.map(process => process.id).filter(id => Number.isSafeInteger(id) && id > 0);
    if (process.platform !== 'win32' || ids.length === 0) return { startedAt, processInfo, unavailable: 'Windows process working-set/private-commit sampling unavailable' };
    const command = `
$taskProcessIds = @(${ids.join(',')})
$taskCpuAt = [DateTime]::UtcNow.ToString('o')
$taskCpu = @(Get-Process -Id $taskProcessIds -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,PrivateMemorySize64,WorkingSet64)
$taskGpu = @()
$taskGpuError = $null
try {
  $taskGpu = @(Get-Counter -Counter '\\GPU Process Memory(*)\\Dedicated Usage','\\GPU Process Memory(*)\\Shared Usage','\\GPU Process Memory(*)\\Total Committed' -ErrorAction Stop | Select-Object -ExpandProperty CounterSamples | Where-Object { $_.InstanceName -match '^pid_(?<processId>\\d+)_' -and $taskProcessIds -contains [int]$Matches.processId } | Select-Object InstanceName,Path,CookedValue,Timestamp,Status)
} catch { $taskGpuError = $_.Exception.Message }
[pscustomobject]@{ cpuAt=$taskCpuAt; cpu=$taskCpu; gpu=$taskGpu; gpuError=$taskGpuError } | ConvertTo-Json -Depth 5 -Compress
`;
    const raw = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true, timeout: 10000 }).trim();
    const parsed = JSON.parse(raw) as { cpuAt: string; cpu: CpuSample[]; gpu: GpuSample[]; gpuError: string | null };
    const gpuSum = (counter: string) => {
      const valid = parsed.gpu.filter(sample => sample.Status === 0 && sample.Path.toLowerCase().endsWith(`\\${counter}`));
      return valid.length ? valid.reduce((sum, sample) => sum + sample.CookedValue, 0) : null;
    };
    return { startedAt, completedAt: new Date().toISOString(), cpuSampledAt: parsed.cpuAt, processInfo,
      processes: parsed.cpu.map(sample => ({ ...sample, type: processInfo.find(process => process.id === sample.Id)?.type })),
      summedPrivateCommitBytes: parsed.cpu.reduce((sum, sample) => sum + sample.PrivateMemorySize64, 0),
      summedWorkingSetBytes: parsed.cpu.reduce((sum, sample) => sum + sample.WorkingSet64, 0),
      gpuCounters: { samples: parsed.gpu, unavailable: parsed.gpuError,
        summedDedicatedBytes: parsed.gpu.length ? gpuSum('dedicated usage') : null,
        summedSharedBytes: parsed.gpu.length ? gpuSum('shared usage') : null,
        summedTotalCommittedBytes: parsed.gpu.length ? gpuSum('total committed') : null,
        definition: 'Windows GPU Process Memory counters filtered to CDP-owned Chromium PIDs. Values describe OS/driver-reported allocation usage across adapter instances, not exact physical VRAM residency. Do not add CPU and GPU totals: shared/system memory can overlap.' },
      definition: 'CDP-enumerated Chromium OS processes only. PrivateMemorySize64 is private committed CPU virtual memory; WorkingSet64 is resident working set and summation can double-count shared pages. Neither is GPU allocation size.' };
  } catch (error) { return { startedAt, unavailable: error instanceof Error ? error.message : String(error) }; }
  finally { await session.detach(); }
}
