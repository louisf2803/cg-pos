import { describe, expect, it } from 'vitest';
import { createFakeData, groupGateByPhase, taskIsResolved, taskPhotoPath, taskProgress, taskTemplateProblem } from '../src';

describe('tugas harian', () => {
  it('memvalidasi templat', () => {
    expect(taskTemplateProblem({ title: 'Lantai bersih', phase: 'opening', kind: 'photo' })).toBeNull();
    expect(taskTemplateProblem({ title: '  ', phase: 'opening', kind: 'check' })).not.toBeNull();
    expect(taskTemplateProblem({ title: 'x'.repeat(121), phase: 'closing', kind: 'check' })).not.toBeNull();
  });
  it('progres: selesai atau tidak bisa dihitung selesai', () => {
    expect(taskIsResolved({ status: 'skipped' })).toBe(true);
    expect(taskProgress([{ status: 'done' }, { status: 'skipped' }, { status: 'pending' }])).toEqual({ done: 2, total: 3, percent: 67 });
    expect(taskProgress([]).percent).toBe(100);
  });
  it('kelompok gerbang menurut fase dan jalur foto', () => {
    const g = groupGateByPhase([{ itemId: '1', phase: 'closing', title: 'a', kind: 'check' }, { itemId: '2', phase: 'opening', title: 'b', kind: 'photo' }]);
    expect(g.map((x) => x.phase)).toEqual(['opening', 'closing']);
    expect(taskPhotoPath('org1', 'out1', '2026-11-17', 'it1')).toBe('org1/out1/2026-11-17/it1.jpg');
  });
  it('demo: gerbang terisi, centang dan foto menyelesaikan, tidak bisa wajib alasan dan izin, buka lagi', async () => {
    const d = createFakeData();
    const first = await d.taskGate();
    expect(first.length).toBe(6);
    expect(first[0]!.phase).toBe('opening');
    const photo = first.find((i) => i.kind === 'photo' && i.title.startsWith('Mesin'))!;
    const check = first.find((i) => i.kind === 'check' && i.phase === 'opening')!;
    await expect(d.completeTaskItem({ itemId: photo.itemId })).rejects.toThrow(/foto/i);
    await d.completeTaskItem({ itemId: photo.itemId, photoPath: 'org/outlet/2026-11-17/x.jpg' });
    await d.completeTaskItem({ itemId: check.itemId });
    expect((await d.taskGate()).length).toBe(4);
    const kas = first.find((i) => i.title === 'Kas awal di laci')!; // tidak boleh dilewati
    await expect(d.skipTaskItem({ itemId: kas.itemId, reason: 'macet' })).rejects.toThrow(/tidak boleh/i);
    const lampu = first.find((i) => i.title === 'Lampu dimatikan')!;
    await expect(d.skipTaskItem({ itemId: lampu.itemId, reason: '  ' })).rejects.toThrow(/alasan/i);
    await d.skipTaskItem({ itemId: lampu.itemId, reason: 'listrik padam' });
    expect((await d.taskGate()).length).toBe(3);
    await d.reopenTaskItem(lampu.itemId);
    expect((await d.taskGate()).length).toBe(4);
    const today = new Date().toISOString().slice(0, 10);
    const runs = await d.listTaskRuns({ from: '2020-01-01', to: '2099-12-31' });
    expect(runs.length).toBe(2);
    expect(runs.find((r) => r.phase === 'opening')!.items.filter((i) => i.status === 'done').length).toBe(2);
    expect(today).toBeTruthy();
  });
  it('demo: templat bisa ditambah, diubah, dan dihapus; templat baru ikut gerbang hari ini', async () => {
    const d = createFakeData();
    await d.taskGate();
    const t = await d.saveTaskTemplate({ outletId: 'outlet-1', phase: 'closing', title: 'Sampah dibuang', kind: 'photo' });
    expect((await d.taskGate()).some((i) => i.title === 'Sampah dibuang')).toBe(true); // gerbang menyalin templat baru ke baris hari ini
    await d.saveTaskTemplate({ ...t, outletId: t.outletId, title: 'Sampah dibuang ke luar' });
    expect((await d.listTaskTemplates('outlet-1')).some((x) => x.title === 'Sampah dibuang ke luar')).toBe(true);
    await d.deleteTaskTemplate(t.id);
    expect((await d.listTaskTemplates('outlet-1')).some((x) => x.id === t.id)).toBe(false);
  });
});
