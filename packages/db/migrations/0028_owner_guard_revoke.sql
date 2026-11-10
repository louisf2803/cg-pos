-- Pengerasan 0011: fungsi pemicu employees_owner_guard() tidak perlu dan tidak boleh dipanggil lewat RPC
-- (penasihat keamanan menandai anon/authenticated bisa mengeksekusinya). Pemicu tetap berjalan: hak EXECUTE
-- diperiksa saat pemicu dibuat, bukan saat dijalankan. Tidak mengubah data.
revoke all on function pos.employees_owner_guard() from public, anon, authenticated;
