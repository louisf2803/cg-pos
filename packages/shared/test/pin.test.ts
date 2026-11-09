import { describe, expect, it } from 'vitest';
import { pinProblem } from '../src/pin';

describe('pinProblem', () => {
  it('menerima PIN acak 6 digit', () => {
    for (const p of ['482915', '730264', '105928', '918273']) expect(pinProblem(p)).toBeNull();
  });
  it('menolak format salah', () => {
    for (const p of ['', '12345', '1234567', '12a456', '12 345']) expect(pinProblem(p)).toMatch(/6 digit/);
  });
  it('menolak angka sama, berurutan naik/turun, dan pola berulang', () => {
    for (const p of ['000000', '111111', '123456', '234567', '654321', '987654', '121212', '123123', '456456']) expect(pinProblem(p)).not.toBeNull();
  });
});
