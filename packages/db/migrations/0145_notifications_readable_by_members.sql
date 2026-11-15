-- CG POS · 0145_notifications_readable_by_members
-- Notifikasi pengelola ke karyawan (0038) hanya terbaca oleh pengelola, jadi kasir tidak pernah melihat pesan yang dikirim kepadanya.
-- Kini semua anggota organisasi boleh MEMBACA (kasir memfilter yang untuk dirinya atau untuk semua karyawan). Menulis tetap hanya pengelola.

drop policy if exists sel on pos.employee_notifications;
create policy sel on pos.employee_notifications for select to authenticated using (org_id in (select pos.user_org_ids()));
